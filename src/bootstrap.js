import { configurePlatform, initializePlatform } from './platform/index.js';

// Host entries only assemble drivers. All platforms load this same UI.
export async function startApplication(drivers) {
  if (drivers) configurePlatform(drivers);
  await initializePlatform();
  await import('./main.jsx');
}
