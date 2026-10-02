import { browserCompute, createBrowserCompute } from './browser/compute.js';
import { createDesktopCompute } from './desktop/compute.js';
import { desktopBridge } from '../app/runtime.js';
import * as browserCache from '../demo/browserCache.js';
import { browserRecords } from './browser/records.js';
import { createNativeCache } from './native/cache.js';
import { createNativeRecords } from './native/records.js';
import { createAiTransport } from '../ai/transport.js';
import { AI_ENABLED, AI_CHAT_URL, PARSER_ENGINE } from '../app/config.js';
import { createWebShell } from './shells/web.js';
import { createElectronShell } from './shells/electron.js';
import { createWasmEngine } from './engines/wasm.js';
import { createNativeEngine } from './engines/native.js';
import { createDisabledEngine } from './engines/disabled.js';
import { composePlatform } from './compose.js';

let platform, configuration, appShell;

// A shell entry configures adapters before loading the application. Selection
// stays fixed for this renderer: changing stores during a session is unsafe.
/** @param {import('./contracts.js').PlatformAdapters} options */
export function configurePlatform(options) {
  if (platform || configuration || appShell) throw new Error('Platform has already been configured');
  configuration = options;
}

// Lifecycle/rendering only need the shell. Do not initialize parser or storage
// services just to subscribe to window visibility.
export function getShell() {
  if (appShell) return appShell;
  const bridge = desktopBridge();
  appShell = configuration?.shell || (bridge ? createElectronShell(bridge) : createWebShell());
  return appShell;
}

export function getPlatform() {
  if (platform) return platform;
  const bridge = desktopBridge();
  const native = bridge?.native;
  const options = configuration || {};
  const shell = getShell();
  const storage = options.storage || (native ? {
    id: 'native', owner: native,
    cache: createNativeCache(native), records: createNativeRecords(native, browserRecords),
  } : { id: 'browser', cache: browserCache, records: browserRecords });
  const parser = options.parser || (PARSER_ENGINE && PARSER_ENGINE !== 'auto' ? PARSER_ENGINE : native ? 'native' : 'wasm');
  if (typeof parser === 'string' && !['wasm', 'native'].includes(parser)) throw new Error(`Unknown parser adapter: ${parser}`);
  const engine = shell.demoParsing === false ? createDisabledEngine() : typeof parser === 'object' ? parser
    : parser === 'native' ? createNativeEngine(storage.owner) : createWasmEngine(storage.cache);
  const computeAdapter = options.compute || (engine.execution === 'native' && native && storage.owner === native
    ? createDesktopCompute(native)
    : storage.cache === browserCache ? browserCompute : createBrowserCompute(storage.cache));
  const compute = (method, ...args) => {
    if (shell.demoParsing === false && /^(analysis|broadcast)\./.test(method)) {
      return Promise.reject(new Error('Demo analysis and broadcast are unavailable in mobile H5'));
    }
    return computeAdapter(method, ...args);
  };
  const ai = AI_ENABLED ? createAiTransport(shell.ai, AI_CHAT_URL) : null;
  platform = composePlatform({ shell, storage, engine, compute, ai });
  return platform;
}
