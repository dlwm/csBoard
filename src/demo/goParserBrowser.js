import { createGoParserAdapter } from './goParserAdapter.js';

let ready;
async function initialize() {
  ready ||= (async () => {
    const root = new URL('../go-parser/', self.location.href);
    await import(/* @vite-ignore */ new URL('wasm_exec.js', root).href);
    const go = new globalThis.Go();
    const response = await fetch(new URL('parser.wasm', root));
    if (!response.ok) throw new Error(`Demo parser fetch failed (${response.status})`);
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    void go.run(instance);
    if (typeof globalThis.csboardGoParserRequest !== 'function') throw new Error('Go parser did not initialize');
    return { memory: instance.exports.mem };
  })();
  return ready;
}

function result(encoded) {
  const response = JSON.parse(encoded);
  if (response.error) throw new Error(response.error);
  return response.result;
}

export function createBrowserGoParser() {
  let sources;
  return createGoParserAdapter({
    init: initialize,
    openSources: async data => {
      await initialize();
      if (data.buffers || data.buffer) {
        sources = result(globalThis.csboardGoParserSource((data.buffers || [data.buffer]).map(buffer => new Uint8Array(buffer))));
      }
      if (!sources) throw new Error('No demo sources');
      return sources;
    },
    request: async (method, args) => result(globalThis.csboardGoParserRequest(method, JSON.stringify(args))),
  });
}
