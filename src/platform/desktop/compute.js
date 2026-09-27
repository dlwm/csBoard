import { migrateLegacyCache } from '../../demo/legacyCacheMigration.js';
let sequence = 0;
export function createDesktopCompute(backend) {
  const sessionId = globalThis.crypto.randomUUID();
  return async (method, args, { signal } = {}) => {
    if (method.startsWith('analysis.')) await migrateLegacyCache(backend);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const id = `data-${sessionId}-${++sequence}`;
    const abort = () => { backend.cancelCompute(id).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try { return await backend.runCompute(id, method, args); }
    finally { signal?.removeEventListener('abort', abort); }
  };
}
