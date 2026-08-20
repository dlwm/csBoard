import * as THREE from 'three';

export function createGhostMaterial(focusScreen, viewportSize, viewMode, distanceField = null) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3b4858'),
    transparent: true,
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
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 modelWorldPosition;',
    ).replace(
      '#include <project_vertex>',
      'modelWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 modelWorldPosition;\nuniform vec2 focusScreen;\nuniform vec2 viewportSize;\nuniform float modelViewMode;\nuniform sampler2D navDistanceTexture;\nuniform vec2 navDistanceOrigin;\nuniform vec2 navDistanceSize;\nuniform float navDistanceMax;',
    ).replace(
      '#include <alphatest_fragment>',
      'vec2 modelScreenPosition = gl_FragCoord.xy / viewportSize;\nvec2 modelScreenDelta = modelScreenPosition - focusScreen;\nmodelScreenDelta.x *= viewportSize.x / viewportSize.y;\nfloat modelFocusDistance = length(modelScreenDelta);\nfloat mouseFade = smoothstep(0.06, 0.34, modelFocusDistance);\nfloat cameraFade = smoothstep(18.0, 34.0, length(vViewPosition));\nvec2 navUv = (modelWorldPosition.xz - navDistanceOrigin) / navDistanceSize;\nfloat navInside = step(0.0, navUv.x) * step(navUv.x, 1.0) * step(0.0, navUv.y) * step(navUv.y, 1.0);\nfloat navDistance = texture2D(navDistanceTexture, navUv).r * navDistanceMax;\nfloat navFade = mix(1.0, smoothstep(1.5, 7.0, navDistance), navInside);\nfloat activeFade = navFade;\nactiveFade = mix(activeFade, mouseFade, step(0.5, modelViewMode));\nactiveFade = mix(activeFade, cameraFade, step(1.5, modelViewMode));\ndiffuseColor.a *= activeFade;\n#include <alphatest_fragment>',
    );
    shader.uniforms.focusScreen = { value: focusScreen };
    shader.uniforms.viewportSize = { value: viewportSize };
    shader.uniforms.modelViewMode = viewMode;
    shader.uniforms.navDistanceTexture = { value: distanceField?.texture || null };
    shader.uniforms.navDistanceOrigin = { value: distanceField?.origin || new THREE.Vector2() };
    shader.uniforms.navDistanceSize = { value: distanceField?.size || new THREE.Vector2(1, 1) };
    shader.uniforms.navDistanceMax = { value: distanceField?.maxDistance || 1 };
  };
  material.customProgramCacheKey = () => 'model-screen-focus-depth-v1';
  return material;
}
