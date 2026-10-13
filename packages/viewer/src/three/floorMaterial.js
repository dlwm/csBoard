export function floorVisibilityAtY(y, state) {
  if (state.w < 0.5) return 1;
  return y >= state.x && y <= state.y ? 1 : 0;
}

export function enableMaterialFloorFade(material, state) {
  // Imported scenes can expose placeholder material-like values; only patch real Three materials.
  if (!material?.isMaterial || material.userData?.csboardIgnoreFloorFade) return;
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
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float csboardFloorWorldY;').replace('#include <project_vertex>', 'vec4 csboardFloorPosition = vec4(transformed, 1.0);\n#ifdef USE_BATCHING\ncsboardFloorPosition = batchingMatrix * csboardFloorPosition;\n#endif\n#ifdef USE_INSTANCING\ncsboardFloorPosition = instanceMatrix * csboardFloorPosition;\n#endif\ncsboardFloorWorldY = (modelMatrix * csboardFloorPosition).y;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float csboardFloorWorldY;\nuniform vec4 floorFadeState;').replace('#include <dithering_fragment>', 'float csboardFloorAlpha = step(floorFadeState.x, csboardFloorWorldY) * step(csboardFloorWorldY, floorFadeState.y);\ngl_FragColor.a *= mix(1.0, csboardFloorAlpha, floorFadeState.w);\nif (gl_FragColor.a < 0.01) discard;\n#include <dithering_fragment>');
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}-csboard-floor-range-v4`;
  material.needsUpdate = true;
}

export function enableObjectFloorFade(object, state) {
  object.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => enableMaterialFloorFade(material, state));
  });
}
