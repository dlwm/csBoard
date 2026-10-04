export function startProcessDemo(backend, { id, cacheId, files, sampleRate, kind = 'match', batchSize = 1, onMessage }) {
  let settled = false;
  let rejectTask;
  let unsubscribe = () => {};
  const finish = (action, value) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    action(value);
  };
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    unsubscribe = backend.onDemoEvent(message => {
      if (message.id !== id || settled) return;
      onMessage?.(message);
      if (message.type === 'complete') finish(resolve, message);
      if (message.type === 'error') finish(reject, Object.assign(new Error(message.message), { code: message.code, reason: message.reason }));
    });
    onMessage?.({ type: 'queued' });
    backend.startDemo({ id, cacheId, sources: files.map(file => file.nativeId), sampleRate, kind, batchSize }).catch(error => finish(reject, error));
  });
  return {
    promise,
    terminate() {
      if (settled) return;
      backend.cancelDemo(id).catch(() => {});
      finish(rejectTask, new Error('Demo task cancelled'));
    },
  };
}
