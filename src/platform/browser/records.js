const DB_NAME = 'csboard-workspace-store';
const DB_VERSION = 1;
const STORE_NAME = 'records';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let request;
    try { request = action(transaction.objectStore(STORE_NAME)); } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(request?.result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Local data transaction aborted')); };
  }));
}

export const browserRecords = {
  get: key => transact('readonly', store => store.get(key)),
  put: (key, value) => transact('readwrite', store => store.put(value, key)),
};
