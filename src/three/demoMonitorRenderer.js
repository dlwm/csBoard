import * as THREE from 'three';
import { cs2AnglesToSceneDirection } from '../demo/interpolation.js';

const playerId = (player) => String(player?.steamid || player?.name || '');

// Reuse the live scene for every observer tile. Layout reads are throttled so
// multi-POV playback does not force browser layout on every animation frame.
export default function createDemoMonitorRenderer({ mount, renderer, scene, primaryCamera, playersRef, modeRef, getModelCenter, markers, primaryOnlyObjects = [] }) {
  const tileCamera = new THREE.PerspectiveCamera(68, 1, 0.1, 200);
  const lookTarget = new THREE.Vector3();
  let layout = null;
  let layoutReadAt = 0;
  let wasActive = false;

  const readLayout = (now) => {
    if (layout && now - layoutReadAt < 250) return layout;
    layoutReadAt = now;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const wall = mount.parentElement?.querySelector('.demo-monitor-wall');
    if (!wall || canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    const wallRect = wall.getBoundingClientRect();
    const mainWidth = Math.max(1, Math.min(canvasRect.width, wallRect.left - canvasRect.left - 10));
    const tiles = [...wall.querySelectorAll('[data-monitor-player-id]')].map((element) => {
      const rect = element.getBoundingClientRect();
      const left = Math.max(canvasRect.left, rect.left);
      const right = Math.min(canvasRect.right, rect.right);
      const top = Math.max(canvasRect.top, rect.top);
      const bottom = Math.min(canvasRect.bottom, rect.bottom);
      return {
        id: element.dataset.monitorPlayerId,
        x: left - canvasRect.left,
        y: canvasRect.bottom - bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    });
    layout = { width: canvasRect.width, height: canvasRect.height, mainWidth, tiles };
    return layout;
  };

  const setPlayerCamera = (camera, player, width, height) => {
    const center = getModelCenter();
    camera.position.set(
      player.position.x - center.x,
      player.position.y - center.y + 1.62 - (player.duckAmount || 0) * 0.34,
      player.position.z - center.z,
    );
    const direction = cs2AnglesToSceneDirection(player.pitch, player.yaw);
    lookTarget.copy(camera.position).add(direction.multiplyScalar(8));
    camera.fov = player.scoped ? 35 : 68;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();
  };

  const render = (now) => {
    const players = playersRef.current || [];
    if (modeRef.current !== 'monitor' || !players.length) {
      if (wasActive) {
        const { width, height } = renderer.domElement.getBoundingClientRect();
        primaryCamera.aspect = width / Math.max(height, 1);
        primaryCamera.updateProjectionMatrix();
        renderer.setScissorTest(false);
        // The last monitor pass leaves WebGL's viewport on a side tile.
        // Restore the full canvas before the regular renderer takes over.
        renderer.setViewport(0, 0, width, height);
        renderer.autoClear = true;
      }
      wasActive = false;
      return false;
    }
    const currentLayout = readLayout(now);
    if (!currentLayout) return false;
    wasActive = true;

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, currentLayout.width, currentLayout.height);
    renderer.clear();
    renderer.autoClear = false;
    renderer.setScissorTest(true);

    primaryCamera.aspect = currentLayout.mainWidth / Math.max(currentLayout.height, 1);
    primaryCamera.updateProjectionMatrix();
    renderer.setViewport(0, 0, currentLayout.mainWidth, currentLayout.height);
    renderer.setScissor(0, 0, currentLayout.mainWidth, currentLayout.height);
    renderer.render(scene, primaryCamera);

    const playersById = new Map(players.map((player) => [player.monitorId || playerId(player), player]));
    const primaryOnlyVisibility = primaryOnlyObjects.map((object) => object.visible);
    primaryOnlyObjects.forEach((object) => { object.visible = false; });
    for (const tile of currentLayout.tiles) {
      const player = playersById.get(tile.id);
      if (!player || Number(player.health) <= 0 || player.hasPosition === false || !player.position || tile.width < 2 || tile.height < 2) continue;
      setPlayerCamera(tileCamera, player, tile.width, tile.height);
      renderer.setViewport(tile.x, tile.y, tile.width, tile.height);
      renderer.setScissor(tile.x, tile.y, tile.width, tile.height);
      const marker = markers.get(player.name);
      const markerVisible = marker?.visible;
      if (marker) marker.visible = false;
      renderer.render(scene, tileCamera);
      if (marker) marker.visible = markerVisible;
    }
    primaryOnlyObjects.forEach((object, index) => { object.visible = primaryOnlyVisibility[index]; });

    renderer.setScissorTest(false);
    renderer.autoClear = true;
    return true;
  };

  return {
    invalidateLayout: () => { layout = null; layoutReadAt = 0; },
    render,
    dispose: () => { layout = null; },
  };
}
