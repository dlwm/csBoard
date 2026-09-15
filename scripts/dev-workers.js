import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const children = [
  spawn(process.execPath, [path.join(root, 'scripts', 'map-server.js')], { cwd: root, stdio: 'inherit' }),
  // Pin persistence to the existing root directory when relocating the config;
  // otherwise Wrangler would silently start with a different local room store.
  spawn(process.execPath, [wrangler, 'dev', '--config', path.join(root, 'config/cloudflare/wrangler.dev.jsonc'), '--persist-to', path.join(root, '.wrangler/state'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  process.exitCode = code;
}

children.forEach((child) => child.on('error', (error) => {
  console.error(error.message);
  stop(1);
}));
children[1].on('exit', (code, signal) => stop(signal ? 1 : code || 0));
children[0].on('exit', (code) => { if (!stopping) stop(code || 1); });
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
