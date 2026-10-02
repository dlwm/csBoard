export function createBrowserCompute(cache) {
  return function compute(method, args, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./dataWorker.js', import.meta.url), { type: 'module' });
      let settled = false;
      const finish = (action, value) => { if (settled) return; settled = true; worker.terminate(); signal?.removeEventListener('abort', abort); action(value); };
      const abort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = async ({ data }) => {
        if (settled) return;
        if (data.type === 'cache-request') {
          const allowed = ['listCachedDemos', 'getCachedDemo', 'getCachedDemoRound'];
          try {
            if (!cache || !allowed.includes(data.method)) throw new Error('Unsupported worker cache request');
            const result = await cache[data.method](...data.args);
            if (!settled) worker.postMessage({ type: 'cache-response', id: data.id, result });
          } catch (error) {
            if (!settled) worker.postMessage({ type: 'cache-response', id: data.id, error: error.message });
          }
          return;
        }
        data.error ? finish(reject, new Error(data.error)) : finish(resolve, data.result);
      };
      worker.onerror = event => finish(reject, new Error(event.message || 'Data worker stopped'));
      worker.onmessageerror = () => finish(reject, new Error('Data response could not be read'));
      try { worker.postMessage({ method, args, externalCache: Boolean(cache) }); }
      catch (error) { finish(reject, error); }
    });
  };
}

export const browserCompute = createBrowserCompute();
