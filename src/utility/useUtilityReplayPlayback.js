import { useEffect, useMemo } from 'react';
import { interpolateDemoSnapshot } from '../demo/interpolation.js';
import { buildDemoGrenadeSegments, utilityProjectileAtTick } from '../demo/grenades.js';
import { UTILITY_THROW_VIEW_HOLD_SECONDS } from '../app/config.js';

// Advance saved throws and expose the mutually exclusive first-person/chase camera states.
export default function useUtilityReplayPlayback(utilityReplay, setUtilityReplay) {
  useEffect(() => {
    if (!utilityReplay?.playing) return undefined;
    const timer = window.setInterval(() => setUtilityReplay((current) => {
      if (!current?.playing) return current;
      if (current.delayUntil && Date.now() < current.delayUntil) return current;
      const nextTick = Math.min(current.note.replay.endTick, current.tick + current.note.replay.tickRate / 30);
      return { ...current, tick: nextTick, playing: nextTick < current.note.replay.endTick, delayUntil: 0 };
    }), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [setUtilityReplay, utilityReplay?.playing]);

  const snapshot = utilityReplay && utilityReplay.tick <= utilityReplay.note.replay.throwTick + 64
    ? interpolateDemoSnapshot(utilityReplay.note.replay.snapshots, utilityReplay.tick)
    : null;
  const firstPerson = useMemo(() => {
    if (!utilityReplay?.firstPerson) return null;
    const replay = utilityReplay.note.replay;
    const tickRate = replay.tickRate || 64;
    if (utilityReplay.tick > replay.throwTick + tickRate * UTILITY_THROW_VIEW_HOLD_SECONDS) return null;
    // Freeze the exact release view instead of following the thrower's later movement.
    const cameraSnapshot = interpolateDemoSnapshot(replay.snapshots, Math.min(utilityReplay.tick, replay.throwTick));
    const player = cameraSnapshot?.players[0];
    return player ? { player, grenadeType: utilityReplay.note.grenadeType || 'he', replayId: utilityReplay.note.id, tick: utilityReplay.tick, throwTick: replay.throwTick, tickRate } : null;
  }, [utilityReplay]);
  const projectileFollow = useMemo(() => {
    if (!utilityReplay?.firstPerson) return null;
    const replay = utilityReplay.note.replay;
    const tickRate = replay.tickRate || 64;
    const followStartTick = replay.throwTick + tickRate * UTILITY_THROW_VIEW_HOLD_SECONDS;
    const recordedEndTick = replay.projectiles?.at(-1)?.tick ?? replay.events?.find((event) => event.event_name !== 'grenade_thrown')?.tick;
    const followEndTick = Number.isFinite(replay.effectTick) ? replay.effectTick : recordedEndTick;
    if (!Number.isFinite(followEndTick) || utilityReplay.tick <= followStartTick || utilityReplay.tick > followEndTick) return null;
    return utilityProjectileAtTick(replay, utilityReplay.tick);
  }, [utilityReplay]);
  const segments = useMemo(() => utilityReplay ? buildDemoGrenadeSegments(
    utilityReplay.note.replay.projectiles,
    utilityReplay.note.replay.events,
    utilityReplay.note.replay.snapshots,
    { startTick: 0, endTick: utilityReplay.note.replay.endTick },
    utilityReplay.note.replay.tickRate,
  ) : [], [utilityReplay?.note]);

  return { firstPerson, projectileFollow, segments, snapshot };
}
