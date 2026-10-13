import * as THREE from 'three';
import { createGrenadeEffect, disposeGrenadeEffect } from '../src/three/grenadeEffects.js';
import { enableObjectFloorFade } from '../src/three/floorMaterial.js';
// Explicit demonstration asset, not a recorded smoke or a valid game lineup.
export const utilitySource = {
  list({ mapName, query, offset, limit }) {
    const items = mapName === 'de_dust2' && 'Demonstration flash'.toLowerCase().includes(query.toLowerCase())
      ? [{ referenceId: 'example-flash', mapName, name: 'Demonstration flash (illustrative)', kind: 'flash' }] : [];
    return { total: items.length, items: items.slice(offset, offset + limit) };
  },
  load(referenceId, { mapName }) {
    if (referenceId !== 'example-flash' || mapName !== 'de_dust2') throw new Error('Unknown demonstration reference');
    return { asset: { referenceId, mapName, position: [0, 0, 0], payload: { kind: 'flash', offset: [1, 1, 0] } }, release() {} };
  },
};
export function createUtilityRenderer({ scene, navData, floorState }) {
  const entries = new Map();
  const clear = () => { for (const { object } of entries.values()) { object.removeFromParent(); disposeGrenadeEffect(object); } entries.clear(); };
  return {
    place({ id, asset, position }) {
      const object = createGrenadeEffect(new THREE.Vector3(...position).add(new THREE.Vector3(...asset.payload.offset)), asset.payload.kind, navData, null);
      enableObjectFloorFade(object, floorState); scene.add(object);
      entries.set(id, { object, position: [...position], referenceId: asset.referenceId, kind: asset.payload.kind, offset: [...asset.payload.offset] }); return { id };
    },
    move({ id, position }) { const entry = entries.get(id); entry.object.position.fromArray(position).add(new THREE.Vector3(...entry.offset)); entry.position = [...position]; return { id }; },
    remove(id) { const entry = entries.get(id); entry.object.removeFromParent(); disposeGrenadeEffect(entry.object); entries.delete(id); return { id }; },
    getPlacements() { return [...entries].map(([id, entry]) => ({ id, referenceId: entry.referenceId, kind: entry.kind, position: [...entry.position], effectPosition: entry.position.map((n, i) => n + entry.offset[i]) })); },
    clear, dispose: clear,
  };
}
