import { createBombTimeline } from '../../packages/viewer/src/playback/bombTimeline.js';
const cache = new WeakMap();
export function getDemoBombTimeline(events, tickRate) {
  const entry = cache.get(events);
  if (entry?.tickRate === tickRate) return entry.timeline;
  const timeline = createBombTimeline({ events, tickRate, readEvent: event => {
    const position = [event.x ?? event.user_X, event.y ?? event.user_Y, event.z ?? event.user_Z];
    return { type: event.event_name, tick: event.tick, position: position.every(Number.isFinite) ? position : null,
      hasKit: event.hasKit == null && event.haskit == null && event.has_kit == null && event.has_defuser == null ? null : Boolean(event.hasKit ?? event.haskit ?? event.has_kit ?? event.has_defuser) };
  } });
  cache.set(events, { tickRate, timeline }); return timeline;
}
const sampleCache = new WeakMap();
export function getDemoBombState(events, snapshots, tickRate, tick) {
  const bomb = getDemoBombTimeline(events, tickRate).at(tick);
  let samples = sampleCache.get(snapshots);
  if (!samples) {
    samples = []; const starts = new Map();
    for (const frame of snapshots) {
      const active = new Set();
      for (const player of frame.players || []) if (player.defusing) {
        const id = String(player.steamid || player.name); active.add(id);
        if (!starts.has(id)) starts.set(id, frame.tick);
      }
      for (const id of starts.keys()) if (!active.has(id)) starts.delete(id);
      const player = frame.players?.find(player => player.defusing);
      samples.push({ tick: frame.tick, player, startTick: player ? starts.get(String(player.steamid || player.name)) : null });
    }
    sampleCache.set(snapshots, samples);
  }
  let lo = 0, hi = samples.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].tick <= tick) lo = mid + 1; else hi = mid; }
  const sample = samples[lo - 1];
  const currentDefuser = sample?.player || null;
  if (bomb.status === 'planted' && !bomb.defuse && currentDefuser) {
    bomb.defuse = { tick: Math.max(sample.startTick, bomb.plant.tick), hasKit: Boolean(currentDefuser.hasDefuser), evidence: 'sample' };
    bomb.defuseDurationEstimated = false;
    bomb.defuseProgress = Math.max(0, Math.min(1, (tick - bomb.defuse.tick) / ((bomb.defuse.hasKit ? 5 : 10) * tickRate)));
  }
  return { ...bomb, currentDefuser };
}
