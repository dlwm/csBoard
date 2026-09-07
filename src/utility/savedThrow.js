import { utilityReplayStart } from '../demo/grenades.js';

// Convert one parsed projectile segment into the portable utility-note schema.
export function buildSavedThrowNote({ mapName, segment, source = {}, unknownLabel = 'Unknown' }) {
  if (!segment) return null;
  const throwerId = String(segment.throwEvent.user_steamid || '');
  const throwerName = segment.throwEvent.user_name || unknownLabel;
  const tickRate = source.tickRate || 64;
  const replayStart = utilityReplayStart(segment, throwerId, throwerName, tickRate);
  const replayStartTick = replayStart.startTick;
  const replaySnapshots = segment.snapshots.filter((snapshot) => snapshot.tick >= replayStartTick && snapshot.tick <= segment.effectTick).map((snapshot) => ({
    tick: snapshot.tick - replayStartTick,
    players: snapshot.players.filter((player) => String(player.steamid || '') === throwerId || player.name === throwerName).map((player) => ({ name: player.name, steamid: player.steamid, team: player.team, health: player.health, pitch: player.pitch, yaw: player.yaw, duckAmount: player.duckAmount, isAirborne: player.isAirborne, movement: player.movement, walking: player.walking, fire: player.fire, secondaryFire: player.secondaryFire, activeWeapon: player.activeWeapon, hasDefuser: player.hasDefuser, defusing: player.defusing, placeName: player.placeName, raw: player.raw, position: player.position })),
  }));
  const throwSnapshot = [...replaySnapshots].reverse().find((snapshot) => snapshot.tick <= segment.throwTick - replayStartTick)?.players[0] || replaySnapshots[0]?.players[0];
  const startSnapshot = replaySnapshots.find((snapshot) => snapshot.players[0])?.players[0] || throwSnapshot;
  const startPlace = startSnapshot?.placeName || '';
  const throwPlace = throwSnapshot?.placeName || startPlace;
  const position = startSnapshot?.raw ? [startSnapshot.raw.x, startSnapshot.raw.y, startSnapshot.raw.z] : [segment.throwEvent.user_X, segment.throwEvent.user_Y, segment.throwEvent.user_Z];
  if (position.some((value) => !Number.isFinite(Number(value)))) return null;
  const angles = [Number(throwSnapshot?.pitch || 0), Number(throwSnapshot?.yaw || 0), 0];
  const preparation = replaySnapshots.filter((snapshot) => snapshot.tick <= segment.throwTick - replayStartTick).flatMap((snapshot) => snapshot.players);
  const nearestAttackIndex = preparation.findLastIndex((player) => player.fire || player.secondaryFire);
  const attackRows = [];
  for (let index = nearestAttackIndex; index >= 0 && (preparation[index].fire || preparation[index].secondaryFire); index -= 1) attackRows.unshift(preparation[index]);
  const throwStrength = segment.throwEvent.throw_strength == null ? NaN : Number(segment.throwEvent.throw_strength);
  const attack = Number.isFinite(throwStrength)
    ? throwStrength >= 0.75 ? 'primary' : throwStrength <= 0.25 ? 'secondary' : 'both'
    : attackRows.some((player) => player.fire && player.secondaryFire) ? 'both' : attackRows.at(-1)?.secondaryFire ? 'secondary' : 'primary';
  const movement = [...new Set(preparation.slice(-32).flatMap((player) => player.movement || []))];
  const behavior = { attack, throwStrength: Number.isFinite(throwStrength) ? throwStrength : null, jumped: typeof segment.throwEvent.jump_throw === 'boolean' ? segment.throwEvent.jump_throw : preparation.slice(-32).some((player) => player.isAirborne), crouched: preparation.slice(-8).some((player) => Number(player.duckAmount) >= 0.8), walking: preparation.slice(-8).some((player) => player.walking), movement, hasRunup: replayStart.hasRunup, runupPeakSpeed: replayStart.peakSpeed, runupDistance: replayStart.distance };
  const behaviorText = [attack, replayStart.hasRunup ? 'runup' : null, behavior.jumped ? 'jump' : null, behavior.crouched ? 'crouch' : null, behavior.walking ? 'walk' : null, movement.length ? movement.join('+') : 'stationary'].filter(Boolean).join(' · ');
  const entityIds = new Set(segment.projectiles.map((record) => Number(record.entity_id ?? record.grenade_entity_id)).filter(Number.isFinite));
  if (Number.isFinite(Number(segment.landing?.entityid))) entityIds.add(Number(segment.landing.entityid));
  const smokeVoxelFrames = segment.kind === 'smoke' ? (source.smokeVoxelFrames || []).filter((frame) => (
    entityIds.has(Number(frame.entityId)) && frame.tick >= replayStartTick && frame.tick <= segment.endTick
  )).map((frame) => ({
    ...frame,
    tick: frame.tick - replayStartTick,
    // Utility notes are JSON-backed, so preserve packed voxel values as a plain array.
    voxels: Array.from(frame.voxels || []),
  })) : [];
  const replay = {
    tickRate,
    throwTick: segment.throwTick - replayStartTick,
    effectTick: segment.effectTick - replayStartTick,
    endTick: segment.endTick - replayStartTick,
    snapshots: replaySnapshots,
    projectiles: segment.projectiles.map((record) => ({ tick: record.tick - replayStartTick, entity_id: record.entity_id, grenade_type: record.grenade_type, initialVelocity: record.initial_velocity ?? null, x: record.x, y: record.y, z: record.z })),
    smokeVoxelFrames,
    events: [{ event_name: 'grenade_thrown', tick: segment.throwTick - replayStartTick, weapon: segment.throwEvent.weapon, user_name: throwerName, user_steamid: segment.throwEvent.user_steamid, user_X: segment.throwEvent.user_X, user_Y: segment.throwEvent.user_Y, user_Z: segment.throwEvent.user_Z }, ...(segment.landing ? [{ event_name: segment.landing.event_name, tick: segment.effectTick - replayStartTick, entityid: segment.landing.entityid, user_steamid: segment.landing.user_steamid, x: segment.landing.x, y: segment.landing.y, z: segment.landing.z }] : [])],
  };
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mapName, position: position.map(Number), angles, name: `${throwerName} · ${segment.kind.toUpperCase()}`, summary: behaviorText, source: 'demo', grenadeType: segment.kind, thrower: throwerName, startPlace, throwPlace, demoSource: { fileName: source.fileName || 'Demo', round: source.round || null, tick: segment.throwTick, map: mapName }, behavior, replay, createdAt: new Date().toISOString() };
}
