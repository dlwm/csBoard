import type { Object3D, Mesh, Group } from 'three';
import type { SmokeCollision, SmokePrediction, SmokePosition } from './index.js';
export interface SmokeCollisionWorld extends SmokeCollision {
  getStats(): { meshes: number; triangles: number; estimatedBytes: number; raycasts: number };
  dispose(): void;
}
/** Snapshot static geometry. sceneOrigin is the scene's XYZ offset in metres. */
export function createSmokeCollisionWorld(options: { root?: Object3D; objects?: Mesh[]; sceneOrigin?: SmokePosition; filter?: (mesh: Mesh) => boolean; maxTriangles?: number; maxBytes?: number }): SmokeCollisionWorld;
export function createPredictedSmokeVolume(prediction: SmokePrediction, sceneOrigin?: SmokePosition): Group;
export function disposePredictedSmokeVolume(volume: Group): void;
