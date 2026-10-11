// Seat colors stay independent of team colors. Persist new colors with players;
// old records use a stable identity fallback instead of changing each render.
// 底盘色独立于阵营色；新人物保存颜色，旧记录按稳定身份回退，刷新不变色。
export const PLAYER_BASE_COLORS = ['#5da9ff', '#ffe066', '#ff9f43', '#73df92', '#ba8cff'];
export function playerBaseColor(index, identity = '') {
  if (index < PLAYER_BASE_COLORS.length) return PLAYER_BASE_COLORS[Math.max(0, index)];
  let hash = 2166136261;
  for (const char of String(identity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = identity ? hash % 360 : Math.floor(Math.random() * 360);
  return `hsl(${hue}, 72%, 65%)`;
}
export function validPlayerBaseColor(value) {
  return typeof value === 'string' && (/^#[a-f\d]{6}$/i.test(value) || /^hsl\(\d{1,3}, 72%, 65%\)$/.test(value));
}
