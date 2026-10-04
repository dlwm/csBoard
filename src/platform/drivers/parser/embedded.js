import { startWorkerDemo } from './workerTask.js';

// Unlike the desktop task host, the embedded parser never writes product data.
// Its output is persisted through the injected cache, exactly like WASM.
export function createEmbeddedParserDriver(plugin, cache) {
  return Object.freeze({
    id: 'go-embedded', execution: 'native', input: 'native',
    concurrency: () => 1,
    start(options) {
      let sessionId, closing = false;
      const close = () => {
        closing = true;
        if (!sessionId) return;
        const id = sessionId;
        sessionId = null;
        plugin.closeParser({ sessionId: id }).catch(error => console.warn('Parser cleanup failed', error));
      };
      return startWorkerDemo(options, cache, {
        createWorker: () => new Worker(new URL('./embeddedWorker.js', import.meta.url), { type: 'module' }),
        loadSources: async files => {
          const opened = await plugin.openParser({ sourceIds: files.map(file => file.nativeId) });
          sessionId = opened.sessionId;
          if (closing) close();
          return { message: { sources: opened.sources } };
        },
        request: async (method, args) => {
          if (!sessionId) throw new Error('Demo task cancelled');
          const { result } = await plugin.requestParser({ sessionId, method, arguments: JSON.stringify(args) });
          return JSON.parse(result);
        },
        close,
      });
    },
  });
}
