import * as THREE from 'three';

// Shared chess-pawn silhouette; crouching lowers the head and widens the body,
// while preserving the existing eye/weapon anchors used by replay and collaboration.
export function createPlayerPawn(bodyMaterial, headMaterial, crouched = false, baseColor = null) {
  const group = new THREE.Group();
  const profile = [[0, 0.03], [.30, .03], [.34, .07], [.34, .12],
    [.29, .17], [.26, .20], [.22, .30], [.17, .52],
    [.12, .79], [.21, .82], [.21, .88], [.13, .92], [0, .94]];
  const bodyProfile = baseColor ? [[0, .2], ...profile.filter(([, height]) => height >= .2)] : profile;
  const points = bodyProfile.map(([radius, height]) => new THREE.Vector2(
    radius * (crouched ? 1.13 : 1), .03 + (height - .03) * (crouched ? .66 : 1),
  ));
  group.add(new THREE.Mesh(new THREE.LatheGeometry(points, 24), bodyMaterial));
  if (baseColor) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.31, .35, .16, 24), new THREE.MeshStandardMaterial({ color: baseColor, roughness: .65, metalness: .08 }));
    base.position.y = .11; base.userData.playerBase = true;
    group.add(base);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 12), headMaterial);
  head.position.y = crouched ? .78 : 1.1;
  group.add(head);
  return group;
}
