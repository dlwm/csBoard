import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { activeSmokeBlasts, HE_SMOKE_CLEAR_RADIUS, smokeBlastHasLineOfSight } from '../src/three/smokeBlast.js';
import { createFallbackSmokeVolume } from '../src/three/smokeVoxelVolume.js';
import createDemoGrenadeSceneController from '../src/three/demoGrenadeSceneController.js';
import { packSmokeVoxel } from '../src/demo/smokeVoxels.js';
import { disposeGrenadeEffect } from '../src/three/grenadeEffects.js';

const he = { event_name: 'hegrenade_detonate', tick: 64, x: 100, y: 200, z: 300 };

test('HE blast expands and then smoke recovers at the recorded tick', () => {
  const before = activeSmokeBlasts([he], 63);
  const opening = activeSmokeBlasts([he], 68)[0];
  const peak = activeSmokeBlasts([he], 80)[0];
  const recovery = activeSmokeBlasts([he], 160)[0];
  assert.deepEqual(before, []);
  assert.ok(opening.radius > 0 && opening.radius < HE_SMOKE_CLEAR_RADIUS);
  assert.equal(peak.radius, HE_SMOKE_CLEAR_RADIUS);
  assert.ok(recovery.strength < peak.strength);
  assert.deepEqual(activeSmokeBlasts([he], 64 + 135), []);
  assert.deepEqual([peak.x, peak.y, peak.z], [200 * 0.0254, 300 * 0.0254, 100 * 0.0254]);
});

test('only valid HE events produce a clearing volume', () => {
  assert.equal(activeSmokeBlasts([{ ...he, event_name: 'flashbang_detonate' }, { ...he, z: null }], 80).length, 0);
});

test('a wall prevents a blast from affecting the smoke behind it', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 4));
  wall.position.set(2, 1, 0);
  wall.updateMatrixWorld();
  const blast = { x: 0, y: 0, z: 0 };
  const smoke = new THREE.Vector3(4, 1, 0);
  const raycaster = new THREE.Raycaster();
  assert.equal(smokeBlastHasLineOfSight(blast, smoke, [wall], raycaster), false);
  wall.position.z = 5;
  wall.updateMatrixWorld();
  assert.equal(smokeBlastHasLineOfSight(blast, smoke, [wall], raycaster), true);
  wall.geometry.dispose();
  wall.material.dispose();
});

test('recorded and fallback smoke volumes accept temporary blast uniforms', () => {
  const smoke = createFallbackSmokeVolume(new THREE.Vector3());
  const volume = smoke.children[0];
  smoke.userData.setSmokeBlasts([{ x: 1, y: 2, z: 3, radius: 4, strength: 0.7 }]);
  assert.equal(volume.material.uniforms.blastCount.value, 1);
  assert.equal(volume.material.uniforms.blastData.value[0].w, 4);
  assert.ok(volume.material.fragmentShader.includes('blastStrength[blast]'));
  smoke.userData.setSmokeBlasts([]);
  assert.equal(volume.material.uniforms.blastCount.value, 0);
  disposeGrenadeEffect(smoke);
});

test('Demo smoke receives the HE opening and clears it when rewinding', () => {
  const scene = new THREE.Scene();
  const tick = { current: 80 };
  const controller = createDemoGrenadeSceneController({
    scene,
    navData: null,
    refs: {
      tick,
      source: { current: { tickRate: 64 } },
      segments: { current: [] },
      projectileGroups: { current: new Map() },
      grenades: { current: [
        { event_name: 'smokegrenade_detonate', tick: 0, entityid: 7, x: 0, y: 0, z: 0 },
        { event_name: 'hegrenade_detonate', tick: 64, entityid: 8, x: 0, y: 0, z: 0 },
      ] },
      smokeVoxelFrames: { current: [{ tick: 1, entityId: 7, origin: [0, 0, 0], seq: 1, voxels: Uint16Array.from([packSmokeVoxel(16, 16, 16)]) }] },
      infernoFrames: { current: [] },
    },
    floorFadeRef: { current: new THREE.Vector4() },
    getModelCenter: () => new THREE.Vector3(),
    getNav: () => null,
    getCollisionMeshes: () => [],
  });
  controller.update();
  const smoke = controller.objects.get('smoke-voxels-7');
  assert.equal(smoke.children[0].material.uniforms.blastCount.value, 1);
  tick.current = 40;
  controller.update();
  assert.equal(smoke.children[0].material.uniforms.blastCount.value, 0);
  controller.dispose();
});
