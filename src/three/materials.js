import * as THREE from 'three';

// Map-only lighting response: leave players, NAV and effect colours untouched.
// exposure scales linear radiance; Reinhard compresses highlights before sRGB
// conversion, preventing bright exported surfaces from clipping to flat white.
// 只调整世界模型：曝光先在线性空间缩放，再压缩亮部，保留贴图层次。
const MAP_LIGHT_EXPOSURE = 0.65;

const MAP_SCALE = 0.0254;
const MODEL_FADE_START = 50 * MAP_SCALE;
const MODEL_FADE_END = 70 * MAP_SCALE;

export function createGhostMaterial(focusScreen, viewportSize, viewMode, viewRange, source = null) {
  const material = source ? source.clone() : new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b4858'),
    transparent: false,
    alphaToCoverage: true,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    alphaTest: 0,
    roughness: 0.82,
    metalness: 0.08,
    emissive: new THREE.Color('#101923'),
    emissiveIntensity: 0.32,
  });
  // Original materials share textures, while each display material owns its
  // fade uniforms. Both styles retain identical visibility controls.
  // 原始材质复用贴图，但淡化参数独立；两种样式共用可见性规则。
  material.alphaToCoverage = true;
  delete material.userData.csboardMapSquareFade;
  delete material.userData.csboardFloorFade;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec2 focusScreen;\nuniform vec2 viewportSize;\nuniform float modelViewMode;\nuniform float modelViewRange;',
    ).replace(
      '#include <alphatest_fragment>',
      'vec2 modelScreenPosition = gl_FragCoord.xy / viewportSize;\nvec2 modelScreenDelta = modelScreenPosition - focusScreen;\nmodelScreenDelta.x *= viewportSize.x / viewportSize.y;\nfloat modelFocusDistance = length(modelScreenDelta);\nfloat viewRangeScale = mix(modelViewRange * 2.0, modelViewRange + 0.5, step(0.5, modelViewRange));\nfloat safeViewRangeScale = max(viewRangeScale, 0.0001);\nfloat viewRangeEnabled = step(0.001, modelViewRange);\nfloat mouseFade = mix(1.0, smoothstep(0.06 * safeViewRangeScale, 0.34 * safeViewRangeScale, modelFocusDistance), viewRangeEnabled);\nfloat cameraFade = mix(1.0, smoothstep(18.0 * safeViewRangeScale, 34.0 * safeViewRangeScale, length(vViewPosition)), viewRangeEnabled);\nfloat activeFade = 1.0;\nactiveFade = mix(activeFade, mouseFade, step(0.5, modelViewMode));\nactiveFade = mix(activeFade, cameraFade, step(1.5, modelViewMode));\ndiffuseColor.a *= activeFade;\n#include <alphatest_fragment>',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight *= ${MAP_LIGHT_EXPOSURE.toFixed(2)};\noutgoingLight = outgoingLight / (vec3(1.0) + outgoingLight);\n#include <opaque_fragment>`,
    );
    shader.uniforms.focusScreen = { value: focusScreen };
    shader.uniforms.viewportSize = { value: viewportSize };
    shader.uniforms.modelViewMode = viewMode;
    shader.uniforms.modelViewRange = viewRange;
  };
  material.customProgramCacheKey = () => `model-screen-focus-alpha-to-coverage-v4-${source ? 'original' : 'simple'}`;
  return material;
}

export function enableMapSquareFade(material, boundary, layerState) {
  if (!material || !boundary || material.userData.csboardMapSquareFade) return;
  material.userData.csboardMapSquareFade = true;
  if (!material.alphaToCoverage) material.transparent = true;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <alphatest_fragment>')) return;
    shader.uniforms.navBoundaryMin = { value: boundary.min };
    shader.uniforms.navBoundaryMax = { value: boundary.max };
    shader.uniforms.navModelFadeStart = { value: MODEL_FADE_START };
    shader.uniforms.navModelFadeEnd = { value: MODEL_FADE_END };
    shader.uniforms.mapLayerState = { value: layerState };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 navBoundaryWorldPosition;').replace('#include <project_vertex>', 'navBoundaryWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 navBoundaryWorldPosition;\nuniform vec2 navBoundaryMin;\nuniform vec2 navBoundaryMax;\nuniform float navModelFadeStart;\nuniform float navModelFadeEnd;\nuniform vec4 mapLayerState;').replace('#include <alphatest_fragment>', 'vec2 navBoundaryOutside = max(max(navBoundaryMin - navBoundaryWorldPosition.xz, navBoundaryWorldPosition.xz - navBoundaryMax), vec2(0.0));\nfloat navBoundaryDistance = length(navBoundaryOutside);\nfloat navBoundaryAlpha = 1.0 - smoothstep(navModelFadeStart, navModelFadeEnd, navBoundaryDistance);\ndiffuseColor.a *= mix(1.0, navBoundaryAlpha, step(0.5, mapLayerState.w));\nif (diffuseColor.a < 0.01) discard;\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}-csboard-square-boundary-fade-v2`;
  material.needsUpdate = true;
}
