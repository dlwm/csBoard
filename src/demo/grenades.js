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
      if (index > 0 && (record.tick - records[index - 1].tick > 2 || record.grenade_type !== records[index - 1].grenade_type)) {
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
    segments.push({ id: `grenade-${groupKey}`, groupKey, entityId: first.entity_id, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, effectTick + 20), projectiles: records, snapshots });
  });
  // Some parsers omit projectile samples; pair throw/landing events as a fallback.
  throws.forEach((throwEvent) => {
    if (usedThrows.has(throwEvent) || throwEvent.user_X == null) return;
    const kind = grenadeKind(throwEvent.weapon);
    const landingName = grenadeLandingEvent(kind);
    const landing = landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.tick > throwEvent.tick && event.tick - throwEvent.tick < tickRate * 10 && (event.user_steamid == null || throwEvent.user_steamid == null || event.user_steamid === throwEvent.user_steamid));
    if (!landing) return;
    usedLandings.add(landing);
    segments.push({ id: `grenade-fallback-${throwEvent.tick}-${throwEvent.user_steamid || 'unknown'}`, groupKey: null, entityId: landing.entityid, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick: landing.tick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, landing.tick + 20), projectiles: [], snapshots });
  });
  return segments;
}

export function utilityReplayStart(segment, throwerId, throwerName, tickRate) {
  const rows = segment.snapshots.map((snapshot) => {
    const player = snapshot.players.find((item) => String(item.steamid || '') === throwerId || item.name === throwerName);
    return player ? { tick: snapshot.tick, player } : null;
  }).filter(Boolean).sort((left, right) => left.tick - right.tick);
  const preparation = rows.filter((row) => row.tick <= segment.throwTick && row.tick >= segment.throwTick - tickRate * 2);
  const motion = preparation.map((row, index) => {
    const previous = preparation[index - 1];
    if (!previous || row.tick <= previous.tick || !row.player.raw || !previous.player.raw) return { ...row, horizontalSpeed: null };
    const elapsed = (row.tick - previous.tick) / tickRate;
    return { ...row, horizontalSpeed: Math.hypot(row.player.raw.x - previous.player.raw.x, row.player.raw.y - previous.player.raw.y) / elapsed };
  });
  let zeroIndex = -1;
  for (let index = motion.length - 1; index >= 0; index -= 1) {
    if (motion[index].horizontalSpeed != null && motion[index].horizontalSpeed <= 5) {
      zeroIndex = index;
      break;
    }
  }
  const movementRows = motion.slice(zeroIndex >= 0 ? zeroIndex + 1 : 0);
  const speeds = movementRows.map((row) => row.horizontalSpeed).filter(Number.isFinite);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
  const distance = movementRows.reduce((sum, row, index) => {
    const previous = movementRows[index - 1];
    return previous?.player.raw && row.player.raw ? sum + Math.hypot(row.player.raw.x - previous.player.raw.x, row.player.raw.y - previous.player.raw.y) : sum;
  }, 0);
  const hasRunup = peakSpeed >= 20 && distance >= 4;
  if (hasRunup) return { startTick: motion[Math.max(0, zeroIndex)]?.tick ?? segment.startTick, hasRunup, peakSpeed, distance };

  const actionRows = preparation.filter((row) => row.tick >= segment.throwTick - Math.round(tickRate * 0.5));
  let actionStartTick = segment.throwTick;
  const nearestAttackIndex = actionRows.findLastIndex((row) => row.player.fire || row.player.secondaryFire);
  if (nearestAttackIndex >= 0) {
    let attackStartIndex = nearestAttackIndex;
    while (attackStartIndex > 0 && actionRows[attackStartIndex - 1].tick >= actionRows[attackStartIndex].tick - 1 && (actionRows[attackStartIndex - 1].player.fire || actionRows[attackStartIndex - 1].player.secondaryFire)) attackStartIndex -= 1;
    actionStartTick = Math.min(actionStartTick, actionRows[attackStartIndex].tick);
  }
  for (let index = 0; index < actionRows.length; index += 1) {
    const current = actionRows[index].player;
    const previous = actionRows[index - 1]?.player;
    const startedJump = current.isAirborne && !previous?.isAirborne;
    const startedMovement = (current.movement || []).some((key) => !(previous?.movement || []).includes(key));
    const startedCrouch = Number(current.duckAmount) >= 0.15 && Number(previous?.duckAmount || 0) < 0.15;
    if (startedJump || startedMovement || startedCrouch) actionStartTick = Math.min(actionStartTick, actionRows[index].tick);
  }
  return { startTick: actionStartTick, hasRunup: false, peakSpeed, distance };
}
