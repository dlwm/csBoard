const cache = new WeakMap();
// Floor metadata is supplied by the host, never a fixed map catalogue.
// 楼层分界由宿主注入；沿用来源 Z 英寸、下 64/上 96 单位的显示留白。
export function deriveNavFloorRanges(navData, boundary = null) {
  if (!navData?.areas) return {};
  let byBoundary = cache.get(navData); if (!byBoundary) { byBoundary = new Map(); cache.set(navData, byBoundary); }
  if (byBoundary.has(boundary)) return structuredClone(byBoundary.get(boundary));
  if (boundary != null && !Number.isFinite(boundary)) throw new TypeError('Floor boundary must be finite');
  let min = Infinity, max = -Infinity, lowerMin = Infinity, upperMax = -Infinity;
  for (const area of Object.values(navData.areas)) for (const point of area.corners || []) {
    const z = Number(point.z); if (!Number.isFinite(z)) continue;
    min = Math.min(min, z); max = Math.max(max, z);
    if (boundary != null && z <= boundary) lowerMin = Math.min(lowerMin, z);
    if (boundary != null && z >= boundary) upperMax = Math.max(upperMax, z);
  }
  const ranges = {};
  if (Number.isFinite(min) && Number.isFinite(max) && (boundary == null || Number.isFinite(upperMax))) ranges.main = [boundary ?? min - 64, (boundary == null ? max : upperMax) + 96];
  if (boundary != null && Number.isFinite(lowerMin)) ranges.lower = [lowerMin - 64, boundary];
  byBoundary.set(boundary, ranges); return structuredClone(ranges);
}
export function applyFloorRange(state, range, originY = 0) {
  if (range == null) { state.set(0, 0, 0, 0); return; }
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > range[1] || !Number.isFinite(originY)) throw new TypeError('Floor range must have ordered Source Z bounds');
  state.set(range[0] * .0254 - originY, range[1] * .0254 - originY, 0, 1);
}
