importScripts('./wasm_exec.js');

let ready;
async function initialize() {
  ready ||= (async () => {
    const go = new Go();
    const response = await fetch('./parser.wasm');
    if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`);
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    void go.run(instance);
    if (typeof self.csboardGoParserRequest !== 'function') throw new Error('Go parser did not initialize');
  })();
  return ready;
}

self.onmessage = async ({ data }) => {
  const { id, method, buffers, args = {} } = data || {};
  try {
    await initialize();
    const encoded = method === 'source'
      ? self.csboardGoParserSource((buffers || []).map(bytes => new Uint8Array(bytes)))
      : self.csboardGoParserRequest(method, JSON.stringify(args));
    self.postMessage({ id, ...JSON.parse(encoded) });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
