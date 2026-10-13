import { DEMO_CACHE_SCHEMA_VERSION } from '../demo/cacheSchema.js';
import { requireFormat } from './errors.js';

const delta = values => { let value = 0; return values.map(change => (value += change)); };
const missing = reason => ({ status: 'unavailable', reason });
export function createV3ReplayConsumer(files, manifest) {
  requireFormat(files.replay?.rounds?.length, 'replay_unavailable', 'This standard package has no replay stream');
  requireFormat(files.replay.meta.tickrate === manifest.tickrate && files.match.tickrate === manifest.tickrate, 'invalid_timeline', 'Package tick rates disagree');
  const roster = files.players;
  const side = (index, round) => (roster[index]?.teamKey === 'teamA' ? round.teamASide : round.teamBSide).toUpperCase();
  const player = (index, prefix, point) => {
    if (index == null) return {};
    requireFormat(roster[index], 'unknown_player', `Invalid v3 playerIndex ${index}`);
    return { [`${prefix}_name`]: roster[index].name, [`${prefix}_steamid`]: roster[index].steamId64,
      ...(point ? { [`${prefix}_X`]: point.x, [`${prefix}_Y`]: point.y, [`${prefix}_Z`]: point.z } : {}) };
  };
  const events = [];
  for (const row of files.kills) events.push({ event_name: 'player_death', tick: row.tick, weapon: row.weapon, headshot: row.headshot,
    ...player(row.killerIndex, 'attacker', row.killerPosition), ...player(row.victimIndex, 'user', row.victimPosition), ...player(row.assisterIndex, 'assister') });
  for (const row of files.damages) events.push({ event_name: 'player_hurt', tick: row.tick, weapon: row.weapon,
    dmg_health: row.healthDamage, dmg_armor: row.armorDamage, health: row.victimHealthBefore - row.healthDamage, hitgroup: row.hitgroup,
    ...player(row.attackerIndex, 'attacker', row.attackerPosition), ...player(row.victimIndex, 'user', row.victimPosition) });
  for (const row of files.blinds) events.push({ event_name: 'player_blind', tick: row.tick, blind_duration: row.durationSeconds,
    ...player(row.flasherIndex, 'attacker'), ...player(row.flashedIndex, 'user') });
  const bombNames = { plant_begin: 'bomb_beginplant', planted: 'bomb_planted', defuse_begin: 'bomb_begindefuse', defuse_abort: 'bomb_abortdefuse', defused: 'bomb_defused', exploded: 'bomb_exploded', dropped: 'bomb_dropped', picked_up: 'bomb_pickup' };
  for (const row of files.bombs) events.push({ event_name: bombNames[row.type] || `bomb_${row.type}`, tick: row.tick, site: row.site, ...player(row.actorIndex, 'user', row.position), x: row.position.x, y: row.position.y, z: row.position.z });
  const grenadeNames = { smoke: 'C_SmokeGrenadeProjectile', flashbang: 'C_FlashbangProjectile', hegrenade: 'C_HEGrenadeProjectile', molotov: 'C_MolotovProjectile', incendiary: 'C_MolotovProjectile', decoy: 'C_DecoyProjectile' };
  const effects = { smoke: ['smokegrenade_detonate', 'smokegrenade_expired'], flashbang: ['flashbang_detonate'], hegrenade: ['hegrenade_detonate'], molotov: ['inferno_startburn', 'inferno_expire'], incendiary: ['inferno_startburn', 'inferno_expire'], decoy: ['decoy_started', 'decoy_detonate'] };
  const grenades = files.grenades.map((row, index) => ({ ...row, entity: row.grenadeId || `v3-grenade-${index}` }));
  for (const row of grenades) {
    const attrs = { grenade_entity_id: row.entity, ...player(row.throwerIndex, 'user', row.throwPosition), weapon: row.grenade };
    events.push({ ...attrs, event_name: 'grenade_thrown', tick: row.throwTick });
    const position = row.effectPosition;
    events.push({ ...attrs, event_name: effects[row.grenade]?.[0] || 'unknown', tick: row.effectTick, x: position.x, y: position.y, z: position.z });
    if (row.destroyTick != null && effects[row.grenade]?.[1]) events.push({ ...attrs, event_name: effects[row.grenade][1], tick: row.destroyTick, x: position.x, y: position.y, z: position.z });
  }
  for (const track of files.shots?.tracks || []) {
    const ticks = delta(track.tick);
    requireFormat(['weapon', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch'].every(key => track[key].length === ticks.length), 'invalid_track', 'Shot arrays have different lengths');
    for (let index = 0; index < ticks.length; index++) events.push({ event_name: 'weapon_fire', tick: ticks[index], weapon: files.shots.weaponDict[track.weapon[index]] || '', ...player(track.playerIndex, 'user') });
  }
  const roundNumbers = new Set(files.rounds.map(round => round.roundNumber));
  requireFormat(roundNumbers.size === files.rounds.length, 'duplicate_segment', 'V3 round numbers must be unique');
  for (const [key, rows] of Object.entries(files)) if (Array.isArray(rows)) for (const row of rows) {
    if (row.roundNumber != null) requireFormat(roundNumbers.has(row.roundNumber), 'unknown_round', `${key} refers to an unknown round`);
    for (const [field, index] of Object.entries(row)) if (field.endsWith('Index') && index != null) requireFormat(roster[index], 'unknown_player', `${key}.${field} refers to an unknown player`);
  }
  const meta = files.replay.meta;
  const rounds = files.rounds.map((round, index) => ({ round: round.roundNumber, sourceRound: round.roundNumber, startTick: round.freezeEndTick,
    // Freeze samples are not present in v3: do not invent a playable freeze span.
    freezeStartTick: round.freezeEndTick, endTick: files.rounds[index + 1]?.startTick - 1 || round.endTick,
    winner: round.winnerSide === 't' ? 2 : 3, reason: round.endReason }));
  const capabilities = { replay: { status: 'available' }, projectiles: { status: 'available' },
    freezeTime: missing('v3-replay-starts-at-freeze-end'), inputs: missing('not-in-v3-contract'),
    smokeVoxels: missing('not-in-v3-contract'), fireAreas: missing('not-in-v3-contract'), voice: missing('not-in-v3-contract') };
  const { replay: _replay, ...facts } = files;
  const data = { cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION, demo: { kind: 'match', fileName: manifest.demo.sourceFileName || 'Imported match', map: manifest.mapName,
    tickRate: manifest.tickrate, sampleRate: meta.sampleRate, maxTick: Math.max(...rounds.map(round => round.endTick)),
    formatCapabilities: capabilities, voice: { frames: 0, skipped: 0, limited: false } },
    rounds, roundData: [], events: events.sort((a, b) => a.tick - b.tick).map(event => ({ ...event, timeSeconds: event.tick / manifest.tickrate })),
    players: roster.map(row => row.name), summary: { rounds: rounds.length, kills: files.kills.length, damageEvents: files.damages.length, players: roster.map(row => row.name) },
    formatFacts: { version: manifest.schemaVersion, manifest, files: facts },
  };
  return {
    data, capabilities,
    decodeSegment(index) {
      const round = files.rounds[index], stream = files.replay.rounds.find(value => value.roundNumber === round.roundNumber);
      requireFormat(stream && stream.frameCount > 0 && stream.frameCount <= 200000, 'missing_segment', `V3 round ${round.roundNumber} has no replay frames`);
      requireFormat(stream.startTick === round.freezeEndTick, 'invalid_timeline', 'V3 replay start disagrees with freezeEndTick');
      const snapshots = Array.from({ length: stream.frameCount }, (_, frame) => ({ tick: stream.startTick + frame * stream.tickStep, timeSeconds: (stream.startTick + frame * stream.tickStep) / manifest.tickrate, players: [] }));
      const seen = new Set();
      for (const track of stream.players) {
        requireFormat(roster[track.playerIndex] && !seen.has(track.playerIndex), 'unknown_player', 'Replay has duplicate or invalid player tracks'); seen.add(track.playerIndex);
        requireFormat(['x', 'y', 'z', 'yaw', 'pitch', 'hp', 'armor', 'money', 'equipValue', 'weapon', 'place', 'flash', 'flags'].every(key => track[key].length === stream.frameCount), 'invalid_track', 'Replay arrays have different lengths');
        requireFormat(!track.grenades?.length || track.grenades.length === stream.frameCount, 'invalid_track', 'Replay inventory length is invalid');
        const values = Object.fromEntries(['x', 'y', 'z', 'yaw', 'pitch', 'money', 'equipValue'].map(key => [key, delta(track[key])]));
        const entry = roster[track.playerIndex];
        snapshots.forEach((snapshot, frame) => {
          const x = values.x[frame] * meta.coordScale, y = values.y[frame] * meta.coordScale, z = values.z[frame] * meta.coordScale;
          const teamSide = side(track.playerIndex, round), flags = track.flags[frame];
          requireFormat(track.weapon[frame] < files.replay.weaponDict.length && track.place[frame] < files.replay.placeDict.length, 'invalid_dictionary', 'Replay dictionary index is out of bounds');
          snapshot.players.push({ name: entry.name, steamid: entry.steamId64, team: teamSide === 'T' ? 2 : 3, side: teamSide,
            health: track.hp[frame], armor: track.armor[frame], alive: Boolean(flags & 1), hasC4: Boolean(flags & 2), hasDefuser: Boolean(flags & 4),
            raw: { x, y, z }, position: { x: y * .0254, y: z * .0254, z: x * .0254 }, hasPosition: true,
            yaw: values.yaw[frame] / meta.angleScale, pitch: values.pitch[frame] / meta.angleScale, flashDuration: track.flash[frame] / 10,
            activeWeapon: files.replay.weaponDict[track.weapon[frame]] || '', inventory: track.grenades?.[frame] || [],
            balance: values.money[frame], currentEquipValue: values.equipValue[frame], placeName: files.replay.placeDict[track.place[frame]] || '',
            inputAvailable: false, movement: [], jump: null, score: teamSide === round.teamASide.toUpperCase() ? round.teamAScoreBefore : round.teamBScoreBefore,
          });
        });
      }
      const projectiles = [], used = new Set();
      for (const [pIndex, track] of stream.projectiles.entries()) {
        requireFormat(track.x.length === track.y.length && track.y.length === track.z.length, 'invalid_track', 'Projectile arrays have different lengths');
        const candidates = grenades.filter(row => row.roundNumber === round.roundNumber && row.grenade === track.grenade && row.throwerIndex === track.throwerIndex && !used.has(row.entity) && Math.abs(row.throwTick - track.startTick) <= stream.tickStep);
        const entity = candidates.length === 1 ? candidates[0].entity : `v3-projectile-${round.roundNumber}-${pIndex}`;
        if (candidates.length === 1) used.add(entity);
        const x = delta(track.x), y = delta(track.y), z = delta(track.z);
        for (let frame = 0; frame < x.length; frame++) projectiles.push({ tick: track.startTick + frame * stream.tickStep,
          entity_id: entity, grenade_type: grenadeNames[track.grenade] || track.grenade,
          x: x[frame] * meta.coordScale, y: y[frame] * meta.coordScale, z: z[frame] * meta.coordScale,
          thrower_name: roster[track.throwerIndex]?.name || '', thrower_steamid: roster[track.throwerIndex]?.steamId64 || '' });
      }
      return { round: round.roundNumber, snapshots, throwSnapshots: [], projectiles, smokeVoxelFrames: [], infernoFrames: [], voiceFrames: [] };
    },
  };
}
