const fs = require('node:fs');
const path = require('node:path');
const { Arch } = require('builder-util');

module.exports = async context => {
  const platform = context.electronPlatformName;
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform;
  const arch = Arch[context.arch];
  if (!((platform === 'darwin' && ['arm64', 'x64'].includes(arch)) || (platform === 'win32' && arch === 'x64'))) throw new Error(`Unsupported desktop package: ${platform}-${arch}`);
  const root = path.join(context.packager.projectDir, 'build/native', `${os}-${arch}`);
  const executable = path.join(root, `csboard-native${platform === 'win32' ? '.exe' : ''}`);
  if (!fs.existsSync(executable)) throw new Error(`Missing ${os}-${arch} native component. Build it on the target platform or set CSBOARD_NATIVE_TARGET with the required toolchain before packaging.`);
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : '';
  const system = platform === 'darwin' ? 'apple' : platform === 'win32' ? 'windows' : 'linux';
  if (!cpu || !info.target.startsWith(`${cpu}-`) || !info.target.includes(system) || info.protocol !== 1) throw new Error(`Wrong native binary for ${os}-${arch}`);
};
