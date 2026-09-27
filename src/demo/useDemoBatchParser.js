import { useEffect, useRef, useState } from 'react';
import { countCachedDemoRounds, deleteCachedDemo, demoCacheId, inspectCachedDemo } from '../demoCache.js';
import { translateDemoWorkerStatus } from '../i18n.js';
import { batchTaskLabel, groupDemoFiles } from './batch.js';
import { getPlatform } from '../platform/index.js';
import { resultDiagnostic } from './diagnostics.js';

const terminalStatuses = new Set(['success', 'cached', 'failed']);

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

  const parseTask = async (batchId, task, concurrency, runId) => {
    const startedAt = performance.now();
    const cacheId = demoCacheId(task.files, sampleRate);
    const sourceBytes = task.files.reduce((sum, file) => sum + file.size, 0);
    const source = task.files.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified }));
    const baseDiagnostic = { taskId: task.id, cacheId, source, sampleRate, cacheSchemaVersion, concurrency };
    updateTask(batchId, task.id, { status: 'reading', startedAt: new Date().toISOString(), diagnostic: { input: baseDiagnostic, phases: [] } });
    try {
      const cached = await inspectCachedDemo(cacheId);
      if (runIdRef.current !== runId) return;
      if (cached?.data?.cacheSchemaVersion === cacheSchemaVersion && await countCachedDemoRounds(cacheId) === cached.data.rounds?.length) {
        updateTask(batchId, task.id, { status: 'cached', progress: 100, statusText: '', finishedAt: new Date().toISOString(), summary: resultDiagnostic(cached.data, cached.dataBytes || 0, performance.now() - startedAt) });
        return;
      }
      if (cached) await deleteCachedDemo(cacheId).catch(() => {});
      if (runIdRef.current !== runId) return;
      const taskHandle = getPlatform().demos.start({ id: `${batchId}:${task.id}`, cacheId, files: task.files, sampleRate, batchSize: concurrency, baseDiagnostic, onMessage: message => {
        if (message.type === 'queued') updateTask(batchId, task.id, { status: 'queued', statusText: '', waitReason: message.reason });
        if (message.type === 'started') updateTask(batchId, task.id, { status: 'parsing', allocation: message.allocation, waitReason: null });
        if (message.type === 'status') updateTask(batchId, task.id, { status: 'parsing', statusText: translateDemoWorkerStatus(languageRef.current, message.message) });
        if (message.type === 'progress') updateTask(batchId, task.id, { status: 'parsing', progress: Math.max(0, Math.min(99, Number(message.percent) || 0)) });
        if (message.type === 'caching') updateTask(batchId, task.id, { status: 'caching', progress: 99, statusText: '' });
        if (message.type === 'diagnostic') updateTask(batchId, task.id, current => ({ diagnostic: { ...current.diagnostic, phases: [...(current.diagnostic?.phases || []), { phase: message.phase, receivedAt: new Date().toISOString(), ...message.data }] } }));
      } });
      workersRef.current.add(taskHandle);
      try {
        const result = await taskHandle.promise;
        updateTask(batchId, task.id, { status: 'success', progress: 100, finishedAt: new Date().toISOString(), summary: { ...result.summary, elapsedMs: performance.now() - startedAt } });
      } finally { workersRef.current.delete(taskHandle); }
    } catch (error) {
      updateTask(batchId, task.id, (current) => ({ status: 'failed', progress: 100, finishedAt: new Date().toISOString(), error: { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null }, diagnostic: { ...current.diagnostic, elapsedMs: performance.now() - startedAt, failure: error?.diagnostic || null } }));
    }
  };

  const startBatch = async (files) => {
    if (!files?.length || batch?.running) return;
    const groups = groupDemoFiles(files);
    const jobs = groups.map((group, index) => ({ id: `demo-${Date.now()}-${index + 1}`, files: group, label: batchTaskLabel(group) }));
    const concurrency = getPlatform().demos.concurrency(jobs);
    const batchId = `batch-${Date.now()}`;
    const runId = ++runIdRef.current;
    setBatch({ id: batchId, running: true, startedAt: new Date().toISOString(), finishedAt: null, concurrency, environment: { hardwareConcurrency: navigator.hardwareConcurrency || null, deviceMemory: navigator.deviceMemory || null, userAgent: navigator.userAgent, crossOriginIsolated: window.crossOriginIsolated, cacheSchemaVersion }, tasks: jobs.map((job) => ({ id: job.id, label: job.label, fileCount: job.files.length, sourceBytes: job.files.reduce((sum, file) => sum + file.size, 0), status: 'queued', progress: 0, statusText: '', diagnostic: null, summary: null, error: null })) });
    let nextIndex = 0;
    const runners = Array.from({ length: concurrency }, async () => {
      while (runIdRef.current === runId) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= jobs.length) return;
        await parseTask(batchId, jobs[index], concurrency, runId);
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
