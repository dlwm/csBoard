import { createDirectorTimeline } from '../../packages/viewer/src/playback/directorTimeline.js';
const cache = new WeakMap();
export function getDemoDirectorTimeline(events) {
  if (!cache.has(events)) cache.set(events, createDirectorTimeline({ events, readEvent: event => ({ type: event.event_name, tick: event.tick, raw: event }) }));
  return cache.get(events);
}

export const demoCameraPlayerId = player => String(player.steamid || player.name);
export function demoCameraPlayerPose(player, center) {
  if (!player?.position || player.hasPosition === false) return null;
  return { position: [player.position.x - center.x, player.position.y - center.y, player.position.z - center.z],
    pitch: player.pitch ?? 0, yaw: player.yaw ?? 0, crouchAmount: player.duckAmount, scoped: player.scoped, alive: player.health > 0 };
}
export function getDemoDirectorRecord(events, tick, mode, snapshot, center) {
  const event = getDemoDirectorTimeline(events).at(tick, mode)?.raw;
  if (!event) return null;
  const resolve = value => {
    if (value == null || !Number.isFinite(Number(value)) || Number(value) === 65535) return null;
    const exact = snapshot?.players.find(player => player.userId != null && Number(player.userId) === Number(value));
    if (exact) return demoCameraPlayerId(exact);
    const candidates = snapshot?.players.filter(player => player.userId != null && (Number(player.userId) & 255) === (Number(value) & 255)) || [];
    return candidates.length === 1 ? demoCameraPlayerId(candidates[0]) : null;
  };
  const fixed = event.event_name === 'hltv_fixed';
  const sourcePosition = [event.posx, event.posy, event.posz];
  return { type: event.event_name, tick: event.tick,
    position: fixed && sourcePosition.every(Number.isFinite) ? [sourcePosition[1] * .0254 - center.x, sourcePosition[2] * .0254 - center.y, sourcePosition[0] * .0254 - center.z] : null,
    targetId: resolve(event.target1), secondaryId: resolve(event.target2),
    pitch: fixed ? Number(event.theta) || 0 : Number(event.phi) || 20,
    yaw: fixed ? Number(event.phi) || 0 : Number(event.theta) || 0,
    fov: Number(event.fov) || 55, distanceMetres: (Number(event.distance) || 112) * .0254,
    inEye: Number(event.ineye) > 0, inertia: Number(event.inertia) || 0 };
}
