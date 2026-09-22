const EFFECT_END_EVENT = {
  smokegrenade_detonate: 'smokegrenade_expired',
  inferno_startburn: 'inferno_expire',
  decoy_started: 'decoy_detonate',
};

export const HE_SMOKE_CLEAR_SECONDS = 2.1;

const FALLBACK_DURATION_TICKS = {
  smokegrenade_detonate: 1152,
  inferno_startburn: 448,
  decoy_started: 960,
  flashbang_detonate: 20,
  hegrenade_detonate: 20,
};

const eventDistanceSquared = (left, right) => {
  if (![left?.x, left?.y, left?.z, right?.x, right?.y, right?.z].every(Number.isFinite)) return Infinity;
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
};

// Entity IDs are the strongest match. Position/player matching covers demos where IDs are absent.
export function effectEndTick(start, events = []) {
  const endName = EFFECT_END_EVENT[start?.event_name];
  const fallback = FALLBACK_DURATION_TICKS[start?.event_name] ?? 20;
  if (!endName || !Number.isFinite(start?.tick)) return (start?.tick ?? 0) + fallback;

  const candidates = events.filter((event) => event.event_name === endName && event.tick > start.tick && event.tick - start.tick <= fallback * 3);
  const entityMatch = start.entityid == null ? null : candidates.find((event) => event.entityid != null && event.entityid === start.entityid);
  if (entityMatch) return entityMatch.tick;

  const playerMatches = candidates.filter((event) => start.user_steamid == null || event.user_steamid == null || String(event.user_steamid) === String(start.user_steamid));
  const nearest = playerMatches.sort((left, right) => eventDistanceSquared(start, left) - eventDistanceSquared(start, right))[0];
  return nearest?.tick ?? start.tick + fallback;
}

export function isEffectStartEvent(event) {
  return event?.event_name in FALLBACK_DURATION_TICKS;
}
