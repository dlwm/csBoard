import { emptyWorkspace, frameWorkspace, normalizeCollabWorkspace, normalizeFrames } from './workspace.js';

// Resolve legacy frames and archive-level camera state without touching the current scene.
export function prepareArchiveRestore(storedArchive) {
    const restoredFrames = normalizeFrames(storedArchive.frames, storedArchive.workspace || emptyWorkspace());
    if (!restoredFrames.length) return;
    const active = restoredFrames.find((frame) => frame.id === storedArchive.activeFrameId) || restoredFrames[0];
    const canonicalArchive = { ...storedArchive, frames: restoredFrames, activeFrameId: active.id, workspace: { ...(storedArchive.workspace || {}), ...normalizeCollabWorkspace(storedArchive.workspace || active.workspace) } };
    const restoreWorkspace = { ...frameWorkspace(active.workspace || canonicalArchive.workspace), cameraSlots: canonicalArchive.workspace?.cameraSlots || [], camera: canonicalArchive.workspace?.camera || null };
    return { restoredFrames, active, canonicalArchive, restoreWorkspace, needsMigration: JSON.stringify(storedArchive.frames || []) !== JSON.stringify(restoredFrames) || JSON.stringify(storedArchive.workspace || {}) !== JSON.stringify(canonicalArchive.workspace) };
}
