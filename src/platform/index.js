import { browserCompute } from './browser/compute.js';
import { createDesktopCompute } from './desktop/compute.js';
import { desktopBridge } from '../app/runtime.js';
import * as browserCache from '../demo/browserCache.js';
import { recommendedDemoParseConcurrency } from '../demo/batch.js';
import { browserRecords } from './browser/records.js';
import { startBrowserDemo } from './browser/demoTask.js';
import { createDesktopCache } from './desktop/cache.js';
import { createDesktopRecords } from './desktop/records.js';
import { startNativeDemo } from './desktop/demoTask.js';

let platform;

// Select once per renderer. A native failure stays an error, never a silent
// switch to another database. Domain modules depend on these services only.
export function getPlatform() {
  if (platform) return platform;
  const bridge = desktopBridge();
  const desktop = bridge?.isDesktop === true;
  if (desktop && !bridge.native) throw new Error('Desktop native bridge unavailable');
  platform = Object.freeze({
    kind: desktop ? 'desktop' : 'web',
    capabilities: Object.freeze({ nativeFilePicker: desktop, backgroundParsing: desktop, resourceImport: desktop }),
    cache: desktop ? createDesktopCache(bridge.native) : browserCache,
    records: desktop ? createDesktopRecords(bridge.native, browserRecords) : browserRecords,
    demos: desktop ? {
      // Submission window; the native scheduler owns actual CPU/memory admission.
      concurrency: jobs => Math.min(16, jobs.length),
      chooseFiles: () => bridge.native.chooseDemos(),
      start: options => startNativeDemo(bridge.native, options),
    } : {
      concurrency: jobs => recommendedDemoParseConcurrency(jobs.length, jobs),
      chooseFiles: event => Promise.resolve(Array.from(event.target.files || [])),
      start: startBrowserDemo,
    },
    compute: desktop ? createDesktopCompute(bridge.native) : browserCompute,
    resources: desktop ? bridge.resources : null,
    maintenance: desktop ? bridge.maintenance : null,
    presentation: desktop ? bridge.presentation : null,
  });
  return platform;
}
