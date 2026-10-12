import { createUtilityReferenceController } from '../../packages/viewer/src/core/utilityReferences.js';
// Native/IndexedDB note acquisition remains a host responsibility.
export function createApplicationUtilityReferences({ getNotes, mapName, toScene, scene, isEditable, readGuard, notify, commit }) {
  const source = {
    list({ query, offset, limit }) {
      const notes = getNotes().filter(n => n.mapName === mapName && `${n.name || ''} ${n.summary || ''}`.toLowerCase().includes(query.toLowerCase()));
      return { total: notes.length, items: notes.slice(offset, offset + limit).map(n => ({ referenceId: n.id, mapName, name: n.name, kind: n.grenadeType })) };
    },
    load(referenceId) {
      const note = getNotes().find(n => n.id === referenceId && n.mapName === mapName);
      if (!note) { const e = new Error('Utility reference was not found on this map'); e.code = 'not_found'; throw e; }
      return { asset: { referenceId, mapName, position: toScene(note.position), payload: note }, release() {} };
    },
  };
  return createUtilityReferenceController({ source, mapName, isEditable, readGuard, notify, commit,
    renderer: { getPlacements: scene.getPlacements, place: ({ id, asset, position }) => { scene.add(asset.payload, id, position); return { id }; }, move: scene.move, remove: scene.remove } });
}
