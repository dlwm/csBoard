// Owns imported collaboration utility effects, trajectories, serialization, and cleanup.
import * as THREE from 'three';
import { grenadeKind } from '../demo/grenades.js';
import { createGrenadeEffect } from './grenadeEffects.js';
import { enableObjectFloorFade } from './floorFade.js';
import { createSmokeVoxelVolume, SMOKE_VOLUME_SCALE } from './smokeVoxelVolume.js';
import { createInfernoEffect, updateInfernoEffect } from './infernoEffect.js';

export default function createCollabUtilitySceneController({ scene, navData, editingRef, floorFadeRef, getModelCenter, getNav, pushHistory, notifyEdit }) {
  const group = new THREE.Group();
  const utilities = [];
  let previewUtility = null;
  let playback = null;
  scene.add(group);

  const noteWorldPosition = (note) => {
    const [x, y, z] = note?.position || [0, 0, 0];
    const modelCenter = getModelCenter();
    return new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
  };

  const noteEffectData = (note, kind, savedEffectPosition = null) => {
    const modelCenter = getModelCenter();
    const normalizedKind = grenadeKind(kind || note?.grenadeType || 'smoke');
    const effectKind = normalizedKind === 'he' ? 'explosion' : normalizedKind;
    const projectiles = (note?.replay?.projectiles || []).filter((record) => record.x != null && record.y != null && record.z != null).sort((left, right) => Number(left.tick) - Number(right.tick));
    const landing = [...(note?.replay?.events || [])].reverse().find((event) => event.event_name !== 'grenade_thrown' && event.x != null && event.y != null && event.z != null);
    const endpoint = landing || projectiles.at(-1);
    const effectPosition = savedEffectPosition
      ? new THREE.Vector3().fromArray(savedEffectPosition)
      : endpoint
        ? new THREE.Vector3(endpoint.y * 0.0254 - modelCenter.x, endpoint.z * 0.0254 - modelCenter.y, endpoint.x * 0.0254 - modelCenter.z)
        : noteWorldPosition(note);
    const recordedSmokeFrame = normalizedKind === 'smoke'
      ? [...(note?.replay?.smokeVoxelFrames || [])].filter((frame) => frame?.voxels?.length).sort((left, right) => left.tick - right.tick).at(-1)
      : null;
    const recordedInfernoFrame = normalizedKind === 'fire'
      ? [...(note?.replay?.infernoFrames || [])].filter((frame) => frame?.cells?.length).sort((left, right) => left.tick - right.tick).at(-1)
      : null;
    return { effectKind, effectPosition, projectiles, recordedSmokeFrame, recordedInfernoFrame };
  };

  // Trajectory samples and the final smoke frame already live on the collaboration item.
  // Removing replay copies still matters in IndexedDB: duplicated voxel journals
  // inflate structured-clone time, disk use, exports, and collaboration payloads.
  const compactAnonymousSourceNote = (note) => {
    if (!note) return null;
    const { id: _id, name: _name, summary: _summary, ...sourceNote } = note;
    const { projectiles: _projectiles, smokeVoxelFrames: _smokeVoxelFrames, infernoFrames: _infernoFrames, ...replay } = sourceNote.replay || {};
    return { ...sourceNote, replay };
  };

  const create = (note, itemId, kind, originPosition, savedEffectPosition = null) => {
    const utility = new THREE.Group();
    const modelCenter = getModelCenter();
    const { effectKind, effectPosition, projectiles, recordedSmokeFrame, recordedInfernoFrame } = noteEffectData(note, kind, savedEffectPosition);
    // Collaboration is a static tactical view: use the latest recorded journal
    // frame so imported Demo smokes retain their environment-shaped silhouette.
    const effect = recordedSmokeFrame
      ? createSmokeVoxelVolume({ ...recordedSmokeFrame, voxels: Uint16Array.from(recordedSmokeFrame.voxels) }, modelCenter)
      : recordedInfernoFrame
        ? createInfernoEffect({ ...recordedInfernoFrame, cells: Float32Array.from(recordedInfernoFrame.cells) }, modelCenter, getNav())
      : createGrenadeEffect(effectPosition, effectKind, navData, getNav());
    if (recordedSmokeFrame) effect.scale.setScalar(SMOKE_VOLUME_SCALE);
    const resolvedEffectPosition = effect.position.clone();
    effect.position.sub(originPosition);
    effect.userData.collabUtilityEffect = true;
    enableObjectFloorFade(effect, floorFadeRef.current);
    utility.add(effect);
    if (projectiles.length >= 2) {
      // Trajectory points are stored relative to the group so imported utilities remain movable.
      const points = projectiles.map((record) => new THREE.Vector3(record.y * 0.0254 - modelCenter.x, record.z * 0.0254 - modelCenter.y, record.x * 0.0254 - modelCenter.z).sub(originPosition));
      const trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#c58cff', transparent: true, opacity: 0.9 }));
      trajectory.userData.collabUtilityTrajectory = true;
      trajectory.userData.collabUtilityTrajectoryPoints = points;
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
    utility.userData.utilityEffectPosition = resolvedEffectPosition.toArray();
    utility.userData.utilityProjectiles = projectiles.map((record) => ({ ...record }));
    utility.userData.utilityTickRate = Number(note?.replay?.tickRate) || 64;
    utility.userData.utilityThrowTick = Number(note?.replay?.throwTick);
    utility.userData.utilityEffectTick = Number(note?.replay?.effectTick);
    utility.userData.utilityEndTick = Number(note?.replay?.endTick);
    utility.userData.utilityEffectScale = effect.scale.clone();
    utility.userData.utilitySmokeVoxelFrame = recordedSmokeFrame ? { ...recordedSmokeFrame, voxels: Array.from(recordedSmokeFrame.voxels) } : null;
    utility.userData.utilityInfernoFrame = recordedInfernoFrame ? { ...recordedInfernoFrame, cells: Array.from(recordedInfernoFrame.cells) } : null;
    utility.userData.anonymousUtility = false;
    utility.userData.sourceNote = null;
    return utility;
  };

  // Demo-frame utilities are portable collaboration items before the user gives them a title and description.
  const serializeAnonymous = (note, itemId) => {
    if (!note) return null;
    const origin = noteWorldPosition(note);
    const { effectKind, effectPosition, projectiles, recordedSmokeFrame, recordedInfernoFrame } = noteEffectData(note);
    return {
      id: itemId,
      noteId: null,
      noteName: '',
      noteSummary: '',
      kind: effectKind,
      position: origin.toArray(),
      effectPosition: effectPosition.toArray(),
      projectiles: projectiles.map((record) => ({ ...record })),
      smokeVoxelFrame: recordedSmokeFrame ? { ...recordedSmokeFrame, voxels: Array.from(recordedSmokeFrame.voxels) } : null,
      infernoFrame: recordedInfernoFrame ? { ...recordedInfernoFrame, cells: Array.from(recordedInfernoFrame.cells) } : null,
      anonymous: true,
      sourceNote: compactAnonymousSourceNote(note),
    };
  };

  const disposeUtility = (utility) => {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    utility.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
      if (object.userData.smokeDensityTexture) textures.add(object.userData.smokeDensityTexture);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    utility.removeFromParent();
  };

  const clearPreview = () => {
    if (!previewUtility) return;
    disposeUtility(previewUtility);
    previewUtility = null;
  };

  const preview = (note) => {
    clearPreview();
    if (!note) return null;
    const origin = noteWorldPosition(note);
    previewUtility = create(note, `collab-preview-${note.id || 'utility'}`, undefined, origin);
    previewUtility.position.copy(origin);
    previewUtility.userData.collabUtilityPreview = true;
    // Preview independently from Collaboration visibility so Utility Notes can
    // inspect the landing effect without revealing the active tactical frame.
    scene.add(previewUtility);
    previewUtility.updateMatrixWorld(true);
    const effect = previewUtility.userData.collabUtilityEffect;
    const bounds = new THREE.Box3().setFromObject(effect);
    const focus = bounds.isEmpty() ? effect.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3());
    return { focus: focus.toArray() };
  };

  const focus = (itemId) => {
    const utility = utilities.find((candidate) => candidate.userData.collabUtilityId === itemId);
    const effect = utility?.userData.collabUtilityEffect;
    if (!effect) return null;
    effect.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(effect);
    const point = bounds.isEmpty() ? effect.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3());
    return { focus: point.toArray() };
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
    playback = null;
    clearPreview();
    utilities.forEach(disposeUtility);
    utilities.length = 0;
  };

  const restore = (items = [], notes = []) => {
    clear();
    items.forEach((item) => {
      const origin = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
      const note = notes.find((candidate) => candidate.id === item.noteId);
      // Persisted metadata keeps utilities usable even if the source note was deleted locally.
      const embeddedNote = item.sourceNote || {};
      const sourceNote = { ...embeddedNote, ...(note || {}), name: note?.name || item.noteName || '', summary: note?.summary || item.noteSummary || '', grenadeType: note?.grenadeType || embeddedNote.grenadeType || item.kind, replay: { tickRate: item.tickRate, throwTick: item.throwTick, effectTick: item.effectTick, endTick: item.endTick, ...(embeddedNote.replay || {}), ...(note?.replay || {}), projectiles: item.projectiles || note?.replay?.projectiles || embeddedNote.replay?.projectiles || [], smokeVoxelFrames: item.smokeVoxelFrame ? [item.smokeVoxelFrame] : note?.replay?.smokeVoxelFrames || embeddedNote.replay?.smokeVoxelFrames || [], infernoFrames: item.infernoFrame ? [item.infernoFrame] : note?.replay?.infernoFrames || embeddedNote.replay?.infernoFrames || [] } };
      const utility = create(sourceNote, item.id, item.kind, origin, item.effectPosition);
      utility.userData.anonymousUtility = item.anonymous === true;
      utility.userData.sourceNote = item.anonymous === true ? {
        ...embeddedNote,
        replay: { ...(embeddedNote.replay || {}), projectiles: item.projectiles || [], smokeVoxelFrames: item.smokeVoxelFrame ? [item.smokeVoxelFrame] : [], infernoFrames: item.infernoFrame ? [item.infernoFrame] : [] },
      } : null;
      utility.position.copy(origin);
      group.add(utility);
      utilities.push(utility);
    });
  };

  const promote = (itemId, note) => {
    if (!itemId || !note || !editingRef.current) return false;
    const utility = utilities.find((candidate) => candidate.userData.collabUtilityId === itemId);
    if (!utility) return false;
    pushHistory();
    utility.userData.noteId = note.id;
    utility.userData.noteName = note.name;
    utility.userData.noteSummary = note.summary;
    utility.userData.anonymousUtility = false;
    utility.userData.sourceNote = null;
    notifyEdit();
    return true;
  };

  const play = () => {
    const entries = utilities.map((utility) => {
      const trajectory = utility.children.find((child) => child.userData.collabUtilityTrajectory);
      const points = trajectory?.userData.collabUtilityTrajectoryPoints || [];
      const effect = utility.userData.collabUtilityEffect;
      if (!trajectory || points.length < 2 || !effect) return null;
      const projectiles = utility.userData.utilityProjectiles || [];
      const sampleTicks = projectiles.map((record) => Number(record.tick));
      const firstSampleTick = sampleTicks[0];
      const lastSampleTick = sampleTicks.at(-1);
      const tickRate = utility.userData.utilityTickRate || 64;
      const recordedThrowTick = utility.userData.utilityThrowTick;
      const recordedEffectTick = utility.userData.utilityEffectTick;
      const startTick = Number.isFinite(recordedThrowTick) ? Math.min(recordedThrowTick, firstSampleTick) : firstSampleTick;
      const effectTick = Number.isFinite(recordedEffectTick) && recordedEffectTick >= firstSampleTick ? recordedEffectTick : lastSampleTick;
      const endTick = Number.isFinite(utility.userData.utilityEndTick) ? Math.max(effectTick, utility.userData.utilityEndTick) : effectTick;
      const flightDuration = Math.max(0, ((effectTick - startTick) / tickRate) * 1000);
      if (!Number.isFinite(flightDuration) || flightDuration <= 0) return null;
      let projectile = utility.children.find((child) => child.userData.collabUtilityProjectile);
      if (!projectile) {
        projectile = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: '#efe8ff', depthWrite: false }));
        projectile.userData.collabUtilityProjectile = true;
        utility.add(projectile);
      }
      trajectory.geometry.setDrawRange(0, 0);
      projectile.position.copy(points[0]);
      projectile.visible = true;
      effect.visible = false;
      effect.scale.copy(utility.userData.utilityEffectScale);
      return { utility, trajectory, points, sampleTicks, projectile, effect, tickRate, startTick, firstSampleTick, effectTick, endTick, flightDuration };
    }).filter(Boolean);
    playback = entries.length ? { startedAt: performance.now(), entries } : null;
  };

  const update = (now = performance.now()) => {
    utilities.forEach((utility) => {
      if (utility.userData.utilityKind === 'fire' && utility.userData.utilityInfernoFrame) updateInfernoEffect(utility.userData.collabUtilityEffect, now / 1000 * 64);
    });
    if (!playback) return;
    let complete = true;
    playback.entries.forEach((entry) => {
      const elapsed = now - playback.startedAt;
      const currentTick = entry.startTick + elapsed * entry.tickRate / 1000;
      let upperIndex = entry.sampleTicks.findIndex((tick) => tick >= currentTick);
      if (upperIndex < 0) upperIndex = entry.sampleTicks.length - 1;
      const lowerIndex = Math.max(0, upperIndex - 1);
      const lowerTick = entry.sampleTicks[lowerIndex];
      const upperTick = entry.sampleTicks[upperIndex];
      const sampleAmount = upperTick > lowerTick ? THREE.MathUtils.clamp((currentTick - lowerTick) / (upperTick - lowerTick), 0, 1) : 0;
      entry.projectile.position.lerpVectors(entry.points[lowerIndex], entry.points[upperIndex], sampleAmount);
      entry.projectile.visible = currentTick >= entry.firstSampleTick && currentTick < entry.effectTick;
      entry.trajectory.geometry.setDrawRange(0, currentTick >= entry.firstSampleTick ? Math.max(2, upperIndex + 1) : 0);
      if (currentTick < entry.effectTick) { complete = false; return; }
      entry.projectile.visible = false;
      entry.effect.visible = true;
      if (entry.utility.userData.utilityKind === 'smoke') {
        const growthTicks = Math.max(1, entry.endTick - entry.effectTick);
        const growth = THREE.MathUtils.smoothstep((currentTick - entry.effectTick) / growthTicks, 0, 1);
        entry.effect.scale.copy(entry.utility.userData.utilityEffectScale).multiplyScalar(0.18 + growth * 0.82);
        if (growth < 1) complete = false;
      }
    });
    if (complete) playback = null;
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
    tickRate: utility.userData.utilityTickRate,
    throwTick: Number.isFinite(utility.userData.utilityThrowTick) ? utility.userData.utilityThrowTick : undefined,
    effectTick: Number.isFinite(utility.userData.utilityEffectTick) ? utility.userData.utilityEffectTick : undefined,
    endTick: Number.isFinite(utility.userData.utilityEndTick) ? utility.userData.utilityEndTick : undefined,
    // One final frame is enough for the static collaboration view and keeps room payloads small.
    smokeVoxelFrame: utility.userData.utilitySmokeVoxelFrame,
    infernoFrame: utility.userData.utilityInfernoFrame,
    anonymous: utility.userData.anonymousUtility === true,
    sourceNote: utility.userData.anonymousUtility === true ? compactAnonymousSourceNote(utility.userData.sourceNote) : undefined,
  }));

  const dispose = () => {
    clear();
    scene.remove(group);
  };

  return { add, remove, promote, clear, preview, focus, clearPreview, restore, play, update, serialize, serializeAnonymous, setVisible: (visible) => { group.visible = visible !== false; }, dispose };
}
