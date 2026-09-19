import { prepareArchiveRestore } from './archiveRestore.js';
import { frameWorkspace } from './workspace.js';

// Capability ports hide React state and Yjs schema. Read fresh ports for every command.
// scene, frames, archives and room own their data; effects handles UI/Demo integration.
export function createWorkspaceSession(getPorts) {
  let suspended = null;
  let pending = null;
  const onReady = (board) => {
    const { scene, frames, room } = getPorts();
    scene.attach(board);
    const { mapName, enabled, ready } = scene.context();
    board.setCollabEditingEnabled?.(enabled);
    board.setCollabVisible?.(enabled);
    if (pending && pending.mapName === mapName && ready) {
      const active = pending.frames.find(frame => frame.id === pending.activeFrameId) || pending.frames[0];
      frames.replace(pending.frames, active.id);
      board.restoreWorkspaceState?.(pending.workspace || active.workspace, true);
      pending = null;
      return;
    }
    const shared = room.readWorkspace();
    if (shared) board.restoreWorkspaceState?.(shared, false);
  };
  const openRoom = () => {
    const { scene, frames, archives, room, effects } = getPorts();
    effects.flush();
    const workspace = scene.get()?.getWorkspaceState?.();
    if (!workspace) return;
    const current = frames.read();
    suspended = { archiveId: archives.active(), ...current };
    if (!current.frames.length || !current.activeFrameId) {
      const id = 'frame-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
      frames.replace([{ id, workspace: frameWorkspace(workspace) }], id);
    }
    const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    room.seed({ workspace: frameWorkspace(workspace), cameraSlots: workspace.cameraSlots || [] });
    archives.select(null);
    room.start(code, true);
    effects.notify('opened', code);
  };
  const leaveRoom = () => {
    const { frames, archives, room, effects } = getPorts();
    const owner = room.read().owner;
    room.stop(owner);
    effects.notify(owner ? 'destroyed' : 'left');
    archives.select(suspended?.archiveId || null);
    frames.replace(suspended?.frames || [], suspended?.activeFrameId || null);
    suspended = null;
  };
  const joinRoom = (value) => {
    const { scene, frames, archives, room, effects } = getPorts();
    const code = (value ?? room.read().joinCode).trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(code)) return;
    suspended = { archiveId: archives.active(), ...frames.read() };
    archives.select(null);
    frames.replace([], null);
    scene.get()?.clearWorkspaceState?.();
    room.start(code, false);
    effects.notify('joining', code);
  };
  const restoreWorkspaceArchive = (archive) => {
    const { scene, frames, archives, room, effects } = getPorts();
    const { code, owner } = room.read();
    if (code && !owner) return;
    effects.flush();
    const stored = archives.read().find(item => item.id === archive.id) || archive;
    const prepared = prepareArchiveRestore(stored);
    if (!prepared) return;
    const { restoredFrames, active, canonicalArchive, restoreWorkspace, needsMigration } = prepared;
    if (needsMigration) archives.persist(archives.read().map(item => item.id === canonicalArchive.id ? canonicalArchive : item));
    if (!code) archives.select(canonicalArchive.id);
    frames.replace(restoredFrames, active.id);
    pending = { ...canonicalArchive, workspace: restoreWorkspace };
    if (canonicalArchive.mapName !== scene.context().mapName) scene.changeMap(canonicalArchive.mapName);
    else if (scene.get()) {
      scene.get().restoreWorkspaceState?.(restoreWorkspace, true);
      pending = null;
    }
    effects.notify('restored', canonicalArchive);
    effects.restoreDemo(canonicalArchive.demo);
    if (owner) room.publishArchive(canonicalArchive, restoredFrames, active.id, restoreWorkspace);
  };
  return { openRoom, leaveRoom, joinRoom, restoreWorkspaceArchive, onReady };
}
