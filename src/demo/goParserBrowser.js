import { createGoParserAdapter } from './goParserAdapter.js';

let ready;
let goRuntime, runtimeFailure, stderr = '';
async function initialize() {
  ready ||= (async () => {
    const root = new URL('../go-parser/', self.location.href);
    await import(/* @vite-ignore */ new URL('wasm_exec.js', root).href);
    const go = goRuntime = new globalThis.Go();
    // Capture the original Go failure before an undefined bridge result hides it.
    // Worker-local stderr is bounded; never turn a terminated runtime into JSON.
    // 保存 Go 原始错误，避免 undefined 的 JSON 二次报错误导诊断。
    const write = globalThis.fs?.writeSync;
    if (write) globalThis.fs.writeSync = (fd, bytes, ...args) => {
      if (fd === 2) stderr = (stderr + new TextDecoder().decode(bytes)).slice(0, 8192);
      return write.call(globalThis.fs, fd, bytes, ...args);
    };
    go.exit = code => { runtimeFailure = new Error(`Go WASM parser exited with code ${code}${stderr ? `: ${stderr}` : ''}`); };
    const response = await fetch(new URL('parser.wasm', root));
    if (!response.ok) throw new Error(`Demo parser fetch failed (${response.status})`);
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    void go.run(instance).catch(error => { runtimeFailure = error; });
    if (typeof globalThis.csboardGoParserRequest !== 'function') throw new Error('Go parser did not initialize');
    return { memory: instance.exports.mem };
  })();
  return ready;
}

function result(encoded, method) {
  if (typeof encoded !== 'string') {
    const reason = runtimeFailure?.message || (goRuntime?.exited ? `Go WASM parser stopped${stderr ? `: ${stderr}` : ''}` : 'Go WASM parser returned no response');
    throw new Error(`${method}: ${reason}`);
  }
  const response = JSON.parse(encoded);
  if (response.error) throw new Error(response.error);
  return response.result;
}

export function createBrowserGoParser() {
  let sources;
  return createGoParserAdapter({
    compactTicks: true,
    init: initialize,
    openSources: async data => {
      await initialize();
      if (data.buffers || data.buffer) {
        sources = result(globalThis.csboardGoParserSource((data.buffers || [data.buffer]).map(buffer => new Uint8Array(buffer))), 'source');
      }
      if (!sources) throw new Error('No demo sources');
      let lastProgressAt = -Infinity;
      globalThis.csboardGoParserTickProgress = (part, tick, target) => {
        const now = performance.now();
        // Limit UI updates while retaining actual scanned-tick progress.
        // 真实进度最多每 250ms 刷新，避免快速扫描时刷屏与反复渲染。
        if (now - lastProgressAt < 250 && tick < target) return;
        lastProgressAt = now;
        const fraction = Math.max(0, Math.min(.99, tick / target));
        self.postMessage({ type: 'progress', phase: 'preparing', completed: tick, total: target,
          percent: (part + fraction) / sources.length * 85 });
      };
      return sources;
    },
    request: async (method, args) => {
      if (goRuntime?.exited || runtimeFailure) throw new Error(`${method}: ${runtimeFailure?.message || 'Go WASM parser stopped'}`);
      return result(globalThis.csboardGoParserRequest(method, JSON.stringify(args)), method);
    },
  });
}
