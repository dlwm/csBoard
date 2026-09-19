import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { readRoomWorkspace, publishRoomArchive } from '../src/collaboration/roomWorkspace.js';

test('restoring an archive publishes metadata and frames as a single remote revision', () => {
  const source = new Y.Doc(), peer = new Y.Doc();
  let updates = 0;
  source.on('update', update => {
    updates++;
    Y.applyUpdate(peer, update);
    assert.equal(peer.getMap('room').get('mapName'), 'de_nuke');
    assert.equal(peer.getMap('activeFrame').get('id'), 'frame');
    assert.equal(peer.getMap('frames').size, 1);
    assert.equal(peer.getMap('points').size, 1);
  });
  const workspace = { points: [{ id: 'p', kind: 'player' }], cameraSlots: [1] };
  publishRoomArchive(source, { mapName: 'de_nuke', workspace }, [{ id: 'frame', workspace }], 'frame', workspace);
  assert.equal(updates, 1);
  assert.deepEqual(peer.getMap('room').get('cameraSlots'), [1]);
  assert.equal(readRoomWorkspace(peer).cameraSlots, undefined);
  assert.equal(readRoomWorkspace(peer).points[0].id, 'p');
  source.destroy(); peer.destroy();
});

test('shared workspace reads legacy fallback only until initialized', () => {
  const doc = new Y.Doc();
  doc.getMap('room').set('workspace', { points: [{ id: 'legacy', kind: 'player' }], cameraSlots: [2] });
  assert.equal(readRoomWorkspace(doc).points[0].id, 'legacy');
  doc.getMap('room').set('workspaceInitialized', true);
  assert.deepEqual(readRoomWorkspace(doc).points, []);
  assert.equal(readRoomWorkspace(null), null);
  doc.destroy();
});
