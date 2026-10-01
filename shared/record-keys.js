// Shared by the renderer and Electron IPC validation; keep dynamic records
// confined to their own namespace rather than accepting arbitrary keys.
export const AI_SESSION_STORE_KEY = 'ai-sessions-v1';
export const isAiSessionId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/i.test(id);
export function aiSessionRecordKey(id) {
  if (!isAiSessionId(id)) throw new Error('Invalid AI session ID');
  return `ai-session-${id}`;
}
const fixedRecordKeys = new Set([
  'workspace-archives', 'utility-notes', 'broadcast-archives',
  'archive-folders-workspace', 'archive-folders-broadcast',
  'archive-folders-utility', 'native-demo-migration-v1', AI_SESSION_STORE_KEY,
]);
export const isAllowedRecordKey = key => typeof key === 'string' && (
  fixedRecordKeys.has(key) || key.startsWith('ai-session-') && isAiSessionId(key.slice('ai-session-'.length))
);
