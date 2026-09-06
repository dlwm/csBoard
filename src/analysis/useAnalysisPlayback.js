// Owns the shared KD/area/utility analysis timeline and its derived duration.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

function calculateAnalysisDuration(rows, selectedPlayers, side, economyOwn, economyOpponent) {
  if (!selectedPlayers.length || !rows.length) return 0;
  const selected = new Set(selectedPlayers);
  const rowsByRound = new Map();
  rows.forEach((snapshot) => {
    if (!snapshot.analysisRound?.id) return;
    if (!rowsByRound.has(snapshot.analysisRound.id)) rowsByRound.set(snapshot.analysisRound.id, []);
    rowsByRound.get(snapshot.analysisRound.id).push(snapshot);
  });
  return Math.max(0, ...[...rowsByRound.values()].map((roundRows) => {
    const round = roundRows[0].analysisRound;
    const [ownEconomy, opponentEconomy] = String(round.economyMatchup || '').split(':');
    if (!economyOwn.includes(ownEconomy) || !economyOpponent.includes(opponentEconomy)) return 0;
    const records = roundRows.flatMap((snapshot) => snapshot.players
      .filter((player) => selected.has(player.name))
      .map((player) => ({ ...player, tick: snapshot.tick })));
    const roundSide = records[0]?.team === 2 ? 'T' : records[0] ? 'CT' : null;
    if (side !== 'ALL' && roundSide !== side) return 0;
    const last = records.find((player) => player.health != null && player.health <= 0) || records.at(-1);
    return last ? Math.min(last.tick - round.startTick, round.endTick - round.startTick) : 0;
  }));
}

export default function useAnalysisPlayback({ rows, selectedPlayers, side, economyOwn, economyOpponent }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const deferredSelectedPlayers = useDeferredValue(selectedPlayers);
  const duration = useMemo(() => calculateAnalysisDuration(
    rows,
    deferredSelectedPlayers,
    side,
    economyOwn,
    economyOpponent,
  ), [deferredSelectedPlayers, rows, side, economyOwn, economyOpponent]);

  useEffect(() => {
    if (!playing || !rows.length) return undefined;
    const timer = window.setInterval(() => setTime((currentTime) => {
      const next = Math.min(duration, currentTime + 64 / 30);
      if (next >= duration) setPlaying(false);
      return next;
    }), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [playing, rows.length, duration]);

  return { playing, setPlaying, time, setTime, duration };
}
