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
