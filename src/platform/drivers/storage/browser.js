import * as cache from './indexedDbCache.js';
import { indexedDbRecords } from './indexedDbRecords.js';
import { createBrowserPreferencesDriver } from './browserPreferences.js';

export function createBrowserStorageDriver() {
  return Object.freeze({ id: 'browser-storage', cache, records: indexedDbRecords, preferences: createBrowserPreferencesDriver() });
}
