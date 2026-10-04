package goparser

import (
	"context"
	"fmt"
	"sort"
)

type Query struct {
	Part    int      `json:"part"`
	Ticks   []int    `json:"ticks"`
	Props   []string `json:"props"`
	Players []string `json:"players"`
	Events  []string `json:"events"`
}

type Source struct {
	Part       int   `json:"part"`
	ByteLength int64 `json:"byteLength"`
}

type sessionPart struct {
	report *Report
	ticks  map[int][]map[string]any
	props  map[string]struct{}
}

// Session owns per-import state. Native reads are lazy; the browser retains
// transferred input bytes. Neither session reads or writes product caches.
type Session struct {
	ctx    context.Context
	cancel context.CancelFunc
	read   func(int) ([]byte, error)
	parts  []sessionPart
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
	case "header", "events", "inspect":
		if part.report == nil {
			data, err := s.read(q.Part)
			if err != nil {
				return nil, err
			}
			report, err := parseWithContext(s.ctx, data)
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
		rows, err := parseTicksWithContext(s.ctx, data, q.Ticks, q.Props, nil)
		if err != nil {
			return nil, err
		}
		prepared := make(map[int][]map[string]any, len(q.Ticks))
		for _, tick := range q.Ticks {
			prepared[tick] = []map[string]any{}
		}
		for _, row := range rows {
			tick := row["tick"].(int)
			prepared[tick] = append(prepared[tick], row)
		}
		properties := map[string]struct{}{}
		for _, prop := range q.Props {
			properties[prop] = struct{}{}
		}
		part.ticks, part.props = prepared, properties
		return map[string]any{"ticks": len(prepared), "rows": len(rows)}, nil
	case "releaseTicks":
		part.ticks, part.props = nil, nil
		return true, nil
	case "ticks":
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
						if _, ok := selected[value["steamid"].(string)]; !ok {
							continue
						}
					}
					row := map[string]any{"tick": value["tick"], "steamid": value["steamid"], "name": value["name"]}
					for _, prop := range q.Props {
						row[prop] = value[prop]
					}
					rows = append(rows, row)
				}
			}
			return rows, nil
		}
		data, err := s.read(q.Part)
		if err != nil {
			return nil, err
		}
		return parseTicksWithContext(s.ctx, data, q.Ticks, q.Props, q.Players)
	default:
		return nil, fmt.Errorf("unknown parser method %q", method)
	}
}
