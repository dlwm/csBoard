import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCachedDemoRound } from '../demoCache.js';
import { createRoundDataStore } from './roundDataStore.js';

export default function useDemoRoundData({ demo, round, cacheId, onBegin }) {
  const begin = useRef(onBegin);
  begin.current = onBegin;
  const [store] = useState(() => createRoundDataStore(getCachedDemoRound));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!demo || !round) { store.reset(); return; }
    begin.current(round);
    store.load(cacheId, round.round);
    return () => store.cancel();
  }, [demo, round, cacheId, store]);
  return { ...state, reset: store.reset };
}
