// Computes active floor ranges and injects their clipping test into Three.js materials.
import { TUTORIAL_MAP_ID } from './tutorialMap.js';

const MAP_FLOOR_BOUNDARIES = {
  [TUTORIAL_MAP_ID]: 66.54,
  de_nuke: -495,
  de_train: -50,
  de_vertigo: 11700,
};
const MAP_UNITS_TO_METERS = 0.0254;
const FLOOR_BOTTOM_PADDING = 64;
const FLOOR_TOP_PADDING = 96;
// NAV objects are immutable per map load, so derived ranges can be cached by identity.
const floorRangeCache = new WeakMap();

export function updateFloorFadeState(state, mapName, floor, modelCenterY = 0, navData = null) {
  if (floor === 'all' || !navData?.areas) {
    state.set(0, 0, 0, 0);
    return;
  }
  let cached = floorRangeCache.get(navData);
  if (!cached || cached.mapName !== mapName) {
    const boundary = MAP_FLOOR_BOUNDARIES[mapName];
    let allMin = Infinity;
    let allMax = -Infinity;
    let lowerMin = Infinity;
    let upperMax = -Infinity;
    Object.values(navData.areas).forEach((area) => (area.corners || []).forEach((point) => {
      const height = Number(point.z);
      if (!Number.isFinite(height)) return;
      allMin = Math.min(allMin, height);
      allMax = Math.max(allMax, height);
      if (boundary != null && height <= boundary) lowerMin = Math.min(lowerMin, height);
      if (boundary != null && height >= boundary) upperMax = Math.max(upperMax, height);
    }));
    cached = {
      mapName,
      main: Number.isFinite(allMin) && Number.isFinite(allMax)
        ? [boundary == null ? allMin - FLOOR_BOTTOM_PADDING : boundary, (boundary == null ? allMax : upperMax) + FLOOR_TOP_PADDING]
        : null,
      lower: boundary != null && Number.isFinite(lowerMin) ? [lowerMin - FLOOR_BOTTOM_PADDING, boundary] : null,
    };
    floorRangeCache.set(navData, cached);
  }
  const range = cached[floor];
  if (!range || !range.every(Number.isFinite)) {
    state.set(0, 0, 0, 0);
    return;
  }
  state.set(range[0] * MAP_UNITS_TO_METERS - modelCenterY, range[1] * MAP_UNITS_TO_METERS - modelCenterY, 0, 1);
}

export function floorVisibilityAtY(y, state) {
  if (state.w < 0.5) return 1;
  return y >= state.x && y <= state.y ? 1 : 0;
}

export function enableMaterialFloorFade(material, state) {
  // Imported scenes can expose placeholder material-like values; only patch real Three materials.
  if (!material?.isMaterial) return;
  // Some loaders/cloners omit userData even though core Three materials normally initialize it.
  if (!material.userData) material.userData = {};
  if (material.userData.csboardFloorFade) return;
  material.userData.csboardFloorFade = true;
  if (!material.alphaHash && !material.alphaToCoverage) material.transparent = true;
  const previousCompile = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile.bind(material) : null;
  const previousCacheKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <dithering_fragment>')) return;
    shader.uniforms.floorFadeState = { value: state };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float csboardFloorWorldY;').replace('#include <project_vertex>', 'csboardFloorWorldY = (modelMatrix * vec4(transformed, 1.0)).y;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float csboardFloorWorldY;\nuniform vec4 floorFadeState;').replace('#include <dithering_fragment>', 'float csboardFloorAlpha = step(floorFadeState.x, csboardFloorWorldY) * step(csboardFloorWorldY, floorFadeState.y);\ngl_FragColor.a *= mix(1.0, csboardFloorAlpha, floorFadeState.w);\nif (gl_FragColor.a < 0.01) discard;\n#include <dithering_fragment>');
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}-csboard-floor-range-v2`;
  material.needsUpdate = true;
}

export function enableObjectFloorFade(object, state) {
  object.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => enableMaterialFloorFade(material, state));
  });
}
