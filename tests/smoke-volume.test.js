import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { packSmokeVoxel } from '../src/demo/smokeVoxels.js';
import { createFallbackSmokeVolume, createSmokeVoxelVolume, SMOKE_VOLUME_SCALE } from '../src/three/smokeVoxelVolume.js';
import { disposeGrenadeEffect } from '../src/three/grenadeEffects.js';

test('recorded and fallback smoke share a single density volume with a soft edge', () => {
  const voxels = [];
  for (let a = 15; a <= 17; a += 1) for (let b = 15; b <= 17; b += 1) for (let c = 15; c <= 17; c += 1) {
    voxels.push(packSmokeVoxel(a, b, c));
  }
  const recorded = createSmokeVoxelVolume({ origin: [0, 0, 0], seq: 1, tick: 1, voxels }, new THREE.Vector3());
  const fallback = createFallbackSmokeVolume(new THREE.Vector3());

  for (const smoke of [recorded, fallback]) {
    assert.equal(smoke.children.length, 1);
    const volume = smoke.children[0];
    assert.ok(volume.isMesh);
    assert.equal(volume.material.transparent, true);
    assert.equal(volume.material.depthWrite, false);
    const texture = volume.userData.smokeDensityTexture;
    assert.ok(texture.isData3DTexture);
    assert.equal(texture.image.width, texture.image.height);
    assert.equal(texture.image.width, texture.image.depth);
    assert.ok(texture.image.data.some((density) => density === 255));
    assert.ok(texture.image.data.some((density) => density > 0 && density < 255));
    let disposed = false;
    texture.addEventListener('dispose', () => { disposed = true; });
    disposeGrenadeEffect(smoke);
    assert.ok(disposed);
  }
  assert.equal(fallback.scale.x, SMOKE_VOLUME_SCALE);
});
