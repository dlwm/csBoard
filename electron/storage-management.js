import { dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createNativeClient } from './native-client.js';
import { identifyResource, validateResource } from './resource-store.js';

const exists = async file => { try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}
async function inventory(root, prefix = '') {
  const result = [];
  if (!await exists(root)) return result;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Backup folders must not contain symbolic links');
    if (entry.isDirectory()) result.push(...await inventory(file, relative));
    else if (entry.isFile()) result.push({ path: relative, bytes: (await fs.stat(file)).size });
    else throw new Error('Unsupported backup file');
  }
  return result;
}
async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const allowedPath = value => value === 'native-data/csboard.sqlite3'
  || /^native-data\/blobs\/[a-f0-9]{64}\.json\.gz$/.test(value)
  || /^resource-packs\/(icons|models)\/[a-z0-9_]+\.(svg|glb)$/.test(value);

// Applying two directories uses a small journal. An interrupted application rolls
// back on the next launch; the previous data stays available beside the stage.
export async function applyPendingRestore(userData) {
  const marker = path.join(userData, 'pending-restore.json');
  if (!await exists(marker)) return;
  const plan = JSON.parse(await fs.readFile(marker, 'utf8'));
  if (!/^[a-f0-9-]{36}$/.test(plan.id) || !['prepared', 'applying', 'complete'].includes(plan.state)) throw new Error('Invalid pending restore');
  const stage = path.join(userData, 'restores', plan.id);
  const names = ['native-data', 'resource-packs'];
  if (plan.state === 'complete') { await fs.rm(marker); return; }
  if (plan.state === 'applying') {
    for (const name of names) {
      const original = path.join(stage, 'previous', name);
      const incoming = path.join(stage, 'incoming', name);
      const live = path.join(userData, name);
      if (!await exists(incoming) && await exists(live)) await fs.rename(live, incoming);
      if (await exists(original)) await fs.rename(original, live);
    }
    await fs.rename(marker, path.join(stage, 'interrupted-restore.json'));
    return;
  }
  for (const name of names) if (!await exists(path.join(stage, 'incoming', name))) throw new Error('Incomplete pending restore');
  await fs.mkdir(path.join(stage, 'previous'), { recursive: true });
  await atomicJson(marker, { ...plan, state: 'applying' });
  try {
    for (const name of names) {
      const live = path.join(userData, name);
      if (await exists(live)) await fs.rename(live, path.join(stage, 'previous', name));
      await fs.rename(path.join(stage, 'incoming', name), live);
    }
    await atomicJson(marker, { ...plan, state: 'complete' });
    await fs.rm(marker);
  } catch (error) {
    await applyPendingRestore(userData);
    throw error;
  }
}

export function registerStorageManagement({ app, authorize, getWindow, binary, root, request, begin, end, keepAwake }) {
  const userData = app.getPath('userData');
  const resources = path.join(userData, 'resource-packs');
  let choosing = false;
  const native = (method, args) => request(method, args, { maintenance: true, timeoutMs: 30 * 60_000 });
  ipcMain.handle('desktop:storage-status', async event => {
    authorize(event);
    const usage = await request('storage.usage', {});
    const size = async dir => (await inventory(dir)).reduce((sum, file) => sum + file.bytes, 0);
    const databaseBytes = (await inventory(root)).filter(file => /^csboard\.sqlite3(?:-wal|-shm)?$/.test(file.path)).reduce((sum, file) => sum + file.bytes, 0);
    return { ...usage, databaseBytes, resourceBytes: await size(resources), analysisBytes: await size(path.join(userData, 'analysis-cache')), stagingBytes: await size(path.join(root, 'staging')), recoveryBytes: await size(path.join(userData, 'restores')), keepAwake: keepAwake() };
  });
  ipcMain.handle('desktop:storage-folder', async event => { authorize(event); await shell.openPath(userData); });
  ipcMain.handle('desktop:storage-clean', async (event, maxBytes) => {
    authorize(event);
    if (maxBytes !== null && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) throw new Error('Invalid cache size');
    begin();
    try {
      const result = await native(maxBytes === null ? 'storage.cleanOrphans' : 'storage.prune', { maxBytes, protected: [] });
      await fs.rm(path.join(userData, 'analysis-cache'), { recursive: true, force: true });
      return result;
    }
    finally { end(); }
  });
  ipcMain.handle('desktop:backup', async event => {
    authorize(event);
    if (choosing) throw new Error('A storage dialog is already open');
    choosing = true;
    let locked = false, staging;
    try {
      const selection = await dialog.showOpenDialog(getWindow(), { title: '选择备份存放位置 / Backup location', properties: ['openDirectory', 'createDirectory'] });
      if (selection.canceled) return null;
      const parent = await fs.realpath(selection.filePaths[0]);
      const relative = path.relative(await fs.realpath(userData), parent);
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Choose a backup location outside the application data directory');
      begin(); locked = true;
      const id = randomUUID();
      staging = path.join(parent, `.csboard-backup-${id}.tmp`);
      await fs.mkdir(staging);
      await native('storage.snapshot', { path: path.join(staging, 'native-data') });
      const targetResources = path.join(staging, 'resource-packs');
      await fs.mkdir(targetResources);
      for (const item of await inventory(resources)) {
        if (!allowedPath(`resource-packs/${item.path}`)) continue;
        const target = path.join(targetResources, item.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(resources, item.path), target);
      }
      const files = await inventory(staging);
      for (const item of files) item.sha256 = await checksum(path.join(staging, item.path));
      await atomicJson(path.join(staging, 'manifest.json'), { format: 'csboard-backup', version: 1, createdAt: new Date().toISOString(), appVersion: app.getVersion(), files });
      const destination = path.join(parent, `CSBoard-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}`);
      await fs.rename(staging, destination); staging = null;
      return { path: destination, files: files.length };
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      if (locked) end(); choosing = false;
    }
  });
  ipcMain.handle('desktop:restore', async event => {
    authorize(event);
    if (choosing) throw new Error('A storage dialog is already open');
    choosing = true;
    let locked = false, stage, published = false;
    try {
      const selection = await dialog.showOpenDialog(getWindow(), { title: '选择 CSBoard 备份文件夹 / Restore backup', properties: ['openDirectory'] });
      if (selection.canceled) return null;
      const source = selection.filePaths[0];
      const manifestFile = path.join(source, 'manifest.json');
      if ((await fs.lstat(manifestFile)).isSymbolicLink() || (await fs.stat(manifestFile)).size > 16 * 1024 ** 2) throw new Error('Invalid backup manifest');
      const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
      if (manifest.format !== 'csboard-backup' || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 100_000) throw new Error('Unsupported backup format');
      const actual = new Map((await inventory(source)).map(item => [item.path, item.bytes]));
      const expected = new Set();
      for (const item of manifest.files) {
        if (!allowedPath(item.path) || expected.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || actual.get(item.path) !== item.bytes) throw new Error('Incomplete or invalid backup');
        expected.add(item.path);
      }
      if (!expected.has('native-data/csboard.sqlite3') || actual.size !== expected.size + 1) throw new Error('Backup contains missing or unexpected files');
      const confirmation = await dialog.showMessageBox(getWindow(), {
        type: 'warning', title: '恢复备份 / Restore backup',
        message: '恢复将替换当前存档、Demo 缓存和导入资源，并重启应用。请先保存未保存的内容。恢复前的数据副本会保留。',
        buttons: ['取消 / Cancel', '恢复并重启 / Restore and restart'], defaultId: 0, cancelId: 0,
      });
      if (confirmation.response !== 1) return null;
      begin(); locked = true;
      const id = randomUUID();
      stage = path.join(userData, 'restores', id);
      const incoming = path.join(stage, 'incoming');
      await fs.mkdir(path.join(incoming, 'native-data'), { recursive: true });
      await fs.mkdir(path.join(incoming, 'resource-packs'), { recursive: true });
      for (const item of manifest.files) {
        const destination = path.join(incoming, item.path);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(path.join(source, item.path), destination);
        if (await checksum(destination) !== item.sha256) throw new Error(`Backup checksum mismatch: ${item.path}`);
        if (item.path.startsWith('resource-packs/')) {
          const resource = identifyResource(destination);
          if (!resource || item.path !== `resource-packs/${resource.kind}/${resource.name}`) throw new Error('Unknown backup resource');
          await validateResource(destination, resource);
        }
      }
      const checker = createNativeClient(binary, ['storage', path.join(incoming, 'native-data')], { timeoutMs: 30 * 60_000 });
      try { await checker.ready(); await checker.request('storage.check'); }
      finally {
        const exited = new Promise(resolve => { if (checker.child.exitCode != null || checker.child.signalCode != null) resolve(); else checker.child.once('exit', resolve); });
        checker.close(); await exited;
      }
      await atomicJson(path.join(userData, 'pending-restore.json'), { id, state: 'prepared' });
      published = true;
      app.relaunch(); app.quit();
      return { restart: true };
    } finally {
      if (stage && !published) await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      if (locked && !published) end(); choosing = false;
    }
  });
}
