import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.local/native-demoparser');
const revision = '266a831f08b0264dd722b017a5c05d765206a7ed';
const patches = ['wasm-compat.patch', 'inferno-frames.patch'].map(name => path.join(root, 'src/wasm', name));
const fingerprint = createHash('sha256').update(patches.map(file => fs.readFileSync(file)).join('\n')).digest('hex');
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout?.trim();
}
if (!fs.existsSync(source)) {
  fs.mkdirSync(path.dirname(source), { recursive: true });
  // Keep upstream sources LF on Windows: the second patch contains context
  // added by the first, so a CRLF conversion between applications breaks it.
  run('git', ['clone', '-c', 'core.autocrlf=false', 'https://github.com/LaihoE/demoparser.git', source]);
  run('git', ['checkout', revision], source);
}
if (run('git', ['rev-parse', 'HEAD'], source, true) !== revision) throw new Error(`Unexpected parser revision in ${source}; preserve it and move it aside before building.`);
const marker = path.join(source, '.csboard-patches');
if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') !== fingerprint) throw new Error('Parser patches changed; move the managed .local/native-demoparser directory aside and rebuild.');
if (!fs.existsSync(marker)) {
  // Recognize a previously prepared checkout without resetting local source files.
  const alreadyApplied = spawnSync('git', ['apply', '--reverse', '--check', '--unidiff-zero', ...patches.slice().reverse()], { cwd: source, stdio: 'ignore' }).status === 0;
  if (!alreadyApplied) {
    if (run('git', ['status', '--porcelain'], source, true)) throw new Error('Parser checkout has local changes; refusing to replace them.');
    run('git', ['apply', '--unidiff-zero', patches[0]], source);
    run('git', ['apply', patches[1]], source);
  }
  // The pinned repository already includes generated protobuf.rs. Upstream's
  // build script fetches mutable GameTracking HEAD; use the pinned generated code.
  const manifest = path.join(source, 'src/csgoproto/Cargo.toml');
  fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace('[package]', '[package]\nbuild = false'));
  fs.writeFileSync(marker, fingerprint);
}
const target = process.env.CSBOARD_NATIVE_TARGET;
const performancePatch = path.join(root, 'native/tick-segments.patch');
const performanceFingerprint = createHash('sha256').update(fs.readFileSync(performancePatch)).digest('hex');
const performanceMarker = path.join(source, '.csboard-native-performance');
if (fs.existsSync(performanceMarker) && fs.readFileSync(performanceMarker, 'utf8') !== performanceFingerprint) throw new Error('Native performance patch changed; preserve and move the managed checkout aside before rebuilding.');
if (!fs.existsSync(performanceMarker)) {
  const applied = spawnSync('git', ['apply', '--reverse', '--check', performancePatch], { cwd: source, stdio: 'ignore' }).status === 0;
  if (!applied) { run('git', ['apply', '--check', performancePatch], source); run('git', ['apply', performancePatch], source); }
  fs.writeFileSync(performanceMarker, performanceFingerprint);
}
run('cargo', ['build', '--release', '--locked', '--manifest-path', 'native/Cargo.toml', ...(target ? ['--target', target] : [])]);
const triple = target || run('rustc', ['-vV'], root, true).match(/^host: (.+)$/m)?.[1];
const platform = triple.includes('windows') ? 'win32' : triple.includes('apple') ? 'darwin' : triple.includes('linux') ? 'linux' : null;
const arch = triple.startsWith('aarch64') ? 'arm64' : triple.startsWith('x86_64') ? 'x64' : null;
if (!platform || !arch) throw new Error(`Unsupported native target: ${triple}`);
const name = `csboard-native${platform === 'win32' ? '.exe' : ''}`;
const output = path.join(root, 'build/native', `${platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform}-${arch}`);
fs.mkdirSync(output, { recursive: true });
// Publish a new inode: overwriting an executed Mach-O can retain a stale
// macOS code-signature cache and cause SIGKILL despite a valid on-disk signature.
const stagedBinary = path.join(output, `${name}.${process.pid}.tmp`);
fs.copyFileSync(path.join(root, 'native/target', ...(target ? [target] : []), 'release', name), stagedBinary);
fs.chmodSync(stagedBinary, 0o755);
fs.renameSync(stagedBinary, path.join(output, name));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(output, 'demoparser-LICENSE'));
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ protocol: 1, revision, patches: fingerprint, nativePerformancePatch: performanceFingerprint, target: triple }, null, 2));
const metadata = JSON.parse(run('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'native/Cargo.toml'], root, true));
const notices = [];
for (const dependency of metadata.packages) {
  const directory = path.dirname(dependency.manifest_path);
  const licenseFiles = fs.readdirSync(directory).filter(name => /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const destination = path.join(output, 'licenses', `${dependency.name}-${dependency.version}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of licenseFiles) fs.copyFileSync(path.join(directory, name), path.join(destination, name));
  notices.push({ name: dependency.name, version: dependency.version, license: dependency.license, repository: dependency.repository, files: licenseFiles });
}
fs.writeFileSync(path.join(output, 'licenses/dependencies.json'), JSON.stringify(notices, null, 2));
