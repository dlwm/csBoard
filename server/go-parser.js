// One WASM session per request; serialize access to its isolate-local callbacks.
export function createGoHttpParser(loadModule) {
  let ready, queue = Promise.resolve();
  const decode = value => {
    const response = JSON.parse(value);
    if (response.error) throw new Error(response.error);
    return response.result;
  };
  const request = (method, query = {}) => decode(globalThis.csboardGoParserRequest(method, JSON.stringify(query)));
  function initialize() {
    if (!ready) ready = (async () => {
      const go = new globalThis.Go();
      const instance = await WebAssembly.instantiate(await loadModule(), go.importObject);
      go.run(instance).catch(error => console.error('Go HTTP parser stopped', error));
      if (!globalThis.csboardGoParserSource) throw new Error('Go parser failed to initialize');
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  return {
    name: 'demoinfocs-go',
    withSource(bytes, callback) {
      const task = queue.catch(() => {}).then(async () => {
        await initialize();
        try {
          decode(globalThis.csboardGoParserSource([bytes]));
          return await callback({
            parseHeader: () => request('header'),
            parseEvents: (_bytes, events) => request('events', { events }),
            parseTicks: (_bytes, props, ticks, players) => request('ticks', { props, ticks, ...(players ? { players } : {}) }),
          });
        } finally { request('close'); }
      });
      queue = task.then(() => {}, () => {});
      return task;
    },
  };
}
