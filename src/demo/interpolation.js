// Interpolates sparse Demo snapshots and converts CS2 angles into scene space.
import * as THREE from 'three';

export const lerpAngleDegrees = (from, to, amount) => from + (THREE.MathUtils.euclideanModulo(to - from + 180, 360) - 180) * amount;

export const cs2AnglesToSceneDirection = (pitchDegrees = 0, yawDegrees = 0) => {
  const pitch = THREE.MathUtils.degToRad(pitchDegrees);
  const yaw = THREE.MathUtils.degToRad(yawDegrees);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
};

export function interpolateDemoSnapshot(snapshots, tick) {
  if (!snapshots?.length) return null;
  let before = snapshots[0];
  let after = snapshots[snapshots.length - 1];
  for (let index = 1; index < snapshots.length; index += 1) {
    if (snapshots[index].tick >= tick) {
      after = snapshots[index];
      before = snapshots[index - 1];
      break;
    }
  }
  const amount = before.tick === after.tick ? 0 : THREE.MathUtils.clamp((tick - before.tick) / (after.tick - before.tick), 0, 1);
  const afterByName = new Map(after.players.map((player) => [player.name, player]));
  return {
    tick,
    timeSeconds: tick / 64,
    players: before.players.map((player) => {
      const next = afterByName.get(player.name);
      if (!next) return player;
      const discrete = amount >= 1 ? next : player;
      const flashPlayer = amount >= 1 ? next : player;
      const flashSnapshot = amount >= 1 ? after : before;
      const currentFlashDuration = Number(flashPlayer.flashDuration) || 0;
      let flashStartTick = flashSnapshot.tick;
      let flashInitialDuration = currentFlashDuration;
      if (currentFlashDuration > 0) for (let index = snapshots.indexOf(flashSnapshot) - 1; index >= 0; index -= 1) {
        const previous = snapshots[index].players.find((candidate) => candidate.name === player.name);
        if (!previous || Number(previous.flashDuration) <= 0 || Math.abs(Number(previous.flashDuration) - currentFlashDuration) > 0.05) break;
        flashStartTick = snapshots[index].tick;
        flashInitialDuration = Math.max(flashInitialDuration, Number(previous.flashDuration) || 0);
      }
      const flashRemaining = currentFlashDuration > 0 ? Math.max(0, flashInitialDuration - (tick - flashStartTick) / 64) : 0;
      return {
        ...discrete,
        health: amount < 0.5 ? player.health : next.health,
        flashDuration: flashRemaining,
        flashInitialDuration,
        flashMaxAlpha: THREE.MathUtils.lerp(Number(player.flashMaxAlpha) || 0, Number(next.flashMaxAlpha) || 0, amount),
        position: {
          x: THREE.MathUtils.lerp(player.position.x, next.position.x, amount),
          y: THREE.MathUtils.lerp(player.position.y, next.position.y, amount),
          z: THREE.MathUtils.lerp(player.position.z, next.position.z, amount),
        },
        yaw: lerpAngleDegrees(player.yaw, next.yaw, amount),
        pitch: THREE.MathUtils.lerp(player.pitch, next.pitch, amount),
        duckAmount: THREE.MathUtils.lerp(player.duckAmount || 0, next.duckAmount || 0, amount),
      };
    }),
  };
}
