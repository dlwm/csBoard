import { createBrowserPreferencesDriver } from './drivers/storage/browserPreferences.js';

let driver = createBrowserPreferencesDriver();
let configured = false;
export function configurePreferences(preferences) {
  if (configured) throw new Error('Preferences have already been configured');
  driver = preferences;
  configured = true;
}

// A stable facade: callers do not capture a pre-hydration backend.
// 稳定门面，调用者不会意外持有启动前的旧后端。
export const preferences = Object.freeze({
  getItem: key => driver.getItem(key),
  setItem: (key, value) => driver.setItem(key, value),
  removeItem: key => driver.removeItem(key),
  keys: () => driver.keys(),
  flush: () => driver.flush(),
});
