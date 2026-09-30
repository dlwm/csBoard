package goparser

import "testing"

func TestRefundsMatchWeaponLifetimeAndPlayer(t *testing.T) {
	buy := func(tick int, player string, handle uint64) map[string]any {
		return map[string]any{"event_name": "item_purchase", "tick": tick, "steamid": player, "_weaponHandle": handle, "was_sold": false}
	}
	sold := func(tick int, player string, handle uint64) map[string]any {
		return map[string]any{"event_name": "item_sold", "tick": tick, "steamid": player, "_weaponHandle": handle}
	}
	first := buy(10, "one", uint64(12|1<<14))
	reused := buy(30, "one", uint64(12|2<<14))
	otherPlayer := buy(10, "two", uint64(99|1<<14))
	rows := finalizePurchases([]map[string]any{first, otherPlayer, sold(20, "one", uint64(12|1<<14)), reused, sold(40, "one", uint64(12|1<<14)), sold(50, "one", uint64(99|1<<14))})
	if len(rows) != 3 {
		t.Fatalf("internal refund events leaked: %d", len(rows))
	}
	if first["was_sold"] != true || reused["was_sold"] != false || otherPlayer["was_sold"] != false {
		t.Fatal("refund matched a different owner or entity lifetime")
	}
	for _, row := range rows {
		if _, ok := row["_weaponHandle"]; ok {
			t.Fatal("internal weapon handle leaked")
		}
	}
}
