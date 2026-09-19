import { normalizeCollabWorkspace, frameWorkspace } from './workspace.js';
import { publishRoomFrames } from './roomFrames.js';

// Keep Yjs collections out of the session's plain-data protocol.
export function readRoomWorkspace(doc) {
  if (!doc) return null;
  const room = doc.getMap('room');
  const fallback = room.get('workspace');
  const initialized = room.get('workspaceInitialized') === true;
  const read = (map, field) => initialized ? [...doc.getMap(map).values()] : fallback?.[field] || [];
  return normalizeCollabWorkspace({
    points: read('points', 'points'), paths: read('paths', 'paths'),
    grenades: read('grenades', 'grenades'), collabUtilities: read('utilities', 'collabUtilities'),
    brushStrokes: read('brushes', 'brushStrokes'),
    cameraSlots: room.get('cameraSlots') || fallback?.cameraSlots || [],
  });
}

export function publishRoomArchive(doc, archive, frames, activeFrameId, workspace) {
  if (!doc) return;
  const room = doc.getMap('room');
  // Peers must see metadata and frame content together, never half a restore.
  doc.transact(() => {
    room.set('mapName', archive.mapName);
    room.set('cameraSlots', archive.workspace?.cameraSlots || []);
    room.set('workspaceInitialized', true);
    room.set('revision', Number(room.get('revision') || 0) + 1);
    publishRoomFrames(doc, frames, activeFrameId, frameWorkspace(workspace));
  });
}
