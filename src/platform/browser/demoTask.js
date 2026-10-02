import * as browserCache from '../../demo/browserCache.js';
import { startWorkerDemo } from '../engines/workerTask.js';

export function startBrowserDemo(options, cache = browserCache) {
  return startWorkerDemo(options, cache, {
    createWorker: () => new Worker(new URL('../../demoWorker.js', import.meta.url), { type: 'module' }),
    loadSources: async files => {
      const buffers = await Promise.all(files.map(file => file.arrayBuffer()));
      return { message: { buffers }, transfer: buffers };
    },
  });
}
