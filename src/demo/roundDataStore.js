const empty = () => ({ voiceFrames: [], snapshots: [], throwSnapshots: [], projectiles: [], smokeVoxelFrames: [], infernoFrames: [], loading: false, error: null });

// A request owns a generation: completion from an older Demo/round cannot publish.
export function createRoundDataStore(readRound) {
  let generation = 0, pendingAbort = null;
  const cancel = () => { generation++; pendingAbort?.abort(); pendingAbort = null; };
  let state = empty();
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setInline(data) {
      cancel();
      const next = empty();
      for (const key of Object.keys(next)) if (!['loading', 'error'].includes(key)) next[key] = data?.[key] || [];
      publish(next);
    },
    reset() { cancel(); publish(empty()); },
    cancel,
    async load(cacheId, round) {
      cancel();
      const request = generation;
      const controller = new AbortController(); pendingAbort = controller;
      // Do not render positions from the previous round beneath the new round label.
      publish({ ...empty(), loading: true });
      try {
        const data = await readRound(cacheId, round, { signal: controller.signal });
        if (request !== generation) return;
        const next = empty();
        for (const key of Object.keys(next)) if (!['loading', 'error'].includes(key)) next[key] = data?.[key] || [];
        publish(next);
      } catch (error) {
        if (request === generation) publish({ ...empty(), error: controller.signal.aborted ? null : error.message || String(error) });
      } finally { if (pendingAbort === controller) pendingAbort = null; }
    },
  };
}
