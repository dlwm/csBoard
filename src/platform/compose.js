// The UI-facing service contract is independent of shell and engine names.
// Native engines currently persist through their host: reject mixed stores
// rather than parse successfully into a cache the UI cannot read.
export function composePlatform({ shell, engine, storage, compute, ai = null }) {
  if (!shell?.id || typeof shell.chooseFiles !== 'function' || !engine?.id
    || typeof engine.start !== 'function' || typeof engine.concurrency !== 'function'
    || !storage?.cache || !storage?.records || typeof compute !== 'function') {
    throw new Error('Platform requires a shell, parser, storage and compute adapter');
  }
  if (engine.cacheOwner && engine.cacheOwner !== storage.owner) {
    throw new Error('Native parser and cache must use the same storage host');
  }
  if (engine.input === 'native' && !shell.nativeFilePicker) {
    throw new Error('Native parser requires a native file picker');
  }
  return Object.freeze({
    kind: shell.kind,
    adapters: Object.freeze({ shell: shell.id, parser: engine.id, storage: storage.id }),
    ai,
    capabilities: Object.freeze({
      mobile: Boolean(shell.mobile),
      demoParsing: shell.demoParsing !== false,
      nativeFilePicker: engine.input === 'native' && Boolean(shell.nativeFilePicker),
      backgroundParsing: engine.execution === 'native' && Boolean(shell.backgroundParsing),
      resourceImport: Boolean(shell.resources),
    }),
    cache: storage.cache, records: storage.records, compute,
    demos: Object.freeze({ concurrency: engine.concurrency, start: engine.start,
      chooseFiles: event => shell.chooseFiles(event, engine.input),
      releaseFiles: files => shell.releaseFiles?.(files) || Promise.resolve(),
    }),
    resources: shell.resources, maintenance: shell.maintenance, presentation: shell.presentation,
  });
}
