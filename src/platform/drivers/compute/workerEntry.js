import { runSerialization } from '../../../app/serialization.js';
import * as indexedDbCache from '../storage/indexedDbCache.js';
import { runAnalysisQuery } from '../../../analysis/queryService.js';
let sequence = 0;
const pending = new Map();
const hostCache = Object.fromEntries(['listCachedDemos', 'getCachedDemo', 'getCachedDemoRound'].map(method => [method, (...args) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  self.postMessage({ type: 'cache-request', id, method, args });
})]));
self.onmessage = async ({ data }) => {
  if (data.type === 'cache-response') {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (request) data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
    return;
  }
  const { method, args, externalCache } = data;
  const cache = externalCache ? hostCache : indexedDbCache;
  try { self.postMessage({ result: await (method.startsWith('analysis.') ? runAnalysisQuery(cache, method, args) : runSerialization(method, args)) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
