// Derives display equipment, reload progress, and event/player identity matches.
import * as THREE from 'three';
import { grenadeKind } from './grenades.js';

const meleeNames = ['knife', 'bayonet', 'karambit', 'butterfly', 'flip', 'gut', 'falchion', 'survival_bowie', 'bowie', 'tactical', 'huntsman', 'push', 'dagger', 'gypsy_jackknife', 'navaja', 'ursus', 'widowmaker', 'talon', 'stiletto', 'outdoor', 'nomad', 'skeleton', 'survival', 'cord', 'paracord', 'css', 'classic', 'kukri', 'melee'];
const pistolNames = ['glock', 'hkp2000', 'p2000', 'usp', 'p250', 'deagle', 'elite', 'beretta', 'fiveseven', 'tec9', 'cz75', 'revolver'];
const sniperNames = ['awp', 'ssg08', 'scar20', 'g3sg1'];
const smgNames = ['mp9', 'mac10', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon'];
const shotgunNames = ['nova', 'xm1014', 'mag7', 'sawedoff'];
const machineGunNames = ['negev', 'm249'];
const rifleNames = ['ak47', 'm4a4', 'm4a1', 'aug', 'sg556', 'sg553', 'famas', 'galilar'];
const utilityWeaponNames = ['smoke', 'flash', 'hegrenade', 'molotov', 'incgrenade', 'decoy', 'grenade'];

export const demoWeaponKind = (value = '') => {
  const name = String(value).toLowerCase().replace(/^weapon_/, '').replace(/[- ]/g, '_');
  if (name.includes('c4')) return 'c4';
  if (utilityWeaponNames.some((weapon) => name.includes(weapon))) return 'utility';
  if (meleeNames.some((weapon) => name.includes(weapon))) return 'melee';
  if (pistolNames.some((weapon) => name.includes(weapon))) return 'pistol';
  if (sniperNames.some((weapon) => name.includes(weapon))) return 'sniper';
  if (smgNames.some((weapon) => name.includes(weapon))) return 'smg';
  if (shotgunNames.some((weapon) => name.includes(weapon))) return 'shotgun';
  if (machineGunNames.some((weapon) => name.includes(weapon))) return 'machinegun';
  if (rifleNames.some((weapon) => name.includes(weapon))) return 'rifle';
  return name ? 'rifle' : 'none';
};

export const demoEquipmentKind = (value = '') => demoWeaponKind(value) === 'utility' ? `utility-${grenadeKind(value)}` : demoWeaponKind(value);

export const demoEventPlayerMatches = (event, player) => {
  const eventSteamid = String(event.user_steamid ?? event.player_steamid ?? event.steamid ?? '');
  return (eventSteamid && String(player.steamid || '') === eventSteamid) || (event.user_name ?? event.player_name ?? event.name) === player.name;
};

export function recentPlayerBalanceChange(snapshots, player, tick, tickRate) {
  const cutoff = tick - tickRate * 1.5;
  let previous = null;
  let delta = 0;
  let lastChangeTick = null;
  snapshots.forEach((snapshot) => {
    if (snapshot.tick > tick) return;
    const match = snapshot.players.find((candidate) => String(candidate.steamid || candidate.name) === String(player.steamid || player.name));
    const balance = Number(match?.balance);
    if (!Number.isFinite(balance)) return;
    if (previous != null && balance !== previous && snapshot.tick >= cutoff) {
      delta += balance - previous;
      lastChangeTick = snapshot.tick;
    }
    previous = balance;
  });
  return lastChangeTick == null ? null : { delta, tick: lastChangeTick };
}

const reloadDurationSeconds = (weapon = '') => {
  const kind = demoWeaponKind(weapon);
  if (kind === 'pistol') return 2.2;
  if (kind === 'sniper') return 3.2;
  if (kind === 'shotgun') return 3.4;
  if (kind === 'machinegun') return 4.2;
  return 2.8;
};

export function buildDemoReloads(snapshots, events, tickRate) {
  const reloads = new Map();
  const players = new Map(snapshots.flatMap((snapshot) => snapshot.players.map((player) => [String(player.steamid || player.name), player])));
  players.forEach((player, playerId) => {
    const records = snapshots.map((snapshot) => ({ tick: snapshot.tick, player: snapshot.players.find((candidate) => String(candidate.steamid || candidate.name) === playerId) })).filter((record) => record.player);
    const ammoJumps = records.filter((record, index) => {
      const previous = records[index - 1];
      return previous && record.player.activeWeapon === previous.player.activeWeapon && Number(record.player.activeWeaponAmmo) > Number(previous.player.activeWeaponAmmo);
    });
    const reloadEvents = events.filter((event) => event.event_name === 'weapon_reload' && demoEventPlayerMatches(event, player));
    const truncateAtWeaponSwitch = (interval) => {
      const switchRecord = records.find((record) => record.tick >= interval.startTick && record.tick <= interval.endTick && record.player.activeWeapon && record.player.activeWeapon !== interval.weapon);
      return switchRecord ? { ...interval, endTick: Math.max(interval.startTick, switchRecord.tick) } : interval;
    };
    const intervals = reloadEvents.map((event) => {
      const completion = ammoJumps.find((record) => record.tick >= event.tick && record.tick <= event.tick + tickRate * 5);
      const weapon = completion?.player.activeWeapon || event.weapon || player.activeWeapon;
      return truncateAtWeaponSwitch({ startTick: event.tick, endTick: completion?.tick ?? event.tick + Math.round(reloadDurationSeconds(weapon) * tickRate), weapon });
    });
    ammoJumps.forEach((completion) => {
      if (intervals.some((reload) => completion.tick >= reload.startTick && completion.tick <= reload.endTick + tickRate * 0.2)) return;
      const durationTicks = Math.round(reloadDurationSeconds(completion.player.activeWeapon) * tickRate);
      intervals.push(truncateAtWeaponSwitch({ startTick: completion.tick - durationTicks, endTick: completion.tick, weapon: completion.player.activeWeapon }));
    });
    reloads.set(playerId, intervals.filter((interval) => interval.endTick > interval.startTick).sort((left, right) => left.startTick - right.startTick));
  });
  return reloads;
}

export function demoPlayerReload(reloads, player, tick) {
  const interval = reloads.get(String(player.steamid || player.name))?.find((reload) => tick >= reload.startTick && tick <= reload.endTick);
  return interval ? { ...interval, progress: THREE.MathUtils.clamp((tick - interval.startTick) / Math.max(1, interval.endTick - interval.startTick), 0, 1) } : null;
}
