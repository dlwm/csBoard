import { registerDataService } from './data-service.js';
import { dialog, ipcMain, utilityProcess, powerSaveBlocker } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createNativeClient } from './native-client.js';
import { createTaskScheduler } from './task-scheduler.js';
import { createCacheTransfers } from './cache-files.js';
import { registerStorageManagement } from './storage-management.js';
import { createParsePerformance } from './parse-performance.js';
import { isAllowedRecordKey } from '../shared/record-keys.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const storageMethods = new Set(['record.get', 'record.put', 'record.patch', 'record.import', 'cache.list', 'cache.inspect', 'cache.get', 'cache.round', 'cache.count', 'cache.put', 'cache.putRound', 'cache.delete']);

export function registerNativeServices({ app, authorize, getWindow, resourceBusy = () => false }) {
  const binary = path.join(app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(here, '../build/native', `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`), `csboard-native${process.platform === 'win32' ? '.exe' : ''}`);
  const parserBinary = path.join(app.isPackaged ? path.join(process.resourcesPath, 'go-parser') : path.join(here, '../build/go-parser/native', `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`), `csboard-go-parser${process.platform === 'win32' ? '.exe' : ''}`);
  const root = path.join(app.getPath('userData'), 'native-data');
  const transfers = createCacheTransfers(root);
  const sources = new Map(), jobs = new Map(), owners = new Map();
  const performance = createParsePerformance(app.getPath('userData'));
  let storage, storageReady, powerBlocker;
  let choosing = false, closing = false, maintenance = false, inFlight = 0, keepAwake = false;
  const assertAvailable = () => { if (closing || maintenance) throw new Error('Storage maintenance in progress; try again when it finishes'); };
  const scheduler = createTaskScheduler({ limits: { parse: 16, compute: 1 }, admit: performance.admit, onChange: tasks => {
    const running = tasks.some(task => task.state === 'running');
    if (running && keepAwake && powerBlocker == null) powerBlocker = powerSaveBlocker.start('prevent-app-suspension');
    if ((!running || !keepAwake) && powerBlocker != null) { powerSaveBlocker.stop(powerBlocker); powerBlocker = null; }
    for (const [id, owner] of owners) if (!owner.isDestroyed()) owner.send('native:tasks', tasks.filter(task => task.owner === id));
    for (const task of tasks) {
      const job = jobs.get(task.id);
      if (job && (job.state !== task.state || job.waitReason !== task.waitReason)) {
        job.state = task.state; job.waitReason = task.waitReason;
        if (task.state === 'queued' || task.state === 'running') emit(job.owner, job.inputId, { type: task.state === 'queued' ? 'queued' : 'started', reason: task.waitReason, allocation: task.allocation });
      }
    }
  } });
  async function request(method, args, options = {}) {
    if (!options.maintenance) assertAvailable();
    inFlight++;
    try {
      if (storage?.failed) { storage.close(); storage = null; }
      if (!storage) {
        await fs.access(binary).catch(() => { throw new Error('Native component is missing. Run npm run native:build before starting Electron.'); });
        if (!storage) {
          storage = createNativeClient(binary, ['storage', root]);
          const current = storage;
          storageReady = current.ready();
          const reset = () => { if (storage === current) storage = null; };
          current.child.once('exit', reset); current.child.once('error', reset);
        }
      }
      const current = storage;
      await storageReady;
      return await current.request(method, args, options);
    } finally { inFlight--; }
  }
  let memoryRefreshing = false;
  async function refreshMemory() {
    if (closing || maintenance || memoryRefreshing) return;
    memoryRefreshing = true;
    // Sample between writes even during sustained imports; otherwise a busy
    // storage queue prevents all updates and admission uses stale free memory.
    try { performance.sampleMemory(await request('system.memory', {}, { priority: 10 })); scheduler.wake(); }
    catch (error) { scheduler.rejectQueued('parse', error); }
    finally { memoryRefreshing = false; }
  }
  const memoryTimer = setInterval(() => { if (scheduler.busy) refreshMemory(); }, 2000);
  memoryTimer.unref();
  registerDataService({ app, authorize, storage: request, scheduler, root, assertAvailable, analysisRealtime: () => performance.snapshot().settings.analysisRealtime });
  const emit = (owner, id, message) => { if (!owner.isDestroyed()) owner.send('native:demo-event', { id, ...message }); };
  const cancelOwner = owner => {
    scheduler.cancelOwner(owner.id);
    for (const [id, source] of sources) if (source.owner === owner.id) sources.delete(id);
  };
  app.on('web-contents-created', (_event, contents) => {
    contents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) cancelOwner(contents); });
    contents.once('destroyed', () => { cancelOwner(contents); owners.delete(contents.id); });
  });
  ipcMain.handle('native:tasks', event => { authorize(event); owners.set(event.sender.id, event.sender); return scheduler.snapshot().filter(task => task.owner === event.sender.id); });
  ipcMain.handle('native:performance', event => { authorize(event); return performance.snapshot(); });
  ipcMain.handle('native:performance-save', (event, settings) => {
    authorize(event); assertAvailable();
    if (scheduler.busy) throw new Error('Finish or cancel background tasks before changing performance settings');
    const result = performance.save(settings); scheduler.wake(); return result;
  });
  ipcMain.handle('native:cancel-task', (event, id) => { authorize(event); scheduler.cancel(id, event.sender.id); });
  ipcMain.handle('native:keep-awake', (event, value) => {
    authorize(event); keepAwake = value === true;
    if (keepAwake && scheduler.busy && powerBlocker == null) powerBlocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!keepAwake && powerBlocker != null) { powerSaveBlocker.stop(powerBlocker); powerBlocker = null; }
    return keepAwake;
  });
  ipcMain.handle('native:cache-read', async (event, id, round) => {
    authorize(event);
    if (typeof id !== 'string' || id.length > 16384 || (round != null && !Number.isInteger(round))) throw new Error('Invalid cache request');
    return transfers.issue(await request('cache.reference', { id, round }, { priority: 20 }));
  });
  ipcMain.handle('native:storage', async (event, method, args = {}) => {
    authorize(event);
    if (!storageMethods.has(method)) throw new Error('Invalid storage operation');
    if (method.startsWith('record.') && !isAllowedRecordKey(args.key)) throw new Error('Invalid record key');
    if (method.startsWith('cache.') && method !== 'cache.list' && (typeof args.id !== 'string' || args.id.length > 16384)) throw new Error('Invalid cache ID');
    if (method === 'cache.delete' && [...jobs.values()].some(job => job.cacheId === args.id)) throw new Error('This Demo is still being parsed');
    return request(method, args, { priority: method.startsWith('record.') ? 10 : method === 'cache.round' ? 20 : 0 });
  });
  ipcMain.handle('native:choose-demos', async event => {
    authorize(event); assertAvailable();
    if (choosing) return [];
    choosing = true;
    try {
      const selection = await dialog.showOpenDialog(getWindow(), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'CS2 Demo', extensions: ['dem'] }] });
      if (selection.canceled) return [];
      return await Promise.all(selection.filePaths.map(async file => {
        const stat = await fs.stat(file);
        if (!stat.isFile() || path.extname(file).toLowerCase() !== '.dem') throw new Error('Invalid Demo file');
        const nativeId = randomUUID();
        const descriptor = { nativeId, name: path.basename(file), size: stat.size, lastModified: Math.trunc(stat.mtimeMs) };
        sources.set(nativeId, { path: file, descriptor, owner: event.sender.id });
        return descriptor;
      }));
    } finally { choosing = false; }
  });
  ipcMain.handle('native:start-demo', (event, input) => {
    authorize(event); assertAvailable();
    if (!input || typeof input.id !== 'string' || ![1, 2, 4, 8, 16, 32].includes(input.sampleRate) || !Array.isArray(input.sources) || !input.sources.length) throw new Error('Invalid parse request');
    const selected = input.sources.map(id => sources.get(id));
    if (selected.some(source => !source || source.owner !== event.sender.id)) throw new Error('Select the Demo files again');
    const descriptors = selected.map(source => source.descriptor);
    const cacheId = `${input.sampleRate}hz|${[...descriptors].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(file => `${file.name}:${file.size}:${file.lastModified}`).join('|')}`;
    if (input.cacheId !== cacheId) throw new Error('Source metadata changed');
    if ([...jobs.values()].some(job => job.cacheId === cacheId)) throw new Error('This Demo is already queued or running');
    const key = `${event.sender.id}:demo:${input.id}`;
    const job = { cacheId, owner: event.sender, inputId: input.id };
    owners.set(event.sender.id, event.sender);
    const resources = { sourceBytes: descriptors.reduce((sum, file) => sum + file.size, 0), sampleRate: input.sampleRate, batchSize: Number.isInteger(input.batchSize) ? Math.max(1, Math.min(16, input.batchSize)) : 1 };
    const promise = scheduler.submit({ id: key, owner: event.sender.id, kind: 'parse', label: descriptors.map(file => file.name).join(' + '), resources, run: async (signal, allocation) => {
      for (const source of selected) {
        const stat = await fs.stat(source.path);
        if (stat.size !== source.descriptor.size || Math.trunc(stat.mtimeMs) !== source.descriptor.lastModified) throw new Error('Demo file changed; select it again');
      }
      if (signal.aborted) throw new Error('Demo task cancelled');
      await request('cache.delete', { id: cacheId });
      if (signal.aborted) throw new Error('Demo task cancelled');
      const stagingRoot = path.join(root, 'staging');
      await fs.mkdir(stagingRoot, { recursive: true });
      const staging = await fs.mkdtemp(path.join(stagingRoot, 'parse-'));
      try { return await new Promise((resolve, reject) => {
        const worker = utilityProcess.fork(path.join(here, '../build/tasks/demo.js'), [], { serviceName: 'CSBoard Demo', stdio: 'pipe' });
        let stopped = false, parserPid = null;
        const writes = new Set();
        const finish = async (error, result) => {
          if (stopped) return;
          stopped = true; clearTimeout(deadline);
          signal.removeEventListener('abort', cancel);
          if (parserPid) { try { process.kill(parserPid); } catch {} }
          worker.kill();
          await Promise.allSettled([...writes]);
          if (error) reject(error); else resolve(result);
        };
        const cancel = () => finish(new Error('Demo task cancelled'));
        const deadline = setTimeout(() => finish(new Error('Demo task exceeded 2 hours')), 2 * 60 * 60_000);
        signal.addEventListener('abort', cancel, { once: true });
        worker.once('spawn', () => { if (stopped) worker.kill(); });
        worker.stderr?.on('data', chunk => console.error(String(chunk).trim()));
        worker.stdout?.resume();
        worker.on('message', message => {
          if (message.type === 'parserPid') {
            parserPid = message.pid;
            if (stopped && parserPid) { try { process.kill(parserPid); } catch {} }
            return;
          }
          if (stopped) return;
          if (message.type === 'telemetry') {
            scheduler.metrics(key, message.metrics);
            if (message.metrics?.parserReleased) refreshMemory();
            return;
          }
          if (message.type === 'storage') {
            const write = (async () => {
              try {
                if (message.method !== 'cache.putFile' || message.args?.id !== cacheId || !/^[a-f0-9-]{36}\.json$/.test(message.args?.name)) throw new Error('Invalid task write');
                const result = await request('cache.putFile', { ...message.args, path: path.join(staging, message.args.name) });
                if (!stopped) worker.postMessage({ type: 'storageResult', id: message.id, result });
              } catch (error) { if (!stopped) worker.postMessage({ type: 'storageResult', id: message.id, error: error.message }); }
            })();
            writes.add(write); write.finally(() => writes.delete(write));
            return;
          }
          if (message.type === 'progress') scheduler.progress(key, message.percent);
          if (message.type === 'complete') finish(null, message);
          else if (message.type === 'error') finish(new Error(message.message));
          else emit(event.sender, input.id, message);
        });
        worker.on('exit', code => { if (!stopped) finish(new Error(`Demo task exited (${code}); retry to start a new process.`)); });
        if (signal.aborted) { cancel(); return; }
        worker.postMessage({ type: 'start', binary: parserBinary, staging, allocation, job: { cacheId, fileName: descriptors.map(file => file.name).join(' + '), sampleRate: input.sampleRate, paths: selected.map(source => source.path) } });
      }); } finally { await fs.rm(staging, { recursive: true, force: true }); }
    } });
    jobs.set(key, job);
    refreshMemory();
    promise.then(message => emit(event.sender, input.id, message), error => emit(event.sender, input.id, { type: 'error', message: error.message })).finally(() => { jobs.delete(key); refreshMemory(); });
    return { id: input.id };
  });
  ipcMain.handle('native:cancel-demo', (event, id) => { authorize(event); scheduler.cancel(`${event.sender.id}:demo:${id}`, event.sender.id); });
  registerStorageManagement({ app, authorize, getWindow, binary, root, request,
    begin: () => {
      assertAvailable();
      if (scheduler.busy || inFlight || resourceBusy()) throw new Error('Wait for parsing, saving and resource imports to finish before storage maintenance');
      maintenance = true; transfers.clear();
    },
    end: () => { maintenance = false; },
    keepAwake: () => keepAwake,
  });
  const close = () => {
    clearInterval(memoryTimer);
    closing = true; scheduler.close(); storage?.close(); sources.clear(); transfers.clear();
    if (powerBlocker != null) { powerSaveBlocker.stop(powerBlocker); powerBlocker = null; }
  };
  app.once('before-quit', close);
  return { close, assertAvailable, serveCache: transfers.serve, get busy() { return scheduler.busy || inFlight > 0 || maintenance; } };
}
