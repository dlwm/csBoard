import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoundDataStore } from '../src/demo/roundDataStore.js';

test('only the latest Demo/round request can replace the current payload', async () => {
  const pending = [];
  const store = createRoundDataStore((id, round) => new Promise(resolve => pending.push({ id, round, resolve })));
  const old = store.load('demo-a', 1);
  const latest = store.load('demo-b', 2);
  assert.equal(store.getSnapshot().loading, true);
  pending[1].resolve({ snapshots: ['new'], infernoFrames: ['fire'] });
  await latest;
  pending[0].resolve({ snapshots: ['old'], smokeVoxelFrames: ['old smoke'] });
  await old;
  assert.deepEqual(store.getSnapshot().snapshots, ['new']);
  assert.deepEqual(store.getSnapshot().infernoFrames, ['fire']);
  assert.deepEqual(store.getSnapshot().smokeVoxelFrames, []);
  assert.equal(store.getSnapshot().loading, false);
});

test('reset cancels in-flight results; errors leave no stale round content', async () => {
  let resolve;
  const store = createRoundDataStore(() => new Promise(done => { resolve = done; }));
  const request = store.load('a', 1);
  store.reset(); resolve({ projectiles: ['stale'] }); await request;
  assert.deepEqual(store.getSnapshot().projectiles, []);
  assert.equal(store.getSnapshot().loading, false);
  const failing = createRoundDataStore(async () => { throw Error('cache failed'); });
  await failing.load('a', 1);
  assert.equal(failing.getSnapshot().loading, false);
  assert.deepEqual(failing.getSnapshot().snapshots, []);
});

test('unsubscribe and cancellation prevent unmounted consumers from receiving results', async () => {
  let resolve, calls = 0;
  const store = createRoundDataStore(() => new Promise(done => { resolve = done; }));
  const unsubscribe = store.subscribe(() => calls++);
  const request = store.load('a', 1);
  unsubscribe(); store.cancel(); resolve({ snapshots: ['late'] }); await request;
  assert.equal(calls, 1);
  assert.deepEqual(store.getSnapshot().snapshots, []);
});
