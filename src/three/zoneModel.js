import * as THREE from 'three';

// Map and Blender object name -> display settings. Heights use uncentered model meters.
export const ZONE_MAP_SETTINGS = {
  de_dust2: {
    ZONE_T: { color: '#ffb347', height: 3 },
    ZONE_CT: { color: '#5da9ff', height: -3 },
    ZONE_BOMB_A: { color: '#ff5147', height: 2.4384 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_mirage: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_nuke: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_ancient: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_anubis: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_cache: {
    ZONE_T: { color: '#ffb347', height: 41 },
    ZONE_CT: { color: '#5da9ff', height: 42 },
    ZONE_BOMB_A: { color: '#ff5147', height: 43 },
    ZONE_BOMB_B: { color: '#ff5147', height: 42.3 },
  },
  de_inferno: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_overpass: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_train: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
  de_vertigo: {
    ZONE_T: { color: '#ffb347', height: 0 },
    ZONE_CT: { color: '#5da9ff', height: 0 },
    ZONE_BOMB_A: { color: '#ff5147', height: 0 },
    ZONE_BOMB_B: { color: '#ff5147', height: 0 },
  },
};

function createZoneMaterial(color, height) {
  return new THREE.ShaderMaterial({
    uniforms: {
      zoneColor: { value: new THREE.Color(color) },
      zoneHeight: { value: Math.max(height, 0.001) },
      zoneOpacity: { value: 0.46 },
    },
    vertexShader: `
      attribute float groundHeight;
      varying float zoneModelHeight;
      varying float zoneGroundHeight;

      void main() {
        zoneModelHeight = position.y;
        zoneGroundHeight = groundHeight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zoneColor;
      uniform float zoneHeight;
      uniform float zoneOpacity;
      varying float zoneModelHeight;
      varying float zoneGroundHeight;

      void main() {
        float heightRatio = clamp((zoneModelHeight - zoneGroundHeight) / zoneHeight, 0.0, 1.0);
        float alpha = zoneOpacity * (1.0 - smoothstep(0.0, 0.2, heightRatio));
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(zoneColor, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function pointKey(point) {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
}

function bottomBoundaryEdges(mesh, rootInverse) {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  if (!position) return [];
  const transform = rootInverse.clone().multiply(mesh.matrixWorld);
  const index = source.index;
  const edges = new Map();
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const triangleCount = index ? index.count / 3 : position.count / 3;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    points.forEach((point, vertex) => point.fromBufferAttribute(position, index ? index.getX(offset + vertex) : offset + vertex).applyMatrix4(transform));
    [[0, 1, 2], [1, 2, 0], [2, 0, 1]].forEach(([first, second, opposite]) => {
      const a = points[first];
      const b = points[second];
      if (Math.abs(a.y - b.y) > 0.002 || points[opposite].y <= (a.y + b.y) * 0.5 + 0.002) return;
      const aKey = pointKey(a);
      const bKey = pointKey(b);
      const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
      if (!edges.has(key)) edges.set(key, [a.clone(), b.clone()]);
    });
  }
  return [...edges.values()];
}

function horizontalZoneGeometry(mesh, rootInverse, groundHeight) {
  const edges = bottomBoundaryEdges(mesh, rootInverse);
  if (!edges.length) return null;
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(rootInverse.clone().multiply(mesh.matrixWorld));
  const zoneHeight = Math.max(bounds.max.y - bounds.min.y, 0.001);
  const visibleHeight = zoneHeight * 0.2;
  const positions = [];
  const groundHeights = [];

  edges.forEach(([start, end]) => {
    positions.push(
      start.x, groundHeight, start.z, end.x, groundHeight, end.z, end.x, groundHeight + visibleHeight, end.z,
      start.x, groundHeight, start.z, end.x, groundHeight + visibleHeight, end.z, start.x, groundHeight + visibleHeight, start.z,
    );
    groundHeights.push(groundHeight, groundHeight, groundHeight, groundHeight, groundHeight, groundHeight);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('groundHeight', new THREE.Float32BufferAttribute(groundHeights, 1));
  geometry.computeBoundingSphere();
  geometry.userData.zoneHeight = zoneHeight;
  return geometry;
}

export function createZoneModel(zoneRoot, mapName) {
  zoneRoot.updateMatrixWorld(true);
  const rootInverse = zoneRoot.matrixWorld.clone().invert();
  const group = new THREE.Group();
  group.name = 'map-zones';
  group.userData.csboardZone = true;

  zoneRoot.traverse((object) => {
    if (!object.isMesh) return;
    const settings = ZONE_MAP_SETTINGS[mapName]?.[object.name.toUpperCase()];
    if (!settings) return;
    const geometry = horizontalZoneGeometry(object, rootInverse, settings.height);
    if (!geometry) return;
    const zone = new THREE.Mesh(geometry, createZoneMaterial(settings.color, geometry.userData.zoneHeight));
    zone.name = object.name;
    zone.userData = { ...object.userData, csboardZone: true };
    zone.renderOrder = 4;
    group.add(zone);
  });

  return group;
}
