import { encodeStoredValue, decodeStoredValue } from '../app/storageCodec.js';

let migration;
const marker = 'native-demo-migration-v1';

// Opening without a version avoids the browser cache's destructive schema upgrade.
function openLegacy() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('csboard-demo-cache');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function read(db, store, action) {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Legacy cache read aborted'));
  });
}
export function migrateLegacyCache(backend) {
  if (migration) return migration;
  migration = (async () => {
    if ((await backend.storage('record.get', { key: marker })).found) return;
    const db = await openLegacy();
    try {
      const keys = await read(db, 'demos', store => store.getAllKeys()) || [];
      const roundKeys = await read(db, 'demo-rounds', store => store.getAllKeys()) || [];
      for (const id of keys) {
        if (await backend.storage('cache.get', { id })) continue;
        const entry = await read(db, 'demos', store => store.get(id));
        if (!entry?.data) continue;
        for (const key of roundKeys.filter(key => String(key).startsWith(`${id}:`))) {
          const round = await read(db, 'demo-rounds', store => store.get(key));
          if (round?.data) {
            const value = encodeStoredValue(round.data);
            await backend.storage('cache.putRound', { id, round: round.round, value });
            if (await backend.storage('cache.round', { id, round: round.round }) !== value) throw new Error('Demo round migration verification failed');
          }
        }
        const { data, analysisRows, ...metadata } = entry;
        await backend.storage('cache.put', { id, metadata: encodeStoredValue(metadata), value: encodeStoredValue(entry) });
        const persisted = decodeStoredValue(await backend.storage('cache.get', { id }));
        if (encodeStoredValue(persisted) !== encodeStoredValue(entry)) throw new Error('Demo cache migration verification failed');
      }
      await backend.storage('record.put', { key: marker, value: encodeStoredValue({ completedAt: new Date().toISOString() }) });
    } finally { db.close(); }
  })().catch(error => { migration = undefined; throw error; });
  return migration;
}
