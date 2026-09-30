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
  if (!fs.existsSync(executable)) throw new Error(`Missing ${os}-${arch} native component. Build it on the target platform or set CSBOARD_NATIVE_TARGET to the selected Go platform/architecture before packaging.`);
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  if (info.target !== `${platform}-${arch}` || info.protocol !== 1 || info.component !== 'storage' || info.language !== 'go') throw new Error(`Wrong native binary for ${os}-${arch}`);
  const goRoot = path.join(context.packager.projectDir, 'build/go-parser/native', `${os}-${arch}`);
  const goExecutable = path.join(goRoot, `csboard-go-parser${platform === 'win32' ? '.exe' : ''}`);
  if (!fs.existsSync(goExecutable)) throw new Error(`Missing Go parser for ${platform}-${arch}`);
  const goInfo = JSON.parse(fs.readFileSync(path.join(goRoot, 'build-info.json'), 'utf8'));
  const pin = JSON.parse(fs.readFileSync(path.join(context.packager.projectDir, 'native/parser/source.json'), 'utf8'));
  if (!context.packager.config.extraMetadata?.csboardLocalParser && (goInfo.dirty || goInfo.revision !== pin.revision)) throw new Error('Release packages require the pinned, clean Go parser build');
  if (goInfo.target !== `${platform}-${arch}` || goInfo.protocol !== 1) throw new Error(`Wrong Go parser for ${platform}-${arch}`);
};
