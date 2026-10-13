import { encodeStoredValue, decodeStoredValue } from '../../shared/storage-codec.js';
import { DEMO_CACHE_SCHEMA_VERSION } from '../demo/cacheSchema.js';
import { requireFormat } from './errors.js';

// Producer fields preserve information outside the neutral replay core. Only
// this adapter understands CSBoard's storage tags; the format stays JSON-only.
const fields = value => ({ csboard: JSON.parse(encodeStoredValue(value)) });
const original = value => value?.csboard ? decodeStoredValue(JSON.stringify(value.csboard)) : {};
const steamAccount = value => /^[1-9][0-9]{15,19}$/.test(String(value || '')) ? String(value) : null;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const identity = player => String(player.steamid && player.steamid !== '0' ? `steam:${player.steamid}` : player.userId != null ? `user:${player.userId}` : `name:${player.name || ''}`);
const position = player => player.hasPosition !== false && [player.raw?.x, player.raw?.y, player.raw?.z].every(Number.isFinite) ? [player.raw.x, player.raw.y, player.raw.z] : null;
const sourcePoint = value => [value.x, value.y, value.z].every(Number.isFinite) ? [value.x, value.y, value.z] : null;
const capability = (count, declared) => ({ status: count ? 'available' : declared ? 'empty' : 'unknown', ...(!count && !declared ? { reason: 'not-declared-by-producer' } : {}) });
const stateFields = new Set('steamid raw position team side hasPosition alive health armor hasHelmet hasDefuser hasC4 pitch yaw duckAmount isAirborne movement jump walking fire secondaryFire grenadePinPulled grenadeThrowStrength flashDuration scoped balance placeName activeWeapon activeWeaponAmmo inventory inputAvailable'.split(' '));

export function createCsboardReplayProducer(data) {
  requireFormat(data?.demo && data.rounds?.length, 'missing_replay', 'Replay has no playable segments');
  const players = new Map();
  const register = (steamid, name, userId) => {
    if ((!steamid || String(steamid) === '0') && !name && userId == null) return null;
    const id = identity({ steamid, name, userId });
    if (!players.has(id)) players.set(id, { id, name: name || '', steamId: steamAccount(steamid), producerFields: fields({ steamid, userId }) });
    return id;
  };
  const playerState = player => {
    const id = identity(player);
    if (!players.has(id)) players.set(id, { id, name: player.name || '', steamId: player.steamId ?? steamAccount(player.steamid), producerFields: fields({ steamid: player.steamid, userId: player.userId }) });
    return { playerId: id, position: position(player), yaw: finite(player.yaw), pitch: finite(player.pitch),
      side: player.team === 2 ? 'T' : player.team === 3 ? 'CT' : player.team === 1 ? 'spectator' : 'unknown',
      health: finite(player.health), alive: typeof player.alive === 'boolean' ? player.alive : null,
      weapon: player.activeWeapon ?? null, inventory: Array.isArray(player.inventory) ? player.inventory : null,
      armor: finite(player.armor), helmet: boolean(player.hasHelmet), defuseKit: boolean(player.hasDefuser), hasBomb: boolean(player.hasC4), ammo: finite(player.activeWeaponAmmo),
      crouchAmount: finite(player.duckAmount), airborne: boolean(player.isAirborne), walking: boolean(player.walking),
      flashDurationSeconds: finite(player.flashDuration), scoped: boolean(player.scoped), money: finite(player.balance), placeName: player.placeName ?? null,
      input: player.inputAvailable ? { movement: player.movement || [], jump: boolean(player.jump), primaryFire: boolean(player.fire), secondaryFire: boolean(player.secondaryFire),
        walk: boolean(player.walking), pinPulled: boolean(player.grenadePinPulled), throwStrength: finite(player.grenadeThrowStrength) } : null,
      // Do not duplicate neutral tracks in the producer escape hatch. Retain
      // actual extra facts (ammo/economy details, label changes, future fields).
      producerFields: fields(Object.fromEntries(Object.entries(player).filter(([key]) => !stateFields.has(key)))) };
  };
  const frames = snapshots => (snapshots || []).map(snapshot => ({ tick: snapshot.tick, players: snapshot.players.map(playerState), producerFields: fields({ timeSeconds: snapshot.timeSeconds }) }));
  const counts = { replay: 0, inputs: 0, smokeVoxels: 0, fireAreas: 0, voice: 0, projectiles: 0 };
  return {
    players, counts,
    encodeFrames: frames,
    encodeSegment(round, payload) {
      requireFormat(payload?.snapshots?.length, 'missing_segment', `Missing replay payload for segment ${round.round}`);
      const result = {
        id: `segment-${round.round}`, frames: frames(payload.snapshots), preparationFrames: frames(payload.throwSnapshots),
        projectiles: (payload.projectiles || []).map(value => ({ tick: value.tick, position: sourcePoint(value), type: value.grenade_type || '', entityId: value.entity_id == null ? null : String(value.entity_id),
          ownerId: register(value.thrower_steamid ?? value.steamid, value.thrower_name ?? value.name), producerFields: fields(value) })),
        smokeFrames: (payload.smokeVoxelFrames || []).map(value => ({ tick: value.tick, entityId: String(value.entityId), origin: value.origin, sequence: value.seq, voxels: Array.from(value.voxels), producerFields: fields({ entityId: value.entityId }) })),
        fireFrames: (payload.infernoFrames || []).map(value => ({ tick: value.tick, entityId: String(value.entityId), sequence: value.seq, lifetime: value.lifetime, cells: Array.from(value.cells), producerFields: fields({ entityId: value.entityId }) })),
        voiceFrames: (payload.voiceFrames || []).map(value => ({ tick: value.tick, playerId: register(value.steamid, value.name), durationSeconds: value.duration, codec: 'opus', dataBase64: value.data, producerFields: fields({ name: value.name, steamid: value.steamid, team: value.team }) })),
        producerFields: fields(Object.fromEntries(Object.entries(payload).filter(([key]) => !['snapshots', 'throwSnapshots', 'projectiles', 'smokeVoxelFrames', 'infernoFrames', 'voiceFrames'].includes(key)))),
      };
      counts.replay += result.frames.length; counts.inputs += [...result.frames, ...result.preparationFrames].reduce((sum, frame) => sum + frame.players.filter(player => player.input !== null).length, 0);
      counts.smokeVoxels += result.smokeFrames.length; counts.fireAreas += result.fireFrames.length; counts.voice += result.voiceFrames.length; counts.projectiles += result.projectiles.length;
      return result;
    },
    metadata: () => ({ name: data.demo.fileName, sourceFileName: data.demo.sourceFileName || data.demo.fileName,
      producerFields: fields(Object.fromEntries(Object.entries(data).filter(([key]) => !['events', 'roundData', 'analysisRows'].includes(key)))) }),
    events: () => (data.events || []).map((event, index) => {
      const participant = prefix => {
        const steamid = event[`${prefix}_steamid`], name = event[`${prefix}_name`];
        return register(steamid, name);
      };
      const targeted = ['player_death', 'player_hurt', 'player_blind'].includes(event.event_name);
      const coords = [event.x ?? event.user_X, event.y ?? event.user_Y, event.z ?? event.user_Z];
      return { id: `event-${index}`, type: event.event_name || 'unknown', tick: event.tick,
        actorId: participant(targeted ? 'attacker' : 'user'), targetId: targeted ? participant('user') : null, assistantId: participant('assister'),
        position: coords.every(Number.isFinite) ? coords : null, weapon: event.weapon ?? null, damageHealth: finite(event.dmg_health), producerFields: fields(event) };
    }),
    capabilities: () => Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count ? capability(count, true) : data.demo.formatCapabilities?.[key] || capability(0, ['replay', 'projectiles'].includes(key))])),
  };
}

export function createCsboardReplayConsumer(manifest, metadata, roster, events, analysis = []) {
  const players = new Map(roster.map(player => [player.id, player]));
  const sourceIdentity = player => player.steamId || original(player.producerFields).steamid || player.id;
  requireFormat(players.size === roster.length, 'duplicate_player', 'Player IDs must be unique');
  const frames = values => values.map(frame => {
    requireFormat(new Set(frame.players.map(player => player.playerId)).size === frame.players.length, 'duplicate_player', 'A frame has duplicate player IDs');
    return { ...original(frame.producerFields), tick: frame.tick, timeSeconds: frame.tick / manifest.tickRate,
    players: frame.players.map(value => {
      const entry = players.get(value.playerId);
      requireFormat(entry, 'unknown_player', `Unknown player ID ${value.playerId}`);
      const [x, y, z] = value.position || [0, 0, 0];
      const attrs = original(value.producerFields);
      return { ...attrs, name: attrs.name ?? entry.name, steamid: entry.steamId || original(entry.producerFields).steamid || value.playerId,
        team: value.side === 'T' ? 2 : value.side === 'CT' ? 3 : value.side === 'spectator' ? 1 : null, side: ['T', 'CT'].includes(value.side) ? value.side : '',
        health: value.health, alive: value.alive, yaw: value.yaw, pitch: value.pitch,
        activeWeapon: value.weapon, inventory: value.inventory, hasPosition: value.position !== null,
        armor: value.armor, hasHelmet: value.helmet, hasDefuser: value.defuseKit, activeWeaponAmmo: value.ammo,
        duckAmount: value.crouchAmount, isAirborne: value.airborne, walking: value.walking,
        flashDuration: value.flashDurationSeconds, scoped: value.scoped, balance: value.money, placeName: value.placeName,
        inputAvailable: value.input !== null, movement: value.input?.movement || [], jump: value.input?.jump ?? null,
        fire: value.input?.primaryFire ?? null, secondaryFire: value.input?.secondaryFire ?? null,
        grenadePinPulled: value.input?.pinPulled ?? null, grenadeThrowStrength: value.input?.throwStrength ?? null,
        raw: { x: value.position ? x : null, y: value.position ? y : null, z: value.position ? z : null },
        position: { x: y * .0254, y: z * .0254, z: x * .0254 },
        hasC4: value.hasBomb,
      };
    }) }; });
  const source = original(metadata.producerFields);
  const rounds = manifest.segments.map((segment, index) => ({ ...(source.rounds?.[index] || {}), round: source.rounds?.[index]?.round ?? (manifest.kind === 'match' ? segment.sourceRound : null) ?? index + 1,
    freezeStartTick: segment.startTick, startTick: segment.activeStartTick, endTick: segment.endTick, sourceRound: segment.sourceRound }));
  requireFormat(new Set(events.map(event => event.id)).size === events.length, 'duplicate_event', 'Event IDs must be unique');
  const data = { ...source, cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION,
    demo: { ...source.demo, fileName: metadata.name, sourceFileName: metadata.sourceFileName, map: manifest.mapName, kind: manifest.kind,
      tickRate: manifest.tickRate, sampleRate: manifest.sampleRate, maxTick: Math.max(...rounds.map(round => round.endTick)),
      formatCapabilities: manifest.capabilities, sourceReady: false },
    rounds, events: events.map(value => {
      const participant = (id, prefix) => {
        if (id == null) return {};
        const player = players.get(id); requireFormat(player, 'unknown_player', `Unknown event participant ${id}`);
        return { [`${prefix}_steamid`]: sourceIdentity(player), [`${prefix}_name`]: player.name };
      };
      const targeted = ['player_death', 'player_hurt', 'player_blind'].includes(value.type);
      return { ...original(value.producerFields), event_name: value.type, tick: value.tick, timeSeconds: value.tick / manifest.tickRate,
        ...participant(value.actorId, targeted ? 'attacker' : 'user'), ...participant(value.targetId, 'user'), ...participant(value.assistantId, 'assister'),
        weapon: value.weapon, dmg_health: value.damageHealth, ...(value.position ? { x: value.position[0], y: value.position[1], z: value.position[2], user_X: value.position[0], user_Y: value.position[1], user_Z: value.position[2] } : {}),
      };
    }),
    players: roster.map(player => player.name), analysisRows: [], roundData: [],
    summary: { ...source.summary, rounds: rounds.length, players: roster.map(player => player.name) },
  };
  return {
    data, analysisRows: frames(analysis),
    decodeSegment(value, index) {
      const payload = { ...original(value.producerFields), round: rounds[index].round, snapshots: frames(value.frames), throwSnapshots: frames(value.preparationFrames),
        projectiles: value.projectiles.map(row => {
          const owner = row.ownerId ? players.get(row.ownerId) : null;
          requireFormat(!row.ownerId || owner, 'unknown_player', `Unknown projectile owner ${row.ownerId}`);
          return { ...original(row.producerFields), tick: row.tick, grenade_type: row.type,
            ...(row.position ? { x: row.position[0], y: row.position[1], z: row.position[2] } : {}),
            ...(owner ? { name: owner.name, steamid: sourceIdentity(owner) } : {}), entity_id: original(row.producerFields).entity_id ?? row.entityId };
        }),
        smokeVoxelFrames: value.smokeFrames.map(row => ({ tick: row.tick, entityId: original(row.producerFields).entityId ?? row.entityId, origin: row.origin, seq: row.sequence, voxels: Uint16Array.from(row.voxels) })),
        infernoFrames: value.fireFrames.map(row => {
          requireFormat(row.cells.length % 6 === 0, 'invalid_fire_cells', 'Fire cells require groups of six coordinate/normal components');
          return ({ tick: row.tick, entityId: original(row.producerFields).entityId ?? row.entityId, seq: row.sequence, lifetime: row.lifetime, cells: Float32Array.from(row.cells) }); }),
        voiceFrames: value.voiceFrames.map(row => {
          const speaker = row.playerId ? players.get(row.playerId) : null;
          requireFormat(!row.playerId || speaker, 'unknown_player', `Unknown voice speaker ${row.playerId}`);
          return { ...original(row.producerFields), ...(speaker ? { name: speaker.name, steamid: sourceIdentity(speaker) } : {}), tick: row.tick, duration: row.durationSeconds, data: row.dataBase64 };
        }),
      };
      requireFormat(payload.snapshots.length, 'missing_segment', 'Segment contains no player frames');
      return payload;
    },
  };
}

export { original as readCsboardProducerFields };
