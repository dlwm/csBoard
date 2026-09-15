import * as THREE from 'three';
import { createPlayerPawn } from './playerPawn.js';

export function randomPlayerName() {
  return Array.from({ length: 3 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
}

function createNameLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext('2d');
  context.font = 'bold 30px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = '#f2f7ee'; context.strokeStyle = '#08100b'; context.lineWidth = 7;
  context.strokeText(name, 128, 32); context.fillText(name, 128, 32);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false }));
  label.scale.set(3.4, 0.85, 1); label.position.set(0, 2.6, 0); label.renderOrder = 30;
  label.userData.collabNameLabel = true;
  label.raycast = () => {};
  return label;
}

export function createCollabPlayer({ position, id, name, team = 'T', crouched = false, pitch = 0, weapon = 'ak47', showName = true }) {
  const group = new THREE.Group();
  group.userData.collabPlayer = true;
  group.userData.pointId = id;
  group.userData.team = team;
  group.userData.playerName = name;
  group.userData.crouched = crouched;
  group.userData.collabPitch = pitch;
  group.userData.weapon = weapon;
  group.userData.aimCollisionVersion = -1;

  const sideColor = team === 'CT' ? '#5da9ff' : '#ffb347';
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.72, metalness: 0.04, transparent: true, opacity: 0.82 });
  const headMaterial = bodyMaterial.clone();

  const standingBody = createPlayerPawn(bodyMaterial, headMaterial);
  standingBody.userData.collabBody = 'standing';

  const crouchedBody = createPlayerPawn(bodyMaterial, headMaterial, true);
  crouchedBody.userData.collabBody = 'crouched';

  const equipment = new THREE.Group();
  equipment.userData.collabEquipment = true;
  equipment.position.set(0, crouched ? 0.44 : 0.72, -0.4);
  const equipmentMaterial = new THREE.MeshStandardMaterial({ color: '#38423d', roughness: 0.82, metalness: 0.24 });
  const rifle = new THREE.Group();
  rifle.userData.collabWeapon = weapon;
  const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.62), equipmentMaterial);
  rifleBody.position.z = -0.19;
  const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.2), equipmentMaterial);
  rifleStock.position.set(0, 0, 0.2);
  const rifleBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), equipmentMaterial);
  rifleBarrel.position.z = -0.7;
  const rifleMagazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.13), equipmentMaterial);
  rifleMagazine.position.set(0, -0.17, -0.18);
  rifle.add(rifleBody, rifleStock, rifleBarrel, rifleMagazine);
  equipment.add(rifle);

  const aimRay = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3)),
    new THREE.LineBasicMaterial({ color: sideColor, transparent: true, opacity: 0.76 })
  );
  aimRay.position.set(0, crouched ? 0.62 : 0.93, -0.42);
  aimRay.userData.aimRay = true;
  aimRay.scale.z = 1;
  const aimTarget = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff2bd' }));
  aimTarget.userData.aimTarget = true;
  group.userData.aimRay = aimRay;
  group.userData.aimTarget = aimTarget;

  standingBody.visible = !crouched;
  crouchedBody.visible = crouched;
  group.add(standingBody, crouchedBody, equipment, aimRay, aimTarget);
  if (showName) group.add(createNameLabel(name));
  group.position.copy(position);
  group.rotation.y = 0;
  applyPitch(group, pitch);
  return group;
}

function applyPitch(group, pitch) {
  const aimRay = group.userData.aimRay;
  if (aimRay) aimRay.rotation.x = -pitch;
  group.userData.collabPitch = pitch;
  group.userData.aimCollisionVersion = -1;
}

export function setCollabPlayerPitch(group, pitch) {
  applyPitch(group, pitch);
}

export function setCollabPlayerCrouch(group, crouched) {
  group.userData.crouched = crouched;
  group.children.forEach((child) => {
    if (child.userData?.collabBody === 'standing') child.visible = !crouched;
    if (child.userData?.collabBody === 'crouched') child.visible = crouched;
    if (child.userData?.collabEquipment) child.position.y = crouched ? 0.44 : 0.72;
  });
  const aimRay = group.userData.aimRay;
  if (aimRay) aimRay.position.set(0, crouched ? 0.62 : 0.93, -0.42);
  group.userData.aimCollisionVersion = -1;
}

export function renameCollabPlayer(group, name) {
  group.userData.playerName = name;
  const oldLabel = group.children.find((child) => child.userData.collabNameLabel);
  if (!oldLabel) return;
  const fresh = createNameLabel(name);
  group.add(fresh);
  oldLabel.removeFromParent();
  oldLabel.material.map?.dispose();
  oldLabel.material.dispose();
}

export function updateCollabPlayerAim(group, collisionMeshes, raycaster, collisionVersion) {
  const aimRay = group.userData.aimRay;
  const aimTarget = group.userData.aimTarget;
  if (!aimRay || !aimTarget) return;
  const pitch = group.userData.collabPitch || 0;
  const placeTarget = (length) => {
    aimRay.scale.z = length;
    aimRay.rotation.x = -pitch;
    aimTarget.position.copy(new THREE.Vector3(0, 0, -length).applyEuler(aimRay.rotation).add(aimRay.position));
  };
  if (group.userData.aimCollisionVersion === collisionVersion) {
    placeTarget(group.userData.aimCollisionLength);
    return;
  }
  group.userData.aimCollisionVersion = collisionVersion;
  const worldOrigin = group.localToWorld(aimRay.position.clone());
  const worldDirection = new THREE.Vector3(0, 0, -1).applyEuler(aimRay.rotation).applyQuaternion(group.quaternion).normalize();
  raycaster.set(worldOrigin, worldDirection);
  raycaster.near = 0.05;
  raycaster.far = 72;
  const worldLength = Math.max(0.001, raycaster.intersectObjects(collisionMeshes, false)[0]?.distance ?? 72);
  const worldScale = group.getWorldScale(new THREE.Vector3()).z || 1;
  const length = worldLength / worldScale;
  group.userData.aimCollisionLength = length;
  placeTarget(length);
}

export function setCollabPlayerTeam(group, team) {
  group.userData.team = team;
  const color = new THREE.Color(team === 'CT' ? '#5da9ff' : '#ffb347');
  const aimRay = group.userData.aimRay;
  if (aimRay) aimRay.material.color.copy(color);
  group.children.filter((child) => child.userData.collabBody).forEach((body) => {
    body.traverse((child) => { if (child.material?.color) child.material.color.copy(color); });
  });
}
