import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getPlatform } from '../platform/index.js';
import { createSavedRecordingRepository } from './savedRecordingRepository.js';

export default function useSavedRecordings(onWriteError, enabled = true) {
  const errorRef = useRef(onWriteError), selection = useRef(0);
  errorRef.current = onWriteError;
  const [store] = useState(() => createSavedRecordingRepository(getPlatform().records, error => {
    console.error('Saved recording storage', error); errorRef.current?.();
  }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [recordingsRef] = useState(() => ({ get current() { return store.getSnapshot().entries; } }));
  const [loadingId, setLoadingId] = useState('');
  useEffect(() => {
    if (enabled) void store.initialize().catch(() => {});
    return () => { selection.current++; };
  }, [store, enabled]);
  return {
    recordings: state.entries, recordingsRef, error: state.error, loading: state.loading, loadingId,
    save: store.save, remove: store.remove,
    async load(id) {
      const generation = ++selection.current;
      setLoadingId(id);
      const recording = await store.load(id);
      if (generation !== selection.current) return null;
      setLoadingId(''); return recording;
    },
    cancelSelection() { selection.current++; setLoadingId(''); },
  };
}
