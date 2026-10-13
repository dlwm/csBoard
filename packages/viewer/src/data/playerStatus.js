import { weaponKind } from './weaponKinds.js';

const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : null;
const flag = value => typeof value === 'boolean' ? value : null;
const itemName = item => typeof item === 'string' ? item : item && (item.name || item.weapon_name || item.weapon || item.item_name);

// Neutral player rows → serializable display data. Unknown stays null, never 0.
// 未知值保持 null；死亡装备隐藏属于表现规则，不修改来源轨道。
export function describePlayer(player) {
  if (!player || typeof player !== 'object') throw new TypeError('Neutral player state is required');
  const health = nonnegative(player.health);
  const alive = flag(player.alive) ?? (health == null ? null : health > 0);
  const counts = new Map(); let inventoryUnknownCount = 0;
  if (Array.isArray(player.inventory)) for (const item of player.inventory) {
    const name = itemName(item);
    const count = typeof item === 'object' && item?.count != null ? item.count : 1;
    if (typeof name !== 'string' || !name || !Number.isInteger(count) || count < 1) { inventoryUnknownCount++; continue; }
    counts.set(name, (counts.get(name) || 0) + count);
  }
  const hasPosition = Array.isArray(player.position) && player.position.length === 3 && player.position.every(Number.isFinite);
  const hasViewAngles = Number.isFinite(player.pitch) && Number.isFinite(player.yaw);
  const name = typeof player.weapon === 'string' && player.weapon ? player.weapon : null;
  return {
    health, alive, armor: nonnegative(player.armor), helmet: flag(player.helmet), defuseKit: flag(player.defuseKit), hasBomb: flag(player.hasBomb),
    money: nonnegative(player.money), equipmentVisible: alive !== false,
    weapon: alive !== false && name ? { name, kind: weaponKind(name), ammo: nonnegative(player.ammo) } : null,
    inventory: alive === false ? [] : Array.isArray(player.inventory) ? [...counts].map(([name, count]) => ({ name, count })) : null,
    inventoryUnknownCount, scoped: flag(player.scoped), flashDurationSeconds: nonnegative(player.flashDurationSeconds),
    hasPosition, hasViewAngles, cameraAvailable: hasPosition && hasViewAngles && alive !== false,
  };
}
