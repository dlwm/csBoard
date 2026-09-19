import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { enableMaterialFloorFade } from '../src/three/floorFade.js';

test('radar polling state stays outside the application root', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/ViewTools.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /useRadarOverlay|radarOverlay=/);
  assert.match(view, /function RadarOverlay/);
  assert.match(view, /<RadarOverlay activePanel=\{activePanel\} boardRef=\{boardRef\} mapName=\{mapName\} navData=\{navData\}/);
});

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
