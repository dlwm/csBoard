// Converts analysis snapshots into per-player movement tracks for scene playback.
import { ECONOMY_CATEGORIES } from './constants.js';

export function getAnalysisTrackSignature({ rows, selectedPlayers, side, economyOwn, economyOpponent }) {
  const roundIds = [...new Set(rows.map((snapshot) => snapshot.analysisRound?.id).filter(Boolean))];
  return `${selectedPlayers.join('|')}:${side}:${(economyOwn || []).join(',')}:${(economyOpponent || []).join(',')}:${rows.length}:${roundIds.join('|')}`;
}

export function buildAnalysisTracks({ rows, selectedPlayers, side, economyOwn, economyOpponent, modelCenter }) {
  const roundIds = [...new Set(rows.map((snapshot) => snapshot.analysisRound?.id).filter(Boolean))];
  const rowsByRound = new Map(roundIds.map((id) => [id, []]));
  rows.forEach((snapshot) => {
    if (snapshot.analysisRound?.id) rowsByRound.get(snapshot.analysisRound.id)?.push(snapshot);
  });
  const tracks = [];
  selectedPlayers.forEach((name) => roundIds.forEach((roundId, roundIndex) => {
    const roundRows = rowsByRound.get(roundId) || [];
    const round = roundRows[0]?.analysisRound;
    const [ownEconomy, opponentEconomy] = String(round?.economyMatchup || '').split(':');
    if (!(economyOwn || ECONOMY_CATEGORIES).includes(ownEconomy) || !(economyOpponent || ECONOMY_CATEGORIES).includes(opponentEconomy)) return;
    const records = roundRows.flatMap((snapshot) => snapshot.players
      .filter((player) => player.name === name)
      .map((player) => ({
        time: snapshot.tick - round.startTick,
        health: player.health,
        team: player.team,
        yaw: player.yaw || 0,
        pitch: (player.pitch || 0) * Math.PI / 180,
        crouched: (player.duckAmount || 0) > 0.45,
        weapon: player.activeWeapon || '',
        position: {
          x: player.position.x - modelCenter.x,
          y: player.position.y - modelCenter.y + 0.08,
          z: player.position.z - modelCenter.z,
        },
      })))
      .sort((left, right) => left.time - right.time);
    const roundSide = records[0]?.team === 2 ? 'T' : records[0] ? 'CT' : null;
    if (side !== 'ALL' && roundSide !== side) return;
    const deathIndex = records.findIndex((record) => record.health != null && record.health <= 0);
    const visibleRecords = deathIndex >= 0 ? records.slice(0, deathIndex + 1) : records;
    if (visibleRecords.length < 2) return;
    tracks.push({ key: `${name}-${roundIndex}`, name, team: records[0].team, records: visibleRecords });
  }));
  return tracks;
}
