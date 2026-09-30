import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'native/storage');
const target = process.env.CSBOARD_NATIVE_TARGET || `${process.platform}-${process.arch}`;
const targets = { 'darwin-arm64': ['darwin', 'arm64', 'mac-arm64'], 'darwin-x64': ['darwin', 'amd64', 'mac-x64'], 'win32-x64': ['windows', 'amd64', 'win-x64'], 'linux-x64': ['linux', 'amd64', 'linux-x64'], 'linux-arm64': ['linux', 'arm64', 'linux-arm64'] };
const selected = targets[target];
if (!selected) throw new Error(`Unsupported native target: ${target}`);
const env = { ...process.env, GOTOOLCHAIN: 'auto', CGO_ENABLED: '0' };
function run(args, capture = false, extraEnv = {}) {
  const result = spawnSync('go', args, { cwd: source, env: { ...env, ...extraEnv }, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`go ${args.join(' ')} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout?.trim();
}
const output = path.join(root, 'build/native', selected[2]);
const name = `csboard-native${selected[0] === 'windows' ? '.exe' : ''}`;
fs.mkdirSync(output, { recursive: true });
// Publish a new inode so macOS never retains the signature of a running binary.
const staged = path.join(output, `${name}.${process.pid}.tmp`);
try {
  run(['build', '-mod=readonly', '-trimpath', '-ldflags', '-s -w', '-o', staged, './cmd/storage'], false, { GOOS: selected[0], GOARCH: selected[1] });
  fs.renameSync(staged, path.join(output, name));
} finally { fs.rmSync(staged, { force: true }); }
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ protocol: 1, component: 'storage', target, language: 'go' }, null, 2));
fs.rmSync(path.join(output, 'licenses'), { recursive: true, force: true });
fs.rmSync(path.join(output, 'demoparser-LICENSE'), { force: true });
const notices = [];
const modules = run(['list', '-mod=readonly', '-m', '-f', '{{.Path}}|{{.Version}}|{{.Dir}}', 'all'], true).split('\n');
for (const line of modules) {
  const [name, version, directory] = line.split('|');
  if (name === 'csboard/native/storage' || !directory || !fs.existsSync(directory)) continue;
  const files = fs.readdirSync(directory).filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
  const destination = path.join(output, 'licenses', name.replaceAll('/', '__'));
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(destination, file));
  notices.push({ name, version, files });
}
const goroot = run(['env', 'GOROOT'], true);
fs.mkdirSync(path.join(output, 'licenses'), { recursive: true });
fs.copyFileSync(path.join(goroot, 'LICENSE'), path.join(output, 'licenses/LICENSE-Go.txt'));
fs.writeFileSync(path.join(output, 'licenses/dependencies.json'), JSON.stringify(notices, null, 2));
