import { packSmokeVoxel, unpackSmokeVoxel } from '../data/smokeVoxels.js';

// Source XYZ inches. Recorded packing is A/B/C = Z/Y/X, with centre 16.
// 中文：沿用录像体素约定，不使用场景米坐标；预测与 Valve 实现不等价。
export const SMOKE_GRID = Object.freeze({ size: 32, centre: 16, cellSize: 20 });
export const SMOKE_PREDICTION_DEFAULTS = Object.freeze({ radius: Object.freeze([110, 110, 80]), rise: 40, maxVoxels: 256, maxCollisionChecks: 100000 });
export class SmokePredictionError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'SmokePredictionError'; this.code = code; this.details = details; }
}
const invalid = message => { throw new SmokePredictionError('invalid_argument', message); };
const vector = (value, name) => { if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) invalid(`${name} requires three finite Source coordinates`); return [...value]; };
export function smokeVoxelToSource(voxel, origin) {
  if (!Number.isInteger(voxel) || voxel < 0 || voxel > 32767) invalid('Invalid packed smoke voxel');
  const p = vector(origin, 'origin'), [z, y, x] = unpackSmokeVoxel(voxel);
  return [p[0] + (x - 16) * 20, p[1] + (y - 16) * 20, p[2] + (z - 16) * 20];
}

// Min-heap: fill the nearest reachable cells first, not the arbitrary order of
// six neighbours. q=((x/rx)^2+(y/ry)^2+((z-rise)/rz)^2); q<=1 bounds the cloud.
// 中文：优先占据椭球中心附近且连通的单元，序号用于稳定打破平局。
class Frontier {
  items = [];
  push(value) { const a = this.items; a.push(value); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].score < value.score || (a[p].score === value.score && a[p].id < value.id)) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop() { const a = this.items, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && (a[c + 1].score < a[c].score || (a[c + 1].score === a[c].score && a[c + 1].id < a[c].id))) c++; if (last.score < a[c].score || (last.score === a[c].score && last.id < a[c].id)) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
}
function* grow(options) {
  const { origin: input, collision, signal, onProgress, tick = 0, entityId = 0 } = options || {};
  const origin = vector(input, 'origin');
  const radius = vector(options.radius ?? SMOKE_PREDICTION_DEFAULTS.radius, 'radius');
  const rise = options.rise ?? SMOKE_PREDICTION_DEFAULTS.rise;
  const maxVoxels = options.maxVoxels ?? SMOKE_PREDICTION_DEFAULTS.maxVoxels;
  const maxCollisionChecks = options.maxCollisionChecks ?? SMOKE_PREDICTION_DEFAULTS.maxCollisionChecks;
  if (radius.some(r => r < 20 || r > 300) || !Number.isFinite(rise) || rise + radius[2] > 300 || rise - radius[2] < -320) invalid('Smoke envelope must fit the 32-cell grid; radii must be 20–300 inches');
  if (!Number.isInteger(maxVoxels) || maxVoxels < 1 || maxVoxels > 8192) invalid('maxVoxels must be 1–8192');
  if (!Number.isInteger(maxCollisionChecks) || maxCollisionChecks < 1 || maxCollisionChecks > 1000000) invalid('maxCollisionChecks must be 1–1000000');
  if (!Number.isFinite(tick) || !Number.isSafeInteger(entityId) || entityId < 0) invalid('Invalid frame tick/entityId');
  if (collision != null && typeof collision.isBlocked !== 'function') invalid('collision must implement synchronous isBlocked(from,to) in Source inches');
  if (collision?.isCellBlocked != null && typeof collision.isCellBlocked !== 'function') invalid('isCellBlocked must be a synchronous function');
  if (onProgress != null && typeof onProgress !== 'function') invalid('onProgress must be a function');
  if (signal != null && typeof signal.throwIfAborted !== 'function') invalid('signal must be an AbortSignal');
  signal?.throwIfAborted();
  let collisionChecks = 0, blockedEdges = 0, visited = 0;
  const blocked = (from, to) => {
    signal?.throwIfAborted();
    if (!collision) return false;
    if (++collisionChecks > maxCollisionChecks) throw new SmokePredictionError('budget_exceeded', 'Smoke collision budget exceeded', { maxCollisionChecks });
    const value = collision.isBlocked(from, to);
    if (typeof value !== 'boolean') invalid('collision.isBlocked must return a boolean, not a Promise');
    if (value) blockedEdges++;
    return value;
  };
  const cellBlocked = point => {
    if (!collision?.isCellBlocked) return false;
    signal?.throwIfAborted();
    if (++collisionChecks > maxCollisionChecks) throw new SmokePredictionError('budget_exceeded', 'Smoke collision budget exceeded', { maxCollisionChecks });
    const value = collision.isCellBlocked(point, 10);
    if (typeof value !== 'boolean') invalid('collision.isCellBlocked must return a boolean');
    return value;
  };
  const position = id => { const [z,y,x] = unpackSmokeVoxel(id); return [origin[0]+(x-16)*20,origin[1]+(y-16)*20,origin[2]+(z-16)*20]; };
  const score = (z,y,x) => ((x-16)*20/radius[0])**2 + ((y-16)*20/radius[1])**2 + (((z-16)*20-rise)/radius[2])**2;
  const seed = packSmokeVoxel(17,16,16), start = position(seed);
  // Seed just above the detonation point; never silently move to another room.
  if (score(17,16,16) > 1 || blocked(origin,start) || cellBlocked(start)) throw new SmokePredictionError('seed_blocked', 'Smoke seed is outside the envelope or blocked; check the landing point and collision geometry');
  const seen = new Uint8Array(32768), frontier = new Frontier(), voxels = [];
  frontier.push({ id: seed, score: score(17,16,16) }); seen[seed] = 1;
  const progress = phase => ({ phase, accepted: voxels.length, visited, collisionChecks, fraction: phase === 'complete' ? 1 : Math.min(.99, voxels.length/maxVoxels) });
  onProgress?.(progress('growing'));
  while (frontier.items.length && voxels.length < maxVoxels) {
    signal?.throwIfAborted();
    const { id } = frontier.pop(); visited++; voxels.push(id);
    if (voxels.length === maxVoxels) break;
    const [z,y,x] = unpackSmokeVoxel(id), from = position(id);
    for (const [dz,dy,dx] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const a=z+dz,b=y+dy,c=x+dx;
      if (Math.min(a,b,c)<0 || Math.max(a,b,c)>31) continue;
      const next=packSmokeVoxel(a,b,c); if (seen[next]) continue;
      const q=score(a,b,c); if(q>1)continue;
      // A blocked edge does not mark the destination blocked: it may be reached
      // through a doorway. 中文：封住一条边不等于整个体素不可从别处到达。
      const to = position(next);
      if (cellBlocked(to)) { seen[next]=2; continue; }
      if (blocked(from,to)) continue;
      seen[next]=1;frontier.push({id:next,score:q});
    }
    if (visited % 32 === 0) { onProgress?.(progress('growing')); yield; }
  }
  signal?.throwIfAborted();
  const result = { source: collision ? 'predicted' : 'illustrative', algorithm: 'reachable-ellipsoid/1',
    frame: { tick, entityId, sequence: 0, origin, voxels: Uint16Array.from(voxels) },
    parameters: { radius, rise, maxVoxels, maxCollisionChecks, ...SMOKE_GRID },
    diagnostics: { collisionChecks, blockedEdges, visited, budgetReached: voxels.length === maxVoxels, geometryConstrained: Boolean(collision) } };
  onProgress?.(progress('complete'));
  return result;
}
export function predictSmokeVoxels(options) { const iterator=grow(options);let step;do {step=iterator.next();}while(!step.done);return step.value; }
export async function predictSmokeVoxelsAsync(options) {
  const iterator=grow(options);let step;
  do {step=iterator.next();if(!step.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!step.done);
  return step.value;
}
