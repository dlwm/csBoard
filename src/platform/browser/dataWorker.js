import { runSerialization } from '../shared/serialization.js';
import * as cache from '../../demo/browserCache.js';
import { runAnalysisQuery } from '../shared/analysis.js';
self.onmessage = async ({ data: { method, args } }) => {
  try { self.postMessage({ result: await (method.startsWith('analysis.') ? runAnalysisQuery(cache, method, args) : runSerialization(method, args)) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
