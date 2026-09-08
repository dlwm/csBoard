const defaultUtilityNoteModules = import.meta.glob('../default-data/utility-notes/**/*.json', { eager: true, import: 'default' });
const defaultWorkspaceArchiveModules = import.meta.glob('../default-data/workspace-archives/**/*.json', { eager: true, import: 'default' });

const collectDefaultRecords = (modules, collectionKey) => Object.values(modules).flatMap((data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[collectionKey])) return data[collectionKey];
  return data && typeof data === 'object' ? [data] : [];
}).filter((record) => record && typeof record === 'object' && !Array.isArray(record));

export const DEFAULT_UTILITY_NOTES = collectDefaultRecords(defaultUtilityNoteModules, 'notes');
export const DEFAULT_WORKSPACE_ARCHIVES = collectDefaultRecords(defaultWorkspaceArchiveModules, 'archives');

// Seed defaults once, while keeping malformed or unavailable browser storage non-fatal.
export function initialLocalRecords(storageKey, defaults, persistDefaults = true) {
  let stored = null;
  try { stored = localStorage.getItem(storageKey); } catch { /* Fall through to bundled defaults. */ }
  if (stored !== null) {
    try { const parsed = JSON.parse(stored); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  const initial = JSON.parse(JSON.stringify(defaults));
  if (persistDefaults) {
    try { localStorage.setItem(storageKey, JSON.stringify(initial)); } catch { /* Defaults remain available for this session. */ }
  }
  return initial;
}
