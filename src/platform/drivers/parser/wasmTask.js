import * as indexedDbCache from '../storage/indexedDbCache.js';
import { startWorkerDemo } from './workerTask.js';

export function startWasmDemo(options, cache = indexedDbCache) {
  return startWorkerDemo(options, cache, {
    createWorker: () => new Worker(new URL('../../../demoWorker.js', import.meta.url), { type: 'module' }),
    loadSources: async files => {
      const buffers = await Promise.all(files.map(file => file.arrayBuffer()));
      return { message: { buffers }, transfer: buffers };
    },
  });
}
