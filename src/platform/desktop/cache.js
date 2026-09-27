import { migrateLegacyCache } from '../../demo/legacyCacheMigration.js';
import { encodeStoredValue, decodeStoredValue } from '../../app/storageCodec.js';

export function createDesktopCache(backend) {
  async function nativeCall(method, args = {}) {
    await migrateLegacyCache(backend);
    return backend.storage(method, args);
  }
  async function getCachedDemo(id) {
    const value = await readCache(id);
    return value == null ? undefined : decodeStoredValue(value);
  }
  async function getCachedDemoRound(id, round) {
    const value = await readCache(id, round);
    return value == null ? null : decodeStoredValue(value);
  }
  async function readCache(id, round) {
    await migrateLegacyCache(backend);
    const url = await backend.readCache(id, round);
    if (url == null) return null;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to read native cache');
    return response.text();
  }
  const countCachedDemoRounds = id => nativeCall('cache.count', { id });
  const inspectCachedDemo = async id => {
    const value = await nativeCall('cache.inspect', { id });
    return value == null ? undefined : decodeStoredValue(value);
  };
  async function listCachedDemos() {
    return (await nativeCall('cache.list')).map(decodeStoredValue).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function putCachedDemo(entry) {
    const { data, analysisRows, ...metadata } = entry;
    return nativeCall('cache.put', { id: entry.id, value: encodeStoredValue(entry), metadata: encodeStoredValue(metadata) });
  }
  const putCachedDemoRound = (id, data) => nativeCall('cache.putRound', { id, round: data.round, value: encodeStoredValue(data) });
  const deleteCachedDemo = id => nativeCall('cache.delete', { id });

  return { getCachedDemo, inspectCachedDemo, getCachedDemoRound, countCachedDemoRounds, listCachedDemos, putCachedDemo, putCachedDemoRound, deleteCachedDemo };
}
