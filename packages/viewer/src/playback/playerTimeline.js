import { weaponIconKey } from '../data/weaponIcons.js';
import { weaponKind } from '../data/weaponKinds.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const number = value => Number.isFinite(value) ? value : null;
const upper = (rows, tick, key = 'tick') => {
  let left = 0, right = rows.length;
  while (left < right) { const middle = Math.floor((left + right) / 2); if (rows[middle][key] <= tick) left = middle + 1; else right = middle; }
  return left;
};
const lower = (rows, tick, key = 'tick') => {
  let left = 0, right = rows.length;
  while (left < right) { const middle = Math.floor((left + right) / 2); if (rows[middle][key] < tick) left = middle + 1; else right = middle; }
  return left;
};
const duration = weapon => ({ pistol: 2.2, sniper: 3.2, shotgun: 3.4, machinegun: 4.2 }[weaponKind(weapon)] || 2.8);

// Shared HUD equations; values describe presentation, not new game facts.
// 受伤血条：停留 1 秒，再用 smoothstep 在 0.6 秒内追上；闪光保持来源强度。
export function delayedPlayerHealth(health, hurt, ageSeconds) {
  const current = Number.isFinite(health) ? Math.max(0, health) : null;
  if (current == null) return null;
  if (!hurt) return current;
  const start = Math.min(100, Math.max(current, (number(hurt.health) ?? current) + (number(hurt.damageHealth) ?? 0)));
  return ageSeconds <= 1 ? start : start + (current - start) * smooth((ageSeconds - 1) / .6);
}
export function flashPresentation({ remaining, initial = remaining, maxAlpha = null }) {
  const seconds = Number.isFinite(remaining) ? Math.max(0, remaining) : null;
  if (seconds == null) return { remainingSeconds: null, progress: null, strength: null, opacity: null };
  const progress = clamp(seconds / Math.max(.01, Number.isFinite(initial) ? initial : seconds));
  const strength = Number.isFinite(maxAlpha) && maxAlpha > 0 ? clamp(maxAlpha / 255) : seconds > 0 ? 1 : 0;
  return { remainingSeconds: seconds, progress, strength, opacity: strength * smooth(progress) };
}

// Index once when a segment changes; queries never scan the entire frame track.
// 按人员一次建索引；查询按 tick 二分，支持倒退，不缓存“上一播放时刻”的答案。
export function createPlayerTimeline({ frames = [], events = [], tickRate,
  readPlayer = player => ({ id: player.playerId, weapon: player.weapon, ammo: player.ammo, money: player.money, flashDuration: player.flashDurationSeconds }),
  readEvent = event => ({ ...event, playerId: ['player_hurt', 'player_death', 'player_blind'].includes(event.type) ? event.targetId : event.actorId }),
} = {}) {
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new TypeError('Timeline requires a positive tick rate');
  const players = new Map();
  const ensure = id => { if (!players.has(id)) players.set(id, { records: [], changes: [], events: new Map(), reloads: [] }); return players.get(id); };
  for (const frame of frames) for (const raw of frame.players || []) {
    const value = readPlayer(raw);
    if (!value?.id || !Number.isFinite(frame.tick)) continue;
    const record = { tick: frame.tick, weapon: value.weapon || null, ammo: value.ammo >= 0 ? number(value.ammo) : null, money: value.money >= 0 ? number(value.money) : null, flashDuration: value.flashDuration >= 0 ? number(value.flashDuration) : null };
    const records = ensure(value.id).records;
    if (records.at(-1)?.tick === frame.tick) records[records.length - 1] = record; else records.push(record);
  }
  for (const raw of events) {
    const value = readEvent(raw);
    if (!value?.playerId || !Number.isFinite(value.tick)) continue;
    const types = ensure(value.playerId).events;
    if (!types.has(value.type)) types.set(value.type, []);
    types.get(value.type).push({ id: value.id, type: value.type, tick: value.tick, playerId: value.playerId, weapon: value.weapon, damageHealth: value.damageHealth, health: value.health, cost: value.cost, sold: value.sold, hitGroup: value.hitGroup });
  }
  for (const player of players.values()) {
    const { records } = player; records.sort((a, b) => a.tick - b.tick);
    for (const rows of player.events.values()) rows.sort((a, b) => a.tick - b.tick);
    const jumps = [], switches = []; let previousMoney = null, total = 0;
    for (let index = 0; index < records.length; index++) {
      const record = records[index], previous = records[index - 1];
      const sameFlash = record.flashDuration > 0 && previous?.flashDuration > 0 && Math.abs(record.flashDuration - previous.flashDuration) <= .05;
      record.flashStartTick = sameFlash ? previous.flashStartTick : record.tick;
      record.flashInitialDuration = sameFlash ? Math.max(previous.flashInitialDuration, record.flashDuration) : record.flashDuration;

      if (record.money != null) {
        if (previousMoney != null && record.money !== previousMoney) { const delta = record.money - previousMoney; total += delta; player.changes.push({ tick: record.tick, delta, total }); }
        previousMoney = record.money;
      }
      if (previous && record.weapon && weaponIconKey(record.weapon) !== weaponIconKey(previous.weapon)) switches.push(record);
      if (previous && record.weapon && weaponIconKey(record.weapon) === weaponIconKey(previous.weapon) && record.ammo != null && previous.ammo != null && record.ammo > previous.ammo) jumps.push(record);
    }
    const truncate = interval => {
      for (let index = lower(switches, interval.startTick); index < switches.length && switches[index].tick <= interval.endTick; index++) {
        if (weaponIconKey(switches[index].weapon) !== weaponIconKey(interval.weapon)) return { ...interval, endTick: switches[index].tick };
      }
      return interval;
    };
    for (const event of player.events.get('weapon_reload') || []) {
      const atEvent = records[upper(records, event.tick) - 1];
      const expected = event.weapon || atEvent?.weapon;
      let confirmed = null;
      for (let index = lower(jumps, event.tick); index < jumps.length && jumps[index].tick <= event.tick + tickRate * 5; index++) {
        if (!expected || weaponIconKey(jumps[index].weapon) === weaponIconKey(expected)) { confirmed = jumps[index]; break; }
      }
      const weapon = expected || confirmed?.weapon || null;
      if (!weapon) continue;
      player.reloads.push(truncate({ startTick: event.tick, endTick: confirmed?.tick ?? event.tick + Math.round(duration(weapon) * tickRate), weapon, evidence: 'event', estimatedStart: false, estimatedEnd: !confirmed }));
    }
    // Ammo-only intervals are explicitly inferred. They are not authoritative
    // reload events and may also reflect pickups or server modifications.
    // 仅弹药增加推断的区间不是确证换弹，可能是拾取/修改；向调用者注明依据。
    let covered = -Infinity, intervalCursor = 0;
    player.reloads.sort((a, b) => a.startTick - b.startTick);
    const eventIntervals = [...player.reloads];
    for (const completion of jumps) {
      while (intervalCursor < eventIntervals.length && eventIntervals[intervalCursor].startTick <= completion.tick) covered = Math.max(covered, eventIntervals[intervalCursor++].endTick + tickRate * .2);
      if (completion.tick <= covered) continue;
      const interval = truncate({ startTick: completion.tick - Math.round(duration(completion.weapon) * tickRate), endTick: completion.tick, weapon: completion.weapon, evidence: 'ammo', estimatedStart: true, estimatedEnd: false });
      player.reloads.push(interval); covered = Math.max(covered, interval.endTick + tickRate * .2);
    }
    player.reloads = player.reloads.filter(interval => interval.endTick > interval.startTick).sort((a, b) => a.startTick - b.startTick);
    let maximum = -Infinity;
    player.reloadEnds = player.reloads.map(interval => maximum = Math.max(maximum, interval.endTick));
  }
  const rowsFor = (id, type) => players.get(id)?.events.get(type) || [];
  return Object.freeze({
    tickRate,
    flashAt(id, tick) {
      const records = players.get(id)?.records || [], record = records[upper(records, tick) - 1];
      if (!record || record.flashDuration == null) return null;
      return { remaining: record.flashDuration > 0 ? Math.max(0, record.flashInitialDuration - (tick - record.flashStartTick) / tickRate) : 0,
        initial: record.flashInitialDuration, sourceStartTick: record.flashStartTick };
    },
    getReloads() { return new Map([...players].map(([id, player]) => [id, player.reloads.map(interval => ({ ...interval }))])); },
    reloadAt(id, tick) {
      const player = players.get(id); if (!player) return null;
      let index = upper(player.reloads, tick, 'startTick') - 1, match = null;
      // Keep the earliest overlapping interval, matching the legacy display.
      while (index >= 0 && player.reloadEnds[index] >= tick) { const interval = player.reloads[index--]; if (interval.endTick >= tick) match = interval; }
      return match ? { ...match, progress: clamp((tick - match.startTick) / Math.max(1, match.endTick - match.startTick)) } : null;
    },
    balanceAt(id, tick) {
      const rows = players.get(id)?.changes || [], end = upper(rows, tick), start = lower(rows, tick - tickRate * 1.5);
      if (end <= start) return null;
      return { delta: rows[end - 1].total - (start ? rows[start - 1].total : 0), tick: rows[end - 1].tick };
    },
    latest(id, type, tick, seconds) {
      const rows = rowsFor(id, type), index = upper(rows, tick) - 1, event = rows[index];
      return event && tick - event.tick <= seconds * tickRate ? { ...event } : null;
    },
    purchasesAt(id, tick, { startTick, freezeStartTick = startTick } = {}) {
      const rows = rowsFor(id, 'item_purchase'), start = lower(rows, tick - tickRate * 1.5), end = upper(rows, tick);
      const recent = rows.slice(start, end);
      const sum = values => values.reduce((total, value) => total + (value.sold ? 1 : -1) * Math.abs(number(value.cost) ?? 0), 0);
      const opening = Number.isFinite(startTick) && tick <= startTick + tickRate * 1.5 ? rows.slice(lower(rows, freezeStartTick), upper(rows, startTick)) : [];
      const openingDelta = sum(opening), delta = sum(recent) || openingDelta;
      return { delta, ticks: recent.map(event => event.tick), opening: openingDelta !== 0 };
    },
  });
}

// Preserve the existing equipment drop arc; the host chooses anchor offsets.
// 换弹采用 sin(progress·π) 下沉后回位；各壳只负责模型锚点，不复制曲线。
export function weaponAnimation(reload, firing, kind = 'none') {
  const firearm = !['none', 'melee', 'c4', 'utility'].includes(kind) && !kind.startsWith('utility-');
  return { reloadDrop: firearm && reload ? Math.sin(clamp(reload.progress) * Math.PI) : 0, recoil: firearm && firing ? 1 : 0 };
}
