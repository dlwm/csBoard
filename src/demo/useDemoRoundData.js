import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCachedDemoRound } from '../demoCache.js';
import { createRoundDataStore } from './roundDataStore.js';

export default function useDemoRoundData({ demo, round, cacheId, inlineData, onBegin }) {
  const begin = useRef(onBegin);
  begin.current = onBegin;
  const [store] = useState(() => createRoundDataStore(getCachedDemoRound));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!demo || !round) { store.reset(); return; }
    begin.current(round);
    if (inlineData && Number(inlineData.round) === Number(round.round)) store.setInline(inlineData);
    else store.load(cacheId, round.round);
    return () => store.cancel();
  }, [demo, round, cacheId, inlineData, store]);
  return { ...state, reset: store.reset };
}
