// Large user-authored records belong in IndexedDB. Keeping them in one
// key-value store also gives legacy localStorage migrations one durable target.
// Keep the original database name so archives written by the first IndexedDB
// migration remain visible after this store grows beyond workspace records.
const DB_NAME = 'csboard-workspace-store';
const DB_VERSION = 1;
const STORE_NAME = 'records';
const ARCHIVES_KEY = 'workspace-archives';
const UTILITY_NOTES_KEY = 'utility-notes';
const BROADCAST_ARCHIVES_KEY = 'broadcast-archives';
const FOLDER_KINDS = new Set(['workspace', 'broadcast', 'utility']);

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

const loadRecord = (key) => transact('readonly', (store) => store.get(key));
const storeRecord = (key, value) => transact('readwrite', (store) => store.put(value, key));

export const loadWorkspaceArchives = () => loadRecord(ARCHIVES_KEY);
export const storeWorkspaceArchives = (archives) => storeRecord(ARCHIVES_KEY, archives);

export const loadUtilityNotes = () => loadRecord(UTILITY_NOTES_KEY);
export const storeUtilityNotes = (notes, version) => storeRecord(UTILITY_NOTES_KEY, { version, notes });

export const loadBroadcastArchives = () => loadRecord(BROADCAST_ARCHIVES_KEY);
export const storeBroadcastArchives = (archives) => storeRecord(BROADCAST_ARCHIVES_KEY, archives);

const folderKey = (kind) => {
  if (!FOLDER_KINDS.has(kind)) throw new Error('Unknown archive folder kind');
  return `archive-folders-${kind}`;
};
export const loadArchiveFolders = (kind) => loadRecord(folderKey(kind));
export const storeArchiveFolders = (kind, folders) => storeRecord(folderKey(kind), folders);
