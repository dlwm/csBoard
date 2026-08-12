import * as THREE from 'three';

const MAP_SCALE = 0.0254;
const DISTANCE_RESOLUTION = 256;

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    if ((currentPoint.z > z) !== (previousPoint.z > z) && x < ((previousPoint.x - currentPoint.x) * (z - currentPoint.z)) / (previousPoint.z - currentPoint.z) + currentPoint.x) inside = !inside;
  }
  return inside;
}

function createDistanceTexture(areas, bounds) {
  const resolution = DISTANCE_RESOLUTION;
  const cellCount = resolution * resolution;
  const occupied = new Uint8Array(cellCount);
  const width = Math.max(bounds.max.x - bounds.min.x, 0.001);
  const depth = Math.max(bounds.max.z - bounds.min.z, 0.001);
  const cellSize = Math.max(width, depth) / resolution;
  areas.forEach((area) => {
    const points = area.corners.map((point) => ({ x: point.y * MAP_SCALE, z: point.x * MAP_SCALE }));
    const minX = Math.max(0, Math.floor((Math.min(...points.map((point) => point.x)) - bounds.min.x) / cellSize));
    const maxX = Math.min(resolution - 1, Math.ceil((Math.max(...points.map((point) => point.x)) - bounds.min.x) / cellSize));
    const minZ = Math.max(0, Math.floor((Math.min(...points.map((point) => point.z)) - bounds.min.z) / cellSize));
    const maxZ = Math.min(resolution - 1, Math.ceil((Math.max(...points.map((point) => point.z)) - bounds.min.z) / cellSize));
    for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
      const worldX = bounds.min.x + (x + 0.5) * cellSize;
      const worldZ = bounds.min.z + (z + 0.5) * cellSize;
      if (pointInPolygon(worldX, worldZ, points)) occupied[z * resolution + x] = 1;
    }
  });
  const distances = new Float32Array(cellCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const queue = new Int32Array(cellCount);
  let queueStart = 0;
  let queueEnd = 0;
  for (let index = 0; index < cellCount; index += 1) if (occupied[index]) { distances[index] = 0; queue[queueEnd++] = index; }
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    directions.forEach(([offsetX, offsetZ]) => {
      const nextX = x + offsetX;
      const nextZ = z + offsetZ;
      if (nextX < 0 || nextX >= resolution || nextZ < 0 || nextZ >= resolution) return;
      const nextIndex = nextZ * resolution + nextX;
      const nextDistance = distances[index] + 1;
      if (nextDistance < distances[nextIndex]) { distances[nextIndex] = nextDistance; queue[queueEnd++] = nextIndex; }
    });
  }
  const maxDistance = Math.max(width, depth);
  const data = new Uint8Array(cellCount);
  distances.forEach((distance, index) => { data[index] = Math.min(255, Math.round((distance * cellSize / maxDistance) * 255)); });
  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, origin: new THREE.Vector2(bounds.min.x, bounds.min.z), size: new THREE.Vector2(width, depth), maxDistance };
}

function createDistanceField(areas, bounds) {
  return createDistanceTexture(areas, bounds);
}

export function createNavMesh(navData, focusScreen, focusEnabled, viewportSize) {
  const positions = [];
  const colors = [];
  const edges = [];
  const areas = Object.values(navData.areas);
  const bounds = new THREE.Box3();
  const heights = areas.flatMap((area) => area.corners.map((point) => point.z));
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const color = new THREE.Color();
  const lowColor = new THREE.Color('#101827');
  const highColor = new THREE.Color('#68717d');

  areas.forEach((area) => {
    const points = area.corners;
    if (points.length < 3) return;
    points.forEach((point) => bounds.expandByPoint(new THREE.Vector3(point.y * MAP_SCALE, point.z * MAP_SCALE, point.x * MAP_SCALE)));
    const heightRatio = (points[0].z - minHeight) / Math.max(maxHeight - minHeight, 1);
    color.copy(lowColor).lerp(highColor, heightRatio * 0.72);
    for (let index = 1; index < points.length - 1; index += 1) {
      [points[0], points[index], points[index + 1]].forEach((point) => {
        positions.push(point.y * MAP_SCALE, point.z * MAP_SCALE, point.x * MAP_SCALE);
        colors.push(color.r, color.g, color.b);
      });
    }
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      edges.push(point.y * MAP_SCALE, point.z * MAP_SCALE + 0.025, point.x * MAP_SCALE, next.y * MAP_SCALE, next.z * MAP_SCALE + 0.025, next.x * MAP_SCALE);
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const meshMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1, depthTest: true, depthWrite: false, alphaTest: 0 });
  meshMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.focusEnabled = focusEnabled;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec2 focusScreen;\nuniform vec2 viewportSize;\nuniform float focusEnabled;',
    ).replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nvec2 navScreenPosition = gl_FragCoord.xy / viewportSize;\nvec2 navScreenDelta = navScreenPosition - focusScreen;\nnavScreenDelta.x *= viewportSize.x / viewportSize.y;\nfloat navFocusDistance = length(navScreenDelta);\nfloat navFocusFade = 1.0 - smoothstep(0.06, 0.34, navFocusDistance);\ndiffuseColor.a *= mix(1.0, navFocusFade, focusEnabled);\n#include <alphatest_fragment>',
    );
    shader.uniforms.focusScreen = { value: focusScreen };
    shader.uniforms.viewportSize = { value: viewportSize };
  };
  meshMaterial.customProgramCacheKey = () => 'nav-focus-fade-v1';
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.renderOrder = 1;
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  const edgeLines = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: '#385276', transparent: true, opacity: 0.48, depthTest: true, depthWrite: false }));
  edgeLines.renderOrder = 2;
  const group = new THREE.Group();
  group.add(mesh, edgeLines);
  const distanceField = null; // NAV LENS 暂时停用，保留距离场实现供后续恢复。
  return { group, mesh, edgeLines, geometry, edgeGeometry, distanceField, center: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()).length() };
}
