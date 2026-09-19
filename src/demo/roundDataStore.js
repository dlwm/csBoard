const empty = () => ({ snapshots: [], throwSnapshots: [], projectiles: [], smokeVoxelFrames: [], infernoFrames: [], loading: false });

// A request owns a generation: completion from an older Demo/round cannot publish.
export function createRoundDataStore(readRound) {
  let generation = 0;
  let state = empty();
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    reset() { generation++; publish(empty()); },
    cancel() { generation++; },
    async load(cacheId, round) {
      const request = ++generation;
      // Do not render positions from the previous round beneath the new round label.
      publish({ ...empty(), loading: true });
      try {
        const data = await readRound(cacheId, round);
        if (request !== generation) return;
        const next = empty();
        for (const key of Object.keys(next)) if (key !== 'loading') next[key] = data?.[key] || [];
        publish(next);
      } catch {
        if (request === generation) publish(empty());
      }
    },
  };
}
