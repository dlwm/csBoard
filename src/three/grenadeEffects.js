import * as THREE from 'three';

const MAP_SCALE = 0.0254;

export function createGrenadeEffect(position, type, navData, nav) {
  const group = new THREE.Group();
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: type === 'smoke' ? '#b9c7d6' : '#202832', roughness: 1, metalness: 0, transparent: true, opacity: type === 'smoke' ? 0.24 : 0.38, depthWrite: false, flatShading: true });
  const addPulseRing = (radius, color, opacity = 0.7) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    return ring;
  };
  if (type === 'fire') {
    if (navData && nav) group.add(createFireNavEffect(position, navData, nav, 1.35));
    else {
      const fire = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshBasicMaterial({ color: '#ff3b18', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
      fire.rotation.x = -Math.PI / 2;
      fire.position.y = 0.012;
      group.add(fire);
      for (let index = 0; index < 3; index += 1) {
        const flame = new THREE.Mesh(new THREE.CircleGeometry(2 - index * 0.35, 32), new THREE.MeshBasicMaterial({ color: index === 2 ? '#fff06a' : index === 1 ? '#ff8a17' : '#ff1f12', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
        flame.rotation.x = -Math.PI / 2;
        flame.position.y = 0.02 + index * 0.002;
        group.add(flame);
      }
    }
    addPulseRing(2.55, '#ffad32', 0.7);
    addPulseRing(2.9, '#ff3b18', 0.35);
  } else if (type === 'flash') {
    const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 2), new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0.95, depthWrite: false }));
    group.add(flash, new THREE.PointLight('#fff1a8', 5, 8));
    addPulseRing(0.85, '#fff0a0', 0.9);
    const rayMaterial = new THREE.LineBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.72 });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(angle) * 0.65, 0, Math.sin(angle) * 0.65), new THREE.Vector3(Math.cos(angle) * 1.5, 0, Math.sin(angle) * 1.5)]);
      group.add(new THREE.Line(geometry, rayMaterial));
    }
  } else if (type === 'decoy') {
    const decoy = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.62, 16), new THREE.MeshStandardMaterial({ color: '#9eabb2', roughness: 0.42, metalness: 0.7, transparent: true, opacity: 0.95, depthWrite: false }));
    decoy.position.y = 0.3;
    decoy.userData.decoyBlink = true;
    group.add(decoy);
    addPulseRing(0.52, '#b9c7d6', 0.55);
  } else {
    const count = type === 'smoke' ? 14 : 8;
    const smokeScale = type === 'smoke' ? 2.7 : 1;
    if (type === 'explosion') {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.72, depthWrite: false }));
      core.position.y = 0.3;
      group.add(core);
      addPulseRing(0.95, '#ff7a32', 0.8);
      addPulseRing(1.35, '#ffb347', 0.42);
    }
    for (let index = 0; index < count; index += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry((type === 'smoke' ? 0.75 : 0.62) * smokeScale, 16, 10), smokeMaterial.clone());
      puff.position.set(Math.sin(index * 2.4) * 0.38 * smokeScale, (0.55 + (index % 3) * 0.3) * smokeScale, Math.cos(index * 1.7) * 0.38 * smokeScale);
      puff.scale.y = 0.62;
      puff.scale.x = 0.85 + (index % 4) * 0.16;
      puff.scale.z = 0.85 + ((index + 1) % 3) * 0.18;
      group.add(puff);
    }
  }
  group.position.copy(position);
  group.traverse((object) => {
    object.renderOrder = 5;
    if (object.material) { object.material.depthTest = true; object.material.depthWrite = false; }
  });
  group.userData.grenadeEffect = type;
  return group;
}

export function disposeGrenadeEffect(effect) {
  effect?.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
}

export function grenadeTypeFromPointer(pointer) {
  const angle = Math.atan2(pointer.y, pointer.x);
  if (angle >= Math.PI * 0.25 && angle < Math.PI * 0.75) return 'smoke';
  if (angle >= -Math.PI * 0.25 && angle < Math.PI * 0.25) return 'fire';
  if (angle >= -Math.PI * 0.75 && angle < -Math.PI * 0.25) return 'flash';
  return 'explosion';
}

export function createFireNavEffect(position, navData, nav, range = 1) {
  const areas = Object.values(navData.areas);
  const toWorld = (point) => new THREE.Vector3(point.y * MAP_SCALE, point.z * MAP_SCALE, point.x * MAP_SCALE).add(nav.group.position);
  const areaInfo = areas.map((area) => {
    const corners = area.corners.map(toWorld);
    const center = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).multiplyScalar(1 / corners.length);
    return { area, corners, center, height: center.y };
  });
  const start = areaInfo.sort((left, right) => left.center.distanceToSquared(position) - right.center.distanceToSquared(position))[0];
  const visited = new Set();
  const queue = start ? [start] : [];
  const startHeight = start?.height ?? position.y;
  const group = new THREE.Group();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.area.area_id)) continue;
    visited.add(current.area.area_id);
    if (current.height > startHeight + 0.08 || current.center.distanceTo(position) > 3.4 * range) continue;
    const vertices = [];
    for (let index = 1; index < current.corners.length - 1; index += 1) {
      [current.corners[0], current.corners[index], current.corners[index + 1]].forEach((corner) => vertices.push(corner.x - position.x, corner.y - position.y + 0.035, corner.z - position.z));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
     group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ff4b18', transparent: true, opacity: 0.5, depthTest: true, depthWrite: false, side: THREE.DoubleSide })));
    current.area.connections.forEach((connection) => {
      const next = areaInfo.find((item) => item.area.area_id === connection);
      if (next && !visited.has(next.area.area_id)) queue.push(next);
    });
  }
  group.traverse((object) => {
    object.renderOrder = 5;
    if (object.material) {
       object.material.depthTest = true;
      object.material.depthWrite = false;
    }
  });
  group.userData.fireNav = true;
  return group;
}
