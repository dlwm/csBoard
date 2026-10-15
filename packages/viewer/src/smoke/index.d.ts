/** Source XYZ inches. Packed smoke axes are Z/Y/X; scene XYZ metres are different. */
export type SmokePosition = [number, number, number];
export interface SmokeFrame { tick: number; entityId: number; sequence: number; origin: SmokePosition; voxels: Uint16Array }
export interface SmokeCollision { isBlocked(from: SmokePosition, to: SmokePosition): boolean; isCellBlocked?(center: SmokePosition, halfSize: number): boolean }
export interface SmokeProgress { phase: 'growing' | 'complete'; accepted: number; visited: number; collisionChecks: number; fraction: number }
export interface SmokePredictionOptions {
  origin: SmokePosition; collision?: SmokeCollision; radius?: SmokePosition; rise?: number;
  maxVoxels?: number; maxCollisionChecks?: number; tick?: number; entityId?: number;
  signal?: AbortSignal; onProgress?: (progress: SmokeProgress) => void;
}
export interface SmokePrediction {
  source: 'predicted' | 'illustrative'; algorithm: 'reachable-ellipsoid/1'; frame: SmokeFrame;
  parameters: { radius: SmokePosition; rise: number; maxVoxels: number; maxCollisionChecks: number; size: number; centre: number; cellSize: number };
  diagnostics: { collisionChecks: number; blockedEdges: number; visited: number; budgetReached: boolean; geometryConstrained: boolean };
}
export const SMOKE_GRID: Readonly<{ size: 32; centre: 16; cellSize: 20 }>;
export const SMOKE_PREDICTION_DEFAULTS: Readonly<{ radius: readonly [number, number, number]; rise: number; maxVoxels: number; maxCollisionChecks: number }>;
export class SmokePredictionError extends Error { constructor(code: string, message: string, details?: Record<string, unknown>); code: 'invalid_argument' | 'budget_exceeded' | 'seed_blocked' | 'disposed'; details: Record<string, unknown> }
export function smokeVoxelToSource(voxel: number, origin: SmokePosition): SmokePosition;
export function predictSmokeVoxels(options: SmokePredictionOptions): SmokePrediction;
/** Yields to the event loop every 32 cells; use a host worker for full CPU isolation. */
export function predictSmokeVoxelsAsync(options: SmokePredictionOptions): Promise<SmokePrediction>;
export interface SmokeComparison { referenceCount: number; candidateCount: number; intersection: number; iou: number; tolerance: number; precision: number; recall: number; f1: number; meanDistance: number; hausdorffDistance: number }
export function compareSmokeVoxels(reference: Pick<SmokeFrame, 'origin' | 'voxels'>, candidate: Pick<SmokeFrame, 'origin' | 'voxels'>, options?: { tolerance?: number }): SmokeComparison;
