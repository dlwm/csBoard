import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = {
  'mac-arm64': { platform: 'darwin', arch: 'arm64', format: 'dmg' },
  'mac-x64': { platform: 'darwin', arch: 'x64', format: 'dmg' },
  'win-x64': { platform: 'win32', arch: 'x64', format: 'nsis' },
};
const [command = 'prepare', ...options] = process.argv.slice(2);
const host = Object.values(targets).find(target => target.platform === process.platform && target.arch === process.arch);
const target = ['prepare', 'dev'].includes(command) ? host : targets[command];
const localModels = options.includes('--local-models');
const localSource = options.includes('--local-source');
if (!target || options.some(option => !['--local-models', '--local-source'].includes(option)) || (localModels && command !== 'prepare') || (localSource && !['prepare', 'dev'].includes(command))) {
  throw new Error('Usage: package-desktop.js prepare [--local-models] [--local-source] | dev [--local-source] | mac-arm64 | mac-x64 | win-x64. Supported hosts: macOS arm64/x64 and Windows x64.');
}
if (target.platform !== process.platform) throw new Error('Build macOS packages on macOS and Windows packages on Windows.');
if (process.env.CSBOARD_NATIVE_TARGET && process.env.CSBOARD_NATIVE_TARGET !== `${target.platform}-${target.arch}`) {
  throw new Error(`CSBOARD_NATIVE_TARGET conflicts with the selected package target (${target.platform}-${target.arch}).`);
}
function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed (${result.signal || result.status})`);
}
// Build both Go components for the architecture selected for Electron.
run('scripts/build-native.js', [], { ...process.env, CSBOARD_NATIVE_TARGET: `${target.platform}-${target.arch}` });
run('scripts/build-frontend.js', ['--desktop', ...(localSource ? ['--local-source'] : [])], { ...process.env, CSBOARD_GO_TARGET: `${target.platform}-${target.arch}` });
if (command === 'dev') {
  run('node_modules/electron/cli.js', ['.']);
} else {
  const { build, Platform, Arch } = await import('electron-builder');
  const platform = target.platform === 'darwin' ? Platform.MAC : Platform.WINDOWS;
  const localConfiguration = localModels ? (await import('../electron-builder.local.cjs')).default : {};
  const config = localSource ? { ...localConfiguration, extraMetadata: { ...localConfiguration.extraMetadata, csboardLocalParser: true } } : localModels ? path.join(root, 'electron-builder.local.cjs') : undefined;
  await build({
    projectDir: root,
    targets: platform.createTarget(command === 'prepare' ? 'dir' : target.format, Arch[target.arch]),
    ...(config ? { config } : {}),
    publish: 'never',
  });
}
