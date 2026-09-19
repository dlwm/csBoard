import test from 'node:test';
import assert from 'node:assert/strict';
import { createArchiveStore } from '../src/collaboration/archiveStore.js';
import { buildArchiveSave } from '../src/collaboration/archiveCommands.js';

test('startup cannot replace a newer session save with stale disk data', async () => {
  let finishLoad;
  const writes = [];
  const store = createArchiveStore({ initial: [], load: () => new Promise(resolve => { finishLoad = resolve; }), write: async value => writes.push(value) });
  const loading = store.initialize();
  const latest = [{ id: 'new' }];
  await store.persist(latest);
  finishLoad([{ id: 'old' }]);
  await loading;
  assert.equal(store.getSnapshot(), latest);
  assert.equal(writes.at(-1), latest);
});

test('writes stay ordered and recover after failure without dropping session data', async () => {
  const calls = [];
  const errors = [];
  const store = createArchiveStore({ initial: [], load: async () => [], write: async value => { calls.push(value); if (calls.length === 1) throw Error('quota'); }, onError: (_, phase) => errors.push(phase) });
  const first = store.persist([{ id: 'a' }]);
  const second = store.persist([{ id: 'b' }]);
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.deepEqual(calls.map(items => items[0].id), ['a', 'b']);
  assert.deepEqual(errors, ['write']);
  assert.equal(store.getSnapshot()[0].id, 'b');
  await store.remove('b');
  assert.deepEqual(store.getSnapshot(), []);
});

test('legacy data is cleaned only after a durable migration; cancelled load is ignored', async () => {
  let cleaned = 0;
  let fail = true;
  const initial = [{ id: 'legacy' }];
  const store = createArchiveStore({ initial, load: async () => undefined, write: async () => { if (fail) throw Error('quota'); }, cleanup: () => cleaned++ });
  await store.initialize();
  assert.equal(cleaned, 0);
  assert.equal(store.getSnapshot(), initial);
  fail = false;
  await store.initialize(() => true);
  assert.equal(cleaned, 0);
  await store.initialize();
  assert.equal(cleaned, 1);
});

test('new, append and overwrite preserve archive identity and frame selection rules', () => {
  const input = { archives: [], workspace: { points: [], camera: { fov: 40 } }, targetName: ' Test ', mapName: 'de_dust2' };
  const first = buildArchiveSave(input);
  assert.equal(first.archive.name, 'Test');
  assert.equal(first.archive.workspace.camera.fov, 40);
  const append = buildArchiveSave({ ...input, archives: first.next, targetId: first.archive.id });
  assert.equal(append.archive.id, first.archive.id);
  assert.equal(append.savedFrames.length, 2);
  assert.equal(append.savedActiveFrameId, append.savedFrames.at(-1).id);
  const overwrite = buildArchiveSave({ ...input, archives: append.next, targetId: first.archive.id, saveArchiveMode: 'overwrite' });
  assert.equal(overwrite.savedFrames.length, 1);
  assert.equal(append.savedFrames.length, 2);
  assert.equal(buildArchiveSave({ ...input, archives: first.next, targetId: first.archive.id, mapName: 'de_nuke' }), undefined);
  assert.equal(buildArchiveSave({ ...input, targetId: 'missing' }).error, 'missing');
  assert.equal(buildArchiveSave({ ...input, targetName: ' ' }), undefined);
});
