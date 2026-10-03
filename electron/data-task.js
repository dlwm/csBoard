import { withAnalysisCache } from './analysis-cache.js';
import { runSerialization } from '../src/platform/shared/serialization.js';
import { runAnalysisQuery } from '../src/platform/shared/analysis.js';
import { decodeStoredValue } from '../src/app/storageCodec.js';
import { readCacheFile } from './cache-files.js';
const pending = new Map();
let sequence = 0;
const read = (method, args) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  process.parentPort.postMessage({ type: 'read', id, method, args });
});
const cache = {
  listCachedDemos: async () => (await read('cache.list', {})).map(decodeStoredValue),
  getCachedDemo: async id => { const data = await read('cache.get', { id }); return data == null ? null : decodeStoredValue(data); },
  getCachedDemoRound: async (id, round) => { const data = await read('cache.round', { id, round }); return data == null ? null : decodeStoredValue(data); },
};
process.parentPort.on('message', async ({ data }) => {
  if (data.type === 'readResult') {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) request?.reject(new Error(data.error));
    else if (request) {
      try { request.resolve(data.inline || data.result == null ? data.result : await readCacheFile(data.result)); }
      catch (error) { request.reject(error); }
    }
    return;
  }
  if (data.type !== 'start') return;
  try {
    const compute = () => data.method.startsWith('analysis.') ? runAnalysisQuery(cache, data.method, data.args) : runSerialization(data.method, data.args);
    const result = await (data.method === 'analysis.query' ? withAnalysisCache(data.analysisCache, data.args, cache, compute) : compute());
    process.parentPort.postMessage({ type: 'complete', result });
  }
  catch (error) { process.parentPort.postMessage({ type: 'error', message: error.message }); }
});
