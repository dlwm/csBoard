import { ensureElectronRuntime } from './lib/electron-runtime.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'build/qa/mobile-workspace');
await fs.mkdir(artifacts, { recursive: true });
for (const name of ['result.json', 'failure.png', 'process.log']) await fs.rm(path.join(artifacts, name), { force: true });
const electron = await ensureElectronRuntime();
const child = spawn(electron, [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(root, 'scripts/lib/mobile-workspace-browser.cjs'), root], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk; });
const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
await fs.writeFile(path.join(artifacts, 'process.log'), log);
if (status !== 0) {
  const result = await fs.readFile(path.join(artifacts, 'result.json'), 'utf8').catch(() => 'No browser result');
  throw Error(`Mobile workspace check exited ${status}: ${result}\n${log.slice(-3000)}`);
}
const result = JSON.parse(await fs.readFile(path.join(artifacts, 'result.json'), 'utf8'));
if (!result.passed || result.captures.length !== 7) throw Error(result.error || 'Incomplete mobile workspace check');
console.log(`Mobile H5 touch, layout and viewport checks passed: ${result.captures.length} scenes`);
