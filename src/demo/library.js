// Demo library use cases. Storage is a port; UI and host APIs do not belong here.
// Demo 目录用例：存储通过端口注入，不依赖界面或宿主。
export function createDemoLibrary(cache, schema) {
  return Object.freeze({
    async list() {
      return (await cache.listCachedDemos()).map(entry => {
        const sampleRate = entry.sampleRate || Number(String(entry.id).match(/^(\d+)hz\|/)?.[1]) || 8;
        return { ...entry, sampleRate, rawMap: entry.map, map: `${entry.map} · ${sampleRate} Hz` };
      });
    },
    async open(id) {
      const entry = await cache.getCachedDemo(id);
      if (!entry?.data?.rounds?.length || entry.data.cacheSchemaVersion !== schema || await cache.countCachedDemoRounds(id) !== entry.data.rounds?.length) {
        if (entry) await cache.deleteCachedDemo(id);
        return undefined;
      }
      return entry;
    },
    remove: id => cache.deleteCachedDemo(id),
  });
}

// Storage ownership differs, but the replay catalogue exposes one recording
// category for client captures and independently saved intervals.
export function replayCatalogue(cachedEntries, savedRecordings) {
  return [...cachedEntries.map(entry => ({ ...entry, storage: 'cache' })),
    ...savedRecordings.map(recording => ({
      id: recording.id, storage: 'record', kind: 'recording', fileName: recording.name,
      rawMap: recording.mapName, map: recording.mapName,
      rounds: recording.rounds, updatedAt: recording.savedAt || recording.createdAt,
      sourceBytes: recording.sourceBytes || 0, dataBytes: 0, analysisBytes: 0,
    }))].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}
