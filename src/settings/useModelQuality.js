import { useEffect, useState } from 'react';
import { preferences } from '../platform/preferences.js';
import { MODEL_QUALITY_KEY, normalizeModelQuality } from './modelQuality.js';
export default function useModelQuality() {
  const [value, setValue] = useState(() => {
    try { return normalizeModelQuality(JSON.parse(preferences.getItem(MODEL_QUALITY_KEY) || '{}')); }
    catch { return normalizeModelQuality(); }
  });
  useEffect(() => { preferences.setItem(MODEL_QUALITY_KEY, JSON.stringify(value)); }, [value]);
  return [value, changes => setValue(current => normalizeModelQuality({ ...current, ...changes }))];
}
