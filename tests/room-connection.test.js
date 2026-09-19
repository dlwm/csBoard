import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { connectRoom } from '../src/collaboration/roomConnection.js';
import { prepareArchiveRestore } from '../src/collaboration/archiveRestore.js';

test('owner seeds a room once and repeated sync preserves remote edits', () => {
  const doc = new Y.Doc();
  const handlers = new Map();
  const noop = () => {};
  const provider = {
    awareness: { on: noop, off: noop, getStates: () => new Map(), setLocalStateField: noop },
    on: (event, fn) => handlers.set(event, fn), destroy: () => handlers.clear(),
  };
  let seed = { workspace: { points: [{ id: 'seed', kind: 'player' }] }, cameraSlots: [1] };
  const dispose = connectRoom({ doc, provider, roomCode: 'ABCDEF', getPorts: () => ({
    context: () => ({ language: 'en', name: 'owner', owner: true, mapName: 'de_dust2' }),
    attach: noop, detach: noop, scene: () => null,
    events: { activity: noop, users: noop, notice: noop, status: noop },
    frames: { read: () => ({ frames: [{ id: 'frame', workspace: {} }], activeFrameId: 'frame' }), replace: noop },
    seed: { read: () => seed, clear: () => { seed = null; } }, leave: noop, changeMap: noop,
  }) });
  handlers.get('sync')(true);
  assert.equal(doc.getMap('room').get('mapName'), 'de_dust2');
  assert.equal(doc.getMap('points').has('seed'), true);
  assert.equal(seed, null);
  doc.getMap('points').set('edited', { id: 'edited' });
  handlers.get('sync')(false);
  handlers.get('sync')(true);
  assert.equal(doc.getMap('points').has('edited'), true);
  dispose();
  assert.equal(handlers.size, 0);
});

test('archive restore selects frame content but keeps archive camera settings', () => {
  const archive = { id: 'archive', workspace: { camera: { fov: 30 }, cameraSlots: [1] }, frames: [
    { id: 'a', workspace: { points: [] } },
    { id: 'b', workspace: { points: [{ id: 'p', kind: 'player' }], camera: { fov: 90 } } },
  ], activeFrameId: 'b' };
  const result = prepareArchiveRestore(archive);
  assert.equal(result.active.id, 'b');
  assert.equal(result.restoreWorkspace.points[0].id, 'p');
  assert.equal(result.restoreWorkspace.camera.fov, 30);
  assert.deepEqual(result.restoreWorkspace.cameraSlots, [1]);
  assert.equal(result.restoredFrames[1].workspace.camera, undefined);
  assert.equal(archive.frames[1].workspace.camera.fov, 90);
  const legacy = prepareArchiveRestore({ workspace: { points: [] } });
  assert.equal(legacy.restoredFrames.length, 1);
  assert.equal(legacy.needsMigration, true);
});

test('remote frame updates do not echo; disposal releases presence and document', () => {
  const ref = current => ({ current });
  const doc = new Y.Doc();
  const remote = new Y.Doc();
  const handlers = new Map();
  const presence = new Map();
  let destroyed = false;
  const provider = {
    awareness: { on: (event, fn) => presence.set(event, fn), off: event => presence.delete(event), getStates: () => new Map(), setLocalStateField() {} },
    on: (event, fn) => handlers.set(event, fn),
    destroy: () => { destroyed = true; handlers.clear(); },
  };
  const calls = [];
  const roomDocRef = ref(null), roomProviderRef = ref(null), activeFrameIdRef = ref(null);
  const noop = () => {};
  const dispose = connectRoom({ doc, provider, roomCode: 'ABCDEF', getPorts: () => ({
    context: () => ({ language: 'en', name: 'test', owner: false, mapName: 'de_dust2' }),
    attach: (doc, provider) => { roomDocRef.current = doc; roomProviderRef.current = provider; },
    detach: () => { roomDocRef.current = null; roomProviderRef.current = null; },
    events: { activity: noop, users: noop, notice: noop, status: noop },
    scene: () => ({ restoreWorkspaceState: noop, smoothRestoreFrame: (...args) => calls.push(args) }),
    frames: { read: () => ({ frames: [], activeFrameId: activeFrameIdRef.current }), replace: (frames, id) => { activeFrameIdRef.current = id; } },
    seed: { read: () => null, clear: noop }, leave: noop, changeMap: noop,
  }) });
  remote.transact(() => {
    remote.getMap('frames').set('a', { id: 'a', workspace: { points: [] } });
    remote.getMap('activeFrame').set('id', 'a');
    remote.getMap('room').set('frameOrder', ['a']);
  });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
  assert.equal(activeFrameIdRef.current, 'a');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(1), [false, null, true]);
  dispose();
  assert.equal(destroyed, true);
  assert.equal(doc.isDestroyed, true);
  assert.equal(presence.size, 0);
  assert.equal(roomDocRef.current, null);
  assert.equal(roomProviderRef.current, null);
  remote.destroy();
});
