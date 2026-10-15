import { ensureElectronRuntime } from './lib/electron-runtime.js';
try {
  const executable = await ensureElectronRuntime();
  console.log(`Electron runtime ready: ${executable}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
