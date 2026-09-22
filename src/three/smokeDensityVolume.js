import * as THREE from 'three';

const MAX_MARCH_STEPS = 72;
const vertexShader = `
  in vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  out vec3 localPosition;
  void main() {
    localPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  precision highp sampler3D;
  in vec3 localPosition;
  uniform sampler3D densityMap;
  uniform vec3 cameraLocal;
  uniform mat4 smokeModelView;
  uniform mat4 smokeProjection;
  uniform float fieldResolution;
  uniform int blastCount;
  uniform vec4 blastData[4];
  uniform float blastStrength[4];
  uniform mat4 modelMatrix;
  out vec4 fragColor;

  vec2 boxInterval(vec3 origin, vec3 direction) {
    vec3 inverseDirection = 1.0 / direction;
    vec3 a = (-1.0 - origin) * inverseDirection;
    vec3 b = (1.0 - origin) * inverseDirection;
    vec3 nearSide = min(a, b);
    vec3 farSide = max(a, b);
    return vec2(max(max(nearSide.x, nearSide.y), nearSide.z), min(min(farSide.x, farSide.y), farSide.z));
  }

  void main() {
    vec3 direction = normalize(localPosition - cameraLocal);
    vec2 interval = boxInterval(cameraLocal, direction);
    float start = max(interval.x, 0.0);
    float distance = interval.y - start;
    if (distance <= 0.0) discard;

    float steps = clamp(ceil(distance * fieldResolution * 0.72), 1.0, ${MAX_MARCH_STEPS}.0);
    float stride = distance / steps;
    float opacity = 0.0;
    float firstHit = -1.0;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    for (int index = 0; index < ${MAX_MARCH_STEPS}; index++) {
      if (float(index) >= steps || opacity >= 0.985) break;
      float travel = start + (float(index) + 0.25 + jitter * 0.5) * stride;
      vec3 point = cameraLocal + direction * travel;
      float density = texture(densityMap, clamp(point * 0.5 + 0.5, 0.0, 1.0)).r;
      if (blastCount > 0 && density > 0.005) {
        vec3 worldPoint = (modelMatrix * vec4(point, 1.0)).xyz;
        for (int blast = 0; blast < 4; blast++) {
          if (blast >= blastCount) break;
          float radius = blastData[blast].w;
          float inside = 1.0 - smoothstep(radius * 0.76, radius, length(worldPoint - blastData[blast].xyz));
          density *= 1.0 - inside * blastStrength[blast] * 0.98;
        }
      }
      if (density <= 0.005) continue;
      if (firstHit < 0.0) firstHit = travel;
      float sampleOpacity = 1.0 - exp(-density * 0.18 * stride * fieldResolution * 0.5);
      opacity += (1.0 - opacity) * sampleOpacity;
    }
    if (opacity < 0.008 || firstHit < 0.0) discard;

    // Compare against the first occupied sample, not the back of the volume box.
    vec4 clip = smokeProjection * smokeModelView * vec4(cameraLocal + direction * firstHit, 1.0);
    gl_FragDepth = clamp(clip.z / max(clip.w, 0.0001) * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(0.62, 0.66, 0.67, opacity);
  }
`;

const smoothstep = (start, end, value) => {
  const progress = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

export function createSmokeDensityVolume(field, resolution, scale, position) {
  const densities = new Uint8Array(field.length);
  // Keep the old iso-surface inside the dense core while retaining a soft outer band.
  for (let index = 0; index < field.length; index += 1) {
    densities[index] = Math.round(255 * smoothstep(16, 145, field[index]));
  }
  const texture = new THREE.Data3DTexture(densities, resolution, resolution, resolution);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      densityMap: { value: texture },
      cameraLocal: { value: new THREE.Vector3() },
      smokeModelView: { value: new THREE.Matrix4() },
      smokeProjection: { value: new THREE.Matrix4() },
      fieldResolution: { value: resolution },
      blastCount: { value: 0 },
      blastData: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      blastStrength: { value: new Float32Array(4) },
    },
    side: THREE.BackSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.position.copy(position);
  mesh.scale.setScalar(scale);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData.smokeDensityTexture = texture;
  mesh.userData.setSmokeBlasts = (blasts) => {
    const count = Math.min(4, blasts.length);
    material.uniforms.blastCount.value = count;
    for (let index = 0; index < count; index += 1) {
      const blast = blasts[index];
      material.uniforms.blastData.value[index].set(blast.x, blast.y, blast.z, blast.radius);
      material.uniforms.blastStrength.value[index] = blast.strength;
    }
  };
  const worldCamera = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(worldCamera);
    material.uniforms.cameraLocal.value.copy(mesh.worldToLocal(worldCamera));
    material.uniforms.smokeModelView.value.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    material.uniforms.smokeProjection.value.copy(camera.projectionMatrix);
  };
  return mesh;
}
