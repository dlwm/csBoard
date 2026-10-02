import { startPlaybackClock } from '../app/playbackClock.js';
// Owns the shared KD/area/utility analysis timeline and its derived duration.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

function calculateAnalysisDuration(rows, selectedPlayers, side, economyOwn, economyOpponent) {
  if (!selectedPlayers.length || !rows.length) return 0;
  const selected = new Set(selectedPlayers);
  const rounds = new Map();
  for (const snapshot of rows) {
    const round = snapshot.analysisRound;
    if (!round?.id) continue;
    const [own, opponent] = String(round.economyMatchup || '').split(':');
    if (!economyOwn.includes(own) || !economyOpponent.includes(opponent)) continue;
    for (const player of snapshot.players) {
      if (!selected.has(player.name)) continue;
      const playerSide = player.team === 2 ? 'T' : 'CT';
      if (side !== 'ALL' && playerSide !== side) continue;
      const current = rounds.get(round.id);
      if (current?.dead) continue;
      rounds.set(round.id, { round, tick: snapshot.tick, dead: player.health != null && player.health <= 0 });
    }
  }
  let duration = 0;
  for (const { round, tick } of rounds.values()) {
    duration = Math.max(duration, Math.min(tick - round.startTick, round.endTick - round.startTick));
  }
  return duration;
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
    return startPlaybackClock(seconds => setTime((currentTime) => {
      const next = Math.min(duration, currentTime + 64 * seconds);
      if (next >= duration) setPlaying(false);
      return next;
    }));
  }, [playing, rows.length, duration]);

  return { playing, setPlaying, time, setTime, duration };
}
