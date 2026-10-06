import { MAX_DESKTOP_PARSERS } from '../../../../shared/parser-limits.js';
import { startProcessDemo } from './processTask.js';

// This host contract submits jobs and persists results in the host's cache.
// Mobile hosts can implement it with an embedded Go library, without spawning.
export function createProcessParserDriver(backend) {
  for (const method of ['startDemo', 'cancelDemo', 'onDemoEvent']) {
    if (typeof backend?.[method] !== 'function') throw new Error(`Native parser requires ${method}`);
  }
  return Object.freeze({
    id: 'go-process', execution: 'native', input: 'native', cacheOwner: backend,
    concurrency: jobs => Math.min(MAX_DESKTOP_PARSERS, jobs.length),
    start: options => startProcessDemo(backend, options),
  });
}
