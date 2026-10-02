import { prepareGoParserSource } from './lib/parser-source.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build/go-parser');
const goRoot = path.join(root, 'native/parser');
const localSource = process.argv.includes('--local-source');
const wasmOnly = process.argv.includes('--wasm-only');
if (process.argv.slice(2).some(arg => !['--local-source', '--wasm-only'].includes(arg))) throw new Error('Expected --local-source or --wasm-only');
const { source, revision: sourceRevision, dirty } = prepareGoParserSource(root, { localSource });
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal || result.status})`);
}
function read(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function copyGenerated(from, to) {
  const staged = `${to}.${process.pid}.tmp`;
  try {
    fs.copyFileSync(from, staged);
    fs.chmodSync(staged, 0o644);
    fs.renameSync(staged, to);
  } finally {
    fs.rmSync(staged, { force: true });
  }
}
const target = process.env.CSBOARD_GO_TARGET || `${process.platform}-${process.arch}`;
const platforms = {
  'darwin-arm64': ['darwin', 'arm64'],
  'darwin-x64': ['darwin', 'amd64'],
  'win32-x64': ['windows', 'amd64'],
  'linux-x64': ['linux', 'amd64'],
  'linux-arm64': ['linux', 'arm64'],
};
const platform = platforms[target];
if (!platform && !wasmOnly) throw new Error(`Unsupported Go parser target: ${target}`);
const env = { ...process.env, GOTOOLCHAIN: 'auto', CGO_ENABLED: '0' };
const packageTarget = platform && `${platform[0] === 'darwin' ? 'mac' : platform[0] === 'windows' ? 'win' : platform[0]}-${target.split('-').at(-1)}`;
fs.mkdirSync(path.join(output, 'web'), { recursive: true });
if (!wasmOnly) {
  fs.mkdirSync(path.join(output, 'native', packageTarget), { recursive: true });
  const name = `csboard-go-parser${platform[0] === 'windows' ? '.exe' : ''}`;
  const executable = path.join(output, 'native', packageTarget, name);
  const stagedExecutable = `${executable}.${process.pid}.tmp`;
  try {
    run('go', ['build', '-mod=readonly', '-trimpath', '-ldflags', `-X main.sourceRevision=${sourceRevision}${dirty ? '-dirty' : ''}`, '-o', stagedExecutable, './cmd/native'], goRoot, { ...env, GOOS: platform[0], GOARCH: platform[1] });
    fs.renameSync(stagedExecutable, executable);
  } finally {
    fs.rmSync(stagedExecutable, { force: true });
  }
}
run('go', ['build', '-mod=readonly', '-trimpath', '-ldflags', '-s -w', '-o', path.join(output, 'web', 'parser.wasm'), './cmd/wasm'], goRoot, { ...env, GOOS: 'js', GOARCH: 'wasm' });
const goroot = read('go', ['env', 'GOROOT'], goRoot);
copyGenerated(path.join(goroot, 'lib/wasm/wasm_exec.js'), path.join(output, 'web/wasm_exec.js'));
copyGenerated(path.join(goRoot, 'worker.js'), path.join(output, 'web/worker.js'));
copyGenerated(path.join(source, 'LICENSE.md'), path.join(output, 'LICENSE-demoinfocs.md'));
copyGenerated(path.join(source, 'LICENSE.md'), path.join(output, 'web/LICENSE-demoinfocs.md'));
copyGenerated(path.join(goroot, 'LICENSE'), path.join(output, 'web/LICENSE-Go.txt'));
const licenseDirectory = path.join(output, 'web/licenses');
fs.mkdirSync(licenseDirectory, { recursive: true });
const modules = read('go', ['list', '-m', '-f', '{{.Path}}|{{.Version}}|{{.Dir}}', 'all'], goRoot).split('\n');
const notices = [];
for (const line of modules) {
  const [name, version, directory] = line.split('|');
  if (!name || name === 'csboard/native/parser' || !directory || !fs.existsSync(directory)) continue;
  const files = fs.readdirSync(directory).filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
  const destination = path.join(licenseDirectory, name.replaceAll('/', '__'));
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) copyGenerated(path.join(directory, file), path.join(destination, file));
  notices.push({ name, version, files });
}
fs.writeFileSync(path.join(licenseDirectory, 'dependencies.json'), JSON.stringify(notices, null, 2));
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ revision: sourceRevision, dirty, target, goVersion: read('go', ['version'], goRoot) }, null, 2));
if (!wasmOnly) fs.writeFileSync(path.join(output, 'native', packageTarget, 'build-info.json'), JSON.stringify({ revision: sourceRevision, dirty, target, protocol: 1 }, null, 2));
