// Heavy parsing and computation each have a bounded lane. Reads stay independent.
export function createTaskScheduler({ limits = { parse: 1, compute: 1 }, onChange = () => {}, admit = () => ({}) } = {}) {
  const tasks = new Map();
  let sequence = 0, closed = false, retry = null;
  const snapshot = () => [...tasks.values()].map(({ id, owner, kind, label, state, createdAt, startedAt, finishedAt, error, progress, allocation, metrics, waitReason }) => ({ id, owner, kind, label, state, createdAt, startedAt, finishedAt, error, progress, allocation, metrics, waitReason }));
  const publish = () => onChange(snapshot());
  const terminal = task => ['completed', 'failed', 'cancelled'].includes(task.state);
  const finish = (task, error, value) => {
    if (terminal(task)) return;
    task.state = task.controller.signal.aborted ? 'cancelled' : error ? 'failed' : 'completed';
    task.finishedAt = Date.now();
    task.error = error?.message;
    const settle = error ? task.reject : task.resolve;
    // History stores only status, never closures holding a large request payload.
    task.run = null; task.resolve = null; task.reject = null;
    settle(error || value);
    // Retain a bounded history for diagnostics and the task panel.
    const history = [...tasks.values()].filter(terminal);
    for (const old of history.slice(0, Math.max(0, history.length - 50))) tasks.delete(old.id);
    publish();
    queueMicrotask(pump);
  };
  function pump() {
    clearTimeout(retry); retry = null;
    if (closed) return;
    for (const kind of Object.keys(limits)) {
      let available = limits[kind] - [...tasks.values()].filter(t => t.kind === kind && t.state === 'running').length;
      for (const task of [...tasks.values()].filter(t => t.kind === kind && t.state === 'queued').sort((a, b) => b.priority - a.priority || a.order - b.order)) {
        if (available <= 0) break;
        const allocation = admit(task, [...tasks.values()].filter(t => t.state === 'running'), [...tasks.values()].filter(t => t.state === 'queued'));
        if (allocation.error) { finish(task, allocation.error); continue; }
        if (allocation.waitReason) {
          if (task.waitReason !== allocation.waitReason) { task.waitReason = allocation.waitReason; publish(); }
          continue;
        }
        available--;
        task.allocation = allocation; task.waitReason = null;
        task.state = 'running'; task.startedAt = Date.now(); publish();
        Promise.resolve().then(() => {
          if (task.controller.signal.aborted) throw new Error('Task cancelled');
          return task.run(task.controller.signal, allocation);
        }).then(value => finish(task, null, value), error => finish(task, error));
      }
    }
    if ([...tasks.values()].some(task => task.state === 'queued')) { retry = setTimeout(pump, 1000); retry.unref?.(); }
  }
  function cancel(id, owner) {
    const task = tasks.get(id);
    if (!task || terminal(task) || (owner !== undefined && task.owner !== owner)) return;
    task.controller.abort();
    if (task.state === 'queued') finish(task, new Error('Task cancelled'));
  }
  return {
    snapshot,
    get busy() { return [...tasks.values()].some(task => !terminal(task)); },
    submit({ id, owner, kind, label, priority = 0, resources = {}, run }) {
      if (closed || !limits[kind] || tasks.has(id)) throw new Error('Task unavailable or duplicate ID');
      if ([...tasks.values()].filter(t => !terminal(t)).length >= 64) throw new Error('Task queue is full');
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      tasks.set(id, { id, owner, kind, label, priority, resources, run, resolve, reject, state: 'queued', createdAt: Date.now(), order: ++sequence, controller: new AbortController() });
      publish(); queueMicrotask(pump);
      return promise;
    },
    progress(id, progress) { const task = tasks.get(id); if (task && !terminal(task)) { task.progress = progress; publish(); } },
    metrics(id, metrics) { const task = tasks.get(id); if (task && !terminal(task)) { task.metrics = metrics; publish(); queueMicrotask(pump); } },
    rejectQueued(kind, error) { for (const task of tasks.values()) if (task.kind === kind && task.state === 'queued') finish(task, error); },
    cancel,
    cancelOwner(owner) { for (const task of tasks.values()) cancel(task.id, owner); },
    wake: () => queueMicrotask(pump),
    close() { closed = true; clearTimeout(retry); for (const task of tasks.values()) cancel(task.id); },
  };
}
