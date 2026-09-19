// Owns archive state and ordered persistence independently of React and the scene.
// Failed writes retain the session copy so users can retry without losing work.
export function createArchiveStore({ initial, load, write, cleanup = () => {}, onError = () => {} }) {
  let records = initial;
  let revision = 0;
  let pending = Promise.resolve();
  const listeners = new Set();
  const publish = (next) => { records = next; listeners.forEach((listener) => listener()); };
  const enqueue = (next) => {
    pending = pending.catch(() => {}).then(() => write(next));
    return pending;
  };
  const cleanLegacy = () => {
    try { cleanup(); } catch { /* Durable data is safe even if legacy cleanup is blocked. */ }
  };
  return {
    getSnapshot: () => records,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    async initialize(isCancelled = () => false) {
      const startedRevision = revision;
      try {
        const stored = await load();
        if (isCancelled()) return;
        // Opening IndexedDB must never overwrite a save made during startup.
        if (revision !== startedRevision || !Array.isArray(stored)) await enqueue(records);
        else publish(stored);
        cleanLegacy();
      } catch (error) { onError(error, 'migration'); }
    },
    async persist(next) {
      revision += 1;
      publish(next);
      try {
        await enqueue(next);
        cleanLegacy();
        return true;
      } catch (error) { onError(error, 'write'); return false; }
    },
    remove(id) { return this.persist(records.filter((archive) => archive.id !== id)); },
  };
}
