import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { enableMaterialFloorFade } from '../src/three/floorFade.js';

test('one-time map floor patch retains live floor changes without recompiling', () => {
  const material = new THREE.MeshStandardMaterial();
  const state = new THREE.Vector4(-100, 100, 0, 1);
  enableMaterialFloorFade(material, state);
  const version = material.version;
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <dithering_fragment>',
  };
  material.onBeforeCompile(shader);
  state.set(-20, 30, 0, 1);
  assert.equal(shader.uniforms.floorFadeState.value, state);
  assert.equal(shader.uniforms.floorFadeState.value.y, 30);
  enableMaterialFloorFade(material, state);
  assert.equal(material.version, version);
  material.dispose();
});
