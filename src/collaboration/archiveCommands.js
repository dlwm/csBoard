import { normalizeCollabWorkspace, normalizeFrames, emptyWorkspace } from './workspace.js';

// Archive rules are independent of dialogs, room synchronization and scene capture.
export function buildArchiveSave({ archives, workspace, targetId, targetName = '', mapName, saveArchiveMode, demo = null }) {
    const now = Date.now();
    let latestArchives = archives;
    // Rewrite older anonymous utilities through the compact schema so their
    // duplicated smoke journals do not keep consuming the storage quota.
    latestArchives = latestArchives.map((item) => ({
      ...item,
      workspace: item.workspace ? normalizeCollabWorkspace(item.workspace) : item.workspace,
      frames: Array.isArray(item.frames) ? item.frames.map((frame) => ({ ...frame, workspace: normalizeCollabWorkspace(frame.workspace) })) : item.frames,
    }));
    const existing = targetId ? latestArchives.find((item) => item.id === targetId) : null;
    if (targetId && !existing) return { error: 'missing' };
    if (existing && existing.mapName !== mapName) return;
    const currentFrameWorkspace = normalizeCollabWorkspace(workspace);
    const newFrame = { id: `frame-${now}-${Math.random().toString(16).slice(2, 8)}`, workspace: currentFrameWorkspace };
    // Row-level save is an explicit overwrite; the general save dialog still appends frames to an archive.
    const overwriteExisting = Boolean(existing && saveArchiveMode === 'overwrite');
    const savedFrames = existing && !overwriteExisting ? [...normalizeFrames(existing.frames, existing.workspace || emptyWorkspace()), newFrame] : [newFrame];
    const savedActiveFrameId = newFrame.id;
    const archiveWorkspace = { ...workspace, ...currentFrameWorkspace };
    let archive;
    let next;
    if (existing) {
      archive = { ...existing, savedAt: new Date().toISOString(), workspace: archiveWorkspace, mapName, map: mapName, frames: savedFrames, activeFrameId: savedActiveFrameId, demo: demo };
      next = latestArchives.map((item) => item.id === targetId ? archive : item);
    } else {
      if (!targetName.trim()) return;
      archive = { id: `${now}-${Math.random().toString(16).slice(2, 8)}`, savedAt: new Date().toISOString(), name: targetName.trim(), mapName, map: mapName, frames: savedFrames, activeFrameId: savedActiveFrameId, demo: demo, workspace: archiveWorkspace };
      next = [archive, ...latestArchives].slice(0, 30);
    }
    return { archive, next, savedFrames, savedActiveFrameId };
}
