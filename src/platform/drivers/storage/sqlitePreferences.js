import { APPLICATION_PREFERENCES_KEY as RECORD_KEY } from '../../../../shared/record-keys.js';
const LEGACY_RECORD_KEYS = new Set(['csboard-utility-notes', 'csboard-utility-notes-version', 'csboard-workspace-archives']);

// Hydrate before mounting the UI, then expose synchronous reads from a mirror.
// Serial writes preserve order without synchronous IPC or blocking camera input.
// UI 挂载前读取 SQLite 偏好；之后同步读内存镜像，串行异步落盘，不使用同步 IPC。
export function createSqlitePreferencesDriver(records, legacy) {
  const values = new Map();
  let initialization, pending, revision = 0, savedRevision = 0;
  const write = () => {
    if (pending) return pending;
    if (savedRevision === revision) return Promise.resolve();
    // Coalesce camera/slider updates: at most one write is active, and its
    // successor saves the latest snapshot instead of every intermediate value.
    // 合并相机、滑块连续更新，仅一项落盘；失败后保留脏版本供后续写入/flush 重试。
    pending = Promise.resolve().then(async () => {
      while (savedRevision !== revision) {
        const target = revision;
        await records.put(RECORD_KEY, Object.fromEntries(values));
        savedRevision = target;
      }
    });
    pending.then(() => { pending = undefined; }, () => { pending = undefined; });
    pending.catch(error => console.warn('Preference storage failed:', error));
    return pending;
  };
  const persist = () => { revision += 1; write(); };
  return Object.freeze({
    id: 'sqlite-preferences',
    ready() {
      return initialization ||= (async () => {
        const stored = await records.get(RECORD_KEY);
        if (stored != null && (typeof stored !== 'object' || Array.isArray(stored))) throw new Error('Invalid native preferences');
        if (stored == null) {
          for (const key of legacy.keys()) {
            if (!key.startsWith('csboard-') || key.startsWith('csboard-room-') || LEGACY_RECORD_KEYS.has(key)) continue;
            const value = legacy.getItem(key);
            if (value !== null) values.set(key, value);
          }
          await records.put(RECORD_KEY, Object.fromEntries(values));
        } else {
          for (const [key, value] of Object.entries(stored)) if (typeof value === 'string') values.set(key, value);
        }
        // Keep legacy source records until their own durable migration succeeds.
      })();
    },
    getItem(key) { return values.get(key) ?? (LEGACY_RECORD_KEYS.has(key) ? legacy.getItem(key) : null); },
    setItem(key, value) { values.set(String(key), String(value)); persist(); },
    removeItem(key) {
      values.delete(key);
      if (LEGACY_RECORD_KEYS.has(key) || key.startsWith('csboard-room-')) legacy.removeItem(key);
      persist();
    },
    keys() { return [...new Set([...values.keys(), ...legacy.keys().filter(key => LEGACY_RECORD_KEYS.has(key) || key.startsWith('csboard-room-'))])]; },
    flush: write,
  });
}
