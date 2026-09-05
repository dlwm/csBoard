// Renders height-sliced heatmaps so stacked floors do not bleed into each other.
import * as THREE from 'three';
import { ANALYSIS_UTILITY_COLORS, ANALYSIS_UTILITY_KINDS, HEAT_ATLAS_GRID, HEAT_HEIGHT_SLICES, HEAT_SLICE_SIZE } from './constants.js';

export function createHeatAtlasOverlay(nav, floorFadeState) {
  const canvas = document.createElement('canvas');
  canvas.width = HEAT_SLICE_SIZE * HEAT_ATLAS_GRID;
  canvas.height = HEAT_SLICE_SIZE * HEAT_ATLAS_GRID;
  // All height slices share one texture atlas to keep the overlay at one draw call.
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const geometry = nav.geometry;
  const positions = geometry.getAttribute('position');
  const uvs = new Float32Array(positions.count * 2);
  const width = Math.max(0.001, nav.modelBoundary.max.x - nav.modelBoundary.min.x);
  const depth = Math.max(0.001, nav.modelBoundary.max.y - nav.modelBoundary.min.y);
  for (let index = 0; index < positions.count; index += 1) {
    uvs[index * 2] = (positions.getX(index) + nav.group.position.x - nav.modelBoundary.min.x) / width;
    uvs[index * 2 + 1] = (positions.getZ(index) + nav.group.position.z - nav.modelBoundary.min.y) / depth;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    const worldY = positions.getY(index) + nav.group.position.y;
    minY = Math.min(minY, worldY);
    maxY = Math.max(maxY, worldY);
  }
  const material = new THREE.ShaderMaterial({
    uniforms: {
      heatAtlas: { value: texture },
      heatMinY: { value: minY },
      heatSpanY: { value: Math.max(0.001, maxY - minY) },
      floorFadeState: { value: floorFadeState },
    },
    vertexShader: 'varying vec2 vHeatUv; varying float vHeatWorldY; void main() { vHeatUv = uv; vHeatWorldY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D heatAtlas; uniform float heatMinY; uniform float heatSpanY; uniform vec4 floorFadeState; varying vec2 vHeatUv; varying float vHeatWorldY; void main() { if (floorFadeState.w > 0.5 && (vHeatWorldY < floorFadeState.x || vHeatWorldY > floorFadeState.y)) discard; float layer = floor(clamp((vHeatWorldY - heatMinY) / heatSpanY, 0.0, 0.999999) * ${HEAT_HEIGHT_SLICES.toFixed(1)}); float column = mod(layer, ${HEAT_ATLAS_GRID.toFixed(1)}); float row = floor(layer / ${HEAT_ATLAS_GRID.toFixed(1)}); vec2 localUv = clamp(vHeatUv, vec2(${(0.5 / HEAT_SLICE_SIZE).toFixed(8)}), vec2(${(1 - 0.5 / HEAT_SLICE_SIZE).toFixed(8)})); vec2 atlasUv = vec2((column + localUv.x) / ${HEAT_ATLAS_GRID.toFixed(1)}, ((${(HEAT_ATLAS_GRID - 1).toFixed(1)} - row) + localUv.y) / ${HEAT_ATLAS_GRID.toFixed(1)}); vec4 heat = texture2D(heatAtlas, atlasUv); if (heat.a < 0.01) discard; gl_FragColor = vec4(heat.rgb, heat.a * 0.9); }`,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.map = texture;
  material.userData.heatRange = { minY, maxY };
  const overlay = new THREE.Mesh(geometry, material);
  overlay.renderOrder = 4;
  nav.group.add(overlay);
  nav.mesh.material.addEventListener('dispose', () => {
    texture.dispose();
    material.dispose();
  });
  return overlay;
}

export function paintHeatAtlas({ overlay, cells, nav, heatRadiusWorld, areaMode, utilityMode }) {
  const canvas = overlay.material.map.image;
  const context = canvas.getContext('2d');
  const size = HEAT_SLICE_SIZE;
  const kinds = areaMode
    ? ['areaHeat']
    : utilityMode
      ? ANALYSIS_UTILITY_KINDS.map((kind) => `utility-${kind}`)
      : ['killerHeat', 'victimHeat', 'targetHeat', 'opponentHeat'];
  const valuesByLayer = new Map();
  const width = Math.max(0.001, nav.modelBoundary.max.x - nav.modelBoundary.min.x);
  const depth = Math.max(0.001, nav.modelBoundary.max.y - nav.modelBoundary.min.y);
  const radius = THREE.MathUtils.clamp(heatRadiusWorld / Math.max(width, depth) * size, 4, 72);
  const { minY: heatMinY, maxY: heatMaxY } = overlay.material.userData.heatRange;
  const heightSpan = Math.max(0.001, heatMaxY - heatMinY);
  cells.forEach((cell) => {
    const centerX = (cell.x - nav.modelBoundary.min.x) / width * (size - 1);
    const centerY = (1 - (cell.z - nav.modelBoundary.min.y) / depth) * (size - 1);
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(size - 1, Math.ceil(centerX + radius));
    const pixelMinY = Math.max(0, Math.floor(centerY - radius));
    const pixelMaxY = Math.min(size - 1, Math.ceil(centerY + radius));
    const sliceHeight = heightSpan / HEAT_HEIGHT_SLICES;
    // Limit influence to nearby height slices instead of projecting through floors.
    const verticalRadius = 0.75;
    const centerLayer = THREE.MathUtils.clamp(Math.floor((cell.y - heatMinY) / heightSpan * HEAT_HEIGHT_SLICES), 0, HEAT_HEIGHT_SLICES - 1);
    const layerRadius = Math.max(1, Math.ceil(verticalRadius / sliceHeight));
    for (let layer = Math.max(0, centerLayer - layerRadius); layer <= Math.min(HEAT_HEIGHT_SLICES - 1, centerLayer + layerRadius); layer += 1) {
      const layerY = heatMinY + (layer + 0.5) * sliceHeight;
      const verticalDistance = Math.abs(layerY - cell.y) / verticalRadius;
      if (verticalDistance > 1) continue;
      const verticalInfluence = Math.exp(-(verticalDistance ** 2) * 3.2);
      if (!valuesByLayer.has(layer)) valuesByLayer.set(layer, kinds.map(() => new Float32Array(size * size)));
      const values = valuesByLayer.get(layer);
      for (let y = pixelMinY; y <= pixelMaxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
        const distanceSquared = ((x - centerX) ** 2 + (y - centerY) ** 2) / (radius ** 2);
        if (distanceSquared <= 1) {
          const influence = Math.exp(-distanceSquared * 3.2) * verticalInfluence;
          kinds.forEach((kind, kindIndex) => {
            values[kindIndex][y * size + x] += influence * (cell.kinds[kind] || 0);
          });
        }
      }
    }
  });
  let peak = 0.001;
  valuesByLayer.forEach((values) => {
    for (let index = 0; index < size * size; index += 1) {
      peak = Math.max(peak, values.reduce((sum, field) => sum + field[index], 0));
    }
  });
  context.clearRect(0, 0, canvas.width, canvas.height);
  const colorRamps = (areaMode
    ? [['#17345f', '#ff5a47']]
    : utilityMode
      ? ANALYSIS_UTILITY_KINDS.map((kind) => ['#17345f', ANALYSIS_UTILITY_COLORS[kind]])
      : [['#59367f', '#ffb347'], ['#183f86', '#5da9ff'], ['#65255f', '#ff6b6b'], ['#2949a0', '#c58cff']]
  ).map(([cold, hot]) => [new THREE.Color(cold), new THREE.Color(hot)]);
  valuesByLayer.forEach((values, layer) => {
    const image = context.createImageData(size, size);
    for (let index = 0; index < size * size; index += 1) {
      const total = values.reduce((sum, field) => sum + field[index], 0);
      if (total < peak * 0.008) continue;
      const density = THREE.MathUtils.clamp(Math.pow(total / peak, 0.52), 0, 1);
      const mixed = new THREE.Color(0, 0, 0);
      colorRamps.forEach(([cold, hot], kindIndex) => {
        const weight = values[kindIndex][index] / total;
        if (!weight) return;
        const categoryDensity = THREE.MathUtils.clamp(Math.pow(values[kindIndex][index] / peak, 0.46), 0, 1);
        const temperature = THREE.MathUtils.smoothstep(categoryDensity, 0.45, 0.88);
        mixed.r += THREE.MathUtils.lerp(cold.r, hot.r, temperature) * weight;
        mixed.g += THREE.MathUtils.lerp(cold.g, hot.g, temperature) * weight;
        mixed.b += THREE.MathUtils.lerp(cold.b, hot.b, temperature) * weight;
      });
      const brightness = 0.72 + density * 0.38;
      image.data[index * 4] = Math.round(Math.min(1, mixed.r * brightness) * 255);
      image.data[index * 4 + 1] = Math.round(Math.min(1, mixed.g * brightness) * 255);
      image.data[index * 4 + 2] = Math.round(Math.min(1, mixed.b * brightness) * 255);
      image.data[index * 4 + 3] = Math.round(255 * THREE.MathUtils.smoothstep(density, 0.025, 0.72) * 0.9);
    }
    context.putImageData(image, (layer % HEAT_ATLAS_GRID) * size, Math.floor(layer / HEAT_ATLAS_GRID) * size);
  });
  overlay.material.map.needsUpdate = true;
}
