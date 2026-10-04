import { createSqliteDemoCache } from './sqliteCache.js';
import { createSqliteRecords } from './sqliteRecords.js';
import { indexedDbRecords } from './indexedDbRecords.js';
import { createBrowserPreferencesDriver } from './browserPreferences.js';
import { createSqlitePreferencesDriver } from './sqlitePreferences.js';

export function createSqliteStorageDriver(backend, cacheOptions) {
  const records = createSqliteRecords(backend, indexedDbRecords);
  return Object.freeze({ id: 'sqlite-storage', owner: backend,
    cache: createSqliteDemoCache(backend, cacheOptions), records,
    // Preferences never lived in IndexedDB; their legacy source is localStorage.
    // 偏好的旧来源不是 IndexedDB，因此不依赖浏览器数据库进行原生启动。
    preferences: createSqlitePreferencesDriver(createSqliteRecords(backend), createBrowserPreferencesDriver()),
  });
}
