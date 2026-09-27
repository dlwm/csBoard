import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskScheduler } from '../electron/task-scheduler.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, options = {}) {
  const scheduler = createTaskScheduler(options), started = [], finish = new Map();
  t.after(() => scheduler.close());
  const submit = (id, extra = {}) => {
    const promise = scheduler.submit({ id, owner: 1, kind: 'parse', ...extra, run: (signal, allocation) => {
      started.push(id);
      return new Promise((resolve, reject) => {
        finish.set(id, { resolve, reject, signal, allocation });
        signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true });
      });
    } });
    promise.catch(() => {});
    return promise;
  };
  return { scheduler, started, finish, submit, state: id => scheduler.snapshot().find(task => task.id === id) };
}

test('bounded lanes run independently and choose queued tasks by priority then FIFO', async t => {
  const f = fixture(t, { limits: { parse: 1, compute: 1 } });
  const a = f.submit('a'); await turn();
  const b = f.submit('b'), c = f.submit('c', { priority: 5 }), d = f.submit('d', { priority: 5 }), compute = f.submit('compute', { kind: 'compute' });
  await turn(); assert.deepEqual(f.started, ['a', 'compute']);
  f.finish.get('compute').resolve('computed'); assert.equal(await compute, 'computed');
  f.finish.get('a').resolve('parsed'); assert.equal(await a, 'parsed'); await turn();
  assert.deepEqual(f.started, ['a', 'compute', 'c']);
  f.finish.get('c').resolve(); await c; await turn();
  assert.equal(f.started.at(-1), 'd');
  f.finish.get('d').resolve(); await d; await turn();
  assert.equal(f.started.at(-1), 'b');
  f.finish.get('b').resolve(); await b;
  assert.equal(f.scheduler.busy, false);
});

test('cancel enforces ownership, never starts queued work, and releases a running slot', async t => {
  const f = fixture(t);
  const a = f.submit('a'), b = f.submit('b'), c = f.submit('c', { owner: 2 });
  await turn();
  f.scheduler.cancel('a', 2); assert.equal(f.finish.get('a').signal.aborted, false);
  f.scheduler.cancel('b', 1); await assert.rejects(b, /cancel/i);
  f.scheduler.cancelOwner(1); await assert.rejects(a, /cancel/i); await turn();
  assert.deepEqual(f.started, ['a', 'c']);
  assert.equal(f.state('a').state, 'cancelled'); assert.equal(f.state('b').state, 'cancelled');
  f.finish.get('c').resolve(); await c;
  f.scheduler.progress('a', 99); assert.equal(f.state('a').progress, undefined);
});

test('memory waiting resumes on wake; admission failures and worker errors do not block later work', async t => {
  let memory = false;
  const f = fixture(t, { admit: task => task.id === 'invalid' ? { error: Error('budget too small') } : memory ? { threads: 2 } : { waitReason: 'memory' } });
  const waiting = f.submit('waiting'), invalid = f.submit('invalid');
  await assert.rejects(invalid, /budget/); await turn();
  assert.deepEqual(f.started, []); assert.equal(f.state('waiting').waitReason, 'memory');
  memory = true; f.scheduler.wake(); await turn();
  assert.deepEqual(f.finish.get('waiting').allocation, { threads: 2 });
  const retry = f.submit('retry'); f.finish.get('waiting').reject(Error('parser exited'));
  await assert.rejects(waiting, /parser exited/); await turn();
  assert.equal(f.state('waiting').state, 'failed'); assert.equal(f.started.at(-1), 'retry');
  f.finish.get('retry').resolve(); await retry;
});

test('closing aborts both lanes and queued work; duplicate IDs and unbounded queues are rejected', async t => {
  const f = fixture(t);
  const a = f.submit('a'), compute = f.submit('compute', { kind: 'compute' });
  await turn();
  assert.throws(() => f.submit('a'), /duplicate/);
  const waiting = Array.from({ length: 62 }, (_, i) => f.submit(`q${i}`));
  assert.throws(() => f.submit('overflow'), /full/);
  f.scheduler.close();
  const results = await Promise.allSettled([a, compute, ...waiting]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.ok(f.scheduler.snapshot().every(task => task.state === 'cancelled'));
  assert.equal(f.scheduler.busy, false);
  assert.throws(() => f.submit('after-close'), /unavailable/);
});
