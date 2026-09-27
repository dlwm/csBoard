const DB_NAME = 'csboard-demo-cache';
const DB_VERSION = 16;
const STORE_NAME = 'demos';
const INDEX_STORE_NAME = 'demo-index';
const ROUND_STORE_NAME = 'demo-rounds';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(INDEX_STORE_NAME)) database.createObjectStore(INDEX_STORE_NAME, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(ROUND_STORE_NAME)) database.createObjectStore(ROUND_STORE_NAME, { keyPath: 'id' });
      if (request.oldVersion > 0 && request.oldVersion < DB_VERSION) {
        request.transaction.objectStore(STORE_NAME).clear();
        request.transaction.objectStore(INDEX_STORE_NAME).clear();
        request.transaction.objectStore(ROUND_STORE_NAME).clear();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(storeNames, mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    let result;
    try { result = action(transaction); } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(result?.result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Demo cache transaction aborted')); };
  }));
}

export function demoCacheId(files, sampleRate = 8) {
  return `${sampleRate}hz|${[...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })).map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')}`;
}

export function getCachedDemo(id) {
  return runTransaction(STORE_NAME, 'readonly', (transaction) => transaction.objectStore(STORE_NAME).get(id));
}

export function getCachedDemoRound(id, round) {
  return runTransaction(ROUND_STORE_NAME, 'readonly', (transaction) => transaction.objectStore(ROUND_STORE_NAME).get(`${id}:${round}`)).then((entry) => entry?.data || null);
}

export function putCachedDemoRound(id, data) {
  return runTransaction(ROUND_STORE_NAME, 'readwrite', (transaction) => transaction.objectStore(ROUND_STORE_NAME).put({ id: `${id}:${data.round}`, demoId: id, round: data.round, data }));
}

export function countCachedDemoRounds(id) {
  return runTransaction(ROUND_STORE_NAME, 'readonly', (transaction) => transaction.objectStore(ROUND_STORE_NAME).getAllKeys()).then((keys) => (keys || []).filter((key) => String(key).startsWith(`${id}:`)).length);
}

export function listCachedDemos() {
  return runTransaction(INDEX_STORE_NAME, 'readonly', (transaction) => transaction.objectStore(INDEX_STORE_NAME).getAll()).then((entries) => (entries || []).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))));
}

export async function putCachedDemo(entry) {
  const { data: _data, analysisRows: _analysisRows, ...metadata } = entry;
  await runTransaction([STORE_NAME, INDEX_STORE_NAME], 'readwrite', (transaction) => {
    transaction.objectStore(STORE_NAME).put(entry);
    return transaction.objectStore(INDEX_STORE_NAME).put(metadata);
  });
}

export async function deleteCachedDemo(id) {
  await runTransaction([STORE_NAME, INDEX_STORE_NAME], 'readwrite', (transaction) => {
    transaction.objectStore(STORE_NAME).delete(id);
    return transaction.objectStore(INDEX_STORE_NAME).delete(id);
  });
  const keys = await runTransaction(ROUND_STORE_NAME, 'readonly', (transaction) => transaction.objectStore(ROUND_STORE_NAME).getAllKeys());
  for (const key of keys || []) if (String(key).startsWith(`${id}:`)) await runTransaction(ROUND_STORE_NAME, 'readwrite', (transaction) => transaction.objectStore(ROUND_STORE_NAME).delete(key));
}
