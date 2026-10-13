import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCachedDemoRound } from '../demoCache.js';
import { createRuntimeReplaySource } from './replayDataSource.js';
import { createRoundDataStore } from './roundDataStore.js';

export default function useDemoRoundData({ demo, round, cacheId, inlineData, onBegin }) {
  const begin = useRef(onBegin);
  begin.current = onBegin;
  const source = useRef(null);
  const [store] = useState(() => createRoundDataStore(async (reader, roundNumber, { signal }) => {
    const lease = await reader.openSegment({ segmentId: `segment-${roundNumber}`, signal });
    try { return lease.getExtension('csboard.runtime').getPayload(); } finally { lease.dispose(); }
  }));
  useEffect(() => {
    source.current = demo?.rounds?.length ? createRuntimeReplaySource({ data: demo, cacheId, inlineData, readRound: getCachedDemoRound }) : null;
    return () => { source.current?.dispose(); source.current = null; };
  }, [demo, cacheId, inlineData]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!demo || !round) { store.reset(); return; }
    begin.current(round);
    store.load(source.current, round.round);
    return () => store.cancel();
  }, [demo, round, cacheId, inlineData, store]);
  return { ...state, reset: store.reset };
}
