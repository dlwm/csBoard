// Shared by the renderer and Electron IPC validation; keep dynamic records
// confined to their own namespace rather than accepting arbitrary keys.
export const AI_SESSION_STORE_KEY = 'ai-sessions-v1';
export const APPLICATION_PREFERENCES_KEY = 'application-preferences';
export const isAiSessionId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/i.test(id);
export function aiSessionRecordKey(id) {
  if (!isAiSessionId(id)) throw new Error('Invalid AI session ID');
  return `ai-session-${id}`;
}
export function recordingRecordKey(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(id)) throw new Error('Invalid recording ID');
  return `recording-data-${id}`;
}
const fixedRecordKeys = new Set([
  'workspace-archives', 'utility-notes', 'broadcast-archives', 'saved-recordings', 'recording-library',
  'archive-folders-workspace', 'archive-folders-broadcast', 'archive-folders-recordings',
  'archive-folders-utility', 'native-demo-migration-v1', AI_SESSION_STORE_KEY, APPLICATION_PREFERENCES_KEY,
]);
export const isAllowedRecordKey = key => typeof key === 'string' && (
  fixedRecordKeys.has(key) || /^recording-data-[a-z0-9][a-z0-9_-]{0,119}$/i.test(key) || key.startsWith('ai-session-') && isAiSessionId(key.slice('ai-session-'.length))
);
