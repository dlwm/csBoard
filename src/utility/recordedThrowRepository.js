// Recorded throw application service. Preview/save consumers share a request;
// cancelling one consumer must not cancel the others. Invalidating the feature
// scope cancels every pending request and discards completed records.
// 记录道具资料服务：预览/保存共享请求，按消费者取消；上下文失效时统一释放。
export function createRecordedThrowRepository(compute, { limit = 8 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Recorded throw cache limit must be positive');
  const cache = new Map(), pending = new Map();
  let generation = 0;
  const keyOf = utility => JSON.stringify([utility.source.demoId, utility.source.round, utility.segment.id, utility.segment.throwEvent.user_name]);
  const check = (note, required) => {
    if (required && !note?.replay?.smokeVoxelFrames?.some(frame => frame?.voxels?.length > 0)) {
      const error = new Error('Recorded smoke voxels are missing');
      error.code = 'smoke_voxels_missing';
      throw error;
    }
    return note;
  };
  const subscribe = (entry, signal) => new Promise((resolve, reject) => {
    const token = Symbol();
    entry.consumers.add(token);
    let settled = false;
    const finish = (action, result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      entry.consumers.delete(token);
      if (!entry.consumers.size && !entry.settled) entry.controller.abort();
      action(result);
    };
    const abort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    entry.promise.then(note => finish(resolve, note), error => finish(reject, error));
  });
  return Object.freeze({
    peek: utility => cache.get(keyOf(utility)),
    async read(utility, { signal, requireSmokeVoxels = false } = {}) {
      signal?.throwIfAborted();
      const key = keyOf(utility);
      if (cache.has(key)) {
        const note = cache.get(key);
        cache.delete(key); cache.set(key, note);
        return check(note, requireSmokeVoxels);
      }
      let entry = pending.get(key);
      if (!entry || entry.controller.signal.aborted) {
        const revision = generation;
        entry = { controller: new AbortController(), consumers: new Set(), settled: false };
        entry.promise = Promise.resolve().then(() => compute('analysis.utility', {
          ids: [utility.source.demoId], players: [utility.segment.throwEvent.user_name],
          round: utility.source.round, segmentId: utility.segment.id,
        }, { signal: entry.controller.signal })).then(note => {
          entry.controller.signal.throwIfAborted();
          if (revision !== generation) throw new DOMException('Cancelled', 'AbortError');
          cache.set(key, note);
          while (cache.size > limit) cache.delete(cache.keys().next().value);
          return note;
        }).finally(() => {
          entry.settled = true;
          if (pending.get(key) === entry) pending.delete(key);
        });
        pending.set(key, entry);
      }
      const note = await subscribe(entry, signal);
      signal?.throwIfAborted();
      return check(note, requireSmokeVoxels);
    },
    clear() {
      generation++;
      for (const entry of pending.values()) entry.controller.abort();
      pending.clear(); cache.clear();
    },
  });
}
