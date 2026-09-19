import { emptyWorkspace, frameWorkspace } from './workspace.js';

// Owns frame selection and scene transition ordering. Storage and room transport are ports.
export function createFrameSession({ getBoard, flushCollabSave, cancelPendingSave, persistActiveArchiveFrames, publishFramesToRoom }) {
  let snapshot = { frames: [], activeFrameId: null };
  const framesRef = { current: [] };
  const activeFrameIdRef = { current: null };
  const listeners = new Set();
  const activeFrameWorkspace = () => getBoard()?.getWorkspaceState?.() || emptyWorkspace();
  const commitFrameState = (nextFrames, nextActiveId, { publish = true, workspaceForRoom = null } = {}) => {
    framesRef.current = nextFrames;
    activeFrameIdRef.current = nextActiveId;
    snapshot = { frames: nextFrames, activeFrameId: nextActiveId };
    listeners.forEach((listener) => listener());
    if (publish) publishFramesToRoom(nextFrames, nextActiveId, workspaceForRoom);
    return nextFrames;
  };
  const saveActiveFrame = (workspace, { publish = true } = {}) => {
    if (!framesRef.current.length || !activeFrameIdRef.current) return null;
    cancelPendingSave();
    getBoard()?.finalizeFrameTween?.();
    const snapshot = frameWorkspace(workspace ?? activeFrameWorkspace());
    const next = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: snapshot } : frame);
    commitFrameState(next, activeFrameIdRef.current, { publish, workspaceForRoom: snapshot });
    persistActiveArchiveFrames(next, activeFrameIdRef.current);
    return next;
  };
  const switchFrame = (frameId) => {
    if (frameId === activeFrameIdRef.current) return;
    flushCollabSave();
    getBoard()?.finalizeFrameTween?.();
    const outgoing = frameWorkspace(activeFrameWorkspace());
    const next = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: outgoing } : frame);
    const frame = next.find((item) => item.id === frameId);
    if (!frame) return;
    commitFrameState(next, frameId, { workspaceForRoom: frame.workspace || emptyWorkspace() });
    persistActiveArchiveFrames(next, frameId);
    getBoard()?.smoothRestoreFrame?.(frame.workspace || emptyWorkspace(), false, null, true);
  };
  const insertFrame = () => {
    flushCollabSave();
    getBoard()?.finalizeFrameTween?.();
    const outgoing = frameWorkspace(activeFrameWorkspace());
    const saved = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: outgoing } : frame);
    const id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const workspace = emptyWorkspace();
    const next = [...saved, { id, workspace }];
    commitFrameState(next, id, { workspaceForRoom: workspace });
    persistActiveArchiveFrames(next, id);
    getBoard()?.restoreWorkspaceState?.(workspace, false);
  };
  const duplicateFrame = () => {
    if (!framesRef.current.length) return;
    flushCollabSave();
    getBoard()?.finalizeFrameTween?.();
    const workspace = frameWorkspace(activeFrameWorkspace());
    const saved = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace } : frame);
    const active = saved.find((frame) => frame.id === activeFrameIdRef.current) || saved[0];
    const index = saved.indexOf(active);
    const id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const copy = { id, workspace };
    const next = [...saved.slice(0, index + 1), copy, ...saved.slice(index + 1)];
    commitFrameState(next, id, { workspaceForRoom: workspace });
    persistActiveArchiveFrames(next, id);
    getBoard()?.smoothRestoreFrame?.(copy.workspace, false, null, true);
  };
  const deleteFrame = () => {
    if (framesRef.current.length <= 1) return;
    flushCollabSave();
    const index = framesRef.current.findIndex((frame) => frame.id === activeFrameIdRef.current);
    const next = framesRef.current.filter((frame) => frame.id !== activeFrameIdRef.current);
    const nextActive = next[Math.max(0, index - 1)] || next[0];
    commitFrameState(next, nextActive.id, { workspaceForRoom: nextActive.workspace || emptyWorkspace() });
    persistActiveArchiveFrames(next, nextActive.id);
    getBoard()?.smoothRestoreFrame?.(nextActive.workspace || emptyWorkspace(), false, null, true);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    // Read-only compatibility views: callers may inspect but cannot replace session state.
    framesRef: { get current() { return snapshot.frames; } },
    activeFrameIdRef: { get current() { return snapshot.activeFrameId; } },
    commitFrameState, saveActiveFrame, switchFrame, insertFrame, duplicateFrame, deleteFrame,
  };
}
