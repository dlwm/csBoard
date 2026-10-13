import { migrateLegacyCache } from '../storage/legacyMigration.js';
let sequence = 0;
export function createProcessComputeDriver(backend) {
  const sessionId = globalThis.crypto.randomUUID();
  const run = async (method, args, { signal, onProgress } = {}) => {
    if (method.startsWith('analysis.') || method.startsWith('format.')) await migrateLegacyCache(backend);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const id = `data-${sessionId}-${++sequence}`;
    const unsubscribe = onProgress ? backend.onComputeProgress?.(event => { if (event.id === id && !signal?.aborted) onProgress(event.value); }) : null;
    const abort = () => { backend.cancelCompute(id).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try { return await backend.runCompute(id, method, args); }
    finally { unsubscribe?.(); signal?.removeEventListener('abort', abort); }
  };
  return Object.freeze({ id: 'electron-worker', cacheOwner: backend, run });
}
