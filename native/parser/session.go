package goparser

import (
	"context"
	"fmt"
	"sort"
)

type Query struct {
	Format  string             `json:"format"`
	Part    int                `json:"part"`
	Ticks   []int              `json:"ticks"`
	Props   []string           `json:"props"`
	Players []string           `json:"players"`
	Events  []string           `json:"events"`
	Throws  []ThrowPreparation `json:"throws"`
}

type tickTable struct {
	Columns []string `json:"columns"`
	Rows    [][]any  `json:"rows"`
}

type Source struct {
	Part       int   `json:"part"`
	ByteLength int64 `json:"byteLength"`
}

// Property names belong to the plan, not to every sampled player row.
// 全部行共用属性列名，缓存只保留值与身份，减少 Go/WASM 的存活堆和 GC 压力。
type preparedTickRow struct {
	name    string
	steamID string
	values  []any
}

type sessionPart struct {
	report *Report
	ticks  map[int][]preparedTickRow
	props  map[string]int
}

// Session owns per-import state. Native reads are lazy; the browser retains
// transferred input bytes. Neither session reads or writes product caches.
type Session struct {
	ctx          context.Context
	cancel       context.CancelFunc
	read         func(int) ([]byte, error)
	parts        []sessionPart
	tickProgress func(part, tick, target int)
}

func NewSession(count int, read func(int) ([]byte, error)) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	return &Session{ctx: ctx, cancel: cancel, read: read, parts: make([]sessionPart, count)}
}

func ValidateSource(data []byte, size int64) error {
	if len(data) < 12 || string(data[:8]) != "PBDEMS2\x00" {
		return fmt.Errorf("invalid Source 2 demo header")
	}
	// The header points to DEM_FileInfo, not a fixed-size trailer. Command,
	// tick and protobuf lengths use varints; record/stop clips have shorter tails.
	// 文件头记录 FileInfo 偏移，尾部并非固定 18 字节；截断由消息解码器继续校验。
	infoOffset := int64(uint32(data[8]) | uint32(data[9])<<8 | uint32(data[10])<<16 | uint32(data[11])<<24)
	if size < 16 || infoOffset < 16 || infoOffset >= size {
		return fmt.Errorf("invalid demo FileInfo offset %d for %d bytes", infoOffset, size)
	}
	return nil
}

// Hosts may observe scanned ticks without changing the request/response protocol.
func (s *Session) SetTickProgress(observer func(part, tick, target int)) { s.tickProgress = observer }

func (s *Session) Cancel() { s.cancel() }

// Close releases retained rows after all requests have stopped. Hosts must
// serialize this with Request; Cancel alone is safe during a running request.
func (s *Session) Close() { s.cancel(); s.parts = nil; s.read = nil }

func (s *Session) Request(method string, q Query) (any, error) {
	if err := s.ctx.Err(); err != nil {
		return nil, err
	}
	if q.Part < 0 || q.Part >= len(s.parts) {
		return nil, fmt.Errorf("invalid source part %d", q.Part)
	}
	part := &s.parts[q.Part]
	switch method {
	case "header", "events", "inspect", "voice":
		if part.report == nil {
			data, err := s.read(q.Part)
			if err != nil {
				return nil, err
			}
			report, err := parseReportWithContext(s.ctx, data, true)
			if err != nil {
				return nil, err
			}
			part.report = &report
		}
		if method == "header" {
			header := make(map[string]string, len(part.report.Header)+4)
			for key, value := range part.report.Header {
				header[key] = value
			}
			if header["map_name"] == "" {
				header["map_name"] = part.report.Map
			}
			header["first_tick"] = fmt.Sprint(part.report.FirstTick)
			header["last_tick"] = fmt.Sprint(part.report.LastTick)
			header["frames"] = fmt.Sprint(part.report.Frames)
			if part.report.IsHLTV != nil {
				header["is_hltv"] = fmt.Sprint(*part.report.IsHLTV)
			}
			header["standard_teams_seen"] = fmt.Sprint(part.report.StandardTeamsSeen)
			return header, nil
		}
		if method == "inspect" {
			return part.report, nil
		}
		if method == "voice" {
			return map[string]any{"frames": part.report.VoiceFrames, "summary": part.report.VoiceSummary}, nil
		}
		selected := map[string]struct{}{}
		for _, name := range q.Events {
			selected[name] = struct{}{}
		}
		rows := []map[string]any{}
		for _, row := range part.report.ProductEvents {
			_, ok := selected[row["event_name"].(string)]
			if ok {
				rows = append(rows, row)
			}
		}
		return rows, nil
	case "grenades":
		if part.report != nil && part.report.grenades != nil {
			rows := part.report.grenades
			part.report.grenades = nil // The consumer owns the journal after this response.
			return rows, nil
		}
		data, err := s.read(q.Part)
		if err != nil {
			return nil, err
		}
		return parseGrenadesWithContext(s.ctx, data)
	case "prepareTicks":
		// Replacing a prepared plan releases the previous rows. Callers provide the
		// union of round, analysis and pre-throw samples, so only one pass is needed.
		data, err := s.read(q.Part)
		if err != nil {
			return nil, err
		}
		// Release the replaced plan before decoding a new one; do not keep both.
		part.ticks, part.props = nil, nil
		properties := map[string]int{}
		columns := []string{}
		for _, prop := range q.Props {
			if _, exists := properties[prop]; !exists {
				properties[prop] = len(columns)
				columns = append(columns, prop)
			}
		}
		prepared := make(map[int][]preparedTickRow, len(q.Ticks))
		for _, tick := range q.Ticks {
			prepared[tick] = []preparedTickRow{}
		}
		rowCount := 0
		target := 0
		for _, tick := range q.Ticks {
			if tick > target {
				target = tick
			}
		}
		for _, plan := range q.Throws {
			if plan.Tick > target {
				target = plan.Tick
			}
		}
		var progress func(int)
		if s.tickProgress != nil && target > 0 {
			progress = func(tick int) { s.tickProgress(q.Part, tick, target) }
		}
		throwTicks, err := streamTicksWithPreparation(s.ctx, data, q.Ticks, q.Props, nil, q.Throws, func(row map[string]any) {
			values := make([]any, len(columns))
			for index, prop := range columns {
				values[index] = row[prop]
			}
			tick := row["tick"].(int)
			prepared[tick] = append(prepared[tick], preparedTickRow{name: row["name"].(string), steamID: row["steamid"].(string), values: values})
			rowCount++
		}, progress)
		if err != nil {
			return nil, err
		}
		for _, rows := range prepared {
			sort.SliceStable(rows, func(i, j int) bool { return rows[i].steamID < rows[j].steamID })
		}
		part.ticks, part.props = prepared, properties
		return map[string]any{"ticks": len(prepared), "rows": rowCount, "throwTicks": throwTicks}, nil
	case "releaseTicks":
		part.ticks, part.props = nil, nil
		return true, nil
	case "ticks":
		if q.Format != "" && q.Format != "columns" {
			return nil, fmt.Errorf("unsupported tick format %q", q.Format)
		}
		if part.ticks != nil {
			for _, prop := range q.Props {
				if _, ok := part.props[prop]; !ok {
					return nil, fmt.Errorf("property %s was not prepared", prop)
				}
			}
			selected := map[string]struct{}{}
			for _, player := range q.Players {
				selected[player] = struct{}{}
			}
			rows := []map[string]any{}
			// The compact transport shares field names once and avoids per-row maps.
			// 传输层复用列名，不改变外部采样对象；减少 Go/JS 桥的分配和重复 JSON 字段。
			table := tickTable{Columns: append([]string{"tick", "steamid", "name"}, q.Props...), Rows: [][]any{}}
			ticks := append([]int(nil), q.Ticks...)
			sort.Ints(ticks)
			for i, tick := range ticks {
				if i > 0 && ticks[i-1] == tick {
					continue
				}
				values, ok := part.ticks[tick]
				if !ok {
					return nil, fmt.Errorf("tick %d was not prepared", tick)
				}
				for _, value := range values {
					if len(selected) > 0 {
						if _, ok := selected[value.steamID]; !ok {
							continue
						}
					}
					if q.Format == "columns" {
						row := make([]any, len(table.Columns))
						row[0], row[1], row[2] = tick, value.steamID, value.name
						for index, prop := range q.Props {
							row[index+3] = value.values[part.props[prop]]
						}
						table.Rows = append(table.Rows, row)
						continue
					}
					// Allocate the known row width once instead of repeatedly growing maps.
					// 属性数量已知，预分配容量避免逐行扩容与反复复制。
					row := make(map[string]any, len(q.Props)+3)
					row["tick"], row["steamid"], row["name"] = tick, value.steamID, value.name
					for _, prop := range q.Props {
						row[prop] = value.values[part.props[prop]]
					}
					rows = append(rows, row)
				}
			}
			if q.Format == "columns" {
				return table, nil
			}
			return rows, nil
		}
		data, err := s.read(q.Part)
		if err != nil {
			return nil, err
		}
		rows, err := parseTicksWithContext(s.ctx, data, q.Ticks, q.Props, q.Players)
		if err != nil {
			return nil, err
		}
		if q.Format == "columns" {
			table := tickTable{Columns: append([]string{"tick", "steamid", "name"}, q.Props...), Rows: make([][]any, 0, len(rows))}
			for _, values := range rows {
				row := make([]any, len(table.Columns))
				for index, prop := range table.Columns {
					row[index] = values[prop]
				}
				table.Rows = append(table.Rows, row)
			}
			return table, nil
		}
		return rows, nil
	default:
		return nil, fmt.Errorf("unknown parser method %q", method)
	}
}
