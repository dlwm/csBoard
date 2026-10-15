import { useSyncExternalStore } from 'react';
import { preferences } from '../platform/preferences.js';

const listeners = new Set(), records = new Map(), drivers = new Map();
const key = map => `csboard-model-visibility-${map}`;
const EMPTY = Object.freeze({ signature: '', hidden: [] });
export function modelVisibility(map) {
  if (!records.has(map)) {
    try {
      const saved = JSON.parse(preferences.getItem(key(map)) || 'null');
      records.set(map, saved && typeof saved.signature === 'string' && Array.isArray(saved.hidden)
        ? { signature: saved.signature, hidden: saved.hidden.filter(Number.isInteger), defaultsVersion: saved.defaultsVersion } : EMPTY);
    } catch { records.set(map, EMPTY); }
  }
  return records.get(map);
}
export function persistModelVisibility(map, signature, hidden) {
  const record = { signature, hidden: [...new Set(hidden)], defaultsVersion: 1 };
  preferences.setItem(key(map), JSON.stringify(record));
  records.set(map, record);
  listeners.forEach(listener => listener());
}
export function observeModelVisibility(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function useModelVisibility(map) { return useSyncExternalStore(observeModelVisibility, () => modelVisibility(map)); }

// A loaded scene owns validation and mutation. Before loading, this is only a
// persisted preference; it must not force a large model download.
// 中文：模型已加载时走公共命令；未加载时只保存偏好，不触发下载。
export function registerModelVisibilityDriver(map, driver) {
  drivers.set(map, driver);
  return () => { if (drivers.get(map) === driver) drivers.delete(map); };
}
export function setModelVisibility(map, signature, hidden) {
  const driver = drivers.get(map);
  return driver ? driver(signature, hidden) : persistModelVisibility(map, signature, hidden);
}
