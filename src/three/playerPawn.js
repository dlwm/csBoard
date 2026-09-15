import * as THREE from 'three';

// Shared chess-pawn silhouette; crouching lowers the head and widens the body,
// while preserving the existing eye/weapon anchors used by replay and collaboration.
export function createPlayerPawn(bodyMaterial, headMaterial, crouched = false) {
  const group = new THREE.Group();
  const profile = [[0, 0.03], [.30, .03], [.34, .07], [.34, .12],
    [.29, .17], [.26, .20], [.22, .30], [.17, .52],
    [.12, .79], [.21, .82], [.21, .88], [.13, .92], [0, .94]];
  const points = profile.map(([radius, height]) => new THREE.Vector2(
    radius * (crouched ? 1.13 : 1), .03 + (height - .03) * (crouched ? .66 : 1),
  ));
  group.add(new THREE.Mesh(new THREE.LatheGeometry(points, 24), bodyMaterial));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 12), headMaterial);
  head.position.y = crouched ? .78 : 1.1;
  group.add(head);
  return group;
}
