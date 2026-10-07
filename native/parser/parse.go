package goparser

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/msg"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

type RawEvent struct {
	Name string         `json:"name"`
	Tick int            `json:"tick"`
	Data map[string]any `json:"data"`
}

// Report retains metadata and normalized events for one source session.
// Player samples and effect journals are queried separately.
type Report struct {
	VoiceFrames       []VoiceFrame      `json:"voiceFrames"`
	VoiceSummary      VoiceSummary      `json:"voiceSummary"`
	Protocol          int               `json:"protocol"`
	Map               string            `json:"map"`
	Header            map[string]string `json:"header"`
	FirstTick         int               `json:"firstTick"`
	LastTick          int               `json:"lastTick"`
	IsHLTV            *bool             `json:"isHltv,omitempty"`
	StandardTeamsSeen bool              `json:"standardTeamsSeen"`
	Frames            int               `json:"frames"`
	EventCounts       map[string]int    `json:"eventCounts"`
	Events            []RawEvent        `json:"events"`
	SemanticEvents    []RawEvent        `json:"semanticEvents"`
	ProductEvents     []map[string]any  `json:"productEvents"`
	PlayerNames       []string          `json:"playerNames"`
}

var roundReasons = [...]string{
	"still_in_progress", "bomb_exploded", "vip_escaped", "vip_killed", "t_saved",
	"ct_stopped_escape", "RoundEndReasonTerroristsStopped", "bomb_defused", "t_killed", "ct_killed",
	"draw", "hostage_rescued", "time_ran_out", "RoundEndReasonHostagesNotRescued",
	"terrorists_not_escaped", "vip_not_escaped", "game_start", "t_surrender", "ct_surrender",
	"t_planted", "ct_reached_hostage",
}

var hitGroups = map[int32]string{0: "generic", 1: "head", 2: "chest", 3: "stomach", 4: "left_arm", 5: "right_arm", 6: "left_leg", 7: "right_leg", 8: "neck", 10: "gear"}

func eventValue(key *msg.CMsgSource1LegacyGameEventKeyT) any {
	if key == nil {
		return nil
	}
	// Source 2 keys can carry a value with a non-standard type code. Prefer
	// the populated protobuf field over the legacy type discriminator.
	switch {
	case key.ValString != nil:
		return key.GetValString()
	case key.ValFloat != nil:
		return key.GetValFloat()
	case key.ValLong != nil:
		return key.GetValLong()
	case key.ValShort != nil:
		return key.GetValShort()
	case key.ValByte != nil:
		return key.GetValByte()
	case key.ValBool != nil:
		return key.GetValBool()
	case key.ValUint64 != nil:
		return strconv.FormatUint(key.GetValUint64(), 10)
	}
	switch key.GetType() {
	case 1:
		return key.GetValString()
	case 2:
		return key.GetValFloat()
	case 3:
		return key.GetValLong()
	case 4:
		return key.GetValShort()
	case 5:
		return key.GetValByte()
	case 6:
		return key.GetValBool()
	case 7:
		// Steam IDs exceed JavaScript's exact integer range.
		return strconv.FormatUint(key.GetValUint64(), 10)
	default:
		return nil
	}
}

func purchaseName(index uint64) string {
	switch index {
	case 42:
		return "knife"
	case 59:
		return "knife_t"
	case 49:
		return "C4 Explosive"
	case 50:
		return "Kevlar Vest"
	case 51:
		return "Kevlar & Helmet"
	case 44:
		return "High Explosive Grenade"
	case 60:
		return "M4A1-S"
	}
	if kind, ok := common.EquipmentIndexMapping[index]; ok {
		if kind == common.EqKnife {
			if knife, found := common.KnifeTypeIndexMapping[index]; found {
				return knife.String()
			}
		}
		return kind.String()
	}
	return ""
}

func Parse(data []byte) (Report, error) { return parseWithContext(context.Background(), data) }

func parseWithContext(ctx context.Context, data []byte) (Report, error) {
	result := Report{Protocol: 1, EventCounts: make(map[string]int), Events: []RawEvent{}, SemanticEvents: []RawEvent{}, ProductEvents: []map[string]any{}, FirstTick: -1}
	if len(data) < 8 || string(data[:8]) != "PBDEMS2\x00" {
		return result, fmt.Errorf("invalid Source 2 demo header")
	}
	parser := newParserWithContext(ctx, data, dem.UserCmdParsingDisabled)
	defer parser.Close()
	trackVoice(parser, &result)
	names := make(map[string]struct{})
	seenFrame := false
	round := 0
	firstPrestartTick := -1
	initialSemanticRound := false
	counterRoundTicks := []int{}
	parser.RegisterEventHandler(func(events.DataTablesParsed) {
		class := parser.ServerClasses().FindByName("CCSGameRulesProxy")
		if class == nil {
			return
		}
		class.OnEntityCreated(func(entity st.Entity) {
			if prop := entity.Property("m_pGameRules.m_nRoundStartCount"); prop != nil {
				prop.OnUpdate(func(st.PropertyValue) { counterRoundTicks = append(counterRoundTicks, parser.GameState().IngameTick()) })
			}
		})
	})
	purchases := trackPurchases(parser, &result.ProductEvents)
	playerFor := func(values map[string]any, key string) *common.Player {
		id, ok := values[key].(int32)
		if !ok || id < 0 || id == 65535 {
			return nil
		}
		if id <= 65535 {
			id &= 0xff
		}
		player := parser.GameState().Participants().ByUserID()[int(id)]
		if player == nil {
			player = parser.GameState().Participants().AllByUserID()[int(id)]
		}
		return player
	}
	addPlayer := func(row map[string]any, prefix string, player *common.Player) {
		if player == nil {
			return
		}
		row[prefix+"_name"] = player.Name
		row[prefix+"_steamid"] = playerIdentity(player)
		row[prefix+"_team_num"] = int(player.Team)
		if player.PlayerPawnEntity() == nil {
			return
		}
		position := player.Position()
		row[prefix+"_X"], row[prefix+"_Y"], row[prefix+"_Z"] = position.X, position.Y, position.Z
		if pitch, yaw, ok := playerViewAngles(player); ok {
			row[prefix+"_pitch"], row[prefix+"_yaw"] = pitch, yaw
		}
	}
	parser.RegisterNetMessageHandler(func(header *msg.CDemoFileHeader) {
		result.Header = map[string]string{
			"demo_file_stamp": header.GetDemoFileStamp(), "patch_version": strconv.Itoa(int(header.GetPatchVersion())),
			"server_name": header.GetServerName(), "client_name": header.GetClientName(),
			"map_name": header.GetMapName(), "game_directory": header.GetGameDirectory(),
			"fullpackets_version":        strconv.Itoa(int(header.GetFullpacketsVersion())),
			"allow_clientside_entities":  strconv.FormatBool(header.GetAllowClientsideEntities()),
			"allow_clientside_particles": strconv.FormatBool(header.GetAllowClientsideParticles()),
			"addons":                     header.GetAddons(), "demo_version_name": header.GetDemoVersionName(),
			"demo_version_guid": header.GetDemoVersionGuid(),
		}
	})
	parser.RegisterNetMessageHandler(func(server *msg.CSVCMsg_ServerInfo) {
		isHLTV := server.GetIsHltv()
		result.IsHLTV = &isHLTV
		if result.Map == "" {
			result.Map = server.GetMapName()
		}
	})
	parser.RegisterEventHandler(func(event events.GenericGameEvent) {
		result.EventCounts[event.Name]++
		data := make(map[string]any, len(event.Data))
		for name, value := range event.Data {
			data[name] = eventValue(value)
		}
		result.Events = append(result.Events, RawEvent{Name: event.Name, Tick: parser.GameState().IngameTick(), Data: data})
		if event.Name == "round_prestart" {
			if firstPrestartTick < 0 {
				firstPrestartTick = parser.GameState().IngameTick()
			}
			round++
			result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_start", "round": round, "tick": parser.GameState().IngameTick()})
			return
		}
		row := make(map[string]any, len(data)+15)
		for key, value := range data {
			row[key] = value
		}
		if value, ok := row["hitgroup"].(int32); ok {
			if name, found := hitGroups[value]; found {
				row["hitgroup"] = name
			} else {
				row["hitgroup"] = strconv.Itoa(int(value))
			}
		}
		row["event_name"] = event.Name
		row["tick"] = parser.GameState().IngameTick()
		addPlayer(row, "user", playerFor(data, "userid"))
		addPlayer(row, "attacker", playerFor(data, "attacker"))
		addPlayer(row, "assister", playerFor(data, "assister"))
		if event.Name == "grenade_thrown" {
			if player := playerFor(data, "userid"); player != nil && player.PlayerPawnEntity() != nil {
				pawn := player.PlayerPawnEntity()
				if entityValue(pawn, "m_vecVelocity.m_vecX") != nil && entityValue(pawn, "m_vecVelocity.m_vecY") != nil && entityValue(pawn, "m_vecVelocity.m_vecZ") != nil {
					velocity := player.Velocity()
					row["user_velocity"] = math.Hypot(velocity.X, velocity.Y)
					row["user_velocity_X"], row["user_velocity_Y"], row["user_velocity_Z"] = velocity.X, velocity.Y, velocity.Z
				}
				row["user_active_weapon_name"] = playerValue(player, "active_weapon_name", nil, parser.GameState().Weapons())
			}
		}
		result.ProductEvents = append(result.ProductEvents, row)
	})
	parser.RegisterNetMessageHandler(func(event *msg.CMsgTEFireBullets) {
		entityID := int(event.GetPlayer() & ((1 << 14) - 1))
		row := map[string]any{
			"event_name": "fire_bullets", "tick": parser.GameState().IngameTick(),
			"round": round, "weapon_id": event.GetWeaponId(), "item_def_index": event.GetItemDefIndex(),
			"player": event.GetPlayer(), "mode": event.GetMode(), "attack_type": event.GetAttackType(),
			"seed": event.GetSeed(), "inaccuracy": float64(event.GetInaccuracy()),
			"recoil_index": float64(event.GetRecoilIndex()), "spread": float64(event.GetSpread()),
			"num_bullets_remaining": event.GetNumBulletsRemaining(), "sound_type": event.GetSoundType(),
			"sound_dsp_effect": event.GetSoundDspEffect(), "player_inair": event.GetPlayerInair(),
			"player_scoped": event.GetPlayerScoped(),
		}
		if v := event.GetOrigin(); v != nil {
			row["origin_x"], row["origin_y"], row["origin_z"] = float64(v.GetX()), float64(v.GetY()), float64(v.GetZ())
		}
		if v := event.GetAngles(); v != nil {
			row["angles_x"], row["angles_y"], row["angles_z"] = float64(v.GetX()), float64(v.GetY()), float64(v.GetZ())
		}
		if v := event.GetEntOrigin(); v != nil {
			row["ent_origin_x"], row["ent_origin_y"], row["ent_origin_z"] = float64(v.GetX()), float64(v.GetY()), float64(v.GetZ())
		}
		for _, player := range parser.GameState().Participants().All() {
			if player != nil && player.PlayerPawnEntity() != nil && player.PlayerPawnEntity().ID() == entityID {
				addPlayer(row, "user", player)
				break
			}
		}
		result.ProductEvents = append(result.ProductEvents, row)
	})
	semantic := func(name string, data map[string]any) {
		result.SemanticEvents = append(result.SemanticEvents, RawEvent{Name: name, Tick: parser.GameState().IngameTick(), Data: data})
	}
	parser.RegisterEventHandler(func(event events.RoundStart) {
		semantic("round_start", map[string]any{"timeLimit": event.TimeLimit, "fragLimit": event.FragLimit, "objective": event.Objective})
		if parser.GameState().IngameTick() == 0 {
			initialSemanticRound = true
		}
	})
	parser.RegisterEventHandler(func(events.RoundFreezetimeEnd) {
		semantic("round_freeze_end", nil)
	})
	parser.RegisterEventHandler(func(event events.RoundEnd) {
		semantic("round_end", map[string]any{"reason": event.Reason, "winner": event.Winner})
		var reason any
		if int(event.Reason) < len(roundReasons) {
			reason = roundReasons[event.Reason]
		}
		var winner any
		if event.Winner == common.TeamTerrorists {
			winner = "T"
		} else if event.Winner == common.TeamCounterTerrorists {
			winner = "CT"
		}
		result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_end", "tick": parser.GameState().IngameTick(), "reason": reason, "winner": winner, "round": round - 1})
	})
	parser.RegisterEventHandler(func(events.RoundEndOfficial) {
		semantic("round_officially_ended", nil)
	})
	parser.RegisterEventHandler(func(events.FrameDone) {
		tick := parser.GameState().IngameTick()
		purchases(tick)
		if !seenFrame {
			result.FirstTick = tick
			seenFrame = true
		}
		result.LastTick = tick
		result.Frames++
		tCount, ctCount := 0, 0
		for _, player := range parser.GameState().Participants().All() {
			if player != nil && player.Name != "" {
				names[player.Name] = struct{}{}
				if !result.StandardTeamsSeen {
					switch player.Team {
					case common.TeamTerrorists:
						tCount++
					case common.TeamCounterTerrorists:
						ctCount++
					}
				}
			}
		}
		if tCount == 5 && ctCount == 5 {
			result.StandardTeamsSeen = true
		}
	})
	if err := parser.ParseToEnd(); err != nil {
		return result, err
	}
	if firstPrestartTick < 0 {
		if len(counterRoundTicks) > 0 {
			for _, tick := range counterRoundTicks {
				result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_start", "tick": tick})
			}
		} else {
			for _, event := range result.SemanticEvents {
				if event.Name == "round_start" {
					result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_start", "tick": event.Tick})
				}
			}
		}
		if initialSemanticRound {
			result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_end", "tick": 0, "reason": nil, "winner": nil})
		}
	} else if initialSemanticRound {
		result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_start", "tick": 0})
	} else if firstPrestartTick >= 0 {
		result.ProductEvents = append(result.ProductEvents, map[string]any{"event_name": "round_end", "tick": firstPrestartTick, "reason": nil, "winner": nil})
	}
	sort.SliceStable(result.ProductEvents, func(i, j int) bool {
		return result.ProductEvents[i]["tick"].(int) < result.ProductEvents[j]["tick"].(int)
	})
	result.ProductEvents = finalizePurchases(result.ProductEvents)
	roundNumber := 0
	firstStartTick := -1
	for _, row := range result.ProductEvents {
		if row["event_name"] == "round_end" {
			if row["reason"] == nil && row["tick"] == firstStartTick && roundNumber == 1 {
				row["round"] = 0
			} else {
				row["round"] = roundNumber
			}
		} else if row["event_name"] == "round_start" {
			roundNumber++
			if firstStartTick < 0 {
				firstStartTick = row["tick"].(int)
			}
			row["round"] = roundNumber
		}
	}
	for name := range names {
		result.PlayerNames = append(result.PlayerNames, name)
	}
	sort.Strings(result.PlayerNames)
	return result, nil
}
