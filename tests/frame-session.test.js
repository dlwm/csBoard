import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { createFrameSession } from '../src/collaboration/frameSession.js';
import { publishRoomFrames } from '../src/collaboration/roomFrames.js';

function fixture() {
  const calls = [];
  const live = { points: [{ id: 'edited' }], camera: { fov: 40 }, cameraSlots: [1] };
  const board = {
    getWorkspaceState: () => { calls.push(['capture']); return live; },
    finalizeFrameTween: () => calls.push(['finalize']),
    smoothRestoreFrame: (...args) => calls.push(['smooth', ...args]),
    restoreWorkspaceState: (...args) => calls.push(['restore', ...args]),
  };
  const session = createFrameSession({ getBoard: () => board,
    flushCollabSave: () => calls.push(['flush']), cancelPendingSave: () => calls.push(['cancel']),
    persistActiveArchiveFrames: (...args) => calls.push(['persist', ...args]),
    publishFramesToRoom: (...args) => calls.push(['publish', ...args]),
  });
  session.commitFrameState([{ id: 'a', workspace: {} }, { id: 'b', workspace: { points: [{ id: 'target' }] } }], 'a', { publish: false });
  return { session, calls, live };
}

test('frame switch captures outgoing content before publishing and restoring target', () => {
  const { session, calls } = fixture();
  session.switchFrame('b');
  assert.deepEqual(calls.map(call => call[0]), ['flush', 'finalize', 'capture', 'publish', 'persist', 'smooth']);
  const state = session.getSnapshot();
  assert.equal(state.activeFrameId, 'b');
  assert.equal(state.frames[0].workspace.points[0].id, 'edited');
  assert.equal(state.frames[0].workspace.camera, undefined);
  assert.equal(state.frames[0].workspace.cameraSlots, undefined);
  assert.deepEqual(calls.at(-1).slice(2), [false, null, true]);
  calls.length = 0;
  session.switchFrame('b');
  assert.equal(calls.length, 0);
});

test('insert, duplicate and delete maintain order and never remove the last frame', () => {
  const { session } = fixture();
  session.duplicateFrame();
  let state = session.getSnapshot();
  assert.equal(state.frames.length, 3);
  assert.equal(state.activeFrameId, state.frames[1].id);
  assert.equal(state.frames[1].workspace.points[0].id, 'edited');
  session.deleteFrame();
  assert.equal(session.getSnapshot().activeFrameId, 'a');
  session.insertFrame();
  state = session.getSnapshot();
  assert.equal(state.activeFrameId, state.frames.at(-1).id);
  assert.deepEqual(state.frames.at(-1).workspace.points, []);
  session.deleteFrame(); session.deleteFrame(); session.deleteFrame();
  assert.equal(session.getSnapshot().frames.length, 1);
});

test('remote commits do not echo and unsubscribe stops notifications', () => {
  const { session, calls } = fixture();
  let notifications = 0;
  const unsubscribe = session.subscribe(() => notifications++);
  session.commitFrameState([], null, { publish: false });
  assert.equal(notifications, 1);
  assert.equal(calls.length, 0);
  assert.equal(session.saveActiveFrame(), null);
  unsubscribe();
  session.commitFrameState([], null, { publish: false });
  assert.equal(notifications, 1);
});

test('external consumers cannot replace frame state through compatibility refs', () => {
  const { session } = fixture();
  assert.throws(() => { session.framesRef.current = []; }, TypeError);
  assert.throws(() => { session.activeFrameIdRef.current = 'other'; }, TypeError);
  assert.equal(session.getSnapshot().activeFrameId, 'a');
});

test('room publication is atomic, removes stale entries and skips unchanged writes', () => {
  const doc = new Y.Doc();
  doc.getMap('points').set('old', { id: 'old' });
  doc.getMap('frames').set('old', { id: 'old' });
  const frames = [{ id: 'a', workspace: { points: [{ id: 'p' }] } }];
  let updates = 0;
  doc.on('update', () => updates++);
  publishRoomFrames(doc, frames, 'a', frames[0].workspace);
  assert.equal(updates, 1);
  assert.deepEqual([...doc.getMap('frames').keys()], ['a']);
  assert.deepEqual([...doc.getMap('points').keys()], ['p']);
  assert.deepEqual(doc.getMap('room').get('frameOrder'), ['a']);
  publishRoomFrames(doc, frames, 'a');
  assert.equal(updates, 1);
  assert.equal(doc.getMap('activeFrame').get('id'), 'a');
  doc.destroy();
});
