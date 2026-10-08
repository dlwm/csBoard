// Pairs grenade throws, projectile samples, and landing events into replay segments.
export const grenadeKind = (value = '') => {
  const name = String(value).toLowerCase();
  if (name.includes('smoke')) return 'smoke';
  if (name.includes('flash')) return 'flash';
  if (name === 'fire' || name.includes('molotov') || name.includes('incgrenade') || name.includes('incendiary') || name.includes('inferno')) return 'fire';
  if (name.includes('decoy')) return 'decoy';
  return 'he';
};

const grenadeLandingEvent = (kind) => ({
  smoke: 'smokegrenade_detonate',
  flash: 'flashbang_detonate',
  fire: 'inferno_startburn',
  decoy: 'decoy_started',
  he: 'hegrenade_detonate',
})[kind];

// Sampling gaps in client recordings are not entity destruction. Prefer the
// Source 2 entity serial to distinguish ID reuse; keep the old gap fallback
// only for records whose parser/cache did not provide lifecycle identity.
// 自录 Demo 的采样间隔不表示投掷物结束；用实体序号区分复用，旧数据才按间隔兜底。
export function projectileStartsNewLifecycle(record, previous) {
  if (!previous || record.grenade_type !== previous.grenade_type) return true;
  if (Number.isInteger(record.entity_serial) && Number.isInteger(previous.entity_serial)) {
    return record.entity_serial !== previous.entity_serial;
  }
  return record.tick - previous.tick > 2;
}

export function groupDemoProjectiles(projectiles = []) {
  const byEntity = new Map();
  projectiles.forEach((projectile) => {
    if (!byEntity.has(projectile.entity_id)) byEntity.set(projectile.entity_id, []);
    byEntity.get(projectile.entity_id).push(projectile);
  });
  const groups = new Map();
  byEntity.forEach((unsorted, entityId) => {
    const records = [...unsorted].sort((left, right) => left.tick - right.tick);
    let segment = [];
    records.forEach((record, index) => {
      if (index > 0 && projectileStartsNewLifecycle(record, records[index - 1])) {
        groups.set(`${entityId}-${segment[0].tick}`, segment);
        segment = [];
      }
      segment.push(record);
    });
    if (segment.length) groups.set(`${entityId}-${segment[0].tick}`, segment);
  });
  return groups;
}

const projectilePoint = (record) => {
  const point = { x: Number(record?.x), y: Number(record?.y), z: Number(record?.z) };
  return Object.values(point).every(Number.isFinite) ? point : null;
};

const subtractPoint = (end, start) => ({ x: end.x - start.x, y: end.y - start.y, z: end.z - start.z });
const lerpPoint = (start, end, amount) => ({ x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount, z: start.z + (end.z - start.z) * amount });

// Returns raw CS coordinates so the scene can apply its current map-model offset.
export function utilityProjectileAtTick(replay, tick) {
  const records = (replay?.projectiles || []).filter(projectilePoint).sort((left, right) => left.tick - right.tick);
  if (records.length) {
    let upperIndex = records.findIndex((record) => record.tick >= tick);
    if (upperIndex < 0) upperIndex = records.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const lower = records[lowerIndex];
    const upper = records[upperIndex];
    const lowerPoint = projectilePoint(lower);
    const upperPoint = projectilePoint(upper);
    const amount = upper.tick > lower.tick ? Math.min(1, Math.max(0, (tick - lower.tick) / (upper.tick - lower.tick))) : 0;
    const directionStart = projectilePoint(records[Math.max(0, upperIndex - 1)]) || lowerPoint;
    const directionEnd = projectilePoint(records[Math.min(records.length - 1, upperIndex + 1)]) || upperPoint;
    return { position: lerpPoint(lowerPoint, upperPoint, amount), direction: subtractPoint(directionEnd, directionStart) };
  }

  const throwEvent = replay?.events?.find((event) => event.event_name === 'grenade_thrown');
  const landingEvent = replay?.events?.find((event) => event.event_name !== 'grenade_thrown' && event.x != null);
  const start = projectilePoint({ x: throwEvent?.user_X, y: throwEvent?.user_Y, z: throwEvent?.user_Z });
  const end = projectilePoint(landingEvent);
  if (!start || !end) return null;
  const duration = Math.max(1, Number(landingEvent.tick) - Number(throwEvent.tick));
  const amount = Math.min(1, Math.max(0, (tick - Number(throwEvent.tick)) / duration));
  const control = lerpPoint(start, end, 0.5);
  control.z += Math.max(32, Math.hypot(end.x - start.x, end.y - start.y) * 0.22);
  const first = lerpPoint(start, control, amount);
  const second = lerpPoint(control, end, amount);
  return { position: lerpPoint(first, second, amount), direction: subtractPoint(second, first) };
}

export function buildDemoGrenadeSegments(projectiles = [], events = [], snapshots = [], round, tickRate = 64) {
  if (!round) return [];
  const grenadeEvents = events.filter((event) => event.tick >= (round.contextStartTick ?? round.startTick) && event.tick <= round.endTick);
  const throws = grenadeEvents.filter((event) => event.event_name === 'grenade_thrown');
  const landings = grenadeEvents.filter((event) => ['smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started'].includes(event.event_name));
  const usedThrows = new Set();
  const usedLandings = new Set();
  const segments = [];
  [...groupDemoProjectiles(projectiles)].sort((left, right) => left[1][0].tick - right[1][0].tick).forEach(([groupKey, records]) => {
    const first = records[0];
    const last = records.at(-1);
    const kind = grenadeKind(first.grenade_type);
    const landingName = grenadeLandingEvent(kind);
    const landing = landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.entityid === first.entity_id && event.tick >= first.tick && event.tick <= last.tick + tickRate)
      || landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.tick >= first.tick && event.tick <= last.tick + tickRate * 2);
    const projectileSteamid = String(first.thrower_steamid || first.steamid || '');
    const projectileName = first.thrower_name || first.name || '';
    const throwEvent = [...throws].reverse().find((event) => !usedThrows.has(event) && grenadeKind(event.weapon) === kind && event.tick <= first.tick && first.tick - event.tick <= tickRate * 2 && (projectileSteamid ? String(event.user_steamid || '') === projectileSteamid : projectileName ? event.user_name === projectileName : true));
    if (!throwEvent) return;
    usedThrows.add(throwEvent);
    if (landing) usedLandings.add(landing);
    const effectTick = landing?.tick ?? last.tick;
    segments.push({ id: `grenade-${groupKey}`, groupKey, entityId: first.entity_id, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, effectTick + 20), projectiles: records, snapshots, contextStartTick: round.contextStartTick ?? round.startTick });
  });
  // Some parsers omit projectile samples; pair throw/landing events as a fallback.
  throws.forEach((throwEvent) => {
    if (usedThrows.has(throwEvent) || throwEvent.user_X == null) return;
    const kind = grenadeKind(throwEvent.weapon);
    const landingName = grenadeLandingEvent(kind);
    const landing = landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.tick > throwEvent.tick && event.tick - throwEvent.tick < tickRate * 10 && (event.user_steamid == null || throwEvent.user_steamid == null || event.user_steamid === throwEvent.user_steamid));
    if (!landing) return;
    usedLandings.add(landing);
    segments.push({ id: `grenade-fallback-${throwEvent.tick}-${throwEvent.user_steamid || 'unknown'}`, groupKey: null, entityId: landing.entityid, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick: landing.tick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, landing.tick + 20), projectiles: [], snapshots, contextStartTick: round.contextStartTick ?? round.startTick });
  });
  return segments;
}

// A throw starts at its last grounded rest, including a short aiming lead-in.
// Source units/s: rest <=5 horizontally and vertically, run-up >=20 with >=4
// units travelled. A sample gap >125ms or a >128-unit jump breaks continuity.
// 投掷从最近的地面静止描点开始，保留 250ms 描点；跳投检查垂直运动。
// 以上阈值只判定片段起点，不用于伪造按键；连续动作没有固定两秒上限。
export function utilityReplayStart(segment, throwerId, throwerName, tickRate = 64) {
  const rawValid = player => player?.hasPosition !== false && player?.raw && [player.raw.x, player.raw.y, player.raw.z].every(Number.isFinite);
  const rows = (segment.snapshots || []).map(snapshot => {
    const player = snapshot.players.find(item => throwerId ? String(item.steamid || '') === throwerId : item.name === throwerName);
    return rawValid(player) && snapshot.tick <= segment.throwTick && snapshot.tick >= (segment.contextStartTick ?? 0) ? { tick: snapshot.tick, player } : null;
  }).filter(Boolean).sort((a, b) => a.tick - b.tick);
  if (!rows.length) return { startTick: segment.throwTick, hasRunup: false, peakSpeed: 0, distance: 0, complete: false };
  let first = rows.length - 1;
  for (; first > 0; first--) {
    const current = rows[first], previous = rows[first - 1];
    const distance = Math.hypot(current.player.raw.x - previous.player.raw.x, current.player.raw.y - previous.player.raw.y, current.player.raw.z - previous.player.raw.z);
    if (current.tick - previous.tick > tickRate * .125 || distance > 128) break;
  }
  const motion = rows.slice(first).map((row, index, source) => {
    const previous = source[index - 1];
    if (!previous || row.tick <= previous.tick) return { ...row, speed: null, verticalSpeed: null, distance: 0 };
    const distance = Math.hypot(row.player.raw.x - previous.player.raw.x, row.player.raw.y - previous.player.raw.y);
    const elapsed = (row.tick - previous.tick) / tickRate;
    return { ...row, speed: distance / elapsed, verticalSpeed: Math.abs(row.player.raw.z - previous.player.raw.z) / elapsed, distance };
  });
  const resting = row => row.speed != null && row.speed <= 5 && row.verticalSpeed <= 5 && !row.player.isAirborne;
  const restIndex = motion.findLastIndex(resting);
  const anchorTick = motion[Math.max(0, restIndex)]?.tick ?? segment.throwTick;
  const startTick = Math.max(motion[0].tick, anchorTick - Math.round(tickRate * .25));
  const action = motion.slice(Math.max(0, restIndex + 1));
  const peakSpeed = action.reduce((peak, row) => Math.max(peak, row.speed || 0), 0);
  const distance = action.reduce((sum, row) => sum + row.distance, 0);
  // Stationary throws also retain the beginning of the last recorded pin pull.
  let attackIndex = motion.findLastIndex(row => row.player.fire || row.player.secondaryFire || row.player.grenadePinPulled);
  let attackStart = anchorTick;
  if (attackIndex >= 0) {
    while (attackIndex > 0 && motion[attackIndex - 1].tick >= motion[attackIndex].tick - 1 && (motion[attackIndex - 1].player.fire || motion[attackIndex - 1].player.secondaryFire || motion[attackIndex - 1].player.grenadePinPulled)) attackIndex--;
    attackStart = motion[attackIndex].tick;
  }
  const moving = action.some(row => row.speed > 5 || row.verticalSpeed > 5 || row.player.isAirborne);
  return { startTick: moving ? startTick : Math.min(startTick, attackStart), hasRunup: peakSpeed >= 20 && distance >= 4, peakSpeed, distance, complete: restIndex >= 0 };
}
