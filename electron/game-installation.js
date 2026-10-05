import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import catalog from '../src/resources/catalog.json' with { type: 'json' };
const execute = promisify(execFile);
const exists = file => fs.stat(file).then(stat => stat.isFile(), () => false);

// Steam's VDF has quoted pairs and nested blocks, with optional // comments.
// Read only the library paths and app 730's install directory; do not scan disks.
// 只读 Steam 库配置及 730 安装清单，不遍历磁盘，也不修改游戏文件。
export function readVdf(source) {
  const tokens = [...source.matchAll(/\/\/[^\r\n]*|"((?:\\.|[^"\\])*)"|([{}])|([^\s{}"]+)/g)].filter(match => !match[0].startsWith('//')).map(match => match[1] !== undefined ? match[1].replace(/\\([\\"])/g, '$1') : match[2] || match[3]);
  let offset = 0;
  const block = () => {
    const result = {};
    while (offset < tokens.length) {
      const key = tokens[offset++];
      if (key === '}') break;
      const value = tokens[offset++];
      result[key] = value === '{' ? block() : value;
    }
    return result;
  };
  return block();
}
export async function inspectGameDirectory(directory) {
  // Accept the installation root, game folder, csgo folder or Steam library.
  const candidates = [directory, path.join(directory, 'game'), path.join(directory, 'game/csgo'), path.join(directory, 'csgo'), path.join(directory, 'steamapps/common/Counter-Strike Global Offensive/game/csgo')];
  for (const candidate of candidates) {
    if (!await exists(path.join(candidate, 'gameinfo.gi')) || !await exists(path.join(candidate, 'pak01_dir.vpk'))) continue;
    const gameDirectory = await fs.realpath(candidate);
    const maps = [];
    for (const key of catalog.maps) {
      const file = path.join(gameDirectory, 'maps', `${key}.vpk`);
      const stat = await fs.stat(file).catch(() => null);
      if (stat?.isFile()) maps.push({ key, bytes: stat.size });
    }
    return { directory: gameDirectory, maps, icons: true };
  }
  return null;
}
export async function detectGameInstallations() {
  const roots = new Set();
  if (process.platform === 'darwin') roots.add(path.join(os.homedir(), 'Library/Application Support/Steam'));
  if (process.platform === 'win32') {
    for (const key of ['HKCU\\Software\\Valve\\Steam', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'HKLM\\SOFTWARE\\Valve\\Steam']) {
      const result = await execute('reg.exe', ['query', key], { windowsHide: true, timeout: 5000 }).catch(() => null);
      for (const match of result?.stdout.matchAll(/(?:SteamPath|InstallPath)\s+REG_SZ\s+([^\r\n]+)/g) || []) roots.add(match[1].trim());
    }
    if (process.env['ProgramFiles(x86)']) roots.add(path.join(process.env['ProgramFiles(x86)'], 'Steam'));
    if (process.env.ProgramFiles) roots.add(path.join(process.env.ProgramFiles, 'Steam'));
  }
  const libraries = new Set(roots);
  for (const root of roots) {
    const source = await fs.readFile(path.join(root, 'steamapps/libraryfolders.vdf'), 'utf8').catch(() => '');
    const data = readVdf(source).libraryfolders || {};
    for (const [key, value] of Object.entries(data)) if (/^\d+$/.test(key)) {
      const location = typeof value === 'string' ? value : value?.path;
      if (location && path.isAbsolute(location)) libraries.add(location);
    }
  }
  const found = [], seen = new Set();
  for (const library of libraries) {
    const manifest = readVdf(await fs.readFile(path.join(library, 'steamapps/appmanifest_730.acf'), 'utf8').catch(() => '')).AppState;
    const name = manifest?.installdir;
    if (!name || path.basename(name) !== name) continue;
    const installation = await inspectGameDirectory(path.join(library, 'steamapps/common', name));
    if (installation && !seen.has(installation.directory)) { seen.add(installation.directory); found.push(installation); }
  }
  return found;
}

// Conservative reservation, not a promise about final GLB size: sequential
// exports need temporary output plus the validated copy and a safety margin.
// 保守空间预算：按地图 VPK 的 6 倍预留输出/副本，加 512MB 余量；非精确产物大小。
export function estimateImportSpace(installation, maps, icons) {
  const sourceBytes = installation.maps.filter(item => maps.includes(item.key)).reduce((sum, item) => sum + item.bytes, 0);
  return Math.max(512 * 1024 ** 2, sourceBytes * 6 + (icons ? 128 * 1024 ** 2 : 0) + 512 * 1024 ** 2);
}
