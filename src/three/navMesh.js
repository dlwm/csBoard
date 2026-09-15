import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const MAP_SCALE = 0.0254;

export function createNavMesh(navData, focusScreen, focusEnabled, viewportSize) {
  const positions = [];
  const colors = [];
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
    for (let index = 1; index < points.length - 1; index += 1) {
      [points[0], points[index], points[index + 1]].forEach((point) => {
        positions.push(point.y * MAP_SCALE, point.z * MAP_SCALE, point.x * MAP_SCALE);
        const heightRatio = (point.z - minHeight) / Math.max(maxHeight - minHeight, 1);
        color.copy(lowColor).lerp(highColor, heightRatio * 0.72);
        colors.push(color.r, color.g, color.b);
      });
    }
  });

  const sourceGeometry = new THREE.BufferGeometry();
  sourceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sourceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Welding shared corners removes per-area lighting seams while keeping the
  // original NAV heights intact for raycasts and layered floors.
  const geometry = mergeVertices(sourceGeometry, 0.0001);
  sourceGeometry.dispose();
  geometry.computeVertexNormals();
  // Fire projection and heat markers raycast the NAV surface repeatedly.
  geometry.computeBoundsTree?.();
  const meshMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 1, depthTest: true, depthWrite: true, alphaTest: 0 });
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
  const group = new THREE.Group();
  group.add(mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const halfSide = Math.max(boundsSize.x, boundsSize.z) * 0.5;
  const modelBoundary = { min: new THREE.Vector2(center.x - halfSide, center.z - halfSide), max: new THREE.Vector2(center.x + halfSide, center.z + halfSide) };
  return { group, mesh, geometry, modelBoundary, bounds, center, size: boundsSize.length() };
}
