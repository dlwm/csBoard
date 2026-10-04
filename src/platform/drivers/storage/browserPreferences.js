// Small synchronous preferences only; large records belong in IndexedDB/SQLite.
// 小型同步偏好，不在此处存放 Demo 或工作区记录。
export function createBrowserPreferencesDriver(resolveStorage = () => globalThis.localStorage) {
  const fallback = new Map();
  return Object.freeze({
    id: 'browser-preferences',
    ready: async () => {},
    getItem(key) {
      try {
        const storage = resolveStorage();
        return storage ? storage.getItem(key) : fallback.get(key) ?? null;
      }
      catch { return fallback.get(key) ?? null; }
    },
    setItem(key, value) {
      key = String(key); value = String(value);
      fallback.set(key, value);
      resolveStorage()?.setItem(key, value);
    },
    removeItem(key) { fallback.delete(key); resolveStorage()?.removeItem(key); },
    keys() {
      try { return [...new Set([...Object.keys(resolveStorage() || {}), ...fallback.keys()])]; }
      catch { return [...fallback.keys()]; }
    },
    flush: async () => {},
  });
}
