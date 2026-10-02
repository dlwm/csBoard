import { resultDiagnostic } from '../../demo/diagnostics.js';

function representativeRound(roundData) {
  const representative = roundData.snapshots?.find((snapshot) => snapshot.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData.snapshots?.[0];
  return { round: roundData.round, snapshots: representative ? [representative] : [] };
}

export function startWorkerDemo({ cacheId, files, sampleRate, onMessage, baseDiagnostic }, cache, transport) {
  let worker;
  let settled = false;
  let rejectTask;
  const startedAt = performance.now();
  const sourceBytes = files.reduce((sum, file) => sum + file.size, 0);
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    (async () => {
      const sources = await transport.loadSources(files);
      if (settled) return;

      worker = transport.createWorker();
      const roundSummaries = new Map();
      let roundWrites = Promise.resolve();
      let roundWriteError = null;
      const finish = (action) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        transport.close?.();
        action();
      };
      const fail = (error, diagnostic) => finish(() => reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { diagnostic })));
      worker.onerror = (event) => fail(new Error(event.message || 'Demo Worker stopped'), { ...baseDiagnostic, workerError: { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno } });
      worker.onmessageerror = () => fail(new Error('Worker message could not be read'), baseDiagnostic);
      worker.onmessage = async ({ data: message }) => {
        if (settled) return;
        if (message.type === 'parser-request') {
          try {
            const result = await transport.request(message.method, message.args);
            if (!settled) worker.postMessage({ type: 'parser-response', id: message.id, result });
          } catch (error) { if (!settled) worker.postMessage({ type: 'parser-response', id: message.id, error: error.message }); }
          return;
        }
        onMessage?.(message);
        if (message.type === 'round') {
          roundSummaries.set(message.data.round, representativeRound(message.data));
          roundWrites = roundWrites.then(() => settled ? undefined : cache.putCachedDemoRound(cacheId, message.data)).catch((error) => { roundWriteError = error; });
        }
        if (message.type === 'error') fail(new Error(message.message), { ...baseDiagnostic, parser: message.diagnostic });
        if (message.type !== 'loaded') return;
        try {
          onMessage?.({ type: 'caching' });
          await roundWrites;
          if (settled) return;
          if (roundWriteError) throw roundWriteError;
          const { analysisRows = [], ...workerData } = message.data;
          const data = { ...workerData, roundData: workerData.rounds.map((round) => roundSummaries.get(round.round)).filter(Boolean) };
          const now = new Date().toISOString();
          await cache.putCachedDemo({ id: cacheId, fileName: data.demo.fileName, map: data.demo.map, rounds: data.rounds.length, sampleRate: data.demo.sampleRate || sampleRate, sourceBytes, dataBytes: message.estimatedBytes || 0, createdAt: now, updatedAt: now, data, analysisRows, analysisBytes: message.data.analysisBytes || 0 });
          const summary = resultDiagnostic(data, message.estimatedBytes || 0, performance.now() - startedAt);
          finish(() => resolve({ summary }));
        } catch (error) { fail(error, { ...baseDiagnostic, cacheWrite: { message: error?.message, stack: error?.stack } }); }
      };
      worker.postMessage({ type: 'load', fileName: files.map((file) => file.name).join(' + '), sampleRate, ...sources.message }, sources.transfer || []);
    })().catch(error => { settled = true; worker?.terminate(); transport.close?.(); reject(error); });
  });
  return { promise, terminate() {
    if (settled) return;
    settled = true;
    worker?.terminate();
    transport.close?.();
    rejectTask(new Error('Demo task cancelled'));
  } };
}
