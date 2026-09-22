import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { packSmokeVoxel, unpackSmokeVoxel } from '../demo/smokeVoxels.js';
import { createSmokeDensityVolume } from './smokeDensityVolume.js';

const MAP_SCALE = 0.0254;
const VOXEL_WORLD_SIZE = 20;
const VOXEL_SCENE_SIZE = VOXEL_WORLD_SIZE * MAP_SCALE;
const GRID_CENTER = 16;
const FIELD_PADDING_CELLS = 2;
const SURFACE_RADIUS_CELLS = 1.15;
const FIELD_ISOLATION = 80;
const FIELD_SUBTRACT = 80;
const FIELD_BLUR_PASSES = 3;
const FIELD_BLUR_STRENGTH = 0.48;

export const SMOKE_VOLUME_SCALE = 1.32;

const decodedSceneGrid = (packed) => {
  const [gridA, gridB, gridC] = unpackSmokeVoxel(packed);
  // The visually verified byte-axis mapping is scene +B/+A/+C.
  return [gridB, gridA, gridC];
};

// Reuse the established metaball field, but render density through its depth
// instead of extracting a hard shell and adding visibly separate edge layers.
export function createSmokeVoxelVolume(frame, modelCenter) {
  const group = new THREE.Group();
  const centers = Array.from(frame.voxels, decodedSceneGrid);
  if (centers.length === 0) return group;

  const minima = [0, 1, 2].map((axis) => Math.min(...centers.map((point) => point[axis])));
  const maxima = [0, 1, 2].map((axis) => Math.max(...centers.map((point) => point[axis])));
  const largestSpan = Math.max(...minima.map((minimum, axis) => maxima[axis] - minimum + 1));
  const fieldCells = Math.max(8, largestSpan + FIELD_PADDING_CELLS * 2);
  const fieldCenter = minima.map((minimum, axis) => (minimum + maxima[axis]) / 2);
  const fieldMinimum = fieldCenter.map((center) => center - fieldCells / 2);
  const resolution = THREE.MathUtils.clamp(Math.ceil(fieldCells * 3), 32, 48);
  const field = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 1);
  field.isolation = FIELD_ISOLATION;
  // A slightly wider influence closes gaps before extracting the outer shell;
  // it does not create extra visual particles or alter the recorded source count.
  const normalizedRadius = SURFACE_RADIUS_CELLS / fieldCells;
  const strength = normalizedRadius ** 2 * (FIELD_ISOLATION + FIELD_SUBTRACT);
  centers.forEach((point) => field.addBall(
    (point[0] - fieldMinimum[0]) / fieldCells,
    (point[1] - fieldMinimum[1]) / fieldCells,
    (point[2] - fieldMinimum[2]) / fieldCells,
    strength,
    FIELD_SUBTRACT,
  ));
  // Repeated low-intensity relaxation acts like surface tension: it suppresses
  // the molecule-like bulge around each source while retaining large deformations.
  for (let pass = 0; pass < FIELD_BLUR_PASSES; pass += 1) field.blur(FIELD_BLUR_STRENGTH);
  const position = new THREE.Vector3(
    (fieldCenter[0] - GRID_CENTER) * VOXEL_SCENE_SIZE,
    (fieldCenter[1] - GRID_CENTER) * VOXEL_SCENE_SIZE,
    (fieldCenter[2] - GRID_CENTER) * VOXEL_SCENE_SIZE,
  );
  const volume = createSmokeDensityVolume(field.field, resolution, fieldCells * VOXEL_SCENE_SIZE / 2, position);
  field.geometry.dispose();
  field.material.dispose();
  volume.userData.smokeVoxelSourceCount = centers.length;
  group.userData.setSmokeBlasts = volume.userData.setSmokeBlasts;

  group.position.set(
    frame.origin[1] * MAP_SCALE - modelCenter.x,
    frame.origin[2] * MAP_SCALE - modelCenter.y,
    frame.origin[0] * MAP_SCALE - modelCenter.z,
  );
  group.add(volume);
  group.userData.smokeVoxelSeq = frame.seq;
  group.userData.smokeVoxelTick = frame.tick;
  group.userData.smokeVoxelCount = frame.voxels.length;
  return group;
}

const FALLBACK_SMOKE_VOXELS = (() => {
  const voxels = [];
  for (let sceneX = -4; sceneX <= 4; sceneX += 1) {
    for (let sceneY = 1; sceneY <= 6; sceneY += 1) {
      for (let sceneZ = -4; sceneZ <= 4; sceneZ += 1) {
        const distance = (sceneX / 3.7) ** 2 + ((sceneY - 3.2) / 2.8) ** 2 + (sceneZ / 3.7) ** 2;
        const edgeVariation = Math.sin(sceneX * 2.1 + sceneY * 1.7 + sceneZ * 2.7) * 0.08;
        if (distance <= 1 + edgeVariation) {
          // pack order is A/B/C while the verified scene order is B/A/C.
          voxels.push(packSmokeVoxel(GRID_CENTER + sceneY, GRID_CENTER + sceneX, GRID_CENTER + sceneZ));
        }
      }
    }
  }
  return Uint16Array.from(voxels);
})();

// Older saved throws and manual previews have no network voxel journal. Give
// them the same density renderer with a deterministic smoke-sized volume.
export function createFallbackSmokeVolume(position) {
  const group = createSmokeVoxelVolume({ origin: [0, 0, 0], seq: 0, tick: 0, voxels: FALLBACK_SMOKE_VOXELS }, new THREE.Vector3());
  group.position.copy(position);
  group.scale.setScalar(SMOKE_VOLUME_SCALE);
  group.userData.grenadeEffect = 'smoke';
  // Keep the editable range independent from the renderer's calibrated base scale.
  group.userData.grenadeRange = 1;
  group.userData.fallbackSmokeVolume = true;
  return group;
}
