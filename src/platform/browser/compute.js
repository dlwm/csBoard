export function browserCompute(method, args, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dataWorker.js', import.meta.url), { type: 'module' });
    const finish = (action, value) => { worker.terminate(); signal?.removeEventListener('abort', abort); action(value); };
    const abort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => data.error ? finish(reject, new Error(data.error)) : finish(resolve, data.result);
    worker.onerror = event => finish(reject, new Error(event.message || 'Data worker stopped'));
    worker.onmessageerror = () => finish(reject, new Error('Data response could not be read'));
    try { worker.postMessage({ method, args }); }
    catch (error) { finish(reject, error); }
  });
}
