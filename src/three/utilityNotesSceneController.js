// Owns clustered utility-note pins, visibility, rebuild detection, and cleanup.
import * as THREE from 'three';
import { utilityPositionClusters } from '../utility/notes.js';
import { createUtilityTrajectory, utilityTrajectoryPoint } from './utilityTrajectory.js';
import { createRecordedUtilityEffect } from './recordedUtilityEffect.js';

export default function createUtilityNotesSceneController({ scene, refs, floorFadeRef, getModelCenter, getCollisionVersion, getNav, navData }) {
  const group = new THREE.Group();
  const markers = new Map();
  const trajectories = new THREE.Group(), effects = new THREE.Group();
  let effectsBuilt = false;
  group.add(trajectories, effects);
  let lastNotes = [], lastCollision = -1, lastPlayingNoteId = null;
  scene.add(group);

  const clear = () => {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      object.userData.smokeDensityTexture?.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    group.clear();
    markers.clear();
    trajectories.clear(); effects.clear(); effectsBuilt = false;
    group.add(trajectories, effects);
    lastNotes = []; lastCollision = -1;
  };

  const updateEffects = notes => {
    if (effects.visible && !effectsBuilt) {
      notes.forEach(note => {
        const effect = createRecordedUtilityEffect(note, { modelCenter: getModelCenter(), nav: getNav(), navData, floorFade: floorFadeRef?.current, requireRecordedVolumes: true });
        if (effect) { effect.userData.utilityNoteId = note.id; effects.add(effect); }
      });
      effectsBuilt = true;
    }
    effects.children.forEach(effect => { effect.visible = effect.userData.utilityNoteId !== refs.playingNoteId?.current; });
  };

  const update = () => {
    group.visible = Boolean(refs.enabled.current);
    if (!group.visible) {
      if (markers.size || lastNotes.length) clear();
      return;
    }
    trajectories.visible = refs.display?.current?.trajectories !== false;
    effects.visible = refs.display?.current?.effects !== false;
    const notes = refs.notes.current || [];
    const collision = getCollisionVersion();
    // Immutable records allow a cheap identity check, without hashing voxel or
    // trajectory arrays on every playback frame. 开关只改可见性，不重建几何。
    const playingNoteId = refs.playingNoteId?.current;
    const unchanged = collision === lastCollision && playingNoteId === lastPlayingNoteId && notes.length === lastNotes.length && notes.every((note, index) => note === lastNotes[index]);
    if (unchanged) { updateEffects(notes); return; }
    clear();
    const modelCenter = getModelCenter();
    utilityPositionClusters(notes).forEach(({ entries, key }) => {
      const [sourceX, sourceY, sourceZ] = entries[0].position;
      const marker = new THREE.Group();
      marker.position.set(sourceY * 0.0254 - modelCenter.x, sourceZ * 0.0254 - modelCenter.y + 0.05, sourceX * 0.0254 - modelCenter.z);
      marker.userData.utilityPositionKey = key;
      marker.userData.utilityEntries = entries;
      const material = new THREE.MeshStandardMaterial({ color: '#c58cff', emissive: '#30134e', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.12, depthTest: true, depthWrite: true });
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 20), material);
      pin.position.y = 0.34;
      pin.rotation.x = Math.PI;
      pin.renderOrder = 4;
      pin.userData.utilityMarker = true;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#dfb8ff', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.06;
      halo.renderOrder = 5;
      halo.userData.utilityMarker = true;
      marker.add(pin, halo);
      group.add(marker);
      markers.set(key, marker);
    });
    const pathPositions = [], pathColors = [];
    const colorByKind = { smoke: '#b9c7d6', fire: '#ff7a45', flash: '#fff3a6', he: '#ffb36b', decoy: '#c8d0d4' };
    const valid = point => point && [point.x, point.y, point.z].every(Number.isFinite);
    const world = point => utilityTrajectoryPoint(point, modelCenter, { source: true }).toArray();
    const edge = (positions, colors, from, to, color) => { positions.push(...from, ...to); colors.push(color.r, color.g, color.b, color.r, color.g, color.b); };
    notes.forEach(note => {
      // Playing notes use the same growing trajectory as Match Replay. Hide
      // their full static overview until playback ends. 播放时不预先展示整条路径。
      if (note.id === playingNoteId) return;
      const color = new THREE.Color(colorByKind[note.grenadeType] || '#c58cff');
      const samples = note.replay?.projectiles || [];
      const path = samples.slice().sort((a, b) => a.tick - b.tick);
      for (let index = 1; index < path.length; index++) {
        // Missing samples split a path; do not draw invented bridges over them.
        if (valid(path[index - 1]) && valid(path[index])) edge(pathPositions, pathColors, world(path[index - 1]), world(path[index]), color);
      }
    });
    if (pathPositions.length) trajectories.add(createUtilityTrajectory(pathPositions, { colors: pathColors, segments: true, opacity: .65, floorFade: floorFadeRef?.current }));
    updateEffects(notes);
    lastNotes = notes.slice(); lastCollision = collision; lastPlayingNoteId = playingNoteId;
  };

  const dispose = () => {
    clear();
    scene.remove(group);
  };

  return { markers, update, dispose };
}
