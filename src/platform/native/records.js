import { encodeStoredValue, decodeStoredValue } from '../../app/storageCodec.js';

export function createNativeRecords(backend, legacy = { get: async () => undefined }) {
  const baselines = new Map();
  const queues = new Map();
  return {
    async get(key) {
      let record = await backend.storage('record.get', { key });
      if (record.found) return decodeStoredValue(record.value);
      const value = await legacy.get(key);
      if (value === undefined) return undefined;
      // Import only when absent: a concurrent user save must win over migration.
      await backend.storage('record.import', { key, value: encodeStoredValue(value) });
      record = await backend.storage('record.get', { key });
      if (!record.found) throw new Error('Native migration did not persist the record');
      return decodeStoredValue(record.value);
    },
    put(key, value) {
      // Compare encoded values, not object identity: callers may edit nested data.
      const entries = Array.isArray(value) ? value : key === 'utility-notes' && Array.isArray(value?.notes) ? value.notes : null;
      const encodedValue = entries ? null : encodeStoredValue(value);
      const next = entries?.map(encodeStoredValue);
      const kind = Array.isArray(value) ? 'array' : 'notes';
      const body = encodeStoredValue(kind === 'array' ? null : { ...value, notes: null });
      const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
        if (!entries) {
          await backend.storage('record.put', { key, value: encodedValue });
          baselines.delete(key);
          return;
        }
        const previous = baselines.get(key);
        const updates = next.flatMap((encoded, slot) => previous?.[slot] === encoded ? [] : [{ slot, value: encoded }]);
        await backend.storage('record.patch', { key, kind, body, count: next.length, replace: !previous, updates });
        // Failed writes never advance the baseline; the next save can retry safely.
        baselines.set(key, next);
      }).catch(error => {
        // A lost response may follow a committed transaction; force a full
        // replacement next time rather than comparing against an uncertain base.
        baselines.delete(key);
        throw error;
      });
      queues.set(key, pending);
      return pending;
    },
  };
}
