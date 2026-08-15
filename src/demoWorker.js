import init, { parseEvents, parseGrenades, parseHeader, parseTicks } from './wasm/demoparser2.js';

let parserReady;
let wasmInstance;
let demoBytes;
let demoParts = [];
let partOffsets = [];
let partSkips = [];
let partEvents = [];
let allEvents = [];
let allProjectiles = [];
let currentPhase = 'idle';
let phaseStartedAt = 0;
const CACHE_SCHEMA_VERSION = 15;
const eventNames = ['round_start', 'round_freeze_end', 'round_end', 'player_death', 'player_hurt', 'player_blind', 'weapon_fire', 'weapon_reload', 'fire_bullets', 'item_pickup', 'item_purchase', 'hltv_fixed', 'hltv_chase', 'grenade_thrown', 'smokegrenade_detonate', 'smokegrenade_expired', 'inferno_startburn', 'inferno_expire', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate', 'bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused'];
const replayProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'user_id', 'team_rounds_total', 'active_weapon_name', 'inventory', 'armor_value', 'has_helmet', 'has_defuser', 'flash_duration', 'flash_max_alpha', 'is_scoped', 'is_walking', 'active_weapon_ammo', 'is_alive', 'is_defusing', 'balance', 'cash_spent_this_round', 'round_start_equip_value', 'current_equip_value'];
const analysisProps = ['X', 'Y', 'Z', 'health', 'team_num', 'yaw', 'is_alive'];
const throwProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'is_airborne', 'FIRE', 'RIGHTCLICK', 'FORWARD', 'BACK', 'LEFT', 'RIGHT', 'WALK', 'active_weapon_name', 'has_defuser', 'last_place_name'];
const PARSE_TICK_BATCH_SIZE = 32768;
const parseProgressStages = [
  { percent: 0, zh: '正在展开 Demo 时间轴并校准起始 tick…', en: 'Expanding the demo timeline and calibrating its first tick...' },
  { percent: 3, zh: '正在合并分段录像的重叠回合…', en: 'Merging overlapping rounds from segmented recordings...' },
  { percent: 6, zh: '正在按设定精度建立主回放采样索引…', en: 'Building the main replay index at the selected sampling rate...' },
  { percent: 9, zh: '正在辨认玩家实体与 Steam 身份…', en: 'Resolving player entities and Steam identities...' },
  { percent: 12, zh: '正在对齐 T 与 CT 的阵营变化…', en: 'Aligning T and CT side changes...' },
  { percent: 15, zh: '正在还原玩家出生与存活区间…', en: 'Restoring player spawns and alive intervals...' },
  { percent: 18, zh: '正在解码地图坐标与高度数据…', en: 'Decoding map coordinates and elevation data...' },
  { percent: 21, zh: '正在连接移动采样点并修正跨帧位移…', en: 'Connecting movement samples and correcting cross-frame displacement...' },
  { percent: 24, zh: '正在同步站立、下蹲与腾空姿态…', en: 'Synchronizing standing, crouching, and airborne poses...' },
  { percent: 27, zh: '正在还原水平转向与俯仰角度…', en: 'Restoring horizontal aim and vertical pitch...' },
  { percent: 30, zh: '正在识别行走、奔跑与急停片段…', en: 'Identifying walking, running, and counter-strafe segments...' },
  { percent: 33, zh: '正在对齐开镜状态与视野变化…', en: 'Aligning scoped states and field-of-view changes...' },
  { percent: 36, zh: '正在装配主武器、副武器与近战状态…', en: 'Assembling primary, secondary, and melee weapon states...' },
  { percent: 39, zh: '正在同步弹匣余量与射击计数…', en: 'Synchronizing magazine counts and fired-shot totals...' },
  { percent: 42, zh: '正在整理护甲、头盔与拆弹器状态…', en: 'Organizing armor, helmet, and defuse-kit states...' },
  { percent: 45, zh: '正在追踪 C4 携带、掉落与拾取…', en: 'Tracking C4 possession, drops, and pickups...' },
  { percent: 48, zh: '正在核对余额、购买与装备价值…', en: 'Reconciling balances, purchases, and equipment values...' },
  { percent: 51, zh: '正在对齐开火事件与枪口反馈…', en: 'Aligning weapon-fire events with muzzle feedback...' },
  { percent: 54, zh: '正在匹配伤害来源与受击时间点…', en: 'Matching damage sources with impact timings...' },
  { percent: 57, zh: '正在复原击杀、助攻与爆头记录…', en: 'Restoring kills, assists, and headshot records...' },
  { percent: 60, zh: '正在核验穿烟、穿墙与盲视击杀…', en: 'Verifying smoke, penetration, and blind kill conditions...' },
  { percent: 63, zh: '正在计算闪光强度与致盲衰减…', en: 'Calculating flash intensity and blindness decay...' },
  { percent: 66, zh: '正在拼接烟雾生效与消散区间…', en: 'Joining smoke activation and expiration intervals...' },
  { percent: 69, zh: '正在整理燃烧区域与爆炸事件…', en: 'Organizing fire zones and explosion events...' },
  { percent: 72, zh: '正在关联道具投掷者与实体轨迹…', en: 'Associating utility throwers with projectile entities...' },
  { percent: 75, zh: '正在补齐投掷前两秒的逐 tick 动作…', en: 'Filling two seconds of per-tick pre-throw actions...' },
  { percent: 78, zh: '正在识别跳投、跑投与静止投掷…', en: 'Classifying jump throws, running throws, and standing throws...' },
  { percent: 81, zh: '正在重建道具飞行、反弹与落点…', en: 'Reconstructing utility flight, bounces, and landing points...' },
  { percent: 84, zh: '正在校准下包、拆包与爆炸计时…', en: 'Calibrating plant, defuse, and explosion timings...' },
  { percent: 87, zh: '正在读取 HLTV 导播镜头与目标…', en: 'Reading HLTV camera cues and targets...' },
  { percent: 90, zh: '正在判定冻结时间、回合开始与结束…', en: 'Determining freeze time, round starts, and round endings...' },
  { percent: 93, zh: '正在切分常规回合、换边与加时…', en: 'Splitting regulation rounds, side switches, and overtime...' },
  { percent: 96, zh: '正在压实连续快照并生成回合索引…', en: 'Compacting continuous snapshots and generating round indexes...' },
  { percent: 98, zh: '正在统计数据体积并准备本地缓存…', en: 'Measuring data size and preparing the local cache...' },
  { percent: 100, zh: '所有回放数据已核对完成，正在载入第一回合…', en: 'All replay data verified, loading the first round...' },
];

function memoryDiagnostics() {
  const memory = wasmInstance?.memory;
  return {
    wasmPages: memory?.buffer?.byteLength ? memory.buffer.byteLength / 65536 : null,
    jsHeap: self.performance?.memory ? { used: self.performance.memory.usedJSHeapSize, total: self.performance.memory.totalJSHeapSize } : null,
  };
}

function describeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
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
    if (Array.isArray(value)) { pending.push(...value); continue; }
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

function parsePartEvents(part) {
  const parsed = parseEvents(part, eventNames, ['X', 'Y', 'Z', 'team_num']);
  return Object.values(parsed || {}).map(toPlainObject).map(normalizeEvent);
}

function parseTicksBatched(part, props, ticks, players = null, onBatch = null) {
  const rows = [];
  for (let start = 0; start < ticks.length; start += PARSE_TICK_BATCH_SIZE) {
    const batch = new Int32Array(ticks.slice(start, start + PARSE_TICK_BATCH_SIZE));
    const batchRows = parseTicks(part, props, batch, players, false);
    for (const row of batchRows) rows.push(toPlainObject(row));
    onBatch?.();
  }
  return rows;
}

function findPartOffsets(parts) {
  const offsets = [0];
  partSkips = [0];
  partEvents = parts.map(parsePartEvents);
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

function buildRounds(events) {
  const starts = events.filter((event) => event.event_name === 'round_start');
  const ends = events.filter((event) => event.event_name === 'round_end');
  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const playableStart = events.find((event) => event.event_name === 'round_freeze_end' && event.tick > start.tick && (!nextStart || event.tick < nextStart.tick));
    const startTick = playableStart?.tick ?? start.tick;
    const end = ends.find((candidate) => candidate.tick > startTick && (!nextStart || candidate.tick < nextStart.tick));
    const bufferedEnd = end ? end.tick + 192 : startTick;
    return { round: start.round ?? index + 1, freezeStartTick: start.tick, startTick, endTick: nextStart ? Math.min(bufferedEnd, nextStart.tick - 1) : bufferedEnd, winner: end?.winner ?? null, reason: end?.reason ?? null, timeSeconds: startTick / 64 };
  });
}

function normalizeRows(rows, round) {
  const snapshots = new Map();
  rows.forEach((row) => {
    row = toPlainObject(row);
    if (!snapshots.has(row.tick)) snapshots.set(row.tick, []);
    const inventory = Array.isArray(row.inventory) ? row.inventory.map((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item)).filter(Boolean) : [];
    snapshots.get(row.tick).push({
      name: row.name, steamid: row.steamid, userId: row.user_id ?? null,
      team: row.team_num, side: row.team_num === 2 ? 'T' : 'CT', health: row.health, armor: row.armor_value ?? 0,
      hasHelmet: Boolean(row.has_helmet), hasDefuser: Boolean(row.has_defuser), pitch: row.pitch ?? 0, yaw: row.yaw ?? 0,
      duckAmount: row.duck_amount ?? 0, isAirborne: Boolean(row.is_airborne), movement: ['FORWARD', 'BACK', 'LEFT', 'RIGHT'].filter((key) => Boolean(row[key])),
      walking: Boolean(row.WALK || row.is_walking), fire: Boolean(row.FIRE), secondaryFire: Boolean(row.RIGHTCLICK),
      flashDuration: row.flash_duration ?? 0, flashMaxAlpha: row.flash_max_alpha ?? 0, scoped: Boolean(row.is_scoped),
      placeName: row.last_place_name || '', activeWeaponAmmo: row.active_weapon_ammo ?? null, alive: row.is_alive ?? Number(row.health) > 0,
      defusing: Boolean(row.is_defusing), balance: row.balance ?? null,
      cashSpentThisRound: row.cash_spent_this_round ?? null, roundStartEquipValue: row.round_start_equip_value ?? null, currentEquipValue: row.current_equip_value ?? null,
      score: row.team_rounds_total ?? 0,
      activeWeapon: row.active_weapon_name || '', inventory,
      hasC4: inventory.some((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item).toLowerCase().includes('c4')),
      raw: { x: row.X, y: row.Y, z: row.Z }, position: { x: row.Y * 0.0254, y: row.Z * 0.0254, z: row.X * 0.0254 },
    });
  });
  return [...snapshots.entries()].map(([tick, players]) => ({ tick, timeSeconds: tick / 64, players }));
}

self.onmessage = async ({ data }) => {
  try {
      if (data.type === 'source') {
        beginPhase('source');
        parserReady ||= init();
        wasmInstance ||= await parserReady;
        demoParts = (data.buffers || []).map((buffer) => new Uint8Array(buffer));
        partOffsets = findPartOffsets(demoParts);
        demoBytes = demoParts[0];
        self.postMessage({ type: 'sourceReady' });
      }
      if (data.type === 'load') {
      beginPhase('wasm');
      self.postMessage({ type: 'progress', phase: 'load', completed: 0, total: 1, percent: 0 });
      self.postMessage({ type: 'status', message: '正在加载 Demo 解析器…' });
      parserReady ||= init();
      wasmInstance ||= await parserReady;
       demoParts = (data.buffers || [data.buffer]).map((buffer) => new Uint8Array(buffer));
       partOffsets = findPartOffsets(demoParts);
       demoBytes = demoParts[0];
       const magic = new TextDecoder().decode(demoBytes.subarray(0, 8));
      const expectedLength = demoBytes.byteLength >= 12 ? new DataView(demoBytes.buffer, demoBytes.byteOffset, demoBytes.byteLength).getUint32(8, true) + 18 : null;
      if (magic !== 'PBDEMS2\0') throw new Error(`invalid demo magic: ${JSON.stringify(magic)}`);
       if (expectedLength !== demoBytes.byteLength) throw new Error(`demo length mismatch: expected ${expectedLength}, got ${demoBytes.byteLength}`);
       self.postMessage({ type: 'diagnostic', phase: 'input', data: { bytes: demoParts.reduce((sum, part) => sum + part.byteLength, 0), parts: demoParts.length, magic, expectedLength, partOffsets, memory: memoryDiagnostics() } });
       self.postMessage({ type: 'status', message: '正在读取 Demo Header…' });
       beginPhase('header');
       const header = toPlainObject(parseHeader(demoBytes));
       self.postMessage({ type: 'diagnostic', phase: 'header', data: { elapsedMs: performance.now() - phaseStartedAt, memory: memoryDiagnostics() } });
        self.postMessage({ type: 'status', message: '正在读取回合事件…' });
        beginPhase('events');
         allEvents = partEvents.flatMap((events, index) => events.filter((event) => event.tick > partSkips[index]).map((event) => ({ ...event, tick: event.tick + partOffsets[index], timeSeconds: (event.tick + partOffsets[index]) / 64 }))).sort((left, right) => left.tick - right.tick);
         self.postMessage({ type: 'status', message: '正在读取道具与投掷物轨迹…' });
          allProjectiles = demoParts.flatMap((part, index) => (parseGrenades(part) || []).map(toPlainObject).filter((projectile) => projectile.x != null && projectile.y != null && projectile.z != null && projectile.tick > partSkips[index]).map((projectile) => ({ ...projectile, entity_id: projectile.entity_id ?? projectile.grenade_entity_id, thrower_steamid: String(projectile.thrower_steamid ?? projectile.steamid ?? ''), thrower_name: projectile.thrower_name ?? projectile.name ?? '', tick: projectile.tick + partOffsets[index] })));
       const sampleRate = [1, 2, 4, 8, 16, 32, 64].includes(Number(data.sampleRate)) ? Number(data.sampleRate) : 8;
       const sampleStep = 64 / sampleRate;
       const maxTick = allEvents.at(-1)?.tick || 0;
       const rounds = buildRounds(allEvents);
         beginPhase('ticks');
         self.postMessage({ type: 'status', message: `正在一次性解析 ${rounds.length} 个回合位置…` });
           const throwPlans = demoParts.map((part, index) => {
             const offset = partOffsets[index];
             const localThrows = partEvents[index].filter((event) => event.event_name === 'grenade_thrown' && event.tick > partSkips[index]);
             const localTicks = [...new Set(localThrows.flatMap((event) => Array.from({ length: 129 }, (_, tickIndex) => Math.max(0, event.tick - 128 + tickIndex))))].sort((left, right) => left - right);
             const throwers = [...new Set(localThrows.map((event) => String(event.user_steamid)).filter(Boolean))];
             return { part, offset, localTicks, throwers };
           });
           const ticks = new Int32Array([...new Set(rounds.flatMap((round) => {
             const values = [];
             for (let tick = round.startTick; tick <= round.endTick; tick += sampleStep) values.push(tick);
             if (values.at(-1) !== round.endTick) values.push(round.endTick);
             return values;
           }))]);
           const tickPlans = demoParts.map((part, index) => {
             const offset = partOffsets[index];
             const localTicks = [...ticks].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
             return { part, offset, localTicks };
           });
           const totalBatches = tickPlans.reduce((sum, plan) => sum + Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE), 0) + throwPlans.reduce((sum, plan) => sum + (plan.throwers.length ? Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE) : 0), 0) + 1;
           let completedBatches = 0;
           let progressStageIndex = -1;
           const reportProgress = () => {
             completedBatches += 1;
             const percent = totalBatches ? completedBatches / totalBatches * 100 : 100;
             const stageIndex = parseProgressStages.findLastIndex((stage) => percent >= stage.percent);
             const stage = parseProgressStages[Math.max(0, stageIndex)];
             self.postMessage({ type: 'progress', phase: 'ticks', completed: completedBatches, total: totalBatches, percent, stage: stageIndex !== progressStageIndex ? stage : null });
             progressStageIndex = stageIndex;
           };
           const rows = tickPlans.flatMap(({ part, offset, localTicks }) => localTicks.length ? parseTicksBatched(part, replayProps, localTicks, null, reportProgress).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset })) : []);
           const throwRows = throwPlans.flatMap(({ part, offset, localTicks, throwers }) => localTicks.length && throwers.length ? parseTicksBatched(part, throwProps, localTicks, throwers, reportProgress).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset })) : []);
           reportProgress();
           const snapshots = normalizeRows(rows, 0);
           const throwSnapshots = normalizeRows(throwRows, 0);
           const playerNames = [...new Set(snapshots.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))].sort();
            const roundData = rounds.map((round) => ({ round: round.round, snapshots: snapshots.filter((snapshot) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick), throwSnapshots: throwSnapshots.filter((snapshot) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick), projectiles: allProjectiles.filter((projectile) => projectile.tick >= round.startTick && projectile.tick <= round.endTick) }));
            const estimatedBytes = snapshots.length * 320 + throwSnapshots.length * 240 + allEvents.length * 256 + allProjectiles.length * 128;
            const analysisStep = 32;
            const analysisGlobalTicks = [];
            rounds.forEach((round) => { for (let tick = round.startTick; tick <= round.endTick; tick += analysisStep) analysisGlobalTicks.push(tick); });
            const analysisRows = demoParts.flatMap((part, index) => {
              const offset = partOffsets[index];
              const localTicks = [...new Set(analysisGlobalTicks)].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
              if (localTicks.length === 0) return [];
              return parseTicksBatched(part, analysisProps, localTicks).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset }));
            });
            const analysis = normalizeRows(analysisRows, 0);
            self.postMessage({ type: 'diagnostic', phase: 'ticks', data: { elapsedMs: performance.now() - phaseStartedAt, throwSnapshots: throwSnapshots.length, snapshots: snapshots.length, analysis: analysis.length, memory: memoryDiagnostics() } });
            self.postMessage({ type: 'status', message: `Demo 已读取，${rounds.length} 个回合已全部就绪` });
            allProjectiles = [];
            const result = { cacheSchemaVersion: CACHE_SCHEMA_VERSION, demo: { fileName: data.fileName, bytes: demoParts.reduce((sum, part) => sum + part.byteLength, 0), map: header.map_name, patch: header.patch_version, guid: header.demo_version_guid || '', version: header.demo_version_name || '', demoFileStamp: header.demo_file_stamp || '', serverName: header.server_name || '', clientName: header.client_name || '', tickRate: 64, sampleRate, maxTick, durationSeconds: maxTick / 64, header }, summary: { rounds: rounds.length, kills: allEvents.filter((event) => event.event_name === 'player_death').length, damageEvents: allEvents.filter((event) => event.event_name === 'player_hurt').length, shots: allEvents.filter((event) => event.event_name === 'fire_bullets').length, players: playerNames }, rounds, roundData, events: allEvents, players: playerNames, analysisRows: analysis, analysisBytes: estimateDataBytes(analysis) };
            self.postMessage({ type: 'loaded', data: result, estimatedBytes });
     }
     if (data.type === 'analysis') {
       if (!demoParts.length) return;
       beginPhase('analysis');
       self.postMessage({ type: 'status', message: '正在读取全场移动数据…' });
       const step = 32;
       const globalTicks = [];
       data.rounds.forEach((round) => { for (let tick = round.startTick; tick <= round.endTick; tick += step) globalTicks.push(tick); });
       const rows = demoParts.flatMap((part, index) => {
         const offset = partOffsets[index];
         const localTicks = [...new Set(globalTicks)].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
         if (localTicks.length === 0) return [];
             return parseTicksBatched(part, analysisProps, localTicks).map((plainRow) => ({ ...plainRow, tick: plainRow.tick + offset }));
       });
        const normalized = normalizeRows(rows, 0);
        self.postMessage({ type: 'analysis', rows: normalized, estimatedBytes: estimateDataBytes(normalized) });
       self.postMessage({ type: 'status', message: '全场移动数据已就绪' });
     }
  } catch (error) {
    self.postMessage({ type: 'error', message: `${currentPhase}: ${error?.message || String(error)}`, diagnostic: { phase: currentPhase, elapsedMs: phaseStartedAt ? performance.now() - phaseStartedAt : null, error: describeError(error), memory: memoryDiagnostics(), bytes: demoBytes?.byteLength || null } });
  }
};
