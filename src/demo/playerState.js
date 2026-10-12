// Derives display equipment, reload progress, and event/player identity matches.
import { getDemoPlayerTimeline, demoPlayerId } from './playerTimeline.js';
import { grenadeKind } from './grenades.js';

import { weaponKind as demoWeaponKind } from '../../packages/viewer/src/data/weaponKinds.js';
export { demoWeaponKind };

export const demoEquipmentKind = (value = '') => demoWeaponKind(value) === 'utility' ? `utility-${grenadeKind(value)}` : demoWeaponKind(value);

export const demoEventPlayerMatches = (event, player) => {
  const eventSteamid = String(event.user_steamid ?? event.player_steamid ?? event.steamid ?? '');
  return (eventSteamid && String(player.steamid || '') === eventSteamid) || (event.user_name ?? event.player_name ?? event.name) === player.name;
};

export function recentPlayerBalanceChange(snapshots, player, tick, tickRate) {
  return getDemoPlayerTimeline(snapshots, null, tickRate).balanceAt(demoPlayerId(player), tick);
}

const timelines = new WeakMap();
export function buildDemoReloads(snapshots, events, tickRate) {
  const timeline = getDemoPlayerTimeline(snapshots, events, tickRate);
  const reloads = new Map([...timeline.getReloads()].map(([id, intervals]) => [id, intervals.map(({ startTick, endTick, weapon }) => ({ startTick, endTick, weapon }))]));
  timelines.set(reloads, timeline); return reloads;
}
export function demoPlayerReload(reloads, player, tick) {
  const timeline = timelines.get(reloads), id = demoPlayerId(player);
  if (timeline) { const value = timeline.reloadAt(id, tick); if (!value) return null; const { startTick, endTick, weapon, progress } = value; return { startTick, endTick, weapon, progress }; }
  const interval = reloads.get(id)?.find(value => tick >= value.startTick && tick <= value.endTick);
  return interval ? { ...interval, progress: Math.max(0, Math.min(1, (tick - interval.startTick) / Math.max(1, interval.endTick - interval.startTick))) } : null;
}
