import { getDemoPlayerTimeline, demoPlayerId } from './playerTimeline.js';
// Interpolates sparse Demo snapshots and converts CS2 angles into scene space.
import * as THREE from 'three';

import { frameWindow, lerpAngleDegrees } from '../../packages/viewer/src/playback/interpolation.js';
export { lerpAngleDegrees };

export { cs2AnglesToSceneDirection } from '../../packages/viewer/src/three/playerCamera.js';

export function interpolateDemoSnapshot(snapshots, tick, tickRate = 64) {
  if (!snapshots?.length) return null;
  const { before, after, amount } = frameWindow(snapshots, tick);
  const timeline = getDemoPlayerTimeline(snapshots, null, tickRate);
  const identity = player => String(player.steamid || player.name);
  const afterByName = new Map(after.players.map((player) => [identity(player), player]));
  return {
    tick,
    timeSeconds: tick / tickRate,
    // Older caches may contain multiple FrameDone rows for the same player/tick.
    // Seeking replaces state; duplicate samples must not grow the roster.
    players: [...new Map((amount >= 1 ? after.players : before.players).map(player => [identity(player), player])).values()].map((player) => {
      const next = afterByName.get(identity(player));
      if (!next) return player;
      const discrete = amount >= 1 ? next : player;
      const playerHasPosition = player.hasPosition !== false && [player.position?.x, player.position?.y, player.position?.z].every(Number.isFinite);
      const nextHasPosition = next.hasPosition !== false && [next.position?.x, next.position?.y, next.position?.z].every(Number.isFinite);
      const hasPosition = playerHasPosition || nextHasPosition;
      const fromPosition = playerHasPosition ? player.position : next.position;
      // Respawns/teleports in practice recordings are discontinuities, not
      // movement paths. 人员死亡复活不补间，避免横穿地图的虚假移动。
      const discontinuity = Boolean(player.health <= 0 && next.health > 0) || Math.hypot((next.position?.x || 0) - (player.position?.x || 0), (next.position?.y || 0) - (player.position?.y || 0), (next.position?.z || 0) - (player.position?.z || 0)) > 12;
      const toPosition = !discontinuity && nextHasPosition ? next.position : fromPosition;
      const flash = timeline.flashAt(demoPlayerId(discrete), tick);
      return {
        ...discrete,
        health: amount < 0.5 ? player.health : next.health,
        flashDuration: flash?.remaining ?? 0,
        flashInitialDuration: flash?.initial ?? 0,
        flashMaxAlpha: THREE.MathUtils.lerp(Number(player.flashMaxAlpha) || 0, Number(next.flashMaxAlpha) || 0, amount),
        hasPosition,
        position: hasPosition ? {
          x: THREE.MathUtils.lerp(fromPosition.x, toPosition.x, amount),
          y: THREE.MathUtils.lerp(fromPosition.y, toPosition.y, amount),
          z: THREE.MathUtils.lerp(fromPosition.z, toPosition.z, amount),
        } : { x: 0, y: 0, z: 0 },
        yaw: lerpAngleDegrees(player.yaw, next.yaw, amount),
        pitch: THREE.MathUtils.lerp(player.pitch, next.pitch, amount),
        duckAmount: THREE.MathUtils.lerp(player.duckAmount || 0, next.duckAmount || 0, amount),
      };
    }),
  };
}
