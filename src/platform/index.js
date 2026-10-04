import { createDetectedHost, assemblePlatform } from './assembly/default.js';
import { configurePreferences } from './preferences.js';

let platform, configuration, host, initialization;

/** @param {import('./contracts.js').PlatformDrivers} drivers */
export function configurePlatform(drivers) {
  if (platform || configuration || host) throw new Error('Platform has already been configured');
  configuration = drivers;
}

// Visibility subscriptions must not instantiate parser/storage workers.
export function getHost() {
  return host ||= configuration?.host || createDetectedHost();
}

export function getPlatform() {
  return platform ||= assemblePlatform({ ...configuration, host: getHost() });
}

// Native preference hydration happens before any component reads initial state.
export function initializePlatform() {
  return initialization ||= (async () => {
    const services = getPlatform();
    await services.preferences.ready();
    configurePreferences(services.preferences);
    const flush = () => { services.preferences.flush().catch(error => console.warn('Preference flush failed:', error)); };
    // The application runtime owns these listeners for its entire lifetime.
    // Native suspension must not leave preference writes only in the mirror.
    getHost().presentation?.subscribe(active => { if (active === false) flush(); });
    globalThis.window?.addEventListener('pagehide', flush);
    return services;
  })();
}
