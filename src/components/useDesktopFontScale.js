import { useEffect, useSyncExternalStore } from 'react';
import { preferences } from '../platform/preferences.js';

const KEY = 'csboard-desktop-font-scale';
const listeners = new Set();
let current;
const normalize = value => Number.isFinite(Number(value)) ? Math.max(80, Math.min(150, Number(value))) : 100;
const snapshot = () => current ??= normalize(preferences.getItem(KEY) || 100);
const subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
export function useDesktopFontScale(enabled = true) {
  const value = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (enabled) document.documentElement.style.setProperty('--ui-font-scale', String(value / 100));
  }, [enabled, value]);
  return [value, value => {
    current = normalize(value);
    preferences.setItem(KEY, String(current));
    listeners.forEach(callback => callback());
  }];
}
