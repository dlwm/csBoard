import { useSyncExternalStore } from 'react';
import { preferences } from '../platform/preferences.js';

const listeners = new Set(), records = new Map();
const key = map => `csboard-model-visibility-${map}`;
const EMPTY = Object.freeze({ signature: '', hidden: [] });
export function modelVisibility(map) {
  if (!records.has(map)) {
    try {
      const saved = JSON.parse(preferences.getItem(key(map)) || 'null');
      records.set(map, saved && typeof saved.signature === 'string' && Array.isArray(saved.hidden)
        ? { signature: saved.signature, hidden: saved.hidden.filter(Number.isInteger) } : EMPTY);
    } catch { records.set(map, EMPTY); }
  }
  return records.get(map);
}
export function setModelVisibility(map, signature, hidden) {
  const record = { signature, hidden: [...new Set(hidden)] };
  preferences.setItem(key(map), JSON.stringify(record));
  records.set(map, record);
  listeners.forEach(listener => listener());
}
export function observeModelVisibility(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function useModelVisibility(map) { return useSyncExternalStore(observeModelVisibility, () => modelVisibility(map)); }
