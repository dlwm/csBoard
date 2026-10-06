import * as THREE from 'three';

export const UTILITY_TRAJECTORY_RENDER_ORDER = 5;
const SURFACE_LIFT = .035;

// One depth policy for analysis, notes, replay and collaboration. NAV is a
// transparent depth-writing surface (order 1); trajectories must be drawn later
// with depth testing enabled, so upper floors still occlude lower trajectories.
// NAV 为透明且写深度的地面；轨迹须在其后绘制，保留深度测试，不能靠穿墙解决遮挡。
export function utilityTrajectoryPoint(point, modelCenter, { source = false, origin = null } = {}) {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  const position = source
    ? new THREE.Vector3(point.y * .0254, point.z * .0254, point.x * .0254)
    : new THREE.Vector3(point.x, point.y, point.z);
  position.sub(modelCenter); position.y += SURFACE_LIFT;
  if (origin) position.sub(origin);
  return position;
}

export function createUtilityTrajectory(points, { color = '#c58cff', colors, opacity = .82, segments = false } = {}) {
  const geometry = new THREE.BufferGeometry();
  if (points instanceof Float32Array || typeof points[0] === 'number') geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  else geometry.setFromPoints(points);
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ color: colors ? '#ffffff' : color, vertexColors: Boolean(colors), transparent: true, opacity, depthTest: true, depthWrite: false });
  material.userData.csboardIgnoreFloorFade = true;
  const line = segments ? new THREE.LineSegments(geometry, material) : new THREE.Line(geometry, material);
  line.renderOrder = UTILITY_TRAJECTORY_RENDER_ORDER;
  // Floor selection controls map surfaces, never the recorded flight path.
  // 楼层选择不裁切轨迹；遮挡仍由真实几何和深度测试决定。
  return line;
}

// Reveal recorded samples by their timestamps, with an interpolated tip at the
// projectile's current position. 非均匀采样不能按整条顶点数量线性猜进度。
export function revealUtilityTrajectory(line, records, tick) {
  const positions = line.geometry.getAttribute('position');
  if (!records.length || positions.count !== records.length) { line.geometry.setDrawRange(0, 0); return; }
  const state = line.userData.trajectoryReveal ||= { original: positions.array.slice(), changed: -1 };
  if (state.changed >= 0) {
    const offset = state.changed * 3;
    positions.setXYZ(state.changed, state.original[offset], state.original[offset + 1], state.original[offset + 2]);
    state.changed = -1;
    positions.needsUpdate = true;
  }
  let upper = records.findIndex(record => record.tick > tick);
  if (tick < records[0].tick) { line.geometry.setDrawRange(0, 0); return; }
  if (upper < 0) { line.geometry.setDrawRange(0, records.length); return; }
  const lower = Math.max(0, upper - 1), from = lower * 3, to = upper * 3;
  const amount = (tick - records[lower].tick) / Math.max(1, records[upper].tick - records[lower].tick);
  positions.setXYZ(upper, ...[0, 1, 2].map(axis => THREE.MathUtils.lerp(state.original[from + axis], state.original[to + axis], amount)));
  state.changed = upper;
  positions.needsUpdate = true;
  line.geometry.setDrawRange(0, upper + 1);
}
