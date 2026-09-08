import * as THREE from 'three';

const MAP_SCALE = 0.0254;
const FIELD_RADIUS = 1.2;
const FIELD_THRESHOLD = 0.18;
const GRID_STEP = 0.2;
const MAX_FLOOR_DELTA = 0.85;
// Manual Q-wheel fire has no recorded CInferno cells. This compact, asymmetric
// seed pattern gives it a stable smoke-like default range without reviving the
// old circular flame/ring model.
const DEFAULT_FIRE_OFFSETS = [
  [0, 0], [-0.72, -0.12], [-0.38, 0.56], [0.28, 0.62],
  [0.78, 0.22], [0.62, -0.5], [-0.05, -0.65],
];

const sourcePointToScene = (values, offset, modelCenter) => new THREE.Vector3(
  values[offset + 1] * MAP_SCALE - modelCenter.x,
  values[offset + 2] * MAP_SCALE - modelCenter.y,
  values[offset] * MAP_SCALE - modelCenter.z,
);

const createFireMaterial = () => new THREE.ShaderMaterial({
  uniforms: { fireColor: { value: new THREE.Color('#f04a16') } },
  transparent: true,
  depthTest: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  vertexShader: `
    attribute float fireInfluence;
    varying float fireEdge;
    void main() {
      fireEdge = fireInfluence;
      vec4 world = modelMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform vec3 fireColor;
    varying float fireEdge;
    void main() {
      float edgeAlpha = smoothstep(0.02, 0.26, fireEdge);
      if (edgeAlpha < 0.01) discard;
      gl_FragColor = vec4(fireColor, edgeAlpha * 0.78);
    }
  `,
});

function buildProjectedFireGeometry(points, nav, fieldScale = 1) {
  const positions = [];
  const influences = [];
  if (!points.length) return new THREE.BufferGeometry();

  const safeFieldScale = Math.max(0.35, Number(fieldScale) || 1);
  const fieldRadius = FIELD_RADIUS * safeFieldScale;
  // Preserve detail when shrinking; larger ranges keep the normal world-space
  // sampling interval because rebuilding happens only after pointer release.
  const gridStep = GRID_STEP * Math.min(1, safeFieldScale);
  const minX = Math.min(...points.map((point) => point.x)) - fieldRadius;
  const maxX = Math.max(...points.map((point) => point.x)) + fieldRadius;
  const minZ = Math.min(...points.map((point) => point.z)) - fieldRadius;
  const maxZ = Math.max(...points.map((point) => point.z)) + fieldRadius;
  const columns = Math.ceil((maxX - minX) / gridStep);
  const rows = Math.ceil((maxZ - minZ) / gridStep);
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const projectionCache = new Map();

  nav?.mesh?.updateMatrixWorld(true);

  const nearestCell = (x, z) => points.reduce((nearest, point) => {
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
    return !nearest || distance < nearest.distance ? { point, distance } : nearest;
  }, null);
  // Accumulated compact kernels behave like a 2D metaball field: nearby cells
  // pull one another together and form a continuous surface instead of circles.
  const influenceAt = (x, z) => {
    const anchor = nearestCell(x, z)?.point;
    if (!anchor) return 0;
    let density = 0;
    let strongest = 0;
    points.forEach((point) => {
      // Never let vertically stacked fire cells attract through another floor.
      if (Math.abs(point.y - anchor.y) > MAX_FLOOR_DELTA) return;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance >= fieldRadius) return;
      const amount = 1 - distance / fieldRadius;
      const contribution = amount * amount * (3 - 2 * amount);
      density += contribution;
      strongest = Math.max(strongest, contribution);
    });
    // Extra weight applies only to neighboring-cell overlap, increasing the
    // connecting tension without inflating an isolated cell's calibrated edge.
    const tensionDensity = strongest + (density - strongest) * 1.85;
    return Math.max(0, Math.min(1, tensionDensity) - FIELD_THRESHOLD);
  };
  const project = (x, z) => {
    const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
    if (projectionCache.has(key)) return projectionCache.get(key);
    const nearest = nearestCell(x, z);
    if (!nearest) return null;
    let projected = null;
    if (nav?.mesh) {
      raycaster.set(new THREE.Vector3(x, nearest.point.y + 2.5, z), down);
      raycaster.near = 0;
      raycaster.far = 5;
      const hit = raycaster.intersectObject(nav.mesh, false)
        .reduce((best, candidate) => (
          Math.abs(candidate.point.y - nearest.point.y) < Math.abs((best?.point.y ?? Infinity) - nearest.point.y)
            ? candidate : best
        ), null);
      if (hit && Math.abs(hit.point.y - nearest.point.y) <= MAX_FLOOR_DELTA) {
        const normal = hit.face?.normal?.clone().transformDirection(nav.mesh.matrixWorld) || new THREE.Vector3(0, 1, 0);
        projected = hit.point.clone().addScaledVector(normal, 0.018);
      }
    } else {
      projected = new THREE.Vector3(x, nearest.point.y + 0.018, z);
    }
    projectionCache.set(key, projected);
    return projected;
  };
  const appendVertex = (point, influence) => {
    positions.push(point.x, point.y, point.z);
    influences.push(influence);
  };

  const cellIndex = (column, row) => row * columns + column;
  const coverage = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = minX + column * gridStep;
      const x1 = Math.min(maxX, x0 + gridStep);
      const z0 = minZ + row * gridStep;
      const z1 = Math.min(maxZ, z0 + gridStep);
      if (influenceAt((x0 + x1) / 2, (z0 + z1) / 2)) coverage[cellIndex(column, row)] = 1;
    }
  }

  // Empty cells reachable from the bounds are exterior. Any remaining empty
  // island is an enclosed no-fire ring and should read as part of the footprint.
  const exterior = new Uint8Array(coverage.length);
  const queue = [];
  const enqueueExterior = (column, row) => {
    if (column < 0 || column >= columns || row < 0 || row >= rows) return;
    const index = cellIndex(column, row);
    if (coverage[index] || exterior[index]) return;
    exterior[index] = 1;
    queue.push([column, row]);
  };
  for (let column = 0; column < columns; column += 1) {
    enqueueExterior(column, 0);
    enqueueExterior(column, rows - 1);
  }
  for (let row = 0; row < rows; row += 1) {
    enqueueExterior(0, row);
    enqueueExterior(columns - 1, row);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [column, row] = queue[cursor];
    enqueueExterior(column - 1, row);
    enqueueExterior(column + 1, row);
    enqueueExterior(column, row - 1);
    enqueueExterior(column, row + 1);
  }
  coverage.forEach((value, index) => {
    if (!value && !exterior[index]) coverage[index] = 2;
  });
  const mergedSurfaceInfluence = (column, row) => {
    let hasSurface = false;
    let hasExterior = false;
    [[column - 1, row - 1], [column, row - 1], [column - 1, row], [column, row]].forEach(([cellColumn, cellRow]) => {
      if (cellColumn < 0 || cellColumn >= columns || cellRow < 0 || cellRow >= rows) {
        hasExterior = true;
        return;
      }
      const index = cellIndex(cellColumn, cellRow);
      if (coverage[index]) hasSurface = true;
      else if (exterior[index]) hasExterior = true;
    });
    // Opacity follows only the final outer silhouette. Original cell borders
    // and filled-hole borders therefore remain indistinguishable inside it.
    return hasSurface && !hasExterior ? 1 : 0;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const coverageKind = coverage[cellIndex(column, row)];
      if (!coverageKind) continue;
      const x0 = minX + column * gridStep;
      const x1 = Math.min(maxX, x0 + gridStep);
      const z0 = minZ + row * gridStep;
      const z1 = Math.min(maxZ, z0 + gridStep);
      // Validating the center and all corners prevents the merged surface from
      // bridging NAV gaps, walls, or a different floor at the same X/Z.
      if (!project((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      const corners = [
        [x0, z0, column, row],
        [x1, z0, column + 1, row],
        [x1, z1, column + 1, row + 1],
        [x0, z1, column, row + 1],
      ];
      const projected = corners.map(([x, z]) => project(x, z));
      if (projected.some((point) => !point)) continue;
      const heights = projected.map((point) => point.y);
      if (Math.max(...heights) - Math.min(...heights) > MAX_FLOOR_DELTA) continue;
      [[0, 1, 2], [0, 2, 3]].forEach((triangle) => triangle.forEach((index) => {
        const [, , vertexColumn, vertexRow] = corners[index];
        appendVertex(projected[index], mergedSurfaceInfluence(vertexColumn, vertexRow));
      }));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('fireInfluence', new THREE.Float32BufferAttribute(influences, 1));
  if (positions.length) geometry.computeVertexNormals();
  return geometry;
}

// One merged mesh is projected onto the nearest same-floor NAV surface. It keeps
// the authoritative CInferno footprint without vertical flames intersecting walls.
export function createInfernoEffect(frame, modelCenter, nav = null) {
  const points = [];
  for (let offset = 0; offset + 5 < frame.cells.length; offset += 6) {
    points.push(sourcePointToScene(frame.cells, offset, modelCenter));
  }
  const group = new THREE.Group();
  const surface = new THREE.Mesh(buildProjectedFireGeometry(points, nav), createFireMaterial());
  surface.renderOrder = 5;
  surface.userData.infernoSurface = true;
  group.add(surface);
  group.userData.infernoSeq = frame.seq;
  group.userData.infernoCellCount = points.length;
  return group;
}

// Builds the same merged ground projection for manually placed fire. Geometry
// stays local to the group so collaboration range editing can scale it in X/Z.
export function createDefaultInfernoEffect(position, nav = null) {
  const points = DEFAULT_FIRE_OFFSETS.map(([x, z]) => new THREE.Vector3(
    position.x + x,
    position.y,
    position.z + z,
  ));
  const geometry = buildProjectedFireGeometry(points, nav);
  geometry.translate(-position.x, -position.y, -position.z);

  const group = new THREE.Group();
  const surface = new THREE.Mesh(geometry, createFireMaterial());
  surface.renderOrder = 5;
  surface.userData.infernoSurface = true;
  group.add(surface);
  group.position.copy(position);
  group.userData.grenadeEffect = 'fire';
  group.userData.grenadeRange = 1;
  group.userData.renderedGrenadeRange = 1;
  group.userData.defaultInfernoEffect = true;
  return group;
}

// Reprojects a resized manual footprint only after dragging ends. During the
// drag the existing mesh is scaled for responsiveness; this replaces it with
// correctly sampled geometry that follows the newly covered NAV surface.
export function rebuildDefaultInfernoEffect(group, nav = null) {
  if (!group?.userData.defaultInfernoEffect) return false;
  const range = Math.max(0.35, Number(group.userData.grenadeRange) || 1);
  const position = group.position;
  const points = DEFAULT_FIRE_OFFSETS.map(([x, z]) => new THREE.Vector3(
    position.x + x * range,
    position.y,
    position.z + z * range,
  ));
  const geometry = buildProjectedFireGeometry(points, nav, range);
  geometry.translate(-position.x, -position.y, -position.z);
  const surface = group.children.find((child) => child.userData.infernoSurface);
  if (!surface) return false;
  surface.geometry.dispose();
  surface.geometry = geometry;
  group.scale.set(1, 1, 1);
  group.userData.renderedGrenadeRange = range;
  return true;
}

export function updateInfernoEffect() {}
