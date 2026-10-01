import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeatures } from '../config/build/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const localSource = args.includes('--local-source');
const modes = args.filter(arg => arg !== '--local-source');
const mode = modes[0] || '--local';
if (modes.length > 1 || !['--local', '--remote', '--desktop'].includes(mode)) throw new Error('Expected --local, --remote or --desktop');
process.chdir(root);
const features = buildFeatures(root, mode === '--desktop' ? 'desktop' : 'production');
process.env.CSBOARD_AI_ENABLED = String(features.ai);
console.log(`AI build: ${features.ai ? 'enabled' : 'excluded'}`);
// Disabled builds neither load nor validate optional AI content.
if (features.ai) {
  const { validateDocumentationCatalog } = await import('../src/ai/validateCatalog.js');
  const aiRoot = path.join(root, 'docs/ai');
  const aiCatalog = validateDocumentationCatalog(JSON.parse(fs.readFileSync(path.join(aiRoot, 'catalog.json'), 'utf8')));
  for (const document of aiCatalog) for (const file of Object.values(document.files)) {
    const absolute = fs.realpathSync(path.join(aiRoot, file));
    const relative = path.relative(fs.realpathSync(path.join(aiRoot, 'references')), absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(absolute).isFile() || !fs.readFileSync(absolute, 'utf8').trim()) throw new Error(`Invalid or empty AI reference: ${file}`);
  }
  for (const file of ['system.en.md', 'compression.en.md']) {
    const text = fs.readFileSync(path.join(aiRoot, 'prompts', file), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!text || file === 'system.en.md' && !text.includes('{{language}}')) throw new Error(`Invalid AI prompt template: ${file}`);
  }
}
const goParser = spawnSync(process.execPath, [path.join(root, 'scripts/build-go-parser.js'), ...(localSource ? ['--local-source'] : [])], { stdio: 'inherit' });
if (goParser.error) throw goParser.error;
if (goParser.status !== 0) throw new Error('Go parser build failed');
if (mode === '--desktop') {
  const icons = spawnSync(process.execPath, [path.join(root, 'scripts/build-icons.js')], { stdio: 'inherit' });
  if (icons.error) throw icons.error;
  if (icons.status !== 0) throw new Error('Icon build failed');
  await build({ configFile: path.join(root, 'config/build/vite.tasks.config.js') });
} else {
  // Set build options without POSIX shell assignments so npm also works on Windows.
  process.env.VITE_USE_LOCAL_MAPS = mode === '--local' ? 'true' : 'false';
  if (mode === '--local') process.env.VITE_BACKEND_BASE_URL = '/';
}
await build({ configFile: path.join(root, 'config/build/vite.config.js'), mode: mode === '--desktop' ? 'desktop' : 'production' });
const output = path.join(root, mode === '--desktop' ? 'build/renderer' : 'dist', 'go-parser');
fs.cpSync(path.join(root, 'build/go-parser/web'), output, { recursive: true, force: true });
