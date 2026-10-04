package goparser

import (
	"fmt"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"strconv"
)

// Bots share SteamID 0. Keep a per-controller identity across snapshots, events
// and projectile ownership instead of merging every bot into the same player.
// BOT 的 SteamID 都为 0，使用控制器 userID 维持人物和道具所属关系。
func playerIdentity(player *common.Player) string {
	if player.SteamID64 != 0 {
		return strconv.FormatUint(player.SteamID64, 10)
	}
	return fmt.Sprintf("bot:%d:%s", player.UserID, player.Name)
}
