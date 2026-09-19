import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_WORKSPACE_ARCHIVES, initialLocalRecords } from '../app/defaultRecords.js';
import { loadWorkspaceArchives, storeWorkspaceArchives } from '../app/persistentStore.js';
import { createArchiveStore } from './archiveStore.js';

// React adapter only; storage ordering and migration live in the testable store.
export default function useWorkspaceArchives(onWriteError) {
  const errorRef = useRef(onWriteError);
  errorRef.current = onWriteError;
  const [store] = useState(() => createArchiveStore({
    initial: initialLocalRecords('csboard-workspace-archives', DEFAULT_WORKSPACE_ARCHIVES, false),
    load: loadWorkspaceArchives,
    write: storeWorkspaceArchives,
    cleanup: () => localStorage.removeItem('csboard-workspace-archives'),
    onError: (error, phase) => {
      console.error(`workspace archive ${phase}`, error);
      if (phase === 'write') errorRef.current?.();
    },
  }));
  const archives = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Imperative scene callbacks need the newest snapshot, including before React commits.
  const [archivesRef] = useState(() => ({ get current() { return store.getSnapshot(); } }));
  useEffect(() => {
    let cancelled = false;
    store.initialize(() => cancelled);
    return () => { cancelled = true; };
  }, [store]);
  return { archives, archivesRef, persistWorkspaceArchives: store.persist, removeArchive: (id) => store.remove(id) };
}
