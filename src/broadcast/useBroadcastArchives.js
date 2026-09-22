import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createArchiveStore } from '../collaboration/archiveStore.js';
import { loadBroadcastArchives, storeBroadcastArchives } from '../app/persistentStore.js';

export default function useBroadcastArchives(onWriteError) {
  const errorRef = useRef(onWriteError);
  errorRef.current = onWriteError;
  const [store] = useState(() => createArchiveStore({
    initial: [],
    load: loadBroadcastArchives,
    write: storeBroadcastArchives,
    onError: (error, phase) => {
      console.error(`broadcast archive ${phase}`, error);
      if (phase === 'write') errorRef.current?.();
    },
  }));
  const archives = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [archivesRef] = useState(() => ({ get current() { return store.getSnapshot(); } }));
  useEffect(() => {
    let cancelled = false;
    store.initialize(() => cancelled);
    return () => { cancelled = true; };
  }, [store]);
  return { archives, archivesRef, persist: store.persist, remove: (id) => store.remove(id) };
}
