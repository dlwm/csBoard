import { createPlayerTimeline } from '../../packages/viewer/src/playback/playerTimeline.js';

const cache = new WeakMap();
export const demoPlayerId = player => String(player.steamid || player.name);
// Arrays are immutable segment inputs; rebuild for new references/tick rates.
// 旧缓存字段和姓名兜底只留在适配器；数据引用改变时重建，逐帧查询不重扫。
export function getDemoPlayerTimeline(snapshots, events, tickRate) {
  const existing = cache.get(snapshots);
  if (existing && existing.tickRate === tickRate && (events == null || existing.events === events)) return existing.timeline;
  const ids = new Set(), names = new Map();
  for (const frame of snapshots) for (const player of frame.players || []) { const id = demoPlayerId(player); ids.add(id); if (player.name) names.set(player.name, id); }
  const timeline = createPlayerTimeline({ frames: snapshots, events: events || [], tickRate,
    readPlayer: player => ({ id: demoPlayerId(player), weapon: player.activeWeapon, ammo: player.activeWeaponAmmo, money: player.balance, flashDuration: player.flashDuration }),
    readEvent: event => {
      const steamid = String(event.user_steamid ?? event.player_steamid ?? event.steamid ?? '');
      return { type: event.event_name, tick: event.tick, playerId: ids.has(steamid) ? steamid : names.get(event.user_name ?? event.player_name ?? event.name),
        weapon: event.weapon, damageHealth: event.dmg_health, health: event.health, cost: event.cost, sold: event.was_sold, hitGroup: event.hitgroup ?? event.hit_group };
    },
  });
  cache.set(snapshots, { tickRate, events, timeline }); return timeline;
}
