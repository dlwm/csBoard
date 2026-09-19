import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceSession } from '../src/collaboration/workspaceSession.js';

function fixture() {
  const calls = [];
  const ref = current => ({ current });
  const runtime = {
    boardRef: ref({ getWorkspaceState: () => ({ points: [], cameraSlots: [1] }), clearWorkspaceState: () => calls.push('clear'), restoreWorkspaceState: () => calls.push('restore') }),
    activeArchiveId: 'local', framesRef: ref([{ id: 'local-frame', workspace: {} }]), activeFrameIdRef: ref('local-frame'),
    roomSeedRef: ref(null), roomDocRef: ref(null), roomOwner: false, roomCode: '', roomJoinCode: '',
    mapName: 'de_dust2', navData: {}, activePanel: 'collab', hasActiveFrameContext: true,
    archivesRef: ref([]), demoData: null, t: key => key,
    flushCollabSave: () => calls.push('flush'),
    commitFrameState: (frames, id, options) => { assert.equal(options.publish, false); runtime.framesRef.current = frames; runtime.activeFrameIdRef.current = id; },
    setActiveArchiveId: id => { runtime.activeArchiveId = id; },
    setRoomCode: code => { runtime.roomCode = code; }, setRoomOwner: owner => { runtime.roomOwner = owner; },
    setRoomStatus: () => {}, setMapName: map => { runtime.mapName = map; },
    persistWorkspaceArchives: () => {}, publishFramesToRoom: () => {},
  };
  const ports = {
    scene: { get: () => runtime.boardRef.current, attach: board => { runtime.boardRef.current = board; }, context: () => ({ mapName: runtime.mapName, ready: Boolean(runtime.navData), enabled: true }), changeMap: runtime.setMapName },
    frames: { read: () => ({ frames: runtime.framesRef.current, activeFrameId: runtime.activeFrameIdRef.current }), replace: (items, id) => runtime.commitFrameState(items, id, { publish: false }) },
    archives: { read: () => runtime.archivesRef.current, active: () => runtime.activeArchiveId, select: runtime.setActiveArchiveId, persist: runtime.persistWorkspaceArchives },
    room: {
      read: () => ({ code: runtime.roomCode, owner: runtime.roomOwner, joinCode: runtime.roomJoinCode }),
      start: (code, owner) => { runtime.setRoomCode(code); runtime.setRoomOwner(owner); },
      stop: owner => { if (owner) runtime.roomDocRef.current?.getMap('room').set('closed', true); runtime.setRoomCode(''); runtime.setRoomOwner(false); },
      seed: seed => { runtime.roomSeedRef.current = seed; }, readWorkspace: () => null, publishArchive: () => {},
    },
    effects: { flush: runtime.flushCollabSave, notify: () => {}, restoreDemo: () => {} },
  };
  return { runtime, calls, ports, session: createWorkspaceSession(() => ports) };
}

test('joining and leaving preserve the suspended local frame session', () => {
  const { session, runtime, calls } = fixture();
  session.joinRoom('invalid');
  assert.equal(runtime.activeArchiveId, 'local');
  session.joinRoom(' abc123 ');
  assert.equal(runtime.roomCode, 'ABC123');
  assert.equal(runtime.activeArchiveId, null);
  assert.equal(runtime.framesRef.current.length, 0);
  assert.deepEqual(calls, ['clear']);
  session.leaveRoom();
  assert.equal(runtime.roomCode, '');
  assert.equal(runtime.activeArchiveId, 'local');
  assert.equal(runtime.activeFrameIdRef.current, 'local-frame');
});

test('owner seeds camera slots separately from frames and closes the room on leave', () => {
  const { session, runtime } = fixture();
  session.openRoom();
  assert.match(runtime.roomCode, /^[0-9A-F]{6}$/);
  assert.equal(runtime.roomOwner, true);
  assert.deepEqual(runtime.roomSeedRef.current.cameraSlots, [1]);
  assert.equal(runtime.roomSeedRef.current.workspace.cameraSlots, undefined);
  const room = new Map();
  runtime.roomDocRef.current = { getMap: () => room };
  session.leaveRoom();
  assert.equal(room.get('closed'), true);
});

test('cross-map archive restoration waits for the matching ready scene and runs once', () => {
  const { session, runtime, calls } = fixture();
  const archive = { id: 'other', mapName: 'de_nuke', workspace: { points: [], camera: { fov: 40 } } };
  session.restoreWorkspaceArchive(archive);
  assert.equal(runtime.mapName, 'de_nuke');
  assert.equal(calls.includes('restore'), false);
  const board = runtime.boardRef.current;
  runtime.mapName = 'de_dust2';
  session.onReady(board);
  assert.equal(calls.includes('restore'), false);
  runtime.mapName = 'de_nuke';
  session.onReady(board);
  session.onReady(board);
  assert.equal(calls.filter(call => call === 'restore').length, 1);
});

test('guests cannot restore local archives into a shared room', () => {
  const { session, runtime, calls } = fixture();
  runtime.roomCode = 'ABC123';
  session.restoreWorkspaceArchive({ id: 'other', mapName: 'de_nuke' });
  assert.equal(runtime.activeArchiveId, 'local');
  assert.deepEqual(calls, []);
});
