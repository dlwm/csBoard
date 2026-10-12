import { describePlayer } from '../../packages/viewer/src/data/playerStatus.js';

// Parser/cache field adaptation stays in the application.
export function describeDemoPlayer(player) {
  return describePlayer({ ...player,
    position: player.hasPosition === false ? null : [player.position?.x, player.position?.y, player.position?.z],
    weapon: player.activeWeapon, ammo: player.activeWeaponAmmo,
    helmet: player.hasHelmet, defuseKit: player.hasDefuser, hasBomb: player.hasC4,
    money: player.balance, flashDurationSeconds: player.flashDuration,
  });
}
