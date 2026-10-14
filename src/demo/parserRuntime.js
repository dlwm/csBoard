import { projectileStartsNewLifecycle } from './grenades.js';
import { DEMO_CACHE_SCHEMA_VERSION } from './cacheSchema.js';
import { matchCompatibility, recordingSegments, NON_STANDARD_DEMO, RECORDING_KIND } from './recordings.js';
import { ParserError } from './parsers/session.js';
import { eventToRuntime } from './parsers/eventObservation.js';
import { buildRounds } from './roundTimeline.js';

// Each task owns its parser state; both Web Workers and desktop jobs use this contract.
export function createDemoParser({ engine, postMessage }) {
let session;
const parserInfo = engine.info;
const openSources = async data => {
  if (!session || data.buffers || data.buffer || data.sources) {
    await session?.dispose();
    session = await engine.open(data);
  }
  return session.parts;
};
const parseHeader = async part => {
  const metadata = await session.getMetadata({ partId: part.id });
  if (metadata.tickRate !== 64) throw new ParserError('unsupported_tickrate', 'The current replay pipeline requires a 64-tick source');
  return metadata;
};
const parseVoice = async part => {
  if (!session.capabilities.voice?.supported) return null;
  const frames = [], summary = { skipped: 0, limited: false };
  for await (const batch of session.readVoice({ partId: part.id })) {
    frames.push(...batch.frames); summary.skipped += batch.summary?.skipped || 0; summary.limited ||= Boolean(batch.summary?.limited);
  }
  return { frames, summary };
};
let demoBytes;
let demoParts = [];
let partOffsets = [];
let partSkips = [];
let partEvents = [];
let allEvents = [];
let allProjectiles = [];
let allSmokeVoxelFrames = [];
let allInfernoFrames = [];
let allVoiceFrames = [];
let equippedWeaponsByPlayer = new Map();
let currentPhase = 'idle';
let phaseStartedAt = 0;
const CACHE_SCHEMA_VERSION = DEMO_CACHE_SCHEMA_VERSION;
const replayProfile = 'replay', analysisProfile = 'analysis', preparationProfile = 'preparation';
// Bound the JSON bridge response, not the number of ticks scanned by Go.
// 512 ticks × players × properties keeps temporary maps/JSON/string copies
// manageable below wasm32's 4 GiB ceiling, including long throw preparations.
// 限制每次返回体积，不降低采样率，也不重复全量扫描；避免大批 JSON 耗尽 WASM。
const PARSE_TICK_BATCH_SIZE = 512;
const parseProgressStages = [
  { percent: 0, code: "ticks_0" },
  { percent: 3, code: "ticks_3" },
  { percent: 6, code: "ticks_6" },
  { percent: 9, code: "ticks_9" },
  { percent: 12, code: "ticks_12" },
  { percent: 15, code: "ticks_15" },
  { percent: 18, code: "ticks_18" },
  { percent: 21, code: "ticks_21" },
  { percent: 24, code: "ticks_24" },
  { percent: 27, code: "ticks_27" },
  { percent: 30, code: "ticks_30" },
  { percent: 33, code: "ticks_33" },
  { percent: 36, code: "ticks_36" },
  { percent: 39, code: "ticks_39" },
  { percent: 42, code: "ticks_42" },
  { percent: 45, code: "ticks_45" },
  { percent: 48, code: "ticks_48" },
  { percent: 51, code: "ticks_51" },
  { percent: 54, code: "ticks_54" },
  { percent: 57, code: "ticks_57" },
  { percent: 60, code: "ticks_60" },
  { percent: 63, code: "ticks_63" },
  { percent: 66, code: "ticks_66" },
  { percent: 69, code: "ticks_69" },
  { percent: 72, code: "ticks_72" },
  { percent: 75, code: "ticks_75" },
  { percent: 78, code: "ticks_78" },
  { percent: 81, code: "ticks_81" },
  { percent: 84, code: "ticks_84" },
  { percent: 87, code: "ticks_87" },
  { percent: 90, code: "ticks_90" },
  { percent: 93, code: "ticks_93" },
  { percent: 96, code: "ticks_96" },
  { percent: 98, code: "ticks_98" },
  { percent: 100, code: "ticks_100" },
];

function memoryDiagnostics() {
  return {
    wasmPages: session?.diagnostics().wasmPages ?? null,
    jsHeap: globalThis.performance?.memory ? { used: globalThis.performance.memory.usedJSHeapSize, total: globalThis.performance.memory.totalJSHeapSize } : null,
  };
}

function describeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
    code: error?.code || null,
    details: error?.details || null,
  };
}

function estimateDataBytes(data) {
  let bytes = 0;
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (value == null) continue;
    if (typeof value === 'string') { bytes += value.length * 2; continue; }
    if (typeof value === 'number') { bytes += 8; continue; }
    if (typeof value === 'boolean') { bytes += 4; continue; }
    if (ArrayBuffer.isView(value)) { bytes += value.byteLength; continue; }
    if (value instanceof ArrayBuffer) { bytes += value.byteLength; continue; }
    if (Array.isArray(value)) { for (const item of value) pending.push(item); continue; }
    if (typeof value === 'object') Object.entries(value).forEach(([key, item]) => { bytes += key.length * 2; pending.push(item); });
  }
  return bytes;
}

function beginPhase(phase) {
  currentPhase = phase;
  phaseStartedAt = performance.now();
}

const normalizeEvent = (event) => ({ ...event, timeSeconds: event.tick / 64 });

function toPlainObject(value) {
  return value instanceof Map ? Object.fromEntries(value) : value;
}

async function parsePartEvents(part) {
  const events = [];
  for await (const batch of session.readEvents({ partId: part.id })) events.push(...batch.map(event => normalizeEvent(eventToRuntime(event))));
  return events;
}

function grenadeWeaponName(type = '') {
  const normalized = String(type).toLowerCase();
  if (normalized.includes('smoke')) return 'smokegrenade';
  if (normalized.includes('flash')) return 'flashbang';
  if (normalized.includes('molotov') || normalized.includes('incendiary') || normalized.includes('incgrenade')) return 'molotov';
  if (normalized.includes('decoy')) return 'decoy';
  return 'hegrenade';
}

async function parsePartGrenades(part, recoverHeldGrenades) {
  const projectiles = [];
  const smokeVoxelFrames = [];
  const infernoFrames = [];
  const throwStates = new Map();
  if (session.capabilities.utilities?.supported) for await (const observation of session.readUtilities({ partId: part.id })) {
    if (observation.kind === 'projectile') projectiles.push(observation.frame);
    else if (observation.kind === 'smoke') smokeVoxelFrames.push(observation.frame);
    else if (observation.kind === 'fire') infernoFrames.push(observation.frame);
    else if (observation.kind === 'throw' && recoverHeldGrenades) throwStates.set(`${observation.tick}:${observation.steamid}:${grenadeWeaponName(observation.type)}`, observation.state);
  }
  return { projectiles, smokeVoxelFrames, infernoFrames, throwStates };
}

function inferProjectileThrows(projectiles, events, throwStates) {
  const byEntity = new Map();
  const fires = events.filter((event) => event.event_name === 'weapon_fire' && event.user_steamid && event.weapon);
  const usedFires = new Set();
  projectiles.forEach((projectile) => {
    if (!String(projectile.grenade_type || '').includes('Projectile')) return;
    const entityId = projectile.entity_id ?? projectile.grenade_entity_id;
    if (!byEntity.has(entityId)) byEntity.set(entityId, []);
    byEntity.get(entityId).push(projectile);
  });
  const throws = [];
  byEntity.forEach((unsorted) => {
    const records = [...unsorted].sort((left, right) => left.tick - right.tick);
    records.forEach((record, index) => {
      const previous = records[index - 1];
      if (!projectileStartsNewLifecycle(record, previous)) return;
      const weapon = grenadeWeaponName(record.grenade_type);
      const steamid = String(record.thrower_steamid ?? record.steamid ?? '');
      const fire = fires.findLast((event) => !usedFires.has(event) && String(event.user_steamid) === steamid && grenadeWeaponName(event.weapon) === weapon && event.tick <= record.tick && record.tick - event.tick <= 32);
      if (fire) usedFires.add(fire);
      const tick = fire?.tick ?? record.tick;
      const throwState = fire ? throwStates.get(`${fire.tick}:${steamid}:${weapon}`) : null;
      throws.push(normalizeEvent({
        event_name: 'grenade_thrown',
        tick,
        user_name: fire?.user_name ?? record.thrower_name ?? record.name ?? '',
        user_steamid: steamid,
        user_X: fire?.user_X,
        user_Y: fire?.user_Y,
        user_Z: fire?.user_Z,
        user_pitch: fire?.user_pitch,
        user_yaw: fire?.user_yaw,
        weapon,
        throw_strength: throwState?.strength ?? null,
        jump_throw: throwState?.jumpThrow ?? null,
        throw_time: throwState?.throwTime ?? null,
        initial_velocity: record.initial_velocity ?? null,
        inferred: true,
      }));
    });
  });
  return throws;
}

async function parseTicksBatched(part, profile, ticks, players = null, onBatch = null) {
  const rows = [];
  for await (const batch of session.readFrames({ partId: part.id, profile, ticks, players, batchSize: PARSE_TICK_BATCH_SIZE })) {
    rows.push(...batch); onBatch?.();
  }
  return rows;
}

async function findPartOffsets(parts) {
  const offsets = [0];
  partSkips = [-1];
  partEvents = await Promise.all(parts.map(parsePartEvents));
  let previousEvents = partEvents[0];
  for (let index = 1; index < parts.length; index += 1) {
    const currentEvents = partEvents[index];
    const currentStart = currentEvents.find((event) => event.event_name === 'round_start');
    const matchingStart = previousEvents.find((event) => event.event_name === 'round_start' && event.round === currentStart?.round);
    offsets.push(matchingStart && currentStart ? matchingStart.tick - currentStart.tick : (offsets[index - 1] + (previousEvents.at(-1)?.tick || 0)));
    const repeatedStart = currentEvents.find((event) => event.event_name === 'round_start' && event.round === currentStart?.round && event.tick > (currentStart?.tick || 0));
    partSkips.push(repeatedStart?.tick || 0);
    previousEvents = currentEvents;
  }
  return offsets;
}

const includesPartTick = (tick, index) => index === 0 ? tick >= 0 : tick > partSkips[index];

function fallbackInventoryWeapon(inventory) {
  const names = (inventory || []).map((item) => String(item || '')).filter(Boolean);
  const primary = names.find((name) => /ak-?47|m4a|galil|famas|aug|sg ?55|awp|ssg|scar|g3sg|mp9|mac-?10|mp7|mp5|ump|p90|bizon|nova|xm1014|mag-?7|sawed|m249|negev/i.test(name));
  const pistol = names.find((name) => /glock|usp|p2000|p250|deagle|five-?seven|tec-?9|cz75|revolver|dual|beretta/i.test(name));
  const melee = names.find((name) => /knife|bayonet|karambit|dagger/i.test(name));
  return primary || pistol || melee || names.find((name) => !/c4|explosive/i.test(name)) || '';
}

function indexEquippedWeapons(events) {
  const indexed = new Map();
  events.filter((event) => event.event_name === 'item_equip' && event.item).forEach((event) => {
    const keys = [event.user_steamid ? String(event.user_steamid) : '', event.user_name ? `name:${event.user_name}` : ''].filter(Boolean);
    keys.forEach((key) => {
      if (!indexed.has(key)) indexed.set(key, []);
      indexed.get(key).push(event);
    });
  });
  indexed.forEach((history) => history.sort((left, right) => left.tick - right.tick));
  return indexed;
}

function restoreEquippedWeapons(snapshots) {
  const cursors = new Map();
  snapshots.forEach((snapshot) => snapshot.players.forEach((player) => {
    const key = player.steamid ? String(player.steamid) : `name:${player.name}`;
    const history = equippedWeaponsByPlayer.get(key) || equippedWeaponsByPlayer.get(`name:${player.name}`) || [];
    let cursor = cursors.get(key) ?? -1;
    while (cursor + 1 < history.length && history[cursor + 1].tick <= snapshot.tick) cursor += 1;
    cursors.set(key, cursor);
    if (cursor >= 0 && (!player.activeWeapon || !player.alive)) player.activeWeapon = history[cursor].item;
    if (!player.activeWeapon && player.alive) player.activeWeapon = fallbackInventoryWeapon(player.inventory);
  }));
  return snapshots;
}

function normalizeRows(rows) {
  const snapshots = new Map();
  for (const { tick, player } of rows) {
    if (!snapshots.has(tick)) snapshots.set(tick, new Map());
    // Only the application boundary converts Source coordinates to renderer metres.
    // 渲染坐标不属于解析器；缺失位置仍以 hasPosition 标记，不能当作世界原点。
    const raw = player.raw;
    snapshots.get(tick).set(player.id || String(player.steamid || player.name), { ...player,
      position: { x: player.hasPosition ? raw.y * .0254 : 0, y: player.hasPosition ? raw.z * .0254 : 0, z: player.hasPosition ? raw.x * .0254 : 0 },
    });
  }
  return restoreEquippedWeapons([...snapshots.entries()].map(([tick, players]) => ({ tick, timeSeconds: tick / 64, players: [...players.values()] })));
}

return async (data) => {
  try {
      if (data.type === 'dispose') { await session?.dispose(); session = null; demoParts = []; return; }
      if (data.type === 'source') {
        beginPhase('source');
        demoParts = await openSources(data);
        partOffsets = await findPartOffsets(demoParts);
        demoBytes = demoParts[0];
        postMessage({ type: 'sourceReady' });
      }
      if (data.type === 'load') {
      beginPhase('parser');
      postMessage({ type: 'progress', phase: 'load', completed: 0, total: 1, percent: 0 });
      postMessage({ type: 'status', code: 'parser_loading' });
       demoParts = await openSources(data);
       partOffsets = await findPartOffsets(demoParts);
       demoBytes = demoParts[0];
       const magic = null; // Native/opaque sources do not expose raw header bytes here.
       const infoOffset = null; // Source validation belongs to the parser driver/adapter.
       postMessage({ type: 'diagnostic', phase: 'input', data: { bytes: demoParts.reduce((sum, part) => sum + part.byteLength, 0), parts: demoParts.length, magic, infoOffset, sourceFormat: session.info.sourceFormat || 'unknown', validatedBy: session.info.id, partOffsets, memory: memoryDiagnostics() } });
       postMessage({ type: 'status', code: 'header_reading' });
       beginPhase('header');
       const headers = await Promise.all(demoParts.map(async part => toPlainObject(await parseHeader(part))));
       const header = headers[0];
       const recording = data.kind === RECORDING_KIND;
       if (recording) {
         // Recording parts are independent clips; round overlap heuristics do
         // not apply. Keep the original tick coordinates within each clip.
         // 录制分片不依赖回合重叠，保留片段内部 tick 坐标。
         partOffsets = headers.map((part, index) => index === 0 ? 0 : headers.slice(0, index).reduce((sum, h) => sum + Number(h.lastTick) + 1, 0));
         partSkips = headers.map(() => -1);
       }
       const matchRounds = buildRounds(partEvents.flatMap((events, index) => events.map(event => ({ ...event, tick: event.tick + partOffsets[index] }))));
       const incompatibility = recording ? null : matchCompatibility(header, matchRounds);
       if (incompatibility) throw Object.assign(new Error('Non-standard match Demo; continue parsing as a custom DEMO.'), { code: NON_STANDARD_DEMO, reason: incompatibility });
       postMessage({ type: 'diagnostic', phase: 'header', data: { elapsedMs: performance.now() - phaseStartedAt, memory: memoryDiagnostics() } });
        postMessage({ type: 'status', code: 'rounds_reading' });
        beginPhase('events');
          postMessage({ type: 'status', code: 'utilities_reading' });
            const grenadeDataByPart = await Promise.all(demoParts.map((part, index) => parsePartGrenades(part, !partEvents[index].some((event) => event.event_name === 'grenade_thrown'))));
            const projectilesByPart = grenadeDataByPart.map((data) => data.projectiles);
            partEvents = partEvents.map((events, index) => events.some((event) => event.event_name === 'grenade_thrown') ? events : [...events, ...inferProjectileThrows(projectilesByPart[index], events, grenadeDataByPart[index].throwStates)].sort((left, right) => left.tick - right.tick));
            allEvents = partEvents.flatMap((events, index) => events.filter((event) => includesPartTick(event.tick, index)).map((event) => ({ ...event, tick: event.tick + partOffsets[index], timeSeconds: (event.tick + partOffsets[index]) / 64 }))).sort((left, right) => left.tick - right.tick);
            equippedWeaponsByPlayer = indexEquippedWeapons(allEvents);
            allProjectiles = projectilesByPart.flatMap((projectiles, index) => projectiles.filter((projectile) => includesPartTick(projectile.tick, index)).map((projectile) => ({ ...projectile, tick: projectile.tick + partOffsets[index] })));
            allSmokeVoxelFrames = grenadeDataByPart.flatMap((data, index) => data.smokeVoxelFrames.filter((frame) => includesPartTick(frame.tick, index)).map((frame) => ({ ...frame, tick: frame.tick + partOffsets[index] })));
            allInfernoFrames = grenadeDataByPart.flatMap((data, index) => data.infernoFrames.filter((frame) => includesPartTick(frame.tick, index)).map((frame) => ({ ...frame, tick: frame.tick + partOffsets[index] })));
        const sampleRate = [1, 2, 4, 8, 16, 32].includes(Number(data.sampleRate)) ? Number(data.sampleRate) : 8;
       const sampleStep = 64 / sampleRate;
       const maxTick = Math.max(allEvents.at(-1)?.tick || 0, ...headers.map((header, index) => (Number(header.lastTick) || 0) + partOffsets[index]));
       const rounds = recording ? recordingSegments(headers, partOffsets) : buildRounds(allEvents);
       const voiceParts = parseVoice ? await Promise.all(demoParts.map(part => parseVoice(part))) : [];
       allVoiceFrames = voiceParts.flatMap((voice, index) => (voice?.frames || []).filter(frame => includesPartTick(frame.tick, index)).map(frame => ({ ...frame, tick: frame.tick + partOffsets[index] }))).sort((a, b) => a.tick - b.tick);
       const voiceSummary = { frames: allVoiceFrames.length, skipped: voiceParts.reduce((sum, voice) => sum + (voice?.summary?.skipped || 0), 0), limited: voiceParts.some(voice => voice?.summary?.limited) };
         beginPhase('ticks');
         postMessage({ type: 'status', code: 'positions_reading', values: { count: rounds.length } });
             const throwPlans = demoParts.map((part, index) => {
             const offset = partOffsets[index];
              const localThrows = partEvents[index].filter((event) => event.event_name === 'grenade_thrown' && includesPartTick(event.tick, index));
             const localTicks = [...new Set(localThrows.flatMap((event) => Array.from({ length: 129 }, (_, tickIndex) => Math.max(0, event.tick - 128 + tickIndex))))].sort((left, right) => left - right);
             const throwers = [...new Set(localThrows.map((event) => String(event.user_steamid)).filter(Boolean))];
              const throws = localThrows.map(event => ({ tick: event.tick, steamid: String(event.user_steamid || ''), name: event.user_name || '',
                startTick: Math.max(0, (rounds.find(round => event.tick + offset >= round.startTick && event.tick + offset <= round.endTick)?.startTick ?? offset) - offset),
              }));
              return { part, index, offset, localTicks, throwers, throws };
           });
            const roundTickPlans = rounds.map((round) => {
              const ticks = [];
              for (let tick = round.freezeStartTick ?? round.startTick; tick <= round.endTick; tick += sampleStep) ticks.push(tick);
              if (!ticks.includes(round.startTick)) ticks.push(round.startTick);
              if (ticks.at(-1) !== round.endTick) ticks.push(round.endTick);
              ticks.sort((a, b) => a - b);
              return demoParts.map((part, index) => {
                const offset = partOffsets[index];
                const localTicks = ticks.filter((tick) => tick >= offset && tick - offset <= (Number(headers[index].lastTick) || 1000000)).map((tick) => tick - offset);
                 return { part, index, offset, localTicks };
              });
            });
            const analysisGlobalTicks = recording ? [] : [...new Set(rounds.flatMap(round => {
              const ticks = [];
              for (let tick = round.startTick; tick <= round.endTick; tick += 32) ticks.push(tick);
              return ticks;
            }))];
            if (session.prepareFrames) {
              const profiles = [replayProfile, preparationProfile, analysisProfile];
              await Promise.all(demoParts.map(async (part, index) => {
                const offset = partOffsets[index];
                const ticks = [...new Set([
                  ...roundTickPlans.flatMap(plans => plans[index].localTicks),
                  ...throwPlans[index].localTicks,
                  ...partEvents[index].filter(event => event.event_name === 'weapon_fire').map(event => event.tick),
                  ...analysisGlobalTicks.filter(tick => tick >= offset && tick - offset <= (Number(headers[index].lastTick) || 1000000)).map(tick => tick - offset),
                ])].sort((left, right) => left - right);
                const prepared = await session.prepareFrames({ partId: part.id, profiles, ticks, throws: throwPlans[index].throws });
                throwPlans[index].localTicks = [...new Set([...throwPlans[index].localTicks, ...(prepared?.preparationTicks || [])])].sort((a, b) => a - b);
              }));
            }
            const totalBatches = roundTickPlans.flat().reduce((sum, plan) => sum + Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE), 0) + throwPlans.reduce((sum, plan) => sum + (plan.throwers.length ? Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE) : 0), 0) + 1;
           let completedBatches = 0;
           let progressStageIndex = -1;
           const reportProgress = () => {
             completedBatches += 1;
             // The full position pass is the expensive stage; cached projections then
             // consume the remaining range. 阶段权重保持连续，不是虚构的计时进度。
             const base = session.prepareFrames ? 85 : 0;
             const percent = totalBatches ? base + completedBatches / totalBatches * (100 - base) : 100;
             const stageIndex = parseProgressStages.findLastIndex((stage) => percent >= stage.percent);
             const stage = parseProgressStages[Math.max(0, stageIndex)];
             postMessage({ type: 'progress', phase: 'ticks', completed: completedBatches, total: totalBatches, percent, stage: stageIndex !== progressStageIndex ? stage : null });
             progressStageIndex = stageIndex;
           };
             const throwRows = (await Promise.all(throwPlans.map(async ({ part, index, offset, localTicks, throwers }) => localTicks.length && throwers.length ? (await parseTicksBatched(part, preparationProfile, localTicks, throwers, reportProgress)).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset })) : []))).flat();
            const throwSnapshots = normalizeRows(throwRows, 0);
            const playerNameSet = new Set();
            const playerPositionCoverage = new Map();
            const roundData = [];
            let snapshotCount = 0;
            let estimatedBytes = throwSnapshots.length * 240 + allEvents.length * 256 + allProjectiles.length * 128 + estimateDataBytes(allSmokeVoxelFrames) + estimateDataBytes(allInfernoFrames) + estimateDataBytes(allVoiceFrames);
             for (const [roundIndex, round] of rounds.entries()) {
                const rows = (await Promise.all(roundTickPlans[roundIndex].map(async ({ part, index, offset, localTicks }) => localTicks.length ? (await parseTicksBatched(part, replayProfile, localTicks, null, reportProgress)).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset })) : []))).flat();
              const snapshots = normalizeRows(rows, 0);
              snapshots.forEach((snapshot) => snapshot.players.forEach((player) => {
                if (player.name) playerNameSet.add(player.name);
                if (snapshot.tick < round.startTick || !player.name || ![2, 3].includes(player.team)) return;
                const key = String(player.steamid || player.name);
                const coverage = playerPositionCoverage.get(key) || { name: player.name, steamid: player.steamid || '', samples: 0, positionedSamples: 0 };
                coverage.samples += 1;
                if (player.hasPosition) coverage.positionedSamples += 1;
                playerPositionCoverage.set(key, coverage);
              }));
              snapshotCount += snapshots.length;
              estimatedBytes += estimateDataBytes(snapshots);
              const dataForRound = { round: round.round, voiceFrames: allVoiceFrames.filter(frame => frame.tick < round.endTick && frame.tick + frame.duration * 64 >= (round.freezeStartTick ?? round.startTick)), snapshots, throwSnapshots: throwSnapshots.filter((snapshot) => snapshot.tick >= (round.freezeStartTick ?? round.startTick) && snapshot.tick <= round.endTick), projectiles: allProjectiles.filter((projectile) => projectile.tick >= (round.freezeStartTick ?? round.startTick) && projectile.tick <= round.endTick), smokeVoxelFrames: allSmokeVoxelFrames.filter((frame) => frame.tick >= (round.freezeStartTick ?? round.startTick) && frame.tick <= round.endTick), infernoFrames: allInfernoFrames.filter((frame) => frame.tick >= (round.freezeStartTick ?? round.startTick) && frame.tick <= round.endTick) };
              const representative = snapshots.find((snapshot) => snapshot.tick >= round.startTick && snapshot.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || snapshots.find(snapshot => snapshot.tick >= round.startTick) || snapshots[0];
               roundData.push({ round: round.round, snapshots: representative ? [representative] : [] });
               await postMessage({ type: 'round', data: dataForRound });
             }
            reportProgress();
            if (recording && snapshotCount === 0) throw new Error('Recording contains no readable player samples');
            const playerNames = [...playerNameSet].sort();
             const analysisRows = recording ? [] : (await Promise.all(demoParts.map(async (part, index) => {
              const offset = partOffsets[index];
              const localTicks = [...new Set(analysisGlobalTicks)].filter((tick) => tick >= offset && tick - offset <= (Number(headers[index].lastTick) || 1000000)).map((tick) => tick - offset);
              if (localTicks.length === 0) return [];
               return (await parseTicksBatched(part, analysisProfile, localTicks)).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset }));
            }))).flat();
            await session.releasePreparedFrames?.();
            const analysis = normalizeRows(analysisRows, 0);
             // Report only players with no usable position in any gameplay sample; brief spawn/disconnect gaps are normal.
             const missingPositionPlayers = [...playerPositionCoverage.values()]
               .filter((player) => player.samples > 0 && player.positionedSamples === 0)
               .map(({ name, steamid }) => ({ name, steamid }));
             const warnings = missingPositionPlayers.length ? [{ type: 'missing-player-position', players: missingPositionPlayers }] : [];
             postMessage({ type: 'diagnostic', phase: 'ticks', data: { elapsedMs: performance.now() - phaseStartedAt, throwSnapshots: throwSnapshots.length, snapshots: snapshotCount, analysis: analysis.length, memory: memoryDiagnostics() } });
            postMessage({ type: 'status', code: 'rounds_ready', values: { count: rounds.length } });
            const observedCounts = { replay: snapshotCount, inputs: throwSnapshots.filter(snapshot => snapshot.players.some(player => player.inputAvailable)).length,
              projectiles: allProjectiles.length, smokeVoxels: allSmokeVoxelFrames.length, fireAreas: allInfernoFrames.length, voice: allVoiceFrames.length };
            const formatCapabilities = Object.fromEntries(Object.entries(observedCounts).map(([key, count]) => {
              const supported = session.capabilities[key === 'replay' ? 'frames' : key]?.supported;
              return [key, count ? { status: 'available' } : supported === false ? { status: 'unavailable', reason: session.capabilities[key]?.reason || 'parser-does-not-support' }
                : supported !== true ? { status: 'unknown', reason: 'parser-does-not-declare' }
                : key === 'inputs' || key === 'voice' && voiceSummary.skipped > 0 ? { status: 'unknown', reason: 'no-readable-records' } : { status: 'empty' }];
            }));
            allProjectiles = [];
            allSmokeVoxelFrames = [];
            allInfernoFrames = [];
            allVoiceFrames = [];
             const result = { cacheSchemaVersion: CACHE_SCHEMA_VERSION, demo: { parserId: parserInfo.id, parser: session.info, formatCapabilities, kind: recording ? RECORDING_KIND : 'match', fileName: data.fileName, bytes: demoParts.reduce((sum, part) => sum + part.byteLength, 0), map: header.mapName, patch: header.patch, guid: header.versionGuid || '', version: header.versionName || '', demoFileStamp: header.fileStamp || '', voice: voiceSummary, serverName: header.serverName || '', clientName: header.clientName || '', tickRate: 64, sampleRate, maxTick, durationSeconds: maxTick / 64, header: header.producerFields }, summary: { rounds: rounds.length, kills: allEvents.filter((event) => event.event_name === 'player_death').length, damageEvents: allEvents.filter((event) => event.event_name === 'player_hurt').length, shots: allEvents.filter((event) => event.event_name === 'fire_bullets').length, players: playerNames }, warnings, rounds, roundData, events: allEvents, players: playerNames, analysisRows: analysis, analysisBytes: estimateDataBytes(analysis) };
             await postMessage({ type: 'loaded', data: result, estimatedBytes });
     }
     if (data.type === 'analysis') {
       if (!demoParts.length) return;
       beginPhase('analysis');
       postMessage({ type: 'status', code: 'analysis_reading' });
       const step = 32;
       const globalTicks = [];
       data.rounds.forEach((round) => { for (let tick = round.startTick; tick <= round.endTick; tick += step) globalTicks.push(tick); });
       const rows = (await Promise.all(demoParts.map(async (part, index) => {
         const offset = partOffsets[index];
         const localTicks = [...new Set(globalTicks)].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
         if (localTicks.length === 0) return [];
              return (await parseTicksBatched(part, analysisProfile, localTicks)).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset }));
       }))).flat();
        const normalized = normalizeRows(rows, 0);
        postMessage({ type: 'analysis', rows: normalized, estimatedBytes: estimateDataBytes(normalized) });
       postMessage({ type: 'status', code: 'analysis_ready' });
     }
  } catch (error) {
    const failureMemory = memoryDiagnostics();
    await session?.dispose().catch(() => {}); session = null;
    await postMessage({ type: 'error', code: error.code, reason: error.reason, message: `${currentPhase}: ${error?.message || String(error)}`, diagnostic: { phase: currentPhase, elapsedMs: phaseStartedAt ? performance.now() - phaseStartedAt : null, error: describeError(error), memory: failureMemory, bytes: demoBytes?.byteLength || null } });
  }
};

}
