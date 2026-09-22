export const monitorPlayerId = (player) => String(player?.steamid || player?.name || '');

// Keep the round roster stable even when dead players disappear from later snapshots.
export function buildMonitorRoster(snapshots) {
  const players = new Map();
  for (const snapshot of snapshots || []) for (const player of snapshot.players || []) {
    const id = monitorPlayerId(player);
    if (id && !players.has(id)) players.set(id, { ...player, monitorId: id, health: 0 });
  }
  return [...players.values()];
}

export function mergeMonitorSnapshot(roster, snapshot) {
  const current = new Map((snapshot?.players || []).map((player) => [monitorPlayerId(player), player]));
  return (roster || []).map((player) => ({ ...player, ...(current.get(player.monitorId) || {}), monitorId: player.monitorId }));
}

export function sameTeamMonitorPlayers(players, primaryId) {
  const primary = (players || []).find((player) => player.monitorId === primaryId);
  if (!primary) return [];
  return players.filter((player) => player.monitorId !== primaryId && Number(player.team) === Number(primary.team));
}

export function monitorTeamPrimary(players, team) {
  const teammates = (players || []).filter((player) => Number(player.team) === Number(team));
  return teammates.find((player) => Number(player.health) > 0 && player.hasPosition !== false) || teammates[0] || null;
}
