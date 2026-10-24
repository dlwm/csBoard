package goparser

import "fmt"

// Keep the generic event when available, enriching only missing fields from the
// typed event. Different projectile identities at the same tick remain separate.
// 原始与类型事件只计一次；同 tick 的不同闪光实体不会混为一颗。
func mergePlayerBlindEvents(rows, typed []map[string]any) []map[string]any {
	key := func(row map[string]any) string {
		for _, field := range []string{"user_steamid", "user_name"} {
			if value := row[field]; value != nil && fmt.Sprint(value) != "" && fmt.Sprint(value) != "0" {
				return fmt.Sprint(row["tick"]) + ":" + field + ":" + fmt.Sprint(value)
			}
		}
		return ""
	}
	indexed := make(map[string][]int)
	for index, row := range rows {
		if row["event_name"] == "player_blind" {
			if id := key(row); id != "" {
				indexed[id] = append(indexed[id], index)
			}
		}
	}
	for _, event := range typed {
		id, found := key(event), false
		if id != "" {
			for _, index := range indexed[id] {
				row := rows[index]
				if row["entityid"] != nil && event["entityid"] != nil && fmt.Sprint(row["entityid"]) != fmt.Sprint(event["entityid"]) {
					continue
				}
				for field, value := range event {
					if row[field] == nil {
						row[field] = value
					}
				}
				found = true
				break
			}
		}
		if !found {
			if id != "" {
				indexed[id] = append(indexed[id], len(rows))
			}
			rows = append(rows, event)
		}
	}
	return rows
}
