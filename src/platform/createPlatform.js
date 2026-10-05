function requireMethods(value, methods, label) {
  for (const method of methods) if (typeof value?.[method] !== 'function') throw new Error(`${label} requires ${method}()`);
}

/**
 * Validate ports before the application can read/write data. Compose existing
 * drivers without importing host frameworks, storage APIs or parser runtimes.
 * UI 挂载前校验驱动契约；此模块不依赖 Electron、Capacitor、数据库或解析实现。
 * @param {import('./contracts.js').PlatformDrivers & {ai?: Object|null}} drivers
 */
export function createPlatform({ host, parser, storage, compute, ai = null }) {
  for (const [name, driver] of Object.entries({ host, parser, storage, compute })) {
    if (typeof driver?.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(driver.id)) throw new Error(`Platform requires a ${name} driver with a lowercase id`);
  }
  requireMethods(host, ['chooseFiles'], 'Host driver');
  requireMethods(parser, ['start', 'concurrency'], 'Parser driver');
  requireMethods(storage.cache, ['getCachedDemo', 'getCachedDemoRound', 'countCachedDemoRounds', 'listCachedDemos', 'putCachedDemo', 'putCachedDemoRound', 'deleteCachedDemo'], 'Demo cache');
  requireMethods(storage.records, ['get', 'put'], 'Record store');
  requireMethods(storage.preferences, ['ready', 'getItem', 'setItem', 'removeItem', 'keys', 'flush'], 'Preference store');
  if (typeof storage.preferences.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(storage.preferences.id)) throw new Error('Preference store requires a lowercase id');
  requireMethods(compute, ['run'], 'Compute driver');
  if (!['web', 'desktop', 'mobile'].includes(host.kind)) throw new Error('Unknown host kind');
  if (!['worker', 'native', 'disabled'].includes(parser.execution) || !['file', 'native'].includes(parser.input)) throw new Error('Invalid parser execution or input mode');
  for (const driver of [parser, compute]) {
    if (driver.cacheOwner && driver.cacheOwner !== storage.owner) throw new Error(`${driver.id} requires its own storage host`);
  }
  if (parser.input === 'native' && !host.nativeFilePicker) throw new Error('Native parser input requires a native file picker');
  if (host.demoParsing === false && parser.execution !== 'disabled') throw new Error('This host disables Demo parsing');
  const run = (method, ...args) => {
    if (host.demoParsing === false && /^(analysis|broadcast)\./.test(method)) return Promise.reject(new Error('Demo analysis and broadcast are unavailable in this host'));
    return compute.run(method, ...args);
  };
  return Object.freeze({
    kind: host.kind,
    drivers: Object.freeze({ host: host.id, parser: parser.id, storage: storage.id, compute: compute.id, preferences: storage.preferences.id }),
    ai,
    capabilities: Object.freeze({
      mobile: Boolean(host.mobile), demoParsing: parser.execution !== 'disabled',
      nativeFilePicker: parser.input === 'native' && Boolean(host.nativeFilePicker),
      backgroundParsing: parser.execution === 'native' && Boolean(host.backgroundParsing),
      resourceImport: Boolean(host.resources), releaseDownload: Boolean(host.releaseDownload),
    }),
    cache: storage.cache, records: storage.records, preferences: storage.preferences, compute: run,
    demos: Object.freeze({ concurrency: jobs => parser.concurrency(jobs), start: options => parser.start(options),
      chooseFiles: event => host.chooseFiles(event, parser.input),
      releaseFiles: files => host.releaseFiles?.(files) || Promise.resolve(),
    }),
    resources: host.resources, maintenance: host.maintenance, presentation: host.presentation, updates: host.updates,
  });
}
