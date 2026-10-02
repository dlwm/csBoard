import { configurePlatform } from './platform/index.js';

// Shell entries only assemble services. All platforms load this same UI.
export async function startApplication(adapters) {
  if (adapters) configurePlatform(adapters);
  await import('./main.jsx');
}
