import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createCameraStateController from '../src/three/cameraStateController.js';

test('switching playback sessions can restore position, target and view range without changing slots', () => {
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.window = globalThis;
  try {
    const camera = new THREE.PerspectiveCamera();
    const controls = { target: new THREE.Vector3(), update: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
    let viewRange = 0.5;
    const state = createCameraStateController({ mapName: 'de_dust2', camera, controls, getViewRange: () => viewRange, onRestoreViewRange: (value) => { viewRange = value; } });
    const saved = { position: [3, 4, 5], target: [1, 2, 3], viewRange: 0.2 };

    assert.equal(state.restoreState(saved), true);
    assert.deepEqual(state.getCameraState(), saved);
    assert.equal(state.restoreState({ position: [NaN, 0, 0], target: [0, 0, 0] }), false);
    assert.deepEqual(state.getCameraState(), saved);
    state.dispose();
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.window = originalWindow;
  }
});
