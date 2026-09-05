// Builds a lightweight top-view NAV boundary collider for aim rays and placement.
import * as THREE from 'three';

const MAP_UNITS_TO_METERS = 0.0254;
const TOP_VIEW_RESOLUTION = 256;

const pointInNavPolygon = (x, z, points) => {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    if ((currentPoint.z > z) !== (previousPoint.z > z) && x < ((previousPoint.x - currentPoint.x) * (z - currentPoint.z)) / (previousPoint.z - currentPoint.z) + currentPoint.x) inside = !inside;
  }
  return inside;
};

export const getNavSourceBounds = (navData) => Object.values(navData?.areas || {}).flatMap((area) => area.corners || []).reduce((bounds, point) => ({
  minX: Math.min(bounds.minX, point.y * MAP_UNITS_TO_METERS),
  maxX: Math.max(bounds.maxX, point.y * MAP_UNITS_TO_METERS),
  minZ: Math.min(bounds.minZ, point.x * MAP_UNITS_TO_METERS),
  maxZ: Math.max(bounds.maxZ, point.x * MAP_UNITS_TO_METERS),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

export default function createNavBoundaryCollider(navData, getModelCenter) {
  const radarSourceBounds = getNavSourceBounds(navData);
  // Rasterizing once makes repeated ray-boundary checks cheap during pointer movement.
  const mask = new Uint8Array(TOP_VIEW_RESOLUTION * TOP_VIEW_RESOLUTION);
  const width = radarSourceBounds.maxX - radarSourceBounds.minX;
  const depth = radarSourceBounds.maxZ - radarSourceBounds.minZ;
  const areas = Object.values(navData?.areas || {}).map((area) => (area.corners || []).map((point) => ({
    x: point.y * MAP_UNITS_TO_METERS,
    z: point.x * MAP_UNITS_TO_METERS,
  }))).filter((points) => points.length >= 3);
  if (Number.isFinite(width) && width > 0 && depth > 0) areas.forEach((points) => {
    const minX = Math.max(0, Math.floor((Math.min(...points.map((point) => point.x)) - radarSourceBounds.minX) / width * TOP_VIEW_RESOLUTION));
    const maxX = Math.min(TOP_VIEW_RESOLUTION - 1, Math.ceil((Math.max(...points.map((point) => point.x)) - radarSourceBounds.minX) / width * TOP_VIEW_RESOLUTION));
    const minZ = Math.max(0, Math.floor((Math.min(...points.map((point) => point.z)) - radarSourceBounds.minZ) / depth * TOP_VIEW_RESOLUTION));
    const maxZ = Math.min(TOP_VIEW_RESOLUTION - 1, Math.ceil((Math.max(...points.map((point) => point.z)) - radarSourceBounds.minZ) / depth * TOP_VIEW_RESOLUTION));
    for (let zIndex = minZ; zIndex <= maxZ; zIndex += 1) for (let xIndex = minX; xIndex <= maxX; xIndex += 1) {
      const x = radarSourceBounds.minX + (xIndex + 0.5) / TOP_VIEW_RESOLUTION * width;
      const z = radarSourceBounds.minZ + (zIndex + 0.5) / TOP_VIEW_RESOLUTION * depth;
      if (pointInNavPolygon(x, z, points)) mask[zIndex * TOP_VIEW_RESOLUTION + xIndex] = 1;
    }
  });
  const isInTopView = (x, z) => {
    const xIndex = Math.floor((x - radarSourceBounds.minX) / width * TOP_VIEW_RESOLUTION);
    const zIndex = Math.floor((z - radarSourceBounds.minZ) / depth * TOP_VIEW_RESOLUTION);
    return xIndex >= 0 && xIndex < TOP_VIEW_RESOLUTION && zIndex >= 0 && zIndex < TOP_VIEW_RESOLUTION && mask[zIndex * TOP_VIEW_RESOLUTION + xIndex] === 1;
  };
  const collider = new THREE.Object3D();
  collider.raycast = (activeRaycaster, intersections) => {
    if (!Number.isFinite(radarSourceBounds.minX)) return;
    const origin = activeRaycaster.ray.origin;
    const direction = activeRaycaster.ray.direction;
    const modelCenter = getModelCenter();
    const isValidAt = (distance) => isInTopView(origin.x + direction.x * distance + modelCenter.x, origin.z + direction.z * distance + modelCenter.z);
    let distance = null;
    if (!isValidAt(activeRaycaster.near)) distance = activeRaycaster.near;
    else {
      const horizontalSpeed = Math.hypot(direction.x, direction.z);
      if (horizontalSpeed > 1e-6) {
        const cellSize = Math.min(width, depth) / TOP_VIEW_RESOLUTION;
        const step = Math.max(0.02, cellSize * 0.45 / horizontalSpeed);
        let previous = activeRaycaster.near;
        for (let candidate = previous + step; candidate <= activeRaycaster.far + step; candidate += step) {
          const current = Math.min(candidate, activeRaycaster.far);
          if (!isValidAt(current)) {
            let valid = previous;
            let invalid = current;
            for (let iteration = 0; iteration < 7; iteration += 1) {
              const middle = (valid + invalid) / 2;
              if (isValidAt(middle)) valid = middle;
              else invalid = middle;
            }
            distance = invalid;
            break;
          }
          if (current === activeRaycaster.far) break;
          previous = current;
        }
      }
    }
    if (distance == null) return;
    intersections.push({ distance, point: activeRaycaster.ray.at(distance, new THREE.Vector3()), object: collider });
  };
  return collider;
}
