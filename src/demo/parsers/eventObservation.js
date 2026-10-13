// Neutral identity and event fields; unstandardized event payload stays explicit.
// 不同解析器只映射此形态；attributes 保留尚未统一的事件附加事实。
const targeted = type => ['player_death', 'player_hurt', 'player_blind'].includes(type);
export function observeEvent(row) {
  const identity = prefix => row[`${prefix}_steamid`] != null || row[`${prefix}_name`] != null
    ? { steamid: row[`${prefix}_steamid`] ?? null, name: row[`${prefix}_name`] ?? null } : null;
  const hasWorldPoint = [row.x, row.y, row.z].every(Number.isFinite);
  const xyz = hasWorldPoint ? [row.x, row.y, row.z] : [row.user_X, row.user_Y, row.user_Z];
  return { type: row.event_name, tick: row.tick, actor: identity(targeted(row.event_name) ? 'attacker' : 'user'),
    target: targeted(row.event_name) ? identity('user') : null, assistant: identity('assister'),
    positionRole: hasWorldPoint ? 'effect' : targeted(row.event_name) ? 'target' : 'actor',
    position: xyz.every(Number.isFinite) ? { x: xyz[0], y: xyz[1], z: xyz[2] } : null,
    weapon: row.weapon ?? null, damageHealth: row.dmg_health ?? null, attributes: row };
}

export function eventToRuntime(event) {
  const identity = (value, prefix) => value ? {
    ...(value.steamid != null ? { [`${prefix}_steamid`]: value.steamid } : {}),
    ...(value.name != null ? { [`${prefix}_name`]: value.name } : {}),
  } : {};
  return { ...event.attributes, event_name: event.type, tick: event.tick,
    ...identity(event.actor, targeted(event.type) ? 'attacker' : 'user'), ...identity(event.target, 'user'), ...identity(event.assistant, 'assister'),
    ...(event.weapon != null ? { weapon: event.weapon } : {}), ...(event.damageHealth != null ? { dmg_health: event.damageHealth } : {}),
    // The source may distinguish thrower and effect coordinates. Never replace
    // an observed user position with a generic event position.
    ...(event.position && ['actor', 'target'].includes(event.positionRole) && event.attributes?.user_X == null ? { user_X: event.position.x, user_Y: event.position.y, user_Z: event.position.z } : {}),
    ...(event.position && ['effect', 'unknown'].includes(event.positionRole) && event.attributes?.x == null ? { x: event.position.x, y: event.position.y, z: event.position.z } : {}),
  };
}
