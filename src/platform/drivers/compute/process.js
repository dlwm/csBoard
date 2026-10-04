import { migrateLegacyCache } from '../storage/legacyMigration.js';
let sequence = 0;
export function createProcessComputeDriver(backend) {
  const sessionId = globalThis.crypto.randomUUID();
  const run = async (method, args, { signal } = {}) => {
    if (method.startsWith('analysis.')) await migrateLegacyCache(backend);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const id = `data-${sessionId}-${++sequence}`;
    const abort = () => { backend.cancelCompute(id).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try { return await backend.runCompute(id, method, args); }
    finally { signal?.removeEventListener('abort', abort); }
  };
  return Object.freeze({ id: 'electron-worker', cacheOwner: backend, run });
}
