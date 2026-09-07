import { useEffect, useRef, useState } from 'react';
import { countCachedDemoRounds, deleteCachedDemo, demoCacheId, getCachedDemo, putCachedDemo, putCachedDemoRound } from '../demoCache.js';
import { translateDemoWorkerStatus } from '../i18n.js';
import { batchTaskLabel, groupDemoFiles, recommendedDemoParseConcurrency } from './batch.js';

const terminalStatuses = new Set(['success', 'cached', 'failed']);

function representativeRound(roundData) {
  const representative = roundData.snapshots?.find((snapshot) => snapshot.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData.snapshots?.[0];
  return { round: roundData.round, snapshots: representative ? [representative] : [] };
}

function resultDiagnostic(data, estimatedBytes, elapsedMs) {
  return {
    map: data.demo.map,
    patch: data.demo.patch,
    demoVersion: data.demo.version,
    demoGuid: data.demo.guid,
    server: data.demo.serverName,
    client: data.demo.clientName,
    durationSeconds: data.demo.durationSeconds,
    maxTick: data.demo.maxTick,
    sampleRate: data.demo.sampleRate,
    rounds: data.summary.rounds,
    kills: data.summary.kills,
    damageEvents: data.summary.damageEvents,
    shots: data.summary.shots,
    players: data.summary.players,
    warnings: data.warnings || [],
    sourceBytes: data.demo.bytes,
    estimatedOutputBytes: estimatedBytes,
    elapsedMs,
  };
}

export default function useDemoBatchParser({ language, sampleRate, cacheSchemaVersion, onCacheChanged }) {
  const [batch, setBatch] = useState(null);
  const languageRef = useRef(language);
  const runIdRef = useRef(0);
  const workersRef = useRef(new Set());
  languageRef.current = language;

  const updateTask = (batchId, taskId, update) => setBatch((current) => {
    if (!current || current.id !== batchId) return current;
    return { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...(typeof update === 'function' ? update(task) : update) } : task) };
  });

  useEffect(() => () => {
    runIdRef.current += 1;
    workersRef.current.forEach((worker) => worker.terminate());
    workersRef.current.clear();
  }, []);

  const parseTask = async (batchId, task, concurrency) => {
    const startedAt = performance.now();
    const cacheId = demoCacheId(task.files, sampleRate);
    const sourceBytes = task.files.reduce((sum, file) => sum + file.size, 0);
    const source = task.files.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified }));
    const baseDiagnostic = { taskId: task.id, cacheId, source, sampleRate, cacheSchemaVersion, concurrency };
    updateTask(batchId, task.id, { status: 'reading', startedAt: new Date().toISOString(), diagnostic: { input: baseDiagnostic, phases: [] } });
    try {
      const cached = await getCachedDemo(cacheId).catch(() => null);
      if (cached?.data?.cacheSchemaVersion === cacheSchemaVersion && await countCachedDemoRounds(cacheId) === cached.data.rounds?.length) {
        updateTask(batchId, task.id, { status: 'cached', progress: 100, statusText: '', finishedAt: new Date().toISOString(), summary: resultDiagnostic(cached.data, cached.dataBytes || 0, performance.now() - startedAt) });
        return;
      }
      if (cached) await deleteCachedDemo(cacheId).catch(() => {});
      const buffers = await Promise.all(task.files.map((file) => file.arrayBuffer()));
      await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../demoWorker.js', import.meta.url), { type: 'module' });
        workersRef.current.add(worker);
        const roundSummaries = new Map();
        let roundWrites = Promise.resolve();
        let roundWriteError = null;
        let settled = false;
        const finish = (action) => {
          if (settled) return;
          settled = true;
          workersRef.current.delete(worker);
          worker.terminate();
          action();
        };
        const fail = (error, diagnostic) => finish(() => reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { diagnostic })));
        worker.onerror = (event) => fail(new Error(event.message || 'Demo Worker stopped'), { ...baseDiagnostic, workerError: { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno } });
        worker.onmessageerror = () => fail(new Error('Worker message could not be read'), baseDiagnostic);
        worker.onmessage = async ({ data: message }) => {
          if (message.type === 'status') updateTask(batchId, task.id, { status: 'parsing', statusText: translateDemoWorkerStatus(languageRef.current, message.message) });
          if (message.type === 'progress') updateTask(batchId, task.id, { status: 'parsing', progress: Math.max(0, Math.min(100, Number(message.percent) || 0)) });
          if (message.type === 'diagnostic') updateTask(batchId, task.id, (current) => ({ diagnostic: { ...current.diagnostic, phases: [...(current.diagnostic?.phases || []), { phase: message.phase, receivedAt: new Date().toISOString(), ...message.data }] } }));
          if (message.type === 'round') {
            roundSummaries.set(message.data.round, representativeRound(message.data));
            roundWrites = roundWrites.then(() => putCachedDemoRound(cacheId, message.data)).catch((error) => { roundWriteError = error; });
          }
          if (message.type === 'error') fail(new Error(message.message), { ...baseDiagnostic, parser: message.diagnostic });
          if (message.type !== 'loaded') return;
          try {
            updateTask(batchId, task.id, { status: 'caching', progress: 100, statusText: '' });
            await roundWrites;
            if (roundWriteError) throw roundWriteError;
            const { analysisRows = [], ...workerData } = message.data;
            const data = { ...workerData, roundData: workerData.rounds.map((round) => roundSummaries.get(round.round)).filter(Boolean) };
            const now = new Date().toISOString();
            await putCachedDemo({ id: cacheId, fileName: data.demo.fileName, map: data.demo.map, rounds: data.rounds.length, sampleRate: data.demo.sampleRate || sampleRate, sourceBytes, dataBytes: message.estimatedBytes || 0, createdAt: now, updatedAt: now, data, analysisRows, analysisBytes: message.data.analysisBytes || 0 });
            const summary = resultDiagnostic(data, message.estimatedBytes || 0, performance.now() - startedAt);
            finish(() => { updateTask(batchId, task.id, { status: 'success', progress: 100, finishedAt: now, summary }); resolve(); });
          } catch (error) { fail(error, { ...baseDiagnostic, cacheWrite: { message: error?.message, stack: error?.stack } }); }
        };
        updateTask(batchId, task.id, { status: 'parsing' });
        worker.postMessage({ type: 'load', fileName: task.files.map((file) => file.name).join(' + '), sampleRate, buffers }, buffers);
      });
    } catch (error) {
      await deleteCachedDemo(cacheId).catch(() => {});
      updateTask(batchId, task.id, (current) => ({ status: 'failed', progress: 100, finishedAt: new Date().toISOString(), error: { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null }, diagnostic: { ...current.diagnostic, elapsedMs: performance.now() - startedAt, failure: error?.diagnostic || null } }));
    }
  };

  const startBatch = async (files) => {
    if (!files?.length || batch?.running) return;
    const groups = groupDemoFiles(files);
    const jobs = groups.map((group, index) => ({ id: `demo-${Date.now()}-${index + 1}`, files: group, label: batchTaskLabel(group) }));
    const concurrency = recommendedDemoParseConcurrency(jobs.length, jobs);
    const batchId = `batch-${Date.now()}`;
    const runId = ++runIdRef.current;
    setBatch({ id: batchId, running: true, startedAt: new Date().toISOString(), finishedAt: null, concurrency, environment: { hardwareConcurrency: navigator.hardwareConcurrency || null, deviceMemory: navigator.deviceMemory || null, userAgent: navigator.userAgent, crossOriginIsolated: window.crossOriginIsolated, cacheSchemaVersion }, tasks: jobs.map((job) => ({ id: job.id, label: job.label, fileCount: job.files.length, sourceBytes: job.files.reduce((sum, file) => sum + file.size, 0), status: 'queued', progress: 0, statusText: '', diagnostic: null, summary: null, error: null })) });
    let nextIndex = 0;
    const runners = Array.from({ length: concurrency }, async () => {
      while (runIdRef.current === runId) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        await parseTask(batchId, jobs[index], concurrency);
      }
    });
    await Promise.all(runners);
    if (runIdRef.current !== runId) return;
    await onCacheChanged?.();
    setBatch((current) => current?.id === batchId ? { ...current, running: false, finishedAt: new Date().toISOString() } : current);
  };

  const clearBatch = () => setBatch((current) => current?.running ? current : null);
  const counts = batch?.tasks.reduce((result, task) => {
    if (task.status === 'success' || task.status === 'cached') result.completed += 1;
    if (task.status === 'failed') result.failed += 1;
    if (terminalStatuses.has(task.status)) result.finished += 1;
    return result;
  }, { completed: 0, failed: 0, finished: 0 }) || { completed: 0, failed: 0, finished: 0 };
  return { batch, counts, running: Boolean(batch?.running), startBatch, clearBatch };
}
