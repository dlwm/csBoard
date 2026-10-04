import { desktopBridge } from '../hosts/electronBridge.js';
import { createBrowserHost } from '../hosts/browser.js';
import { createElectronHost } from '../hosts/electron.js';
import { createBrowserStorageDriver } from '../drivers/storage/browser.js';
import { createSqliteStorageDriver } from '../drivers/storage/sqlite.js';
import { createWasmParserDriver } from '../drivers/parser/wasm.js';
import { createProcessParserDriver } from '../drivers/parser/process.js';
import { createDisabledParserDriver } from '../drivers/parser/disabled.js';
import { createWorkerComputeDriver } from '../drivers/compute/worker.js';
import { createProcessComputeDriver } from '../drivers/compute/process.js';
import { createAiTransport } from '../../ai/transport.js';
import { AI_ENABLED, AI_CHAT_URL, PARSER_ENGINE } from '../../app/buildConfig.js';
import { createPlatform } from '../createPlatform.js';

export function createDetectedHost() {
  const bridge = desktopBridge();
  return bridge ? createElectronHost(bridge) : createBrowserHost();
}

// Composition root: only this layer chooses defaults. Explicitly supplied
// drivers have priority; parser selection never determines storage selection.
// 组装入口：默认选择仅在此处发生，解析驱动不决定存储或计算驱动。
export function assemblePlatform({ host, storage, parser, compute } = {}) {
  const backend = desktopBridge()?.native;
  host ||= createDetectedHost();
  storage ||= backend ? createSqliteStorageDriver(backend) : createBrowserStorageDriver();
  if (host.demoParsing === false) parser = createDisabledParserDriver();
  else if (!parser) {
    const selection = PARSER_ENGINE || 'auto';
    if (!['auto', 'wasm', 'native'].includes(selection)) throw new Error(`Unknown parser selection: ${selection}`);
    parser = selection === 'native' || (selection === 'auto' && backend)
      ? createProcessParserDriver(backend) : createWasmParserDriver(storage.cache);
  }
  compute ||= backend && storage.owner === backend
    ? createProcessComputeDriver(backend) : createWorkerComputeDriver(storage.cache);
  return createPlatform({ host, storage, parser, compute,
    ai: AI_ENABLED ? createAiTransport(host.ai, AI_CHAT_URL) : null,
  });
}
