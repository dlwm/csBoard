import { spawn } from 'node:child_process';

// One in-flight request preserves transactions; priority only reorders waiting work.
export function createNativeClient(binary, args = [], { timeoutMs = 120_000, onMetrics, env = process.env, maxResponseBytes = 384 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) throw new Error('Invalid native response limit');
  const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
  const queue = [];
  let sequence = 0, active = null, failure = null, stderrHead = '', stderrTail = '';
  let responseChunks = [], responseBytes = 0;
  const fail = error => {
    failure ||= error;
    responseChunks = []; responseBytes = 0;
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
  child.on('close', (code, signal) => fail(new Error(`Native component exited (${signal || code}): ${stderrHead}${stderrTail}`)));
  child.stderr.on('data', chunk => {
    const text = String(chunk), headSize = Math.min(text.length, 4000 - stderrHead.length);
    stderrHead += text.slice(0, headSize);
    stderrTail = (stderrTail + text.slice(headSize)).slice(-4000);
  });
  const receiveLine = line => {
    const message = JSON.parse(line);
    if (!active || message.id !== active.id) throw new Error('Unexpected native response');
    const request = active;
    if (message.metrics) onMetrics?.(message.metrics);
    if (failure) return;
    clearTimeout(request.timer);
    active = null;
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
    pump();
  };
  // Frame bytes before decoding: readline can throw outside our handler when a
  // single JSON response exceeds V8's string limit. Oversize responses must fail
  // the request cleanly rather than crash the Electron task process.
  // 先限制字节数再解码，避免巨型 JSON 行在 readline 内使任务进程直接退出。
  const receive = chunk => {
    if (failure) return;
    try {
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start);
        const end = newline < 0 ? chunk.length : newline;
        const piece = chunk.subarray(start, end);
        if (responseBytes + piece.length > maxResponseBytes) throw new Error(`Native response exceeds ${maxResponseBytes} bytes for ${active?.method || 'unknown operation'}; use paged queries.`);
        if (piece.length) { responseChunks.push(piece); responseBytes += piece.length; }
        if (newline < 0) break;
        const line = Buffer.concat(responseChunks, responseBytes).toString('utf8');
        responseChunks = []; responseBytes = 0;
        receiveLine(line);
        if (failure) return;
        start = newline + 1;
      }
    } catch (error) {
      responseChunks = []; responseBytes = 0;
      fail(error); child.kill();
    }
  };
  child.stdout.on('data', receive);
  child.stdout.on('error', fail);
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
    close() { fail(new Error('Native operation cancelled')); child.stdout.removeListener('data', receive); responseChunks = []; responseBytes = 0; child.kill(); },
  };
}
