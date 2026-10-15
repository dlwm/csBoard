import { normalizePlayerBaseColor } from '../../packages/viewer/src/data/playerColors.js';
import { createWorkspaceLayout } from '../../packages/viewer/src/data/workspace.js';
// Archive fields belong to this host; the library sees a neutral projection.
// 存档不迁移，只投影给公共 API；完整道具素材继续由宿主维护。
export function projectWorkspace(snapshot, context = {}) {
  return createWorkspaceLayout({ ...context,
    players: (snapshot.points || []).filter(p => p.kind === 'player').map(p => ({ id: p.id, name: p.name || p.id, team: p.team, position: p.position, rotationY: p.rotationY ?? 0, crouched: p.crouched ?? false, ...(p.baseColor ? { baseColor: normalizePlayerBaseColor(p.baseColor) } : {}) })),
    utilities: (snapshot.collabUtilities || []).map(u => ({ id: u.id, referenceId: u.noteId ?? null, kind: u.kind ?? null, position: [...u.position], effectPosition: u.effectPosition ? [...u.effectPosition] : null })),
    effects: (snapshot.grenades || []).map(e => ({ id: e.id, kind: e.type, position: [...e.position], range: e.range ?? 1 })),
  });
}
