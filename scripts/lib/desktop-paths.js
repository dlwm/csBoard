import path from 'node:path';
import fs from 'node:fs/promises';

export const desktopHostTarget = () => ({'darwin-arm64':'mac-arm64','darwin-x64':'mac-x64','win32-x64':'win-x64'}[`${process.platform}-${process.arch}`]);
export function desktopPackagePaths(root, metadata, target = desktopHostTarget()) {
  const folders = {'mac-arm64':'mac-arm64','mac-x64':'mac','win-x64':'win-unpacked'};
  if (!folders[target]) throw new Error('Expected mac-arm64, mac-x64 or win-x64');
  const output = path.resolve(root, metadata.build.directories.output, folders[target]);
  const mac = target.startsWith('mac-');
  const bundle = mac ? path.join(output, `${metadata.build.productName}.app`) : output;
  const resources = mac ? path.join(bundle, 'Contents/Resources') : path.join(output, 'resources');
  return {target, resources, archive:path.join(resources,'app.asar'), executable:mac ? path.join(bundle,'Contents/MacOS',metadata.build.productName) : path.join(output,`${metadata.build.productName}.exe`)};
}

// Launcher architecture belongs to Node, which may run under Rosetta.
// 允许 macOS 的 Intel Node 启动现有 ARM 应用；Windows 不跨架构猜测。
export async function findDesktopApplication(root, metadata, { platform = process.platform, arch = process.arch } = {}) {
  const directory = platform === 'darwin' ? `mac${arch === 'x64' ? '' : `-${arch}`}`
    : platform === 'win32' ? `win${arch === 'x64' ? '' : `-${arch}`}-unpacked`
      : `linux${arch === 'x64' ? '' : `-${arch}`}-unpacked`;
  const filename = platform === 'darwin' ? `${metadata.build.productName}.app` : platform === 'win32' ? `${metadata.build.productName}.exe` : metadata.name.toLowerCase();
  const directories = platform === 'darwin' ? [...new Set([directory, 'mac-arm64', 'mac', 'mac-x64', 'mac-universal'])] : [directory];
  const candidates = directories.map(value => path.join(root, metadata.build.directories.output, value, filename));
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (platform === 'darwin' ? stat.isDirectory() : stat.isFile()) return candidate;
    } catch (error) { if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new Error(`CSBoard application is not built yet. Run make desktop-prepare once, then make desktop-start.\nNode architecture: ${arch}\nChecked paths:\n${candidates.join('\n')}`);
}
