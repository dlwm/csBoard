import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0] || '--local';
if (args.length > 1 || !['--local', '--remote', '--desktop'].includes(mode)) throw new Error('Expected --local, --remote or --desktop');
process.chdir(root);
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
