const clamp = value => Math.max(0, Math.min(1, value));
export const lerpAngleDegrees = (from, to, amount) => from + (((to - from + 180) % 360 + 360) % 360 - 180) * amount;
// Binary lookup is shared by the legacy host and neutral track renderer.
// 稀疏采样按 tick 二分定位；人数变化按时间边界切换，不把新人员提前显示。
export function frameWindow(frames, tick) {
  if (!frames?.length) return null;
  let low = 0, high = frames.length - 1;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (frames[middle].tick < tick) low = middle + 1; else high = middle; }
  const afterIndex = low, beforeIndex = Math.max(0, low - 1);
  const before = frames[beforeIndex], after = frames[afterIndex];
  return { before, after, beforeIndex, afterIndex, amount: before.tick === after.tick ? 0 : clamp((tick - before.tick) / (after.tick - before.tick)) };
}
export function interpolatePosition(from, to, amount, { unitsPerMetre = 1, respawn = false } = {}) {
  const valid = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (!valid(from)) return valid(to) && amount >= 1 ? [...to] : null;
  if (!valid(to)) return [...from];
  if (respawn || Math.hypot(...from.map((value, axis) => to[axis] - value)) / unitsPerMetre > 12) return [...(amount >= 1 ? to : from)];
  return from.map((value, axis) => value + (to[axis] - value) * amount);
}
const numeric = (from, to, amount) => Number.isFinite(from) && Number.isFinite(to) ? from + (to - from) * amount : amount >= 1 ? to ?? null : from ?? null;
export function interpolateReplayFrame(frames, tick, tickRate) {
  const window = frameWindow(frames, tick); if (!window) return null;
  const { before, after, amount } = window, nextById = new Map(after.players.map(player => [player.playerId, player]));
  return { tick, timeSeconds: tick / tickRate, players: (amount >= 1 ? after.players : before.players).map(player => {
    const next = nextById.get(player.playerId); if (!next) return player;
    const discrete = amount >= 1 ? next : player;
    return { ...discrete, position: interpolatePosition(player.position, next.position, amount, { unitsPerMetre: 1 / .0254, respawn: player.alive === false && next.alive === true }),
      yaw: Number.isFinite(player.yaw) && Number.isFinite(next.yaw) ? lerpAngleDegrees(player.yaw, next.yaw, amount) : discrete.yaw,
      pitch: numeric(player.pitch, next.pitch, amount), crouchAmount: numeric(player.crouchAmount, next.crouchAmount, amount) };
  }) };
}
