import * as THREE from 'three';

export function createGhostMaterial(focusScreen, viewportSize, viewMode) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7b887f'),
    transparent: true,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    alphaTest: 0.01,
    roughness: 0.82,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec2 focusScreen;\nuniform vec2 viewportSize;\nuniform float modelViewMode;',
    ).replace(
      '#include <alphatest_fragment>',
      'vec2 modelScreenPosition = gl_FragCoord.xy / viewportSize;\nvec2 modelScreenDelta = modelScreenPosition - focusScreen;\nmodelScreenDelta.x *= viewportSize.x / viewportSize.y;\nfloat modelFocusDistance = length(modelScreenDelta);\nfloat mouseFade = smoothstep(0.12, 0.24, modelFocusDistance);\nfloat cameraFade = smoothstep(18.0, 34.0, length(vViewPosition));\nfloat activeFade = mix(1.0, mouseFade, step(0.5, modelViewMode));\nactiveFade = mix(activeFade, cameraFade, step(1.5, modelViewMode));\ndiffuseColor.a *= activeFade;\n#include <alphatest_fragment>',
    );
    shader.uniforms.focusScreen = { value: focusScreen };
    shader.uniforms.viewportSize = { value: viewportSize };
    shader.uniforms.modelViewMode = viewMode;
  };
  material.customProgramCacheKey = () => 'model-screen-focus-depth-v1';
  return material;
}
