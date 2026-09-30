package goparser

import (
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
	read  func(int) ([]byte, error)
	parts []sessionPart
}

func NewSession(count int, read func(int) ([]byte, error)) *Session {
	return &Session{read: read, parts: make([]sessionPart, count)}
}

func ValidateSource(data []byte, size int64) error {
	if len(data) < 12 || string(data[:8]) != "PBDEMS2\x00" {
		return fmt.Errorf("invalid Source 2 demo header")
	}
	expected := int64(uint32(data[8])|uint32(data[9])<<8|uint32(data[10])<<16|uint32(data[11])<<24) + 18
	if expected != size {
		return fmt.Errorf("demo length mismatch: expected %d, got %d", expected, size)
	}
	return nil
}

func (s *Session) Request(method string, q Query) (any, error) {
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
			report, err := Parse(data)
			if err != nil {
				return nil, err
			}
			part.report = &report
		}
		if method == "header" {
			return part.report.Header, nil
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
		return ParseGrenades(data)
	case "prepareTicks":
		// Replacing a prepared plan releases the previous rows. Callers provide the
		// union of round, analysis and pre-throw samples, so only one pass is needed.
		data, err := s.read(q.Part)
		if err != nil {
			return nil, err
		}
		rows, err := ParseTicks(data, q.Ticks, q.Props, nil)
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
		return ParseTicks(data, q.Ticks, q.Props, q.Players)
	default:
		return nil, fmt.Errorf("unknown parser method %q", method)
	}
}
