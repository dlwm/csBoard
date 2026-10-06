import { getPlatform } from '../platform/index.js';

const ARCHIVES_KEY = 'workspace-archives';
const UTILITY_NOTES_KEY = 'utility-notes';
const FOLDER_KINDS = new Set(['workspace', 'broadcast', 'recordings', 'utility']);
const loadRecord = key => getPlatform().records.get(key);
const storeRecord = (key, value) => getPlatform().records.put(key, value);

export const loadWorkspaceArchives = () => loadRecord(ARCHIVES_KEY);
export const storeWorkspaceArchives = (archives) => storeRecord(ARCHIVES_KEY, archives);

export const loadUtilityNotes = () => loadRecord(UTILITY_NOTES_KEY);
export const storeUtilityNotes = (notes, version) => storeRecord(UTILITY_NOTES_KEY, { version, notes });


const folderKey = (kind) => {
  if (!FOLDER_KINDS.has(kind)) throw new Error('Unknown archive folder kind');
  return `archive-folders-${kind}`;
};
export const loadArchiveFolders = async kind => {
  const folders = await loadRecord(folderKey(kind));
  return folders ?? (kind === 'recordings' ? await loadRecord(folderKey('broadcast')) : folders);
};
export const storeArchiveFolders = (kind, folders) => storeRecord(folderKey(kind), folders);
