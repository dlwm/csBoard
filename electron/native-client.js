import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// One in-flight request preserves transactions; priority only reorders waiting work.
export function createNativeClient(binary, args = [], { timeoutMs = 120_000, onMetrics, env = process.env } = {}) {
  const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
  const queue = [];
  let sequence = 0, active = null, failure = null, stderr = '';
  const fail = error => {
    failure ||= error;
    if (active) { clearTimeout(active.timer); active.reject(failure); active = null; }
    for (const request of queue.splice(0)) request.reject(failure);
  };
  const pump = () => {
    if (failure || active || !queue.length) return;
    queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    active = queue.shift();
    const request = active;
    request.timer = setTimeout(() => {
      fail(new Error(`Native operation timed out: ${request.method}. Its write outcome may be unknown.`));
      child.kill();
    }, request.timeoutMs);
    try {
      child.stdin.write(`${JSON.stringify({ id: request.id, method: request.method, args: request.args })}\n`, error => {
        if (error) { fail(error); child.kill(); }
      });
    } catch (error) { fail(error); child.kill(); }
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', (code, signal) => fail(new Error(`Native component exited (${signal || code}): ${stderr.slice(-2000)}`)));
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      if (!active || message.id !== active.id) throw new Error('Unexpected native response');
      const request = active;
      clearTimeout(request.timer);
      active = null;
      if (message.metrics) onMetrics?.(message.metrics);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
      pump();
    } catch (error) { fail(error); child.kill(); }
  });
  function request(method, args = {}, options = {}) {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      queue.push({ id: ++sequence, method, args, resolve, reject, priority: options.priority || 0, timeoutMs: options.timeoutMs || timeoutMs });
      pump();
    });
  }
  return {
    child, request,
    get failed() { return Boolean(failure); },
    async ready() {
      const info = await request('hello', {}, { timeoutMs: 15_000 });
      if (info.protocol !== 1) { this.close(); throw new Error('Unsupported native protocol'); }
      return info;
    },
    close() { fail(new Error('Native operation cancelled')); lines.close(); child.kill(); },
  };
}
