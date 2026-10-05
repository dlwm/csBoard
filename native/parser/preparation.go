package goparser

import "math"

// ThrowPreparation requests a continuous action history ending at release.
// 回溯投掷前最后一个静止描点；不设固定两秒窗口，不保留整场逐帧数据。
type ThrowPreparation struct {
	Tick      int    `json:"tick"`
	StartTick int    `json:"startTick"`
	SteamID   string `json:"steamid"`
	Name      string `json:"name"`
}

type preparationHistory struct {
	rows        []map[string]any
	pinActive   bool
	releaseTick int
}

// Keep 250ms of the latest grounded rest as an aiming lead-in. Once motion
// begins, retain every tick until release, regardless of run-up duration.
// 速度单位为 Source 单位/秒；水平/垂直均 <=5 且未腾空才视为静止。
func (h *preparationHistory) append(row map[string]any) {
	pulled, _ := row["grenade_pin_pulled"].(bool)
	if len(h.rows) == 0 {
		h.pinActive = pulled
		h.releaseTick = 0
		h.rows = append(h.rows, row)
		return
	}
	if h.pinActive && !pulled {
		h.releaseTick = row["tick"].(int)
	}
	h.pinActive = pulled
	previous := h.rows[len(h.rows)-1]
	tick, lastTick := row["tick"].(int), previous["tick"].(int)
	if tick <= lastTick {
		return
	}
	x, xOK := row["X"].(float64)
	y, yOK := row["Y"].(float64)
	z, zOK := row["Z"].(float64)
	px, pxOK := previous["X"].(float64)
	py, pyOK := previous["Y"].(float64)
	pz, pzOK := previous["Z"].(float64)
	valid := xOK && yOK && zOK && pxOK && pyOK && pzOK
	distance := math.Sqrt((x-px)*(x-px) + (y-py)*(y-py) + (z-pz)*(z-pz))
	// A missing player, respawn or teleport starts a new history, never a run-up.
	if !valid || tick-lastTick > 8 || distance > 128 {
		h.rows = h.rows[:0]
		h.releaseTick = 0
	}
	h.rows = append(h.rows, row)
	if !valid {
		return
	}
	elapsed := float64(tick-lastTick) / 64
	airborne, _ := row["is_airborne"].(bool)
	stationary := !airborne && math.Hypot(x-px, y-py)/elapsed <= 5 && math.Abs(z-pz)/elapsed <= 5
	if stationary && !h.pinActive && (h.releaseTick == 0 || tick > h.releaseTick+64) {
		cut := 0
		for cut < len(h.rows)-1 && h.rows[cut]["tick"].(int) < tick-16 {
			cut++
		}
		if cut > 0 {
			// Copy rather than retaining a long completed run-up's backing array.
			h.rows = append([]map[string]any(nil), h.rows[cut:]...)
		}
	}
}
