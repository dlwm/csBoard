import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

// Poll the imperative scene API and project its camera/player markers into radar percentages.
export default function useRadarOverlay({ activePanel, boardRef, mapName, navData }) {
  const [radarScene, setRadarScene] = useState(null);

  useEffect(() => {
    const update = () => setRadarScene(boardRef.current?.getRadarCameraState?.() || null);
    update();
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [boardRef, mapName, navData]);

  return useMemo(() => {
    const bounds = radarScene?.bounds;
    if (!bounds || !Object.values(bounds).every(Number.isFinite)) return null;
    const width = Math.max(bounds.maxZ - bounds.minZ, 0.001);
    const height = Math.max(bounds.maxX - bounds.minX, 0.001);
    const project = (position, clamp = true) => {
      const rawX = 4 + (position[2] - bounds.minZ) / width * 92;
      const rawY = 96 - (position[0] - bounds.minX) / height * 92;
      return { x: clamp ? THREE.MathUtils.clamp(rawX, 3, 97) : rawX, y: clamp ? THREE.MathUtils.clamp(rawY, 3, 97) : rawY };
    };
    const camera = project(radarScene.position);
    const cameraTarget = project(radarScene.target, false);
    const cameraAngle = Math.atan2(cameraTarget.y - camera.y, cameraTarget.x - camera.x) * 180 / Math.PI;
    const source = activePanel === 'collab' ? 'collab' : 'demo';
    const players = (radarScene.players || []).filter((player) => player.source === source).map((player) => {
      const position = project(player.position);
      const target = project(player.target, false);
      return { ...player, ...position, angle: Math.atan2(target.y - position.y, target.x - position.x) * 180 / Math.PI };
    });
    return { camera: { ...camera, angle: cameraAngle }, players };
  }, [activePanel, radarScene]);
}
