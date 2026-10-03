import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncAppVersion } from './lib/app-version.js';

const args = process.argv.slice(2);
try {
  if (args.length > 1 || args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/sync-version.js [--check]');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { version, buildNumber } = syncAppVersion(root, { check: args.includes('--check') });
  console.log(`Application version ${version}; mobile build ${buildNumber} (${args.includes('--check') ? 'consistent' : 'synchronized'})`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
