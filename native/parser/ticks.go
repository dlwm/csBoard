package goparser

import (
	"context"
	"math"
	"sort"
	"strconv"
	"strings"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

var buttonMasks = map[string]common.ButtonBitMask{
	"FIRE": common.ButtonAttack, "RIGHTCLICK": common.ButtonAttack2,
	"FORWARD": common.ButtonForward, "BACK": common.ButtonBack,
	"LEFT": common.ButtonMoveLeft, "RIGHT": common.ButtonMoveRight,
	// Keep the Demo property convention; the library's ButtonSpeed is bit 16.
	"WALK": 1 << 18,
}

func entityValue(entity st.Entity, name string) any {
	if entity == nil {
		return nil
	}
	value, ok := entity.PropertyValue(name)
	if !ok {
		return nil
	}
	return value.Any
}

// A pawn may exist before its eye-angle property is available (e.g. during
// spawn/disconnect transitions). Missing angles are unknown, not a fatal Demo
// error and not a recorded zero-degree direction.
func playerViewAngles(player *common.Player) (pitch, yaw float64, ok bool) {
	if player == nil {
		return 0, 0, false
	}
	pawn := player.PlayerPawnEntity()
	if pawn == nil {
		return 0, 0, false
	}
	value, present := pawn.PropertyValue("m_angEyeAngles")
	if !present {
		return 0, 0, false
	}
	switch angles := value.Any.(type) {
	case [3]float32:
		pitch, yaw = float64(angles[0]), float64(angles[1])
	case []float32:
		if len(angles) < 2 {
			return 0, 0, false
		}
		pitch, yaw = float64(angles[0]), float64(angles[1])
	default:
		return 0, 0, false
	}
	if math.IsNaN(pitch) || math.IsInf(pitch, 0) || math.IsNaN(yaw) || math.IsInf(yaw, 0) {
		return 0, 0, false
	}
	if pitch > 180 {
		pitch -= 360
	}
	if yaw > 180 {
		yaw -= 360
	}
	return pitch, yaw, true
}

func equipmentName(item *common.Equipment) string {
	if item.Type == common.EqHE {
		return "High Explosive Grenade"
	}
	if item.Type == common.EqM4A1 {
		return "M4A1-S"
	}
	if item.Type == common.EqKnife {
		if index, ok := entityValue(item.Entity, "m_iItemDefinitionIndex").(uint64); ok {
			switch index {
			case 42:
				return "knife"
			case 59:
				return "knife_t"
			default:
				if knife, found := common.KnifeTypeIndexMapping[index]; found {
					return knife.String()
				}
			}
		}
	}
	if item.Type == common.EqBomb {
		return "C4 Explosive"
	}
	return item.String()
}

func playerValue(player *common.Player, name string, commandButtons map[int]uint64) any {
	pawn := player.PlayerPawnEntity()
	switch name {
	case "X", "Y", "Z":
		if pawn == nil {
			return nil
		}
		position := player.Position()
		switch name {
		case "X":
			return position.X
		case "Y":
			return position.Y
		default:
			return position.Z
		}
	case "health":
		if pawn == nil {
			return nil
		}
		return player.Health()
	case "team_num":
		return int(player.Team)
	case "pitch", "yaw":
		pitch, yaw, ok := playerViewAngles(player)
		if !ok {
			return nil
		}
		if name == "pitch" {
			return pitch
		}
		return yaw
	case "duck_amount":
		return entityValue(pawn, "m_pMovementServices.m_flDuckAmount")
	case "user_id":
		return player.UserID
	case "team_rounds_total":
		if player.TeamState != nil {
			return player.TeamState.Score()
		}
		return nil
	case "active_weapon_name":
		if pawn == nil {
			return nil
		}
		if weapon := player.ActiveWeapon(); weapon != nil {
			return equipmentName(weapon)
		}
		return nil
	case "CCSPlayerPawn.CCSPlayer_WeaponServices.m_hActiveWeapon":
		return entityValue(pawn, "m_pWeaponServices.m_hActiveWeapon")
	case "inventory":
		items := []string{}
		if entityValue(pawn, "m_lifeState") != uint64(0) {
			return items
		}
		handles, ok := entityValue(pawn, "m_pWeaponServices.m_hMyWeapons").([]any)
		if !ok {
			return nil
		}
		seen := map[int]bool{}
		for _, value := range handles {
			handle, ok := value.(uint64)
			if !ok {
				continue
			}
			id := int(handle & ((1 << 14) - 1))
			if seen[id] {
				continue
			}
			seen[id] = true
			if item := player.Inventory[id]; item != nil {
				items = append(items, equipmentName(item))
			}
		}
		return items
	case "armor_value":
		return player.Armor()
	case "has_helmet":
		return player.HasHelmet()
	case "has_defuser":
		return player.HasDefuseKit()
	case "flash_duration":
		return float64(player.FlashDuration)
	case "flash_max_alpha":
		return entityValue(pawn, "m_flFlashMaxAlpha")
	case "is_scoped":
		return player.IsScoped()
	case "is_walking":
		return player.IsWalking()
	case "active_weapon_ammo":
		if pawn == nil {
			return nil
		}
		if weapon := player.ActiveWeapon(); weapon != nil {
			if weapon.Type == common.EqKnife {
				return 0
			}
			if ammo := entityValue(weapon.Entity, "m_iClip1"); ammo != nil {
				if ammo == uint64(4294967295) || ammo == uint32(4294967295) || ammo == int32(-1) {
					return 0
				}
				return ammo
			}
			return weapon.AmmoInMagazine()
		}
		return nil
	case "is_alive":
		if entityValue(pawn, "m_lifeState") == nil {
			return nil
		}
		return integerProperty(pawn, "m_lifeState") == 0
	case "is_defusing":
		return player.IsDefusing
	case "balance":
		return player.Money()
	case "cash_spent_this_round":
		return player.MoneySpentThisRound()
	case "round_start_equip_value":
		return player.EquipmentValueRoundStart()
	case "current_equip_value":
		return player.EquipmentValueCurrent()
	case "is_airborne":
		return player.IsAirborne()
	case "last_place_name":
		return player.LastPlaceName()
	case "FIRE", "RIGHTCLICK", "FORWARD", "BACK", "LEFT", "RIGHT", "WALK":
		mask, available := entityValue(pawn, "m_pMovementServices.m_nButtonDownMaskPrev").(uint64)
		if !available && player.Entity != nil {
			mask, available = commandButtons[player.Entity.ID()-1]
		}
		if !available {
			return nil
		}
		return mask&uint64(buttonMasks[name]) != 0
	}
	if strings.HasPrefix(name, "CCSPlayerController.") {
		return entityValue(player.Entity, strings.TrimPrefix(name, "CCSPlayerController."))
	}
	if strings.HasPrefix(name, "CCSPlayerPawn.") {
		return entityValue(pawn, strings.TrimPrefix(name, "CCSPlayerPawn."))
	}
	return nil
}

// ParseTicks samples the requested server ticks without retaining every frame.
func ParseTicks(data []byte, ticks []int, props, players []string) ([]map[string]any, error) {
	return parseTicksWithContext(context.Background(), data, ticks, props, players)
}

func parseTicksWithContext(ctx context.Context, data []byte, ticks []int, props, players []string) ([]map[string]any, error) {
	wanted := make(map[int]struct{}, len(ticks))
	for _, tick := range ticks {
		wanted[tick] = struct{}{}
	}
	selected := make(map[string]struct{}, len(players))
	for _, player := range players {
		selected[player] = struct{}{}
	}
	rows := []map[string]any{}
	parser := newParserWithContext(ctx, data, dem.UserCmdParsingFull)
	commandButtons := map[int]uint64{}
	parser.RegisterEventHandler(func(event events.UserCmd) {
		buttons := event.Command.GetBase().GetButtonsPb()
		if buttons != nil && buttons.Buttonstate1 != nil {
			commandButtons[int(event.PlayerSlot)] = buttons.GetButtonstate1()
		}
	})
	defer parser.Close()
	parser.RegisterEventHandler(func(events.FrameDone) {
		tick := parser.GameState().IngameTick()
		if _, ok := wanted[tick]; !ok {
			return
		}
		for _, player := range parser.GameState().Participants().All() {
			if player == nil || player.Name == "" {
				continue
			}
			team := int(player.Team)
			if team != 2 && team != 3 {
				team = integerProperty(player.Entity, "m_iTeamNum")
				if team != 2 && team != 3 {
					team = integerProperty(player.Entity, "m_iPendingTeamNum")
				}
			}
			if team != 2 && team != 3 {
				continue
			}
			steamID := strconv.FormatUint(player.SteamID64, 10)
			if len(selected) > 0 {
				if _, ok := selected[steamID]; !ok {
					continue
				}
			}
			row := map[string]any{"tick": tick, "steamid": steamID, "name": player.Name}
			for _, prop := range props {
				row[prop] = playerValue(player, prop, commandButtons)
			}
			rows = append(rows, row)
		}
	})
	if err := parser.ParseToEnd(); err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		left, right := rows[i], rows[j]
		if left["tick"].(int) != right["tick"].(int) {
			return left["tick"].(int) < right["tick"].(int)
		}
		return left["steamid"].(string) < right["steamid"].(string)
	})
	return rows, nil
}
