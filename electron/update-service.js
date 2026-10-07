import { ipcMain, net, shell } from 'electron';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { parseReleaseNotes } from '../shared/release-notes.js';

const REPOSITORY = 'dlwm/csBoard';
const API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const MAX_PACKAGE = 4 * 1024 ** 3;
const versionParts = version => /^\d+\.\d+\.\d+$/.test(version || '') ? version.split('.').map(Number) : null;
const compareVersions = (a, b) => {
  const left = versionParts(a), right = versionParts(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
};
const coded = (code, message) => Object.assign(new Error(message), { code });

// Use the release's existing SHA256SUMS.txt, so all desktop architectures share
// the same publishing pipeline. No renderer-supplied URLs or executable paths.
// 复用发布校验清单；渲染端仅能调用业务动作，不能指定下载地址或执行路径。
export function registerUpdateService({ app, authorize, getWindow, isBusy }) {
  const root = path.join(app.getPath('userData'), 'updates');
  const settingsFile = path.join(root, 'preferences.json');
  const supported = ['win32', 'darwin'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch);
  let state = { currentVersion: app.getVersion(), platform: process.platform, architecture: process.arch, enabled: app.isPackaged && supported, autoCheck: true, phase: 'idle', revision: 0 };
  let controller = null, selected = null, downloaded = null, closed = false, timer = null;
  let settingsWrites = Promise.resolve();
  const snapshot = () => ({ ...state });
  const emit = changes => {
    state = { ...state, ...changes, revision: state.revision + 1 };
    const target = getWindow()?.webContents;
    if (!closed && target && !target.isDestroyed()) target.send('desktop:update-state', snapshot());
  };
  const ready = fs.readFile(settingsFile, 'utf8').then(raw => {
    const saved = JSON.parse(raw);
    if (typeof saved.autoCheck === 'boolean') state.autoCheck = saved.autoCheck;
  }).catch(() => {}).then(async () => {
    if (!state.enabled) return;
    for (const name of await fs.readdir(root).catch(() => [])) {
      const match = name.match(/^CSBoard-(\d+\.\d+\.\d+)-(mac|win)-(arm64|x64)\.(dmg|exe)(\.part)?$/);
      if (match && (match[5] || compareVersions(match[1], state.currentVersion) <= 0)) await fs.rm(path.join(root, name), { force: true }).catch(() => {});
    }
  });
  const assertIdle = () => {
    if (!state.enabled) throw coded('development', 'Updates are available in packaged desktop applications');
    if (closed || controller || state.phase === 'installing') throw coded('busy', 'An update operation is already running');
  };
  async function smallResponse(url, signal, limit) {
    const response = await net.fetch(url, { signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CSBoard' } });
    if (!response.ok) throw coded('network', `GitHub returned HTTP ${response.status}`);
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw coded('metadata', 'Update metadata is too large');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const assetUrl = asset => {
    const url = new URL(asset.browser_download_url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${REPOSITORY}/releases/download/`) || url.username || url.password) throw coded('metadata', 'Unexpected release download address');
    return url.href;
  };
  async function check() {
    await ready; assertIdle();
    const request = controller = new AbortController();
    const timeout = setTimeout(() => request.abort(), 30000);
    emit({ phase: 'checking', error: null });
    try {
      const releases = JSON.parse(await smallResponse(API, request.signal, 2 * 1024 ** 2));
      if (!Array.isArray(releases)) throw coded('metadata', 'Invalid GitHub release response');
      // GitHub's "latest" flag may stay on an older release. Select the highest
      // published stable version; drafts and prereleases never become updates.
      // 按稳定版本号选择，而非依赖 latest 标志；排除草稿与预发布版本。
      const release = releases.filter(item => !item.draft && !item.prerelease && versionParts(item.tag_name?.replace(/^v/, ''))).sort((a, b) => compareVersions(b.tag_name.replace(/^v/, ''), a.tag_name.replace(/^v/, '')))[0];
      if (!release || compareVersions(release.tag_name.replace(/^v/, ''), state.currentVersion) <= 0) {
        if (!downloaded) selected = null;
        emit({ phase: downloaded ? 'ready' : 'current', ...(downloaded ? {} : { latestVersion: null, notes: null, notesByLanguage: null }), checkedAt: Date.now() }); return snapshot();
      }
      const version = release.tag_name.replace(/^v/, '');
      const name = `CSBoard-${version}-${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}.${process.platform === 'darwin' ? 'dmg' : 'exe'}`;
      const installer = release.assets?.find(asset => asset.name === name);
      const manifest = release.assets?.find(asset => asset.name === 'SHA256SUMS.txt');
      if (!installer || !manifest || !Number.isSafeInteger(installer.size) || installer.size < 1 || installer.size > MAX_PACKAGE) throw coded('incomplete', 'The release is missing its desktop package or checksum');
      const checksum = (await smallResponse(assetUrl(manifest), request.signal, 65536)).split(/\r?\n/).find(line => line.endsWith(`  ${name}`))?.slice(0, 64);
      if (!/^[a-f0-9]{64}$/i.test(checksum || '')) throw coded('checksum', 'The release checksum is missing or invalid');
      selected = { version, name, url: assetUrl(installer), size: installer.size, checksum: checksum.toLowerCase() };
      if (downloaded?.version !== version) downloaded = null;
      const notesByLanguage = parseReleaseNotes(release.body);
      emit({ phase: downloaded ? 'ready' : 'available', latestVersion: version, packageBytes: installer.size, notes: notesByLanguage.en, notesByLanguage, progress: downloaded ? 100 : 0, checkedAt: Date.now() });
    } catch (error) { emit({ phase: 'error', error: { code: error.code || 'network', message: error.message } }); }
    finally { clearTimeout(timeout); if (controller === request) controller = null; }
    return snapshot();
  }
  async function download() {
    await ready; assertIdle();
    if (!selected) throw coded('missing', 'Check for an update before downloading');
    const release = selected;
    const request = controller = new AbortController();
    const timeout = setTimeout(() => request.abort('timeout'), 30 * 60 * 1000);
    const target = path.join(root, release.name), partial = `${target}.part`;
    downloaded = null;
    emit({ phase: 'downloading', error: null, progress: 0, transferredBytes: 0 });
    try {
      await fs.mkdir(root, { recursive: true });
      // Remove only files owned by this updater, retaining its preferences.
      for (const name of await fs.readdir(root)) if (/^CSBoard-\d+\.\d+\.\d+-(mac|win)-(arm64|x64)\.(dmg|exe)(\.part)?$/.test(name)) await fs.rm(path.join(root, name), { force: true });
      const response = await net.fetch(release.url, { signal: request.signal });
      if (!response.ok || !response.body) throw coded('network', `Download returned HTTP ${response.status}`);
      const hash = createHash('sha256'); let received = 0, lastSent = 0;
      const meter = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > release.size) { callback(coded('checksum', 'The package is larger than expected')); return; }
        hash.update(chunk);
        if (Date.now() - lastSent > 150) { lastSent = Date.now(); emit({ progress: Math.min(99, received / release.size * 100), transferredBytes: received }); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal: request.signal });
      emit({ phase: 'verifying', progress: 99, transferredBytes: received });
      if (received !== release.size || hash.digest('hex') !== release.checksum) throw coded('checksum', 'Downloaded package failed SHA-256 verification');
      await fs.rename(partial, target);
      downloaded = { ...release, path: target };
      emit({ phase: 'ready', progress: 100 });
    } catch (error) {
      await fs.rm(partial, { force: true }).catch(() => {});
      emit(request.signal.reason === 'cancelled' ? { phase: 'available', progress: 0, error: null } : { phase: 'error', error: { code: error.code || 'network', message: error.message } });
    } finally { clearTimeout(timeout); if (controller === request) controller = null; }
    return snapshot();
  }
  async function install() {
    assertIdle();
    if (!downloaded) throw coded('missing', 'Download and verify the update first');
    if (isBusy()) throw coded('tasks', 'Wait for background tasks and storage operations to finish');
    emit({ phase: 'installing', error: null });
    try {
      // Verify again before launching; files on disk may have changed since download.
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(downloaded.path)) hash.update(chunk);
      if (hash.digest('hex') !== downloaded.checksum) { downloaded = null; throw coded('checksum', 'Update file changed after verification; download it again'); }
      if (isBusy()) throw coded('tasks', 'Wait for background tasks and storage operations to finish');
      // Let the OS open the verified package. On Windows this uses the shell
      // launch path, which can handle installer elevation; direct spawn uses
      // CreateProcess and may fail with UNKNOWN instead of showing UAC.
      // 系统负责打开已校验安装包并处理提权；成功交接才退出，失败保留文件供重试。
      const launchError = await shell.openPath(downloaded.path);
      if (launchError) throw coded('install', launchError);
      if (process.platform === 'darwin') emit({ phase: 'ready' });
      else app.quit();
    } catch (error) {
      const code = ['checksum', 'tasks'].includes(error.code) ? error.code : 'install';
      emit({ phase: downloaded ? 'ready' : 'error', error: { code, message: error.message } });
    }
    return snapshot();
  }
  for (const [action, handler] of Object.entries({ status: async () => { await ready; return snapshot(); }, check, download, install, cancel: () => { controller?.abort('cancelled'); return snapshot(); }, preferences: input => {
    if (typeof input?.autoCheck !== 'boolean') throw new Error('Invalid update preference');
    const autoCheck = input.autoCheck;
    settingsWrites = settingsWrites.catch(() => {}).then(async () => {
      await ready;
      await fs.mkdir(root, { recursive: true });
      const temporary = `${settingsFile}.tmp`;
      await fs.writeFile(temporary, JSON.stringify({ autoCheck }), { mode: 0o600 });
      await fs.rename(temporary, settingsFile);
      emit({ autoCheck }); return snapshot();
    });
    return settingsWrites;
  } })) ipcMain.handle(`desktop:update-${action}`, (event, ...args) => { authorize(event); return handler(...args); });
  ready.then(() => {
    if (!closed && state.enabled && state.autoCheck) timer = setTimeout(() => { if (state.autoCheck) check().catch(() => {}); }, 15000);
  });
  app.once('before-quit', () => { closed = true; clearTimeout(timer); controller?.abort(); });
}
