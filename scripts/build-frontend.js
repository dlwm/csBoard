import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const localSource = args.includes('--local-source');
const modes = args.filter(arg => arg !== '--local-source');
const mode = modes[0] || '--local';
if (modes.length > 1 || !['--local', '--remote', '--desktop'].includes(mode)) throw new Error('Expected --local, --remote or --desktop');
process.chdir(root);
const goParser = spawnSync(process.execPath, [path.join(root, 'scripts/build-go-parser.js'), ...(localSource ? ['--local-source'] : [])], { stdio: 'inherit' });
if (goParser.error) throw goParser.error;
if (goParser.status !== 0) throw new Error('Go parser build failed');
if (mode === '--desktop') {
  const icons = spawnSync(process.execPath, [path.join(root, 'scripts/build-icons.js')], { stdio: 'inherit' });
  if (icons.error) throw icons.error;
  if (icons.status !== 0) throw new Error('Icon build failed');
  await build({ configFile: path.join(root, 'vite.tasks.config.js') });
} else {
  // Set build options without POSIX shell assignments so npm also works on Windows.
  process.env.VITE_USE_LOCAL_MAPS = mode === '--local' ? 'true' : 'false';
  if (mode === '--local') process.env.VITE_BACKEND_BASE_URL = '/';
}
await build({ mode: mode === '--desktop' ? 'desktop' : 'production' });
const output = path.join(root, mode === '--desktop' ? 'build/renderer' : 'dist', 'go-parser');
fs.cpSync(path.join(root, 'build/go-parser/web'), output, { recursive: true, force: true });
