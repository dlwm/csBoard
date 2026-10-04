import { startWasmDemo } from './wasmTask.js';
import { recommendedDemoParseConcurrency } from '../../../demo/batch.js';

export function createWasmParserDriver(cache) {
  return Object.freeze({
    id: 'go-wasm', execution: 'worker', input: 'file',
    concurrency: jobs => recommendedDemoParseConcurrency(jobs.length, jobs),
    start: options => startWasmDemo(options, cache),
  });
}
