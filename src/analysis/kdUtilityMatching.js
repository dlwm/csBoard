import { smokeVoxelToSource } from '../../packages/viewer/src/smoke/predict.js';
import { KD_RECOMMENDATION_POLICY as policy, worldPoint, finitePoint } from './kdHotspots.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const eye = point => ({ ...point, y: point.y + policy.eyeHeight });
export const relevantInteractions = (utility, interactions) => interactions.filter(item => item.side === utility.side
  && (!item.phase || !utility.phase || item.phase === utility.phase)
  && (!item.economyMatchup || !utility.economyMatchup || item.economyMatchup === utility.economyMatchup));

function pointSegmentDistance(point, start, end) {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const length = delta.x ** 2 + delta.y ** 2 + delta.z ** 2;
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y + (point.z - start.z) * delta.z) / length)) : 0;
  return distance(point, { x: start.x + delta.x * t, y: start.y + delta.y * t, z: start.z + delta.z * t });
}

// This is a cheap shortlist, never a rendered/default smoke sphere or proof of
// smoke coverage. Actual smoke recommendations require recorded occupied cells.
export function coarseKDMatch(utility, interactions) {
  if (!finitePoint(utility.landing) || !finitePoint(utility.throwPosition)) return false;
  return relevantInteractions(utility, interactions).reduce((best, item) => {
    if (utility.kind === 'flash' && utility.blindEvidence?.length) {
      return Math.max(best, ...utility.blindEvidence.map(blind => 1 - distance(blind.position, item.enemy) / policy.flashMatchRadius));
    }
    const gap = utility.kind === 'smoke' ? pointSegmentDistance(utility.landing, eye(item.own), eye(item.enemy)) : distance(utility.landing, item.enemy);
    const radius = utility.kind === 'smoke' ? policy.smokeSearchRadius : utility.kind === 'fire' ? policy.fireRadius : utility.kind === 'flash' ? policy.flashSearchRadius : policy.heRadius;
    return Math.max(best, 1 - gap / radius);
  }, 0);
}

// Segment versus occupied voxel AABB; all three axes participate. This tests
// historical geometry, not optical density, current enemy poses or causal benefit.
function intersectsCell(start, end, centre, half = .254) {
  let low = 0, high = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = end[axis] - start[axis], min = centre[axis] - half, max = centre[axis] + half;
    if (Math.abs(delta) < 1e-10) { if (start[axis] < min || start[axis] > max) return false; continue; }
    const a = (min - start[axis]) / delta, b = (max - start[axis]) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (low > high) return false;
  }
  return true;
}

export function matchKDUtility(utility, interactions, roundData) {
  const relevant = relevantInteractions(utility, interactions);
  const entityIds = [utility.segment.entityId, utility.segment.landing?.entityid].filter(id => id != null).map(Number);
  const sameEntity = frame => frame.entityId != null && entityIds.includes(Number(frame.entityId));
  let cells = null, confidence = 'position';
  if (utility.kind === 'smoke') {
    const frames = (roundData?.smokeVoxelFrames || []).filter(frame =>
      sameEntity(frame) && Array.isArray(frame.origin) && frame.origin.length === 3 && frame.origin.every(Number.isFinite)
      && (Array.isArray(frame.voxels) || ArrayBuffer.isView(frame.voxels)) && frame.voxels.length && frame.tick >= utility.segment.effectTick
      && frame.tick <= utility.segment.effectTick + (utility.source.tickRate || 64) * 8);
    // A deterministic full-volume sample: largest recorded occupancy in the
    // first 8 seconds. Never pick the frame that maximizes the recommendation.
    const frame = frames.reduce((best, value) => !best || value.voxels.length > best.voxels.length ? value : best, null);
    if (!frame) return { unavailable: 'smoke_voxels' };
    cells = [];
    for (const voxel of frame.voxels) {
      if (!Number.isInteger(voxel) || voxel < 0 || voxel > 32767) continue;
      cells.push(worldPoint(smokeVoxelToSource(voxel, frame.origin)));
    }
    confidence = 'recordedSmoke';
  } else if (utility.kind === 'flash') {
    if (!utility.blindEvidence?.length) return { unavailable: 'blind_evidence' };
    cells = utility.blindEvidence.map(item => item.position); confidence = 'recordedBlind';
  } else if (utility.kind === 'fire') {
    const frames = (roundData?.infernoFrames || []).filter(frame => sameEntity(frame)
      && frame.cells?.length && frame.tick >= utility.segment.effectTick && frame.tick <= utility.segment.effectTick + (utility.source.tickRate || 64) * 8);
    const frame = frames.reduce((best, value) => !best || value.cells.length > best.cells.length ? value : best, null);
    if (frame) {
      cells = [];
      for (let i = 0; i + 2 < frame.cells.length; i += 6) {
        const point = Array.from(frame.cells.slice(i, i + 3));
        if (point.every(Number.isFinite)) cells.push(worldPoint(point));
      }
      if (cells.length) confidence = 'recordedFire';
    }
  }
  const matches = [], seen = new Set();
  for (const item of relevant) {
    let quality;
    if (utility.kind === 'smoke') quality = cells.some(cell => intersectsCell(eye(item.own), eye(item.enemy), cell)) ? 1 : 0;
    else {
      const nearest = cells?.length ? cells.reduce((best, cell) => Math.min(best, distance(cell, item.enemy)), Infinity) : distance(utility.landing, item.enemy);
      const radius = utility.kind === 'flash' ? policy.flashMatchRadius : cells?.length ? 1.5 : utility.kind === 'fire' ? policy.fireRadius : policy.heRadius;
      quality = Math.max(0, 1 - nearest / radius);
    }
    if (quality <= 0 || seen.has(item.eventId)) continue;
    seen.add(item.eventId); matches.push({ ...item, quality });
  }
  if (!matches.length) return null;
  const relevantCount = new Set(relevant.map(item => item.eventId)).size;
  const meanQuality = matches.reduce((sum, item) => sum + item.quality, 0) / matches.length;
  const startDistance = Math.min(...matches.map(item => distance(utility.throwPosition, item.own)));
  // Match score [0,100] = 60*coverage + 25*mean proximity/volume match
  // + 10*saturating event support + 5*throw-origin accessibility heuristic.
  // 中文：60×相关交火覆盖率 + 25×平均空间匹配 + 10×样本支持度 + 5×起点接近度。
  // It is not success probability. Throw frequency remains a separate score.
  const matchScore = 60 * matches.length / Math.max(1, relevantCount) + 25 * meanQuality
    + 10 * (1 - Math.exp(-matches.length / 4)) + 5 * Math.exp(-startDistance / 20);
  return { matchScore, confidence, blindCount: utility.blindEvidence?.length || 0,
    blindDuration: Math.max(0, ...(utility.blindEvidence || []).map(item => item.duration)), matchedCount: matches.length, relevantCount, startDistance,
    evidence: matches.slice(0, 5).map(({ eventId, source, own, enemy }) => ({ eventId, ...source, own, enemy })) };
}
