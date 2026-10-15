import { SmokePredictionError, smokeVoxelToSource } from './predict.js';

// Compare occupied cell centres in Source inches, not raster screenshots.
// 中文：精确重合要求同一个网格；容差指标则在世界坐标比较，不掩盖原始 IoU。
export function compareSmokeVoxels(reference, candidate, { tolerance = 20 } = {}) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new SmokePredictionError('invalid_argument', 'tolerance must be finite and nonnegative');
  const read = frame => {
    if (!frame || !(frame.voxels instanceof Uint16Array || Array.isArray(frame.voxels)) || frame.voxels.length > 8192) throw new SmokePredictionError('invalid_argument', 'Comparison requires bounded voxel frames');
    smokeVoxelToSource(0, frame.origin);
    return [...new Set(frame.voxels)].map(id => smokeVoxelToSource(id, frame.origin));
  };
  const a = read(reference), b = read(candidate);
  if (!a.length || !b.length) throw new SmokePredictionError('invalid_argument', 'Comparison requires two nonempty voxel frames');
  const key = point => point.map(x => Math.round(x * 1e6)).join(',');
  const keys = new Set(a.map(key)), intersection = b.filter(p => keys.has(key(p))).length;
  const distances = (from, to) => from.map(p => Math.sqrt(to.reduce((best, q) => Math.min(best, (p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2), Infinity)));
  const ab = distances(a,b), ba = distances(b,a);
  const mean = values => values.reduce((sum,n) => sum+n,0)/values.length;
  const recall = ab.filter(d => d <= tolerance + 1e-6).length / a.length;
  const precision = ba.filter(d => d <= tolerance + 1e-6).length / b.length;
  return { referenceCount:a.length, candidateCount:b.length, intersection, iou:intersection/(a.length+b.length-intersection),
    tolerance, precision, recall, f1:precision+recall ? 2*precision*recall/(precision+recall) : 0,
    meanDistance:(mean(ab)+mean(ba))/2, hausdorffDistance:Math.max(...ab,...ba) };
}
