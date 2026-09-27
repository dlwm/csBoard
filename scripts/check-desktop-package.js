import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createNativeClient } from '../electron/native-client.js';

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require('@electron/asar');
const target = process.argv[2];
const folders = { 'mac-arm64': 'mac-arm64/CSBoard.app/Contents/Resources', 'mac-x64': 'mac/CSBoard.app/Contents/Resources', 'win-x64': 'win-unpacked/resources' };
if (!folders[target]) throw new Error('Expected mac-arm64, mac-x64 or win-x64');
const resources = path.resolve('build/desktop', folders[target]);
const archive = path.join(resources, 'app.asar');
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const packaged = JSON.parse(extractFile(archive, 'package.json').toString());
if (packaged.version !== pkg.version || packaged.csboardLocalModels) throw new Error('Wrong packaged version or local-model test build');
for (const file of ['electron/main.js', 'electron/preload.cjs', 'build/renderer/index.html', 'build/tasks/demo.js', 'build/tasks/data.js']) extractFile(archive, file);
const names = listPackage(archive).map(name => name.replaceAll('\\', '/'));
if (names.some(name => /(^|\/)\.local(\/|$)|\.glb$/i.test(name))) throw new Error('Local resources leaked into app.asar');
async function inspect(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (item.name === '.local' || /\.glb$/i.test(item.name)) throw new Error('Local resources leaked into packaged resources');
    if (item.isDirectory()) await inspect(path.join(directory, item.name));
  }
}
await inspect(resources);
const info = JSON.parse(await fs.readFile(path.join(resources, 'native/build-info.json'), 'utf8'));
const triples = { 'mac-arm64': 'aarch64-apple-darwin', 'mac-x64': 'x86_64-apple-darwin', 'win-x64': 'x86_64-pc-windows-msvc' };
if (info.target !== triples[target]) throw new Error('Wrong packaged native target');
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
