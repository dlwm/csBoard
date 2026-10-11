import * as cache from './indexedDbCache.js';
import { indexedDbRecords } from './indexedDbRecords.js';
import { createBrowserPreferencesDriver } from './browserPreferences.js';

export function createBrowserStorageDriver() {
  const preferences = createBrowserPreferencesDriver();
  return Object.freeze({ id: 'browser-storage', cache, records: indexedDbRecords, preferences,
    // Clear only CSBoard stores/preferences, never another application's origin data.
    // 仅清理本应用的数据库与偏好，不清空同域其他应用的数据。
    async clearData() {
      await cache.clearCachedDemos();
      await indexedDbRecords.clear();
      for (const key of preferences.keys()) if (key.startsWith('csboard-')) preferences.removeItem(key);
      await preferences.flush();
    },
  });
}
