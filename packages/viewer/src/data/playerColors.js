// Seat colors stay independent of team colors. Persist new colors with players;
// old records use a stable identity fallback instead of changing each render.
// 底盘色独立于阵营色；新人物保存颜色，旧记录按稳定身份回退，刷新不变色。
export const PLAYER_BASE_COLORS = ['#5da9ff', '#ffe066', '#ff9f43', '#73df92', '#ba8cff'];
export function playerBaseColor(index, identity = '') {
  if (index < PLAYER_BASE_COLORS.length) return PLAYER_BASE_COLORS[Math.max(0, index)];
  let hash = 2166136261;
  for (const char of String(identity)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = identity ? hash % 360 : Math.floor(Math.random() * 360);
  return normalizePlayerBaseColor(`hsl(${hue}, 72%, 65%)`);
}
export function validPlayerBaseColor(value) {
  return typeof value === 'string' && (/^#[a-f\d]{6}$/i.test(value) || /^hsl\(\d{1,3}, 72%, 65%\)$/.test(value));
}

// Preserve the legacy CSS HSL appearance while emitting the neutral layout's
// #RRGGBB representation. HSL -> sRGB: C=(1-|2L-1|)S, X=C(1-|H mod 2-1|), m=L-C/2.
// 中文：旧存档颜色不变，只统一为布局约定的六位十六进制格式。
export function normalizePlayerBaseColor(value) {
  const match = typeof value === 'string' && value.match(/^hsl\((\d{1,3}), 72%, 65%\)$/);
  if (!match) return value;
  const hue = (Number(match[1]) % 360) / 60, c = .504, x = c * (1 - Math.abs(hue % 2 - 1)), m = .398;
  const rgb = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(hue)];
  return '#' + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}
