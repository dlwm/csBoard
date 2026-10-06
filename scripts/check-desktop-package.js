import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createNativeClient } from '../electron/native-client.js';

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require('@electron/asar');
const target = process.argv[2];
const folders = { 'mac-arm64': 'mac-arm64/CSBoard.app/Contents/Resources', 'mac-x64': 'mac/CSBoard.app/Contents/Resources', 'win-x64': 'win-unpacked/resources' };
if (!folders[target]) throw new Error('Expected mac-arm64, mac-x64 or win-x64');
const resources = path.resolve('build/desktop', folders[target]);
const archive = path.join(resources, 'app.asar');
// Verify sealed app contents and both native executables before publishing.
// This checks signature integrity, not Developer ID trust or notarization.
if (target.startsWith('mac-')) {
  const appBundle = path.resolve(resources, '../..');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundle], { stdio: 'inherit' });
  for (const file of ['native/csboard-native', 'go-parser/csboard-go-parser', 'resource-tool/Source2Viewer-CLI']) {
    execFileSync('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', path.join(resources, file)], { stdio: 'inherit' });
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const packaged = JSON.parse(extractFile(archive, 'package.json').toString());
if (packaged.version !== pkg.version || packaged.csboardLocalModels || packaged.csboardLocalParser) throw new Error('Wrong packaged version or local-model test build');
for (const file of ['electron/main.js', 'electron/preload.cjs', 'shared/record-keys.js', 'shared/storage-codec.js', 'shared/release-notes.js', 'LICENSE', 'docs/THIRD_PARTY_NOTICES.md', 'build/renderer/index.html', 'build/renderer/go-parser/parser.wasm', 'build/renderer/go-parser/wasm_exec.js', 'build/tasks/demo.js', 'build/tasks/data.js']) {
  extractFile(archive, path.join(...file.split('/')));
}
const features = JSON.parse(extractFile(archive, path.join('build', 'renderer', 'features.json')).toString());
if (features.ai !== (packaged.csboardAiEnabled !== false)) throw new Error('Renderer and desktop AI features differ');
const aiFiles = ['electron/ai-service.js', 'shared/ai-protocol.js', 'shared/ai-providers.js'];
if (packaged.csboardAiEnabled !== false) for (const file of aiFiles) extractFile(archive, path.join(...file.split('/')));
const names = listPackage(archive).map(name => name.replaceAll(path.win32.sep, '/'));
if (packaged.csboardAiEnabled === false && names.some(name => aiFiles.includes(name.replace(/^\//, '')))) throw new Error('AI files leaked into disabled package');
if (names.some(name => /(^|\/)\.local(\/|$)|\.glb$/i.test(name))) throw new Error('Local resources leaked into app.asar');
async function inspect(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (item.name === '.local' || /\.glb$/i.test(item.name)) throw new Error('Local resources leaked into packaged resources');
    if (item.isDirectory()) await inspect(path.join(directory, item.name));
  }
}
await inspect(resources);
const resourceToolInfo = JSON.parse(await fs.readFile(path.join(resources, 'resource-tool/build-info.json'), 'utf8'));
const resourceToolPin = JSON.parse(await fs.readFile('config/resources/source2viewer.json', 'utf8'));
const toolTarget = { 'mac-arm64': 'darwin-arm64', 'mac-x64': 'darwin-x64', 'win-x64': 'win32-x64' }[target];
if (resourceToolInfo.target !== toolTarget || resourceToolInfo.sha256 !== resourceToolPin.targets[toolTarget].sha256) throw new Error('Packaged resource converter does not match its target');
await fs.access(path.join(resources, 'resource-tool', resourceToolPin.targets[toolTarget].executable));
await fs.access(path.join(resources, 'resource-tool/LICENSE-Source2Viewer.txt'));
const info = JSON.parse(await fs.readFile(path.join(resources, 'native/build-info.json'), 'utf8'));
const triples = { 'mac-arm64': 'darwin-arm64', 'mac-x64': 'darwin-x64', 'win-x64': 'win32-x64' };
if (info.target !== triples[target] || info.component !== 'storage' || info.language !== 'go') throw new Error('Wrong packaged native target');
const goInfo = JSON.parse(await fs.readFile(path.join(resources, 'go-parser/build-info.json'), 'utf8'));
const goPin = JSON.parse(await fs.readFile('native/parser/source.json', 'utf8'));
if (goInfo.dirty || goInfo.revision !== goPin.revision) throw new Error('Packaged parser does not match its clean source pin');
const goTargets = { 'mac-arm64': 'darwin-arm64', 'mac-x64': 'darwin-x64', 'win-x64': 'win32-x64' };
if (goInfo.target !== goTargets[target] || goInfo.protocol !== 1) throw new Error('Wrong packaged Go parser target');
await fs.access(path.join(resources, 'go-parser', `csboard-go-parser${target === 'win-x64' ? '.exe' : ''}`));
const binary = path.join(resources, 'native', `csboard-native${target === 'win-x64' ? '.exe' : ''}`);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-package-'));
let native;
try {
  native = createNativeClient(binary, ['storage', directory]);
  await native.ready();
  const value = JSON.stringify([{ id: 'packaged-storage', name: '离线存档' }]);
  await native.request('record.put', { key: 'workspace-archives', value });
  const restored = await native.request('record.get', { key: 'workspace-archives' });
  if (restored.value !== value) throw new Error('Packaged storage round-trip failed');
  console.log(`Packaged application and native storage OK: ${target}, ${pkg.version}`);
} finally {
  if (native) {
    const closed = native.child.exitCode !== null || native.child.signalCode !== null ? Promise.resolve() : once(native.child, 'close');
    native.close();
    await closed;
  }
  await fs.rm(directory, { recursive: true, force: true });
}
