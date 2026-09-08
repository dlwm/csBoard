import * as THREE from 'three';
import { createFallbackSmokeVolume, SMOKE_VOLUME_SCALE } from './smokeVoxelVolume.js';
import { createDefaultInfernoEffect, rebuildDefaultInfernoEffect } from './infernoEffect.js';

export function createGrenadeEffect(position, type, navData, nav) {
  if (type === 'smoke') return createFallbackSmokeVolume(position);
  if (type === 'fire') return createDefaultInfernoEffect(position, nav);
  const group = new THREE.Group();
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: '#202832', roughness: 1, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, flatShading: true });
  const addPulseRing = (radius, color, opacity = 0.7) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    return ring;
  };
  if (type === 'flash') {
    const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 2), new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.95, depthWrite: false }));
    group.add(flash, new THREE.PointLight('#fff1a8', 5, 8));
    addPulseRing(0.85, '#fff0a0', 0.9);
    const rayMaterial = new THREE.LineBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.72 });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(angle) * 0.65, 0, Math.sin(angle) * 0.65), new THREE.Vector3(Math.cos(angle) * 1.5, 0, Math.sin(angle) * 1.5)]);
      group.add(new THREE.Line(geometry, rayMaterial));
    }
  } else if (type === 'decoy') {
    const decoy = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.62, 16), new THREE.MeshStandardMaterial({ color: '#9eabb2', roughness: 0.42, metalness: 0.7, transparent: true, opacity: 0.95, depthWrite: false }));
    decoy.position.y = 0.3;
    decoy.userData.decoyBlink = true;
    group.add(decoy);
    addPulseRing(0.52, '#b9c7d6', 0.55);
  } else {
    const count = 8;
    const smokeScale = 1;
    if (type === 'explosion') {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.72, depthWrite: false }));
      core.position.y = 0.3;
      group.add(core);
      addPulseRing(0.95, '#ff7a32', 0.8);
      addPulseRing(1.35, '#ffb347', 0.42);
    }
    for (let index = 0; index < count; index += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.62 * smokeScale, 16, 10), smokeMaterial.clone());
      const puffHeight = 0.55 + (index % 3) * 0.3;
      puff.position.set(Math.sin(index * 2.4) * 0.38 * smokeScale, puffHeight * smokeScale, Math.cos(index * 1.7) * 0.38 * smokeScale);
      puff.scale.y = 0.62;
      puff.scale.x = 0.85 + (index % 4) * 0.16;
      puff.scale.z = 0.85 + ((index + 1) % 3) * 0.18;
      group.add(puff);
    }
  }
  group.position.copy(position);
  group.traverse((object) => {
    object.renderOrder = 5;
    if (object.material) { object.material.depthTest = true; object.material.depthWrite = false; }
  });
  group.userData.grenadeEffect = type;
  return group;
}

export function disposeGrenadeEffect(effect) {
  effect?.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
}

// Applies the collaboration range without flattening the calibrated smoke shell.
export function setGrenadeEffectRange(effect, type, range) {
  const safeRange = Math.max(0.35, Number(range) || 1);
  if (type === 'smoke') effect.scale.setScalar(SMOKE_VOLUME_SCALE * safeRange);
  else if (type === 'fire' && effect.userData.defaultInfernoEffect) {
    const renderedRange = effect.userData.renderedGrenadeRange || 1;
    effect.scale.set(safeRange / renderedRange, 1, safeRange / renderedRange);
  } else effect.scale.set(safeRange, 1, safeRange);
  effect.userData.grenadeRange = safeRange;
}

// Expensive ground projection is intentionally deferred until range dragging
// finishes; other grenade effects need no geometry rebuild.
export function rebuildGrenadeEffect(effect, type, nav) {
  if (type === 'fire') return rebuildDefaultInfernoEffect(effect, nav);
  return false;
}

export function grenadeTypeFromPointer(pointer) {
  const angle = Math.atan2(pointer.y, pointer.x);
  if (angle >= Math.PI * 0.25 && angle < Math.PI * 0.75) return 'smoke';
  if (angle >= -Math.PI * 0.25 && angle < Math.PI * 0.25) return 'fire';
  if (angle >= -Math.PI * 0.75 && angle < -Math.PI * 0.25) return 'flash';
  return 'explosion';
}
