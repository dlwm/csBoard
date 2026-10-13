import { createGoProtocolClient } from './goProtocol.js';
import { createParserSession, frameTicks, requireParser, ParserError } from './session.js';
import { FRAME_PROFILES, EVENT_TYPES, ACTIVE_WEAPON_HANDLE_PROP, GRENADE_ENTITY_PROPS } from './goFields.js';
import { observeGoPlayer } from './goPlayer.js';
import { observeEvent } from './eventObservation.js';
import { buildRounds } from '../roundTimeline.js';
import { recordingSegments } from '../recordings.js';
import { appendChangedInfernoFrame } from '../infernoFrames.js';
import { smokeVoxelFramesFromRow } from '../smokeVoxels.js';
import { projectileStartsNewLifecycle } from '../grenades.js';

const capability = supported => Object.freeze({ supported });
const CAPABILITIES = Object.freeze(Object.fromEntries(['metadata', 'utilities', 'events', 'frames', 'projectiles', 'inputs', 'smokeVoxels', 'fireAreas', 'voice', 'segments', 'prepareFrames'].map(key => [key, key === 'events' ? Object.freeze({ supported: true, eventTypes: Object.freeze([...EVENT_TYPES]) }) : capability(true)])));
const plain = value => value instanceof Map ? Object.fromEntries(value) : value;
const profileFields = profiles => [...new Set(profiles.flatMap(profile => {
  requireParser(Object.prototype.hasOwnProperty.call(FRAME_PROFILES, profile), 'invalid_query', `Unknown frame profile ${profile}`);
  return FRAME_PROFILES[profile];
}))];

// Transport only provides initialization, source access and a request channel.
// 属性名、列式协议、实体兼容与网络数组解码全部在 Go 适配层收口。
export function createGoParserEngine(transport, { includeVoice = true } = {}) {
  const adapter = createGoProtocolClient({ ...transport, request: async (method, args) => {
    try { return await transport.request(method, args); }
    catch (error) { throw new ParserError('parser_failure', error.message || String(error), { engine: 'demoinfocs', method, cause: { name: error.name, stack: error.stack } }); }
  } });
  let opening = false, active = false;
  const info = Object.freeze({ id: 'demoinfocs', adapterVersion: '2', sourceFormat: 'source2-demo', execution: transport.execution || 'unknown', ...(transport.sourceRevision ? { sourceRevision: transport.sourceRevision } : {}) });
  return Object.freeze({
    info,
    async open(source, { signal } = {}) {
      requireParser(!opening && !active, 'session_busy', 'This engine already owns a parser session');
      opening = true;
      let rawParts, runtime;
      try {
        signal?.throwIfAborted(); runtime = await adapter.init();
        rawParts = await adapter.openSources(source); signal?.throwIfAborted();
        requireParser(Array.isArray(rawParts) && rawParts.length > 0, 'invalid_source', 'No Demo sources');
        const parts = rawParts.map((part, index) => ({ id: `source-${index}`, byteLength: part.byteLength }));
        const find = query => {
          const index = parts.findIndex(part => part.id === query.partId);
          requireParser(index >= 0, 'unknown_source', `Unknown parser source ${query.partId}`); return rawParts[index];
        };
        const events = new Map(), weaponNames = new Map(), prepared = new Set();
        const eventsFor = async part => {
          if (!events.has(part)) events.set(part, Promise.resolve(adapter.parseEvents(part, EVENT_TYPES, ['X', 'Y', 'Z', 'pitch', 'yaw', 'team_num'])).then(value => Object.values(value || {}).map(plain)));
          return events.get(part);
        };
        const weaponsFor = async part => {
          if (!weaponNames.has(part)) weaponNames.set(part, (async () => {
            const fires = (await eventsFor(part)).filter(event => event.event_name === 'weapon_fire' && event.user_steamid && event.weapon);
            const names = new Map();
            const byTick = new Map(fires.map(event => [`${event.tick}:${event.user_steamid}`, event]));
            const ticks = [...new Set(fires.map(event => event.tick))].sort((a, b) => a - b), players = [...new Set(fires.map(event => String(event.user_steamid)))];
            for (let start = 0; start < ticks.length; start += 512) {
              for (const row of await adapter.parseTicks(part, [ACTIVE_WEAPON_HANDLE_PROP], ticks.slice(start, start + 512), players)) {
                const event = byTick.get(`${row.tick}:${row.steamid}`), handle = row[ACTIVE_WEAPON_HANDLE_PROP];
                if (event && handle != null) names.set(String(handle), event.weapon);
              }
            }
            return names;
          })());
          return weaponNames.get(part);
        };
        const release = async () => { const entries = [...prepared]; prepared.clear(); await Promise.all(entries.map(part => adapter.releaseTicks(part))); };
        const operations = {
          async getMetadata(query) {
            const header = plain(await adapter.parseHeader(find(query)));
            return { mapName: header.map_name, tickRate: 64, firstTick: Number(header.first_tick) || 0, lastTick: Number(header.last_tick) || 0,
              broadcast: header.is_hltv === 'true' ? true : header.is_hltv === 'false' ? false : null,
              standardRoster: header.standard_teams_seen === 'true' ? true : header.standard_teams_seen === 'false' ? false : null,
              patch: header.patch_version || null, versionGuid: header.demo_version_guid || null, versionName: header.demo_version_name || null, fileStamp: header.demo_file_stamp || null,
              serverName: header.server_name || null, clientName: header.client_name || null, producerFields: header };
          },
          async listSegments(query) {
            const part = find(query);
            requireParser(query.kind == null || ['match', 'recording'].includes(query.kind), 'invalid_query', 'Segment kind must be match or recording');
            let rounds;
            if (query.kind === 'recording') rounds = recordingSegments([plain(await adapter.parseHeader(part))], [0]);
            else rounds = buildRounds(await eventsFor(part));
            return rounds.map(round => ({ id: `segment-${round.round}`, sourceRound: query.kind === 'recording' ? null : round.sourceRound,
              startTick: round.freezeStartTick ?? round.startTick, activeStartTick: round.startTick, endTick: round.endTick,
              winner: round.winner ?? null, reason: round.reason ?? null }));
          },
          async *readEvents(query) {
            const rows = await eventsFor(find(query)), limit = query.batchSize ?? 512;
            requireParser(Number.isInteger(limit) && limit > 0 && limit <= 4096, 'invalid_query', 'Event batch size must be 1–4096');
            requireParser(!query.types || query.types.every(type => EVENT_TYPES.includes(type)), 'unsupported_capability', `Event type was not captured; supported types: ${EVENT_TYPES.join(', ')}`);
            const selected = rows.filter(row => (!query.types || query.types.includes(row.event_name)) && (query.startTick == null || row.tick >= query.startTick) && (query.endTick == null || row.tick <= query.endTick));
            for (let start = 0; start < selected.length; start += limit) yield selected.slice(start, start + limit).map(observeEvent);
          },
          async prepareFrames(query) {
            const part = find(query), props = profileFields(query.profiles || ['replay', 'analysis', 'preparation']);
            const fires = (await eventsFor(part)).filter(event => event.event_name === 'weapon_fire').map(event => event.tick);
            const ticks = [...new Set([...frameTicks(query), ...fires])].sort((a, b) => a - b);
            // Track before the request: a failed preparation may still retain data.
            prepared.add(part); weaponNames.delete(part);
            query.onProgress?.({ phase: 'preparation', completed: 0, total: 1 });
            const result = await adapter.prepareTicks(part, props, ticks, query.throws || []);
            query.onProgress?.({ phase: 'preparation', completed: 1, total: 1 });
            return { preparationTicks: result?.throwTicks || [] };
          },
          async *readFrames(query) {
            const part = find(query), ticks = frameTicks(query), props = profileFields([query.profile || 'replay']), limit = query.batchSize ?? 512;
            requireParser(Number.isInteger(limit) && limit > 0 && limit <= 512, 'invalid_query', 'Frame batch size must be 1–512');
            requireParser(query.players == null || Array.isArray(query.players) && query.players.every(id => typeof id === 'string'), 'invalid_query', 'Players must be source identity strings');
            const names = await weaponsFor(part);
            for (let start = 0; start < ticks.length; start += limit) {
              const rows = await adapter.parseTicks(part, props, ticks.slice(start, start + limit), query.players || null);
              query.onProgress?.({ phase: 'frames', completed: Math.min(start + limit, ticks.length), total: ticks.length });
              yield rows.map(value => {
                const row = plain(value);
                if (!row.active_weapon_name) row.active_weapon_name = names.get(String(row[ACTIVE_WEAPON_HANDLE_PROP])) || '';
                return { tick: row.tick, player: observeGoPlayer(row) };
              });
            }
          },
          async *readUtilities(query) {
            const latestInferno = new Map(), projectiles = new Map();
            for await (const value of adapter.iterateGrenades(find(query), GRENADE_ENTITY_PROPS)) {
              const row = plain(value), read = name => row[name] ?? row[`Grenade.${name}`];
              if (String(row.grenade_type || '').includes('Inferno')) {
                const frames = []; appendChangedInfernoFrame(frames, latestInferno, row, read);
                for (const frame of frames) yield { kind: 'fire', frame }; continue;
              }
              if (row.grenade_type === 'CSmokeGrenadeProjectile') for (const frame of smokeVoxelFramesFromRow(row, read)) yield { kind: 'smoke', frame };
              if (String(row.grenade_type || '').includes('Projectile')) {
                if (row.x != null && row.y != null && row.z != null) {
                  const entityId = row.entity_id ?? row.grenade_entity_id, starts = projectileStartsNewLifecycle(row, projectiles.get(entityId));
                  const projectile = { ...row }; for (const key of GRENADE_ENTITY_PROPS) { delete projectile[key]; delete projectile[key.split('.').at(-1)]; }
                  const velocity = read('m_vInitialVelocity'); projectiles.set(entityId, row);
                  yield { kind: 'projectile', frame: { ...projectile, entity_id: entityId, thrower_steamid: String(row.thrower_steamid ?? row.steamid ?? ''), thrower_name: row.thrower_name ?? row.name ?? '', ...(starts && velocity ? { initial_velocity: velocity } : {}) } };
                }
              } else if (Number(read('m_fThrowTime')) > 0) yield { kind: 'throw', tick: row.tick, steamid: String(row.thrower_steamid ?? row.steamid ?? ''), type: row.grenade_type,
                state: { strength: read('m_flThrowStrength'), jumpThrow: read('m_bJumpThrow'), throwTime: read('m_fThrowTime') } };
            }
          },
          async *readVoice(query) {
            const voice = await adapter.parseVoice(find(query));
            const frames = (voice?.frames || []).filter(frame => (query.startTick == null || frame.tick + frame.duration * 64 >= query.startTick) && (query.endTick == null || frame.tick <= query.endTick)), limit = query.batchSize ?? 256;
            requireParser(Number.isInteger(limit) && limit > 0 && limit <= 4096, 'invalid_query', 'Voice batch size must be 1–4096');
            if (!frames.length) yield { frames: [], summary: voice?.summary || {} };
            for (let start = 0; start < frames.length; start += limit) yield { frames: frames.slice(start, start + limit).map(frame => ({ ...frame, codec: 'opus' })), summary: start === 0 ? voice?.summary || {} : {} };
          },
          releasePreparedFrames: release,
        };
        const session = createParserSession({ info, parts, capabilities: { ...CAPABILITIES, ...(!includeVoice ? { voice: Object.freeze({ supported: false, reason: 'excluded-by-host' }) } : {}) }, operations,
          diagnostics: () => ({ wasmPages: runtime?.memory?.buffer ? runtime.memory.buffer.byteLength / 65536 : null }),
          dispose: async () => { try { await release(); } finally { events.clear(); weaponNames.clear(); rawParts = []; active = false; await transport.close?.(); } },
        }, { signal });
        active = true; return session;
      } catch (error) { await Promise.resolve().then(() => transport.close?.()).catch(() => {}); throw error; }
      finally { opening = false; }
    },
  });
}
