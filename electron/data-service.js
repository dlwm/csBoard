import { ipcMain, utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareAnalysisCache } from './analysis-cache-files.js';
import { cacheBlobPath } from './cache-files.js';
const taskPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../build/tasks/data.js');

export function registerDataService({ app, authorize, storage, scheduler, root, assertAvailable, analysisRealtime = () => false }) {
  void prepareAnalysisCache(path.join(app.getPath('userData'), 'analysis-cache'), app.getVersion()).catch(error => console.warn('Analysis cache cleanup failed:', error.message));
  ipcMain.handle('data:run', (event, id, method, args) => {
    authorize(event); assertAvailable();
    const analysis = ['analysis.catalog', 'analysis.query', 'analysis.utility', 'analysis.recommendations'].includes(method);
    if ((!analysis && !['json.encode', 'json.decode', 'broadcast.encode', 'broadcast.decode'].includes(method)) || typeof id !== 'string' || !args
      || (analysis && (!Array.isArray(args.ids) || !args.ids.every(value => typeof value === 'string')))
      || (['analysis.query', 'analysis.utility'].includes(method) && (!Array.isArray(args.players) || !args.players.every(value => typeof value === 'string')))
      || (method === 'analysis.recommendations' && (!Array.isArray(args.utilities) || args.utilities.length > 50000))
      || (method === 'analysis.utility' && (args.ids.length !== 1 || !Number.isInteger(args.round) || typeof args.segmentId !== 'string'))) throw new Error('Invalid data operation');
    const key = `${event.sender.id}:${id}`;
    return scheduler.submit({ id: key, owner: event.sender.id, kind: 'compute', label: method, priority: ['analysis.query', 'analysis.utility'].includes(method) ? 10 : 0,
      run: signal => new Promise((resolve, reject) => {
        const worker = utilityProcess.fork(taskPath, [], { serviceName: 'CSBoard Data', stdio: 'pipe' });
        let stopped = false;
        const finish = (error, result) => {
          if (stopped) return;
          stopped = true; clearTimeout(deadline);
          signal.removeEventListener('abort', cancel);
          worker.kill();
          if (error) reject(error); else resolve(result);
        };
        const cancel = () => finish(new Error('Data operation cancelled'));
        const deadline = setTimeout(() => finish(new Error('Data operation exceeded 10 minutes')), 600_000);
        signal.addEventListener('abort', cancel, { once: true });
        worker.once('spawn', () => { if (stopped) worker.kill(); });
        worker.stdout?.resume();
        worker.stderr?.on('data', data => console.error(String(data)));
        worker.on('exit', code => finish(new Error(`Data process exited (${code}); the next task can start a new process.`)));
        worker.on('message', async message => {
          if (stopped) return;
          if (message.type === 'read') {
            try {
              if (message.method === 'cache.list' && analysis) {
                const result = await storage('cache.list', {}, { priority: 5 });
                if (!stopped) worker.postMessage({ type: 'readResult', id: message.id, result, inline: true });
                return;
              }
              if (!['cache.get', 'cache.round'].includes(message.method) || !args.ids?.includes(message.args?.id)) throw new Error('Invalid analysis read');
              const reference = await storage('cache.reference', message.args, { priority: 5 });
              if (!stopped) worker.postMessage({ type: 'readResult', id: message.id, result: reference ? cacheBlobPath(root, reference.name) : null });
            } catch (error) { if (!stopped) worker.postMessage({ type: 'readResult', id: message.id, error: error.message }); }
          } else if (message.type === 'complete') finish(null, message.result);
          else if (message.type === 'error') finish(new Error(message.message));
        });
        worker.postMessage({ type: 'start', method, args, analysisCache: { directory: path.join(app.getPath('userData'), 'analysis-cache'), version: app.getVersion(), realtime: analysisRealtime() } });
      }),
    });
  });
  ipcMain.handle('data:cancel', (event, id) => { authorize(event); scheduler.cancel(`${event.sender.id}:${id}`, event.sender.id); });
}
