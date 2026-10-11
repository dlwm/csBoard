// Independent display quality per camera context; 0 preserves original geometry.
// 各视角独立设置；0 保留原始模型。数值为简化强度，而非精度百分比。
export const MODEL_QUALITY_KEY = 'csboard-model-simplification';
export const DEFAULT_MODEL_QUALITY = Object.freeze({ monitor: 0, firstPerson: 0, free: 0 });
export function normalizeModelQuality(value = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_MODEL_QUALITY).map(key => {
    const amount = Number(value?.[key]);
    return [key, Number.isFinite(amount) ? Math.max(0, Math.min(100, Math.round(amount))) : 0];
  }));
}
export function modelQualityContext({ monitor = false, firstPerson = false } = {}) {
  return monitor ? 'monitor' : firstPerson ? 'firstPerson' : 'free';
}
