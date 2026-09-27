import { getPlatform } from '../platform/index.js';

const ARCHIVES_KEY = 'workspace-archives';
const UTILITY_NOTES_KEY = 'utility-notes';
const BROADCAST_ARCHIVES_KEY = 'broadcast-archives';
const FOLDER_KINDS = new Set(['workspace', 'broadcast', 'utility']);
const loadRecord = key => getPlatform().records.get(key);
const storeRecord = (key, value) => getPlatform().records.put(key, value);

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
