package goparser

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

func vectorProperty(entity st.Entity, name string) []float64 {
	if value, ok := entity.PropertyValue(name); ok {
		v := value.R3Vec()
		return []float64{v.X, v.Y, v.Z}
	}
	return nil
}

func integerProperty(entity st.Entity, name string) int {
	if entity == nil {
		return 0
	}
	if value, ok := entity.PropertyValue(name); ok {
		switch n := value.Any.(type) {
		case int32:
			return int(n)
		case uint32:
			return int(n)
		case int64:
			return int(n)
		case uint64:
			return int(n)
		}
	}
	return 0
}

func floatProperty(entity st.Entity, name string) float64 {
	if value, ok := entity.PropertyValue(name); ok {
		switch n := value.Any.(type) {
		case float32:
			return float64(n)
		case float64:
			return n
		}
	}
	return 0
}

func arrayBits(entity st.Entity, name string, count int) []uint32 {
	values := make([]uint32, 0, count*3)
	for i := 0; i < count; i++ {
		value, ok := entity.PropertyValue(fmt.Sprintf("%s.%04d", name, i))
		if !ok {
			values = append(values, 0, 0, 0)
			continue
		}
		v := value.R3Vec()
		values = append(values, math.Float32bits(float32(v.X)), math.Float32bits(float32(v.Y)), math.Float32bits(float32(v.Z)))
	}
	return values
}

func smokeBytes(entity st.Entity, start, count int) ([]int, bool) {
	if start < 0 || count < start || count > 65536 {
		return nil, false
	}
	data := make([]int, count-start)
	for i := range data {
		value, ok := entity.PropertyValue(fmt.Sprintf("m_VoxelFrameData.%04d", start+i))
		if !ok {
			return nil, false
		}
		switch n := value.Any.(type) {
		case int32:
			data[i] = int(byte(n))
		case uint32:
			data[i] = int(byte(n))
		case uint64:
			data[i] = int(byte(n))
		default:
			return nil, false
		}
	}
	return data, true
}

// ParseGrenades returns the projectile and effect journals consumed by parserRuntime.
func ParseGrenades(data []byte) ([]map[string]any, error) {
	return parseGrenadesWithContext(context.Background(), data)
}

func parseGrenadesWithContext(ctx context.Context, data []byte) ([]map[string]any, error) {
	parser := newParserWithContext(ctx, data, dem.UserCmdParsingDisabled)
	defer parser.Close()
	rows := []map[string]any{}
	previousSmokeSize := map[int]int{}
	previousFire := map[int]string{}
	previousThrowTime := map[int]float64{}
	weaponOwner := map[int]*common.Player{}
	previousSerial := map[int]int{}
	parser.RegisterEventHandler(func(events.FrameDone) {
		tick := parser.GameState().IngameTick()
		for _, player := range parser.GameState().Participants().All() {
			if player == nil {
				continue
			}
			for _, item := range player.Inventory {
				if item != nil && item.Entity != nil {
					weaponOwner[item.Entity.ID()] = player
				}
			}
		}
		entities := parser.GameState().Entities()
		ids := make([]int, 0, len(entities))
		for id, entity := range entities {
			if entity == nil || entity.ServerClass() == nil {
				continue
			}
			name := entity.ServerClass().Name()
			if strings.Contains(name, "Projectile") || strings.Contains(name, "Inferno") || strings.Contains(name, "Grenade") || strings.Contains(name, "Flashbang") || strings.Contains(name, "Molotov") || strings.Contains(name, "Incendiary") || strings.Contains(name, "Decoy") {
				ids = append(ids, id)
			}
		}
		sort.Ints(ids)
		for _, id := range ids {
			entity := entities[id]
			if serial, exists := previousSerial[id]; !exists || serial != entity.SerialNum() {
				delete(previousSmokeSize, id)
				delete(previousFire, id)
				delete(previousThrowTime, id)
				delete(weaponOwner, id)
				previousSerial[id] = entity.SerialNum()
				// Ownership may already have been discovered this frame.
				for _, player := range parser.GameState().Participants().All() {
					if player != nil {
						if item := player.Inventory[id]; item != nil && item.Entity == entity {
							weaponOwner[id] = player
						}
					}
				}
			}
			class := entity.ServerClass().Name()
			row := map[string]any{"tick": tick, "entity_id": id, "grenade_type": class}
			if !strings.Contains(class, "Projectile") && !strings.Contains(class, "Inferno") {
				throwTime := floatProperty(entity, "m_fThrowTime")
				if throwTime <= 0 || throwTime == previousThrowTime[id] {
					continue
				}
				previousThrowTime[id] = throwTime
				row["Grenade.m_fThrowTime"] = throwTime
				row["Grenade.m_flThrowStrength"] = floatProperty(entity, "m_flThrowStrength")
				if jump, ok := entity.PropertyValue("m_bJumpThrow"); ok {
					row["Grenade.m_bJumpThrow"] = jump.BoolVal()
				}
				if owner := weaponOwner[id]; owner != nil {
					row["name"] = owner.Name
					row["steamid"] = strconv.FormatUint(owner.SteamID64, 10)
				}
				rows = append(rows, row)
				continue
			}
			if strings.Contains(class, "Inferno") {
				count := integerProperty(entity, "m_fireCount")
				if count < 0 || count > 64 {
					continue
				}
				positions := arrayBits(entity, "m_firePositions", 64)
				normals := arrayBits(entity, "m_BurnNormal", 64)
				burning := make([]int, 64)
				for i := range burning {
					if value, ok := entity.PropertyValue(fmt.Sprintf("m_bFireIsBurning.%04d", i)); ok && value.BoolVal() {
						burning[i] = 1
					}
				}
				signature := fmt.Sprint(count, positions[:count*3], normals[:count*3], burning[:count])
				if previousFire[id] == signature {
					continue
				}
				previousFire[id] = signature
				row["Grenade.m_fireCount"] = count
				row["Grenade.m_firePositions"] = positions
				row["Grenade.m_BurnNormal"] = normals
				row["Grenade.m_bFireIsBurning"] = burning
				row["Grenade.m_nFireLifetime"] = integerProperty(entity, "m_nFireLifetime")
				rows = append(rows, row)
				continue
			}
			position := entity.Position()
			row["x"], row["y"], row["z"] = position.X, position.Y, position.Z
			if projectile := parser.GameState().GrenadeProjectiles()[id]; projectile != nil && projectile.Thrower != nil {
				row["name"] = projectile.Thrower.Name
				row["steamid"] = strconv.FormatUint(projectile.Thrower.SteamID64, 10)
			}
			row["Grenade.m_vInitialVelocity"] = vectorProperty(entity, "m_vInitialVelocity")
			if strings.Contains(class, "SmokeGrenadeProjectile") {
				row["Grenade.m_vSmokeDetonationPos"] = vectorProperty(entity, "m_vSmokeDetonationPos")
				row["Grenade.m_nVoxelUpdate"] = integerProperty(entity, "m_nVoxelUpdate")
				size := integerProperty(entity, "m_nVoxelFrameDataSize")
				row["Grenade.m_nVoxelFrameDataSize"] = size
				start := previousSmokeSize[id]
				if size < start {
					start = 0
				}
				// The log is append-only within an entity lifetime. Reading
				// the unchanged prefix each frame makes smoke parsing quadratic.
				if chunk, complete := smokeBytes(entity, start, size); complete {
					row["Grenade.m_VoxelFrameData"] = chunk
					previousSmokeSize[id] = size
				}
			}
			rows = append(rows, row)
		}
	})
	if err := parser.ParseToEnd(); err != nil {
		return nil, err
	}
	return rows, nil
}
