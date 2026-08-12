import * as THREE from 'three';

export function createTacticalPoint(position, direction, id, rayLength = 0.15, team = 'T', type = 'T') {
  const point = new THREE.Group();
  point.userData.tacticalPoint = true;
  point.userData.pointId = id;
  point.userData.team = team;
  point.userData.type = type;
  const color = team === 'CT' ? '#5da9ff' : '#ffb347';
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.12 });
  const marker = new THREE.Group();
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 0.38, 0, Math.PI * 2, false);
  const ringHole = new THREE.Path();
  ringHole.absarc(0, 0, 0.28, 0, Math.PI * 2, true);
  ringShape.holes.push(ringHole);
  const ringGeometry = new THREE.ExtrudeGeometry(ringShape, { depth: 0.1, bevelEnabled: false, curveSegments: 32 });
  ringGeometry.translate(0, 0, -0.05);
  const ring = new THREE.Mesh(ringGeometry, material);
  ring.rotation.x = Math.PI / 2;
  ring.userData.tacticalPoint = true;
  marker.add(ring);
  marker.userData.tacticalPoint = true;
  const symbol = new THREE.Group();
  const tStem = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.11), material);
  tStem.position.set(0, 0.07, -0.015);
  tStem.userData.tacticalPoint = true;
  const tBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.11), material);
  tBar.position.set(0, 0.07, 0.17);
  tBar.userData.tacticalPoint = true;
   if (type === 'X') {
     tStem.rotation.y = Math.PI / 4;
     tBar.rotation.y = -Math.PI / 4;
   } else if (type === 'V') {
    tStem.rotation.y = -0.65;
    tStem.position.set(-0.13, 0.07, 0);
    tBar.rotation.y = 0.65;
    tBar.position.set(0.13, 0.07, 0);
  } else tStem.rotation.y = Math.PI / 2;
  symbol.add(tStem, tBar);
  symbol.userData.symbol = true;
   symbol.rotation.y = type === 'V' ? Math.PI : 0;
  const rayGeometry = new THREE.BufferGeometry();
  rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.15, 0, 0, 0.15, -1], 3));
  const aimRay = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.76 }));
  aimRay.scale.z = Math.max(rayLength, 0.05);
  aimRay.userData.tacticalPoint = true;
  aimRay.userData.aimRay = true;
  const aimTarget = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff2bd' }));
  aimTarget.position.set(0, 0.15, -Math.max(rayLength, 0.05));
  aimTarget.userData.tacticalPoint = true;
  aimTarget.userData.aimTarget = true;
  point.userData.aimTarget = aimTarget;
  point.add(marker, symbol, aimRay, aimTarget);
  point.position.copy(position).add(new THREE.Vector3(0, 0.002, 0));
  const flatDirection = direction.clone();
  flatDirection.y = 0;
  point.rotation.y = flatDirection.lengthSq() ? Math.atan2(-flatDirection.x, -flatDirection.z) : 0;
  return point;
}

export function updateTacticalPoint(point, team, type) {
  const color = new THREE.Color(team === 'CT' ? '#5da9ff' : '#ffb347');
  point.userData.team = team;
  point.userData.type = type;
  point.traverse((object) => { if (object.material?.color) object.material.color.copy(color); });
  const symbol = point.children.find((child) => child.userData.symbol);
  if (!symbol) return;
  const [stem, bar] = symbol.children;
  symbol.rotation.y = type === 'V' ? Math.PI : 0;
   if (type === 'X') {
     stem.rotation.y = Math.PI / 4; bar.rotation.y = -Math.PI / 4;
     stem.position.set(0, 0.07, 0); bar.position.set(0, 0.07, 0);
   } else if (type === 'V') {
    stem.rotation.y = -0.65; stem.position.set(-0.13, 0.07, 0);
    bar.rotation.y = 0.65; bar.position.set(0.13, 0.07, 0);
  } else {
    stem.rotation.y = Math.PI / 2; stem.position.set(0, 0.07, -0.015);
    bar.rotation.y = 0; bar.position.set(0, 0.07, 0.17);
  }
}
