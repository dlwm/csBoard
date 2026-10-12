import { ViewerError } from '../core/controller.js';

// Each slot owns one lease. Drivers own fetching/parsing; the host chooses keys.
// 单槽位拥有一个资源租约；读取和解析由驱动实现，核心不认识路径或地图目录。
export function createResourceController({ loader, onReady = () => {}, onRelease = () => {}, onState = () => {}, onObserverError = () => {} }) {
  if (typeof loader?.load !== 'function') throw new TypeError('Resource loader.load is required');
  const slots = new Map(); let disposed = false;
  const slotFor = key => {
    if (disposed) throw new ViewerError('disposed', 'Resources have been disposed');
    if (typeof key !== 'string' || !key) throw new ViewerError('invalid_resource', 'Resource key is required');
    if (!slots.has(key)) slots.set(key, { key, status: 'idle', phase: null, loaded: 0, total: 0, error: null, revision: 0, lease: null, abort: null, pending: null, tail: Promise.resolve() });
    return slots.get(key);
  };
  const state = slot => ({ key: slot.key, status: slot.status, phase: slot.phase, loaded: slot.loaded, total: slot.total, error: slot.error && { ...slot.error } });
  const publish = slot => { try { onState(state(slot)); } catch (error) { try { onObserverError(error); } catch {} } };
  const release = slot => {
    const lease = slot.lease; slot.lease = null;
    if (!lease) return;
    try { onRelease(slot.key, lease.value); } finally { lease.dispose(); }
  };
  return Object.freeze({
    getState() { return [...slots.values()].map(state); },
    get(key) { return slotFor(key).lease?.value ?? null; },
    async ensure(key) {
      const slot = slotFor(key);
      if (slot.lease) return slot.lease.value;
      if (slot.pending) return slot.pending;
      const generation = ++slot.revision, abort = new AbortController(); slot.abort = abort;
      slot.status = 'loading'; slot.phase = 'waiting'; slot.error = null; slot.loaded = 0; slot.total = 0; publish(slot);
      const previous = slot.tail;
      const request = (async () => {
        let lease;
        try {
          // Cancellation cannot interrupt GLTF parsing. Queue a retry behind
          // the old request instead of accumulating simultaneous parses.
          // 同槽位重试等旧解析结束，避免频繁显隐累积模型载荷。
          await previous.catch(() => {});
          if (disposed || slot.revision !== generation || abort.signal.aborted) throw new ViewerError('cancelled', 'Resource request cancelled');
          slot.phase = 'download'; publish(slot);
          lease = await Promise.resolve().then(() => loader.load(key, { signal: abort.signal, onProgress: progress => {
            if (disposed || slot.revision !== generation || abort.signal.aborted) return;
            if (typeof progress.phase === 'string') slot.phase = progress.phase;
            slot.loaded = Number.isFinite(progress.loaded) ? Math.max(0, progress.loaded) : 0;
            slot.total = Number.isFinite(progress.total) ? Math.max(0, progress.total) : 0;
            publish(slot);
          } }));
          if (!lease || lease.value == null || typeof lease.dispose !== 'function') throw new ViewerError('invalid_resource', 'Resource drivers must return {value, dispose}');
          if (disposed || slot.revision !== generation || abort.signal.aborted) { lease.dispose(); lease = null; throw new ViewerError('cancelled', 'Resource request cancelled'); }
          slot.lease = lease; onReady(key, lease.value); slot.status = 'ready'; slot.phase = null; publish(slot); return lease.value;
        } catch (error) {
          if (slot.lease === lease) release(slot); else if (typeof lease?.dispose === 'function') lease.dispose();
          if (!disposed && slot.revision === generation) { slot.status = abort.signal.aborted ? 'cancelled' : 'error'; slot.phase = null; slot.error = { code: typeof error?.code === 'string' ? error.code : 'resource_failed', message: error?.message || String(error) }; publish(slot); }
          throw error;
        } finally { if (slot.revision === generation) { slot.pending = null; slot.abort = null; } }
      })();
      slot.pending = request; slot.tail = request.then(() => undefined, () => undefined); return request;
    },
    cancel(key) { const slot = slotFor(key); slot.revision++; slot.abort?.abort(); slot.abort = null; slot.pending = null; if (!slot.lease) { slot.status = 'cancelled'; slot.phase = null; publish(slot); } },
    unload(key) { const slot = slotFor(key); slot.revision++; slot.abort?.abort(); slot.abort = null; slot.pending = null; release(slot); slot.status = 'idle'; slot.phase = null; slot.loaded = 0; slot.total = 0; slot.error = null; publish(slot); },
    dispose() { if (disposed) return; disposed = true; for (const slot of slots.values()) { slot.revision++; slot.abort?.abort(); release(slot); } slots.clear(); },
  });
}
