// Owns Demo death markers and Analysis heat/position marker scene resources.
import * as THREE from 'three';
import buildHeatCells from '../analysis/buildHeatCells.js';
import { createHeatAtlasOverlay, paintHeatAtlas } from '../analysis/heatAtlas.js';

const disposeMesh = (scene, mesh) => {
  scene.remove(mesh);
  mesh.geometry?.dispose();
  mesh.material?.dispose();
};

export default function createDeathHeatSceneController({ scene, refs, floorFadeRef, getModelCenter, getNav }) {
  const deathMarkers = new Map();
  const heatObjects = new Map();
  const raycaster = new THREE.Raycaster();
  let globalHeatOverlay = null;
  let globalHeatSignature = '';

  const updateDeaths = () => {
    const active = new Set();
    if (refs.analysisEnabled.current) {
      deathMarkers.forEach((marker) => { marker.visible = false; });
      return;
    }
    const flags = refs.flags.current;
    const modelCenter = getModelCenter();
    refs.deaths.current.forEach((event) => {
      const locations = [];
      if (flags.deathVictim) locations.push(['victim', event.user_X, event.user_Y, event.user_Z, event.user_team_num === 2 ? '#ffb347' : event.user_team_num === 3 ? '#5da9ff' : '#ff5d5d']);
      locations.forEach(([kind, x, y, z, color]) => {
        if (x == null || y == null || z == null) return;
        const key = `${kind}-${event.tick}-${event.user_steamid || event.user_name || 'death'}`;
        active.add(key);
        let marker = deathMarkers.get(key);
        if (!marker) {
          const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false });
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 20), material);
          ring.rotation.x = -Math.PI / 2;
          const cross = new THREE.Group();
          cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.09), material), new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.09), material));
          cross.children[0].rotation.y = Math.PI / 4;
          cross.children[1].rotation.y = -Math.PI / 4;
          marker = new THREE.Group();
          marker.add(ring, cross);
          marker.renderOrder = 20;
          scene.add(marker);
          deathMarkers.set(key, marker);
        }
        marker.position.set(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y + 0.32, x * 0.0254 - modelCenter.z);
        marker.visible = true;
      });
    });
    deathMarkers.forEach((marker, key) => { if (!active.has(key)) marker.visible = false; });
  };

  const clearHeatObjects = () => {
    heatObjects.forEach((heat) => disposeMesh(scene, heat));
    heatObjects.clear();
  };

  const updateHeat = () => {
    const flags = refs.flags.current;
    const modelCenter = getModelCenter();
    const nav = getNav();
    const { areaMode, utilityMode, globalHeat, cells } = buildHeatCells({
      analysisEnabled: refs.analysisEnabled.current,
      flags,
      selectedPlayers: refs.selectedPlayers.current,
      side: refs.side.current,
      analysisUtilities: refs.utilities.current,
      analysisRows: refs.rows.current,
      analysisDeaths: refs.analysisDeaths.current,
      heatDeaths: refs.heatDeaths.current,
      modelCenter,
    });
    if (globalHeat && nav?.mesh) {
      const heatRadiusWorld = THREE.MathUtils.clamp(Number(flags.heatRadius) || 9, 2, 24);
      const signature = `radius-${heatRadiusWorld}|${[...cells].map(([key, cell]) => `${key}:${Object.entries(cell.kinds).map(([kind, count]) => `${kind}-${count}`).join(',')}`).join('|')}`;
      if (!globalHeatOverlay) globalHeatOverlay = createHeatAtlasOverlay(nav, floorFadeRef.current);
      globalHeatOverlay.visible = true;
      if (signature !== globalHeatSignature) {
        globalHeatSignature = signature;
        paintHeatAtlas({ overlay: globalHeatOverlay, cells, nav, heatRadiusWorld, areaMode, utilityMode });
      }
      clearHeatObjects();
      return;
    }
    if (globalHeatOverlay) globalHeatOverlay.visible = false;
    const active = new Set(cells.keys());
    cells.forEach((cell, key) => {
      let heat = heatObjects.get(key);
      if (!heat) {
        const throwMarker = cell.kind.startsWith('utilityThrow-');
        const geometry = throwMarker ? new THREE.OctahedronGeometry(0.42, 0) : new THREE.SphereGeometry(0.42, 20, 12);
        heat = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: cell.color, transparent: true, opacity: 0.25, depthTest: true, depthWrite: false }));
        heat.userData.analysisMarkerShape = throwMarker ? 'throw-diamond' : 'landing-circle';
        heat.renderOrder = 4;
        scene.add(heat);
        heatObjects.set(key, heat);
      }
      const origin = new THREE.Vector3(cell.x, cell.y + 0.04, cell.z);
      // Smoke, flash, HE, and decoy can detonate in mid-air; their endpoint is authoritative.
      const preservesAirburstHeight = /^utility-(smoke|flash|he|decoy)$/.test(cell.kind);
      if (nav?.mesh && !preservesAirburstHeight) {
        raycaster.set(new THREE.Vector3(cell.x, cell.y + 50, cell.z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObject(nav.mesh, true).reduce((closest, candidate) => !closest || Math.abs(candidate.point.y - cell.y) < Math.abs(closest.point.y - cell.y) ? candidate : closest, null);
        if (hit) origin.y = hit.point.y + 0.025;
      }
      heat.position.copy(origin);
      heat.userData.analysisUtilityId = cell.utilityId || '';
      heat.userData.analysisUtilityEndpoint = cell.kind.startsWith('utilityThrow-') ? 'throw' : 'landing';
      heat.scale.setScalar((cell.kind.startsWith('utilityThrow-') ? 0.78 : 0.85) + Math.min(cell.count, 8) * 0.14);
      heat.material.opacity = Math.min(0.78, 0.24 + cell.count * 0.09);
    });
    heatObjects.forEach((heat, key) => {
      if (!active.has(key)) {
        disposeMesh(scene, heat);
        heatObjects.delete(key);
      }
    });
  };

  const dispose = () => {
    clearHeatObjects();
    deathMarkers.forEach((marker) => {
      const geometries = new Set();
      const materials = new Set();
      marker.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      scene.remove(marker);
    });
    deathMarkers.clear();
    globalHeatOverlay?.removeFromParent();
  };

  return { heatObjects, updateDeaths, updateHeat, dispose };
}
