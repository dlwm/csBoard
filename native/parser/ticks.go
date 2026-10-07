package goparser

import (
	"context"
	"math"
	"sort"
	"strings"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/constants"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

var buttonMasks = map[string]common.ButtonBitMask{
	"FIRE": common.ButtonAttack, "RIGHTCLICK": common.ButtonAttack2, "JUMP": common.ButtonJump,
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

// Resolve the optional active-weapon handle from the same authoritative map
// used by the library, without ActiveWeaponID's PropertyValueMust. Missing or
// invalid handles stay unknown; never substitute an inventory weapon.
// 用库的武器实体表解析句柄，缺失不猜背包中的武器，不因实体过渡使整份录像失败。
func playerActiveWeapon(pawn st.Entity, weapons map[int]*common.Equipment) *common.Equipment {
	handle, ok := entityValue(pawn, "m_pWeaponServices.m_hActiveWeapon").(uint64)
	if !ok || handle == constants.InvalidEntityHandleSource2 {
		return nil
	}
	return weapons[int(handle&constants.EntityHandleIndexMaskSource2)]
}

// Tick properties are optional during entity transitions. Read scalar fields
// with PropertyValue, not convenience getters that call PropertyValueMust.
// 缺字段统一保留 null，不伪造默认状态，也不通过 recover 吞掉其他解析错误。
func playerValue(player *common.Player, name string, commandButtons map[int]uint64, weapons map[int]*common.Equipment) any {
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
		// Pawn handles can resolve before their health property is available.
		// Missing health is unknown (null), not zero/dead or a fatal tick error.
		// 实体生命周期中缺失生命值时保留未知值，避免 Must 读取导致整份录像失败。
		return entityValue(pawn, "m_iHealth")
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
			return entityValue(player.TeamState.Entity, "m_iScore")
		}
		return nil
	case "grenade_pin_pulled", "grenade_throw_strength":
		if pawn == nil {
			return nil
		}
		if weapon := playerActiveWeapon(pawn, weapons); weapon != nil {
			if name == "grenade_pin_pulled" {
				return entityValue(weapon.Entity, "m_bPinPulled")
			}
			return entityValue(weapon.Entity, "m_flThrowStrength")
		}
		return nil
	case "active_weapon_name":
		if pawn == nil {
			return nil
		}
		if weapon := playerActiveWeapon(pawn, weapons); weapon != nil {
			return equipmentName(weapon)
		}
		return nil
	case "CCSPlayerPawn.CCSPlayer_WeaponServices.m_hActiveWeapon":
		return entityValue(pawn, "m_pWeaponServices.m_hActiveWeapon")
	case "inventory":
		items := []string{}
		lifeState := entityValue(pawn, "m_lifeState")
		if lifeState == nil {
			return nil
		}
		if lifeState != uint64(0) {
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
		return entityValue(pawn, "m_ArmorValue")
	case "has_helmet":
		return entityValue(pawn, "m_pItemServices.m_bHasHelmet")
	case "has_defuser":
		return entityValue(pawn, "m_pItemServices.m_bHasDefuser")
	case "flash_duration":
		return float64(player.FlashDuration)
	case "flash_max_alpha":
		return entityValue(pawn, "m_flFlashMaxAlpha")
	case "is_scoped":
		return entityValue(pawn, "m_bIsScoped")
	case "is_walking":
		return entityValue(pawn, "m_bIsWalking")
	case "active_weapon_ammo":
		if pawn == nil {
			return nil
		}
		if weapon := playerActiveWeapon(pawn, weapons); weapon != nil {
			if weapon.Type == common.EqKnife {
				return 0
			}
			if ammo := entityValue(weapon.Entity, "m_iClip1"); ammo != nil {
				if ammo == uint64(4294967295) || ammo == uint32(4294967295) || ammo == int32(-1) {
					return 0
				}
				return ammo
			}
			// Grenades/equipment have one item, not a magazine property.
			if weapon.Class() == common.EqClassGrenade || weapon.Class() == common.EqClassEquipment {
				return 1
			}
			return nil
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
		return entityValue(player.Entity, "m_pInGameMoneyServices.m_iAccount")
	case "cash_spent_this_round":
		return entityValue(player.Entity, "m_pInGameMoneyServices.m_iCashSpentThisRound")
	case "round_start_equip_value":
		return entityValue(pawn, "m_unRoundStartEquipmentValue")
	case "current_equip_value":
		return entityValue(pawn, "m_unCurrentEquipmentValue")
	case "is_airborne":
		handle, available := entityValue(pawn, "m_hGroundEntity").(uint64)
		if !available {
			return nil
		}
		return handle == constants.InvalidEntityHandleSource2
	case "last_place_name":
		return entityValue(pawn, "m_szLastPlaceName")
	case "FIRE", "RIGHTCLICK", "FORWARD", "BACK", "LEFT", "RIGHT", "JUMP", "WALK":
		// The fork restores checkpoint commands directly onto the Player, without
		// dispatching UserCmd events. Read that authoritative state first.
		// 检查点按键不派发 UserCmd 事件，须读取库恢复到 Player 的状态。
		if player.ButtonsStateAvailable {
			return player.ButtonsPressedState&uint64(buttonMasks[name]) != 0
		}
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
	rows, _, err := parseTicksWithPreparation(ctx, data, ticks, props, players, nil)
	return rows, err
}

func parseTicksWithPreparation(ctx context.Context, data []byte, ticks []int, props, players []string, throws []ThrowPreparation) ([]map[string]any, []int, error) {
	wanted := make(map[int]struct{}, len(ticks))
	for _, tick := range ticks {
		wanted[tick] = struct{}{}
	}
	selected := make(map[string]struct{}, len(players))
	for _, player := range players {
		selected[player] = struct{}{}
	}
	rows := []map[string]any{}
	histories := map[string]*preparationHistory{}
	plans := map[string][]ThrowPreparation{}
	cursors := map[string]int{}
	for _, target := range throws {
		key := target.SteamID
		if key == "" {
			key = "name:" + target.Name
		}
		plans[key] = append(plans[key], target)
	}
	for key := range plans {
		sort.SliceStable(plans[key], func(i, j int) bool { return plans[key][i].Tick < plans[key][j].Tick })
	}
	preparationProps := []string{"X", "Y", "Z", "health", "team_num", "pitch", "yaw", "duck_amount", "is_airborne", "is_walking", "FIRE", "RIGHTCLICK", "FORWARD", "BACK", "LEFT", "RIGHT", "JUMP", "WALK", "active_weapon_name", "has_defuser", "last_place_name", "grenade_pin_pulled", "grenade_throw_strength"}
	preparationTicks := map[int]bool{}
	extraRows := map[int]map[string]bool{}
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
		_, requested := wanted[tick]
		if !requested && len(throws) == 0 {
			return
		}
		weapons := parser.GameState().Weapons()
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
			steamID := playerIdentity(player)
			if len(selected) > 0 {
				if _, ok := selected[steamID]; !ok {
					continue
				}
			}
			planKey := steamID
			if len(plans[planKey]) == 0 {
				planKey = "name:" + player.Name
			}
			plan := plans[planKey]
			cursor := cursors[planKey]
			for cursor < len(plan) && tick > plan[cursor].Tick {
				cursor++
			}
			cursors[planKey] = cursor
			preparing := cursor < len(plan) && tick >= plan[cursor].StartTick
			if !requested && !preparing {
				continue
			}
			row := map[string]any{"tick": tick, "steamid": steamID, "name": player.Name}
			rowProps := props
			if !requested {
				rowProps = preparationProps
			}
			for _, prop := range rowProps {
				row[prop] = playerValue(player, prop, commandButtons, weapons)
			}
			if requested {
				rows = append(rows, row)
			}
			if preparing {
				history := histories[steamID]
				if history == nil {
					history = &preparationHistory{}
					histories[steamID] = history
				}
				history.append(row)
				target := plan[cursor]
				if target.Tick == tick {
					for _, sample := range history.rows {
						sampleTick := sample["tick"].(int)
						if sampleTick < target.StartTick {
							continue
						}
						preparationTicks[sampleTick] = true
						if _, recorded := wanted[sampleTick]; recorded {
							continue
						}
						if extraRows[sampleTick] == nil {
							extraRows[sampleTick] = map[string]bool{}
						}
						if !extraRows[sampleTick][steamID] {
							rows = append(rows, sample)
							extraRows[sampleTick][steamID] = true
						}
					}
				}
			}
		}
	})
	if err := parser.ParseToEnd(); err != nil {
		return nil, nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		left, right := rows[i], rows[j]
		if left["tick"].(int) != right["tick"].(int) {
			return left["tick"].(int) < right["tick"].(int)
		}
		return left["steamid"].(string) < right["steamid"].(string)
	})
	preparation := make([]int, 0, len(preparationTicks))
	for tick := range preparationTicks {
		preparation = append(preparation, tick)
	}
	sort.Ints(preparation)
	return rows, preparation, nil
}
