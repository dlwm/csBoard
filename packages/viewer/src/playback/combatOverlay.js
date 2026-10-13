const clamp = value => Math.max(0, Math.min(1, value));
// Renderer-neutral presentation. Unknown input stays null; inactive/dead views
// explicitly clear both layers. 叠层不制造事件，切视角/死亡时归零。
export function combatOverlayState({ active = false, alive = null, hurt = null, hurtAgeSeconds = null, flashOpacity = null } = {},
  { enabled = true, hurt: showHurt = true, flash: showFlash = true, reducedEffects = false, maxFlashOpacity = 1 } = {}) {
  if ([enabled, showHurt, showFlash, reducedEffects].some(value => typeof value !== 'boolean')) throw new TypeError('Overlay switches must be booleans');
  if (!Number.isFinite(maxFlashOpacity) || maxFlashOpacity < 0 || maxFlashOpacity > 1) throw new TypeError('Maximum flash opacity must be 0–1');
  const visible = Boolean(active && alive !== false && enabled);
  let damage = hurt == null ? null : hurt ? 1 : 0;
  if (hurt && Number.isFinite(hurtAgeSeconds)) {
    const progress = clamp(Math.max(0, hurtAgeSeconds) / .16);
    damage = 1 - progress * progress * (3 - 2 * progress);
  }
  const flash = Number.isFinite(flashOpacity) ? clamp(flashOpacity) : null;
  return { active: visible,
    hurtOpacity: !visible || !showHurt ? 0 : damage == null ? null : damage * (reducedEffects ? .35 : 1),
    flashOpacity: !visible || !showFlash ? 0 : flash == null ? null : flash * Math.min(maxFlashOpacity, reducedEffects ? .35 : 1),
    reducedEffects: Boolean(reducedEffects) };
}
