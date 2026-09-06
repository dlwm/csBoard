// Owns imported collaboration utility effects, trajectories, serialization, and cleanup.
import * as THREE from 'three';
import { grenadeKind } from '../demo/grenades.js';
import { createGrenadeEffect } from './grenadeEffects.js';
import { enableObjectFloorFade } from './floorFade.js';

export default function createCollabUtilitySceneController({ scene, navData, editingRef, floorFadeRef, getModelCenter, getNav, pushHistory, notifyEdit }) {
  const group = new THREE.Group();
  const utilities = [];
  scene.add(group);

  const noteWorldPosition = (note) => {
    const [x, y, z] = note?.position || [0, 0, 0];
    const modelCenter = getModelCenter();
    return new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
  };

  const create = (note, itemId, kind, originPosition, savedEffectPosition = null) => {
    const utility = new THREE.Group();
    const modelCenter = getModelCenter();
    const normalizedKind = grenadeKind(kind || note?.grenadeType || 'smoke');
    const effectKind = normalizedKind === 'he' ? 'explosion' : normalizedKind;
    const projectiles = (note?.replay?.projectiles || []).filter((record) => record.x != null && record.y != null && record.z != null);
    const landing = [...(note?.replay?.events || [])].reverse().find((event) => event.event_name !== 'grenade_thrown' && event.x != null && event.y != null && event.z != null);
    const endpoint = landing || projectiles.at(-1);
    const effectPosition = savedEffectPosition
      ? new THREE.Vector3().fromArray(savedEffectPosition)
      : endpoint
        ? new THREE.Vector3(endpoint.y * 0.0254 - modelCenter.x, endpoint.z * 0.0254 - modelCenter.y, endpoint.x * 0.0254 - modelCenter.z)
        : originPosition.clone();
    const effect = createGrenadeEffect(effectPosition, effectKind, navData, getNav());
    effect.position.sub(originPosition);
    effect.userData.collabUtilityEffect = true;
    enableObjectFloorFade(effect, floorFadeRef.current);
    utility.add(effect);
    if (projectiles.length >= 2) {
      // Trajectory points are stored relative to the group so imported utilities remain movable.
      const points = projectiles.map((record) => new THREE.Vector3(record.y * 0.0254 - modelCenter.x, record.z * 0.0254 - modelCenter.y, record.x * 0.0254 - modelCenter.z).sub(originPosition));
      const trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#c58cff', transparent: true, opacity: 0.9 }));
      trajectory.userData.collabUtilityTrajectory = true;
      enableObjectFloorFade(trajectory, floorFadeRef.current);
      utility.add(trajectory);
    }
    utility.userData.collabUtility = true;
    utility.userData.collabUtilityId = itemId;
    utility.userData.noteId = note?.id;
    utility.userData.noteName = note?.name || '';
    utility.userData.noteSummary = note?.summary || '';
    utility.userData.utilityKind = effectKind;
    utility.userData.collabUtilityEffect = effect;
    utility.userData.utilityEffectPosition = effectPosition.toArray();
    utility.userData.utilityProjectiles = projectiles.map((record) => ({ ...record }));
    return utility;
  };

  const disposeUtility = (utility) => {
    const geometries = new Set();
    const materials = new Set();
    utility.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    utility.removeFromParent();
  };

  const add = (note, itemId) => {
    if (!note || !editingRef.current) return undefined;
    pushHistory();
    const origin = noteWorldPosition(note);
    const utility = create(note, itemId || `collab-util-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, undefined, origin);
    utility.position.copy(origin);
    group.add(utility);
    utilities.push(utility);
    notifyEdit();
    return utility;
  };

  const remove = (itemId) => {
    if (!itemId || !editingRef.current) return;
    const index = utilities.findIndex((utility) => utility.userData.collabUtilityId === itemId);
    if (index < 0) return;
    pushHistory();
    disposeUtility(utilities.splice(index, 1)[0]);
    notifyEdit();
  };

  const clear = () => {
    utilities.forEach(disposeUtility);
    utilities.length = 0;
  };

  const restore = (items = [], notes = []) => {
    clear();
    items.forEach((item) => {
      const origin = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
      const note = notes.find((candidate) => candidate.id === item.noteId);
      // Persisted metadata keeps utilities usable even if the source note was deleted locally.
      const sourceNote = { ...(note || { name: item.noteName, summary: item.noteSummary, grenadeType: item.kind }), replay: { ...(note?.replay || {}), projectiles: item.projectiles || note?.replay?.projectiles || [] } };
      const utility = create(sourceNote, item.id, item.kind, origin, item.effectPosition);
      utility.position.copy(origin);
      group.add(utility);
      utilities.push(utility);
    });
  };

  const serialize = () => utilities.map((utility) => ({
    id: utility.userData.collabUtilityId,
    noteId: utility.userData.noteId,
    noteName: utility.userData.noteName,
    noteSummary: utility.userData.noteSummary,
    kind: utility.userData.utilityKind,
    position: utility.position.toArray(),
    effectPosition: utility.userData.utilityEffectPosition,
    projectiles: utility.userData.utilityProjectiles || [],
  }));

  const dispose = () => {
    clear();
    scene.remove(group);
  };

  return { add, remove, clear, restore, serialize, setVisible: (visible) => { group.visible = visible !== false; }, dispose };
}
