import { startBrowserDemo } from '../browser/demoTask.js';
import { recommendedDemoParseConcurrency } from '../../demo/batch.js';

export function createWasmEngine(cache) {
  return Object.freeze({
    id: 'wasm', execution: 'worker', input: 'file',
    concurrency: jobs => recommendedDemoParseConcurrency(jobs.length, jobs),
    start: options => startBrowserDemo(options, cache),
  });
}
