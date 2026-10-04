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
  const sessionRef = useRef(null);
  const onCacheChangedRef = useRef(onCacheChanged);
  const cacheRefreshRef = useRef({ dirty: false, promise: null });
  languageRef.current = language;
  onCacheChangedRef.current = onCacheChanged;

  // Publish durable results throughout the batch. Coalesce completions while
  // a catalogue read is in flight without delaying the next parser task.
  const refreshCache = () => {
    const refresh = cacheRefreshRef.current;
    refresh.dirty = true;
    if (refresh.promise) return refresh.promise;
    refresh.promise = Promise.resolve().then(async () => {
      while (refresh.dirty) {
        refresh.dirty = false;
        try { await onCacheChangedRef.current?.(); }
        catch (error) { console.warn('Demo catalogue refresh failed', error); }
      }
    }).finally(() => { refresh.promise = null; });
    return refresh.promise;
  };

  const updateTask = (batchId, taskId, update) => setBatch((current) => {
    if (!current || current.id !== batchId) return current;
    return { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...(typeof update === 'function' ? update(task) : update) } : task) };
  });

  useEffect(() => () => {
    runIdRef.current += 1;
    workersRef.current.forEach((worker) => worker.terminate());
    workersRef.current.clear();
    if (sessionRef.current) void releaseSession(sessionRef.current);
  }, []);

  const parseTask = async (batchId, task, concurrency, runId, taskSampleRate) => {
    const startedAt = performance.now();
    const cacheId = demoCacheId(task.files, taskSampleRate);
    const sourceBytes = task.files.reduce((sum, file) => sum + file.size, 0);
    const source = task.files.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified }));
    const baseDiagnostic = { taskId: task.id, attempt: task.attempt || 1, cacheId, source, sampleRate: taskSampleRate, cacheSchemaVersion, concurrency };
    updateTask(batchId, task.id, { status: 'reading', startedAt: new Date().toISOString(), diagnostic: { input: baseDiagnostic, phases: [] } });
    try {
      // Retry starts from a clean cache, including rounds written before failure.
      if ((task.attempt || 1) > 1) await deleteCachedDemo(cacheId);
      const cached = await inspectCachedDemo(cacheId);
      if (runIdRef.current !== runId) return;
      if (cached?.data?.rounds?.length > 0 && cached?.data?.cacheSchemaVersion === cacheSchemaVersion && await countCachedDemoRounds(cacheId) === cached.data.rounds?.length) {
        updateTask(batchId, task.id, { status: 'cached', progress: 100, statusText: '', finishedAt: new Date().toISOString(), summary: resultDiagnostic(cached.data, cached.dataBytes || 0, performance.now() - startedAt) });
        void refreshCache();
        return true;
      }
      if (cached) await deleteCachedDemo(cacheId).catch(() => {});
      if (runIdRef.current !== runId) return;
      const taskHandle = getPlatform().demos.start({ id: `${batchId}:${task.id}:attempt-${task.attempt || 1}`, cacheId, files: task.files, sampleRate: taskSampleRate, batchSize: concurrency, baseDiagnostic, onMessage: message => {
        if (message.type === 'error' && message.diagnostic) updateTask(batchId, task.id, current => ({ diagnostic: { ...current.diagnostic, failure: message.diagnostic } }));
        if (message.type === 'queued') updateTask(batchId, task.id, { status: 'queued', statusText: '', waitReason: message.reason });
        if (message.type === 'started') updateTask(batchId, task.id, { status: 'parsing', parseStartedAt: performance.now(), allocation: message.allocation, waitReason: null });
        if (message.type === 'status') updateTask(batchId, task.id, current => ({ status: 'parsing', parseStartedAt: current.parseStartedAt ?? performance.now(), statusText: translateDemoWorkerStatus(languageRef.current, message.message) }));
        if (message.type === 'progress') updateTask(batchId, task.id, current => ({
          status: 'parsing', parseStartedAt: current.parseStartedAt ?? performance.now(),
          progress: Math.max(current.progress, Math.min(99, Number(message.percent) || 0)),
          progressReceivedAt: performance.now(),
          hasTickProgress: current.hasTickProgress || message.phase === 'ticks',
          progressTotal: message.total,
        }));
        if (message.type === 'caching') updateTask(batchId, task.id, { status: 'caching', progress: 99, statusText: '' });
        if (message.type === 'round-cached') updateTask(batchId, task.id, { cachedRounds: message.completed });
        if (message.type === 'diagnostic') updateTask(batchId, task.id, current => ({ diagnostic: { ...current.diagnostic, phases: [...(current.diagnostic?.phases || []), { phase: message.phase, receivedAt: new Date().toISOString(), ...message.data }] } }));
      } });
      workersRef.current.add(taskHandle);
      try {
        const result = await taskHandle.promise;
        updateTask(batchId, task.id, { status: 'success', progress: 100, finishedAt: new Date().toISOString(), summary: { ...result.summary, elapsedMs: performance.now() - startedAt } });
        if (runIdRef.current === runId) void refreshCache();
        return true;
      } finally { workersRef.current.delete(taskHandle); }
    } catch (error) {
      updateTask(batchId, task.id, (current) => ({ status: 'failed', progress: 100, finishedAt: new Date().toISOString(), error: { code: error?.code, reason: error?.reason, name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null }, diagnostic: { ...current.diagnostic, elapsedMs: performance.now() - startedAt, failure: error?.diagnostic || current.diagnostic?.failure || null } }));
    }
  };

  const releaseJob = async (session, job) => {
    if (session.released.has(job.id)) return;
    session.released.add(job.id);
    try { await getPlatform().demos.releaseFiles(job.files); }
    catch (error) { session.released.delete(job.id); console.warn('Demo source cleanup failed', error); }
  };
  const releaseSession = session => Promise.all([...session.jobs.values()].map(job => releaseJob(session, job)));
  const finishSession = async session => {
    if (!session.initialComplete || session.active.size || sessionRef.current !== session || session.runId !== runIdRef.current) return;
    await refreshCache();
    // A retry can start while the catalogue is refreshing.
    if (session.active.size || sessionRef.current !== session || session.runId !== runIdRef.current) return;
    setBatch(current => current?.id === session.id ? { ...current, running: false, finishedAt: new Date().toISOString() } : current);
  };
  const runJob = async (session, job) => {
    if (session.active.has(job.id)) return;
    session.active.add(job.id);
    let completed = false;
    try {
      completed = await parseTask(session.id, job, session.concurrency, session.runId, session.sampleRate);
    } finally {
      // Failed sources stay available for retry, including native picker copies.
      if (completed) await releaseJob(session, job);
      session.active.delete(job.id);
      await finishSession(session);
    }
  };
  const startBatch = async (files) => {
    if (!getPlatform().capabilities.demoParsing) throw new Error('Demo parsing is unavailable in mobile H5');
    if (!files?.length || batch?.running || sessionRef.current?.active.size) return;
    const previous = sessionRef.current;
    if (previous) void releaseSession(previous);
    const groups = groupDemoFiles(files);
    const jobs = groups.map((group, index) => ({ id: `demo-${Date.now()}-${index + 1}`, files: group, label: batchTaskLabel(group), attempt: 1 }));
    const concurrency = getPlatform().demos.concurrency(jobs);
    const batchId = `batch-${Date.now()}`;
    const runId = ++runIdRef.current;
    const session = { id: batchId, runId, concurrency, sampleRate, jobs: new Map(jobs.map(job => [job.id, job])), active: new Set(), released: new Set(), initialComplete: false };
    sessionRef.current = session;
    setBatch({ id: batchId, running: true, startedAt: new Date().toISOString(), finishedAt: null, concurrency, environment: { hardwareConcurrency: navigator.hardwareConcurrency || null, deviceMemory: navigator.deviceMemory || null, userAgent: navigator.userAgent, crossOriginIsolated: window.crossOriginIsolated, cacheSchemaVersion }, tasks: jobs.map((job) => ({ id: job.id, label: job.label, fileCount: job.files.length, sourceBytes: job.files.reduce((sum, file) => sum + file.size, 0), status: 'queued', progress: 0, statusText: '', attempt: 1, diagnostic: null, summary: null, error: null })) });
    let nextIndex = 0;
    const runners = Array.from({ length: concurrency }, async () => {
      while (runIdRef.current === runId) {
        const index = nextIndex++;
        if (index >= jobs.length) return;
        await runJob(session, jobs[index]);
      }
    });
    await Promise.all(runners);
    session.initialComplete = true;
    await finishSession(session);
  };
  const retryTask = async taskId => {
    const session = sessionRef.current;
    const task = batch?.tasks.find(task => task.id === taskId);
    const job = session?.jobs.get(taskId);
    if (!session || !job || batch?.id !== session.id || task?.status !== 'failed' || session.active.has(taskId)) return;
    job.attempt = (job.attempt || 1) + 1;
    setBatch(current => current?.id === session.id ? { ...current, running: true, finishedAt: null,
      tasks: current.tasks.map(task => task.id === taskId ? { ...task, status: 'queued', progress: 0, statusText: '',
        attempt: (task.attempt || 1) + 1, parseStartedAt: null, progressReceivedAt: null, hasTickProgress: false,
        progressTotal: null, cachedRounds: 0, allocation: null, waitReason: null, startedAt: null, finishedAt: null,
        diagnostic: null, summary: null, error: null } : task),
    } : current);
    await runJob(session, job);
  };
  const recordingFiles = taskId => {
    const session = sessionRef.current;
    const task = batch?.tasks.find(task => task.id === taskId);
    if (!session || task?.status !== 'failed' || task.error?.code !== 'non_standard_demo' || session.active.has(taskId)) return [];
    return session.jobs.get(taskId)?.files || [];
  };
  // The loader takes ownership before starting asynchronous work. A new batch
  // or closing this panel must not release native picker copies still in use.
  // 将失败文件交给录像加载器，避免批次关闭提前删除系统选择器副本。
  const takeRecordingFiles = taskId => {
    const files = recordingFiles(taskId);
    if (files.length) {
      sessionRef.current.released.add(taskId);
      sessionRef.current.jobs.delete(taskId);
      updateTask(sessionRef.current.id, taskId, { recordingTransferred: true });
    }
    return files;
  };
  const clearBatch = () => {
    const session = sessionRef.current;
    if (batch?.running || session?.active.size) return;
    sessionRef.current = null;
    runIdRef.current += 1;
    if (session) void releaseSession(session);
    setBatch(null);
  };
  const counts = batch?.tasks.reduce((result, task) => {
    if (task.status === 'success' || task.status === 'cached') result.completed += 1;
    if (task.status === 'failed') result.failed += 1;
    if (terminalStatuses.has(task.status)) result.finished += 1;
    return result;
  }, { completed: 0, failed: 0, finished: 0 }) || { completed: 0, failed: 0, finished: 0 };
  return { batch, counts, running: Boolean(batch?.running), startBatch, retryTask, takeRecordingFiles, clearBatch };
}
