import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const children = [
  spawn(process.execPath, [path.join(root, 'scripts', 'map-server.js')], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [wrangler, 'dev', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
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
