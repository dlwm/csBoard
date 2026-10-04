package goparser

import (
	"fmt"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

// A sellback entry can move when a grenade is used. Only paired definition and
// cost writes represent a purchase; comparing snapshots invents extra spending.
func trackPurchases(parser dem.Parser, rows *[]map[string]any) func(int) {
	type key struct {
		pawn st.Entity
		slot int
	}
	type update struct{ definition, cost bool }
	pending := map[key]update{}
	order := []key{}
	type refund struct {
		steamid string
		handle  uint64
		tick    int
	}
	refunds := []refund{}
	parser.RegisterEventHandler(func(event events.ItemRefund) {
		if event.Player == nil || event.Weapon == nil || event.Weapon.Entity == nil {
			return
		}
		entity := event.Weapon.Entity
		refunds = append(refunds, refund{playerIdentity(event.Player), uint64(entity.ID()) | uint64(entity.SerialNum())<<14, parser.GameState().IngameTick()})
	})
	parser.RegisterEventHandler(func(events.DataTablesParsed) {
		class := parser.ServerClasses().FindByName("CCSPlayerPawn")
		if class == nil {
			return
		}
		class.OnEntityCreated(func(pawn st.Entity) {
			bound := 0
			bind := func() {
				entries, _ := entityValue(pawn, "m_pBuyServices.m_vecSellbackPurchaseEntries").([]any)
				length := len(entries)
				for bound < length {
					slot := bound
					bound++
					k := key{pawn, slot}
					prefix := fmt.Sprintf("m_pBuyServices.m_vecSellbackPurchaseEntries.%04d.", slot)
					for _, field := range []string{"m_unDefIdx", "m_nCost"} {
						field := field
						prop := pawn.Property(prefix + field)
						if prop == nil {
							continue
						}
						prop.OnUpdate(func(value st.PropertyValue) {
							if value.Any == nil {
								return
							}
							change, exists := pending[k]
							if !exists {
								order = append(order, k)
							}
							if field == "m_unDefIdx" {
								change.definition = true
							} else {
								change.cost = true
							}
							pending[k] = change
						})
					}
				}
			}
			bind()
			if length := pawn.Property("m_pBuyServices.m_vecSellbackPurchaseEntries"); length != nil {
				length.OnUpdate(func(st.PropertyValue) { bind() })
			}
		})
	})
	return func(tick int) {
		owners := map[int]struct{ name, steamid string }{}
		for _, player := range parser.GameState().Participants().All() {
			if player != nil && player.PlayerPawnEntity() != nil {
				owners[player.PlayerPawnEntity().ID()] = struct{ name, steamid string }{player.Name, playerIdentity(player)}
			}
		}
		for _, k := range order {
			change := pending[k]
			if !change.definition || !change.cost || tick == 0 {
				continue
			}
			owner, ok := owners[k.pawn.ID()]
			if !ok {
				continue
			}
			prefix := fmt.Sprintf("m_pBuyServices.m_vecSellbackPurchaseEntries.%04d.", k.slot)
			def, cost := integerProperty(k.pawn, prefix+"m_unDefIdx"), integerProperty(k.pawn, prefix+"m_nCost")
			if def <= 0 {
				continue
			}
			*rows = append(*rows, map[string]any{
				"event_name": "item_purchase", "tick": tick, "name": owner.name, "steamid": owner.steamid,
				"inventory_slot": k.slot, "item_name": purchaseName(uint64(def)), "cost": cost, "was_sold": false, "_weaponHandle": entityValue(k.pawn, prefix+"m_hItem"),
			})
		}
		for _, event := range refunds {
			*rows = append(*rows, map[string]any{"event_name": "item_sold", "tick": event.tick, "steamid": event.steamid, "_weaponHandle": event.handle})
		}
		refunds = refunds[:0]
		clear(pending)
		order = order[:0]
	}
}

// Match actual refunds by the complete weapon handle, including its serial.
// Round resets of purchase counters must not turn earlier purchases into sales.
func finalizePurchases(rows []map[string]any) []map[string]any {
	type key struct {
		steamid string
		handle  uint64
	}
	purchases := map[key]map[string]any{}
	result := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		name := row["event_name"]
		if name == "item_purchase" || name == "item_sold" {
			handle, ok := row["_weaponHandle"].(uint64)
			if ok && handle != 0 && handle != 0xffffffff {
				k := key{row["steamid"].(string), handle}
				if name == "item_purchase" {
					purchases[k] = row
				} else if purchase := purchases[k]; purchase != nil && purchase["tick"].(int) < row["tick"].(int) {
					purchase["was_sold"] = true
					delete(purchases, k)
				}
			}
			delete(row, "_weaponHandle")
		}
		if name != "item_sold" {
			result = append(result, row)
		}
	}
	return result
}
