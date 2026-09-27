import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createParsePerformance } from '../electron/parse-performance.js';

const GiB = 1024 ** 3;
const task = { kind: 'parse', resources: { sourceBytes: 60 * 1024 ** 2, sampleRate: 8, batchSize: 4 } };
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-performance-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let free = 14 * GiB;
  const hardware = { cores: 8, totalMemory: 16 * GiB, freeMemory: () => free };
  const performance = createParsePerformance(directory, hardware);
  return { directory, hardware, performance, free: value => { free = value; }, save: patch => performance.save({ ...performance.snapshot().settings, ...patch }) };
}

test('concurrent demos share CPU and memory budgets; disabling threaded sampling keeps one thread per job', async t => {
  const f = await fixture(t);
  f.save({ mode: 'custom', maxDemos: 4, threadsPerDemo: 4, memoryGB: 12 });
  const running = [];
  for (let i = 0; i < 4; i++) {
    const allocation = f.performance.admit(task, running, []);
    assert.ok(allocation.threads >= 1); running.push({ ...task, allocation });
  }
  assert.ok(running.reduce((sum, job) => sum + job.allocation.threads, 0) <= 8);
  assert.ok(running.reduce((sum, job) => sum + job.allocation.memoryBytes, 0) <= 12 * GiB);
  assert.equal(f.performance.admit(task, running, []).waitReason, 'slots');
  f.save({ parallelTicks: false });
  const serial = f.performance.admit(task, [], []);
  assert.equal(serial.threads, 1); assert.equal(serial.parallelTicks, false);
});

test('low memory waits, larger observed usage reduces admission, and impossible budgets fail', async t => {
  const f = await fixture(t);
  f.save({ mode: 'custom', maxDemos: 4, threadsPerDemo: 2, memoryGB: 8 });
  f.free(100 * 1024 ** 2); assert.equal(f.performance.admit(task, [], []).waitReason, 'memory');
  f.free(14 * GiB);
  const allocation = f.performance.admit(task, [], []);
  assert.ok(allocation.threads);
  const running = [{ ...task, allocation, metrics: { peakBytes: 6 * GiB } }];
  assert.equal(f.performance.admit(task, running, []).waitReason, 'memory');
  f.save({ memoryGB: 0.5 }); assert.match(f.performance.admit(task, [], []).error.message, /memory budget/);
});

test('settings persist; invalid updates leave the last saved settings intact', async t => {
  const f = await fixture(t);
  const saved = f.save({ mode: 'fast' }).settings;
  for (const patch of [{ threadsPerDemo: 9 }, { maxDemos: 0 }, { memoryGB: Infinity }, { mode: 'unknown' }]) assert.throws(() => f.save(patch), /Invalid/);
  assert.deepEqual(createParsePerformance(f.directory, f.hardware).snapshot().settings, saved);
  const single = { ...task, resources: { ...task.resources, batchSize: 1 } };
  assert.equal(f.performance.admit(single, [], []).threads, 8);
  assert.deepEqual((await fs.readdir(f.directory)), ['parse-performance.json']);
});

test('native available-memory samples expire and compute jobs bypass parser admission', async t => {
  const f = await fixture(t);
  let now = 100;
  t.mock.method(Date, 'now', () => now);
  f.free(100 * 1024 ** 2);
  f.performance.sampleMemory(14 * GiB);
  assert.ok(f.performance.admit(task, [], []).threads);
  now += 5001;
  assert.equal(f.performance.admit(task, [], []).waitReason, 'memory');
  assert.deepEqual(f.performance.admit({ kind: 'compute' }, [], []), {});
});
