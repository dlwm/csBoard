// Owns clustered utility-note pins, visibility, rebuild detection, and cleanup.
import * as THREE from 'three';
import { utilityPositionClusters } from '../utility/notes.js';

export default function createUtilityNotesSceneController({ scene, refs, getModelCenter, getCollisionVersion }) {
  const group = new THREE.Group();
  const markers = new Map();
  let signature = '';
  scene.add(group);

  const clear = () => {
    const geometries = new Set();
    const materials = new Set();
    markers.forEach((marker) => marker.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    }));
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    group.clear();
    markers.clear();
    signature = '';
  };

  const update = () => {
    group.visible = Boolean(refs.enabled.current);
    if (!group.visible) {
      if (markers.size) clear();
      return;
    }
    const notes = refs.notes.current;
    // Collision changes can move the centered map even when note data is unchanged.
    const nextSignature = `${getCollisionVersion()}:${JSON.stringify(notes.map((note) => [note.id, note.position, note.angles]))}`;
    if (nextSignature === signature) return;
    clear();
    const modelCenter = getModelCenter();
    utilityPositionClusters(notes).forEach(({ entries, key }) => {
      const [sourceX, sourceY, sourceZ] = entries[0].position;
      const marker = new THREE.Group();
      marker.position.set(sourceY * 0.0254 - modelCenter.x, sourceZ * 0.0254 - modelCenter.y + 0.05, sourceX * 0.0254 - modelCenter.z);
      marker.userData.utilityPositionKey = key;
      marker.userData.utilityEntries = entries;
      const material = new THREE.MeshStandardMaterial({ color: '#c58cff', emissive: '#30134e', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.12, depthTest: true, depthWrite: true });
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 20), material);
      pin.position.y = 0.34;
      pin.rotation.x = Math.PI;
      pin.renderOrder = 4;
      pin.userData.utilityMarker = true;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#dfb8ff', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.06;
      halo.renderOrder = 5;
      halo.userData.utilityMarker = true;
      marker.add(pin, halo);
      group.add(marker);
      markers.set(key, marker);
    });
    signature = nextSignature;
  };

  const dispose = () => {
    clear();
    scene.remove(group);
  };

  return { markers, update, dispose };
}
