import init, { parseEvents, parseGrenades, parseHeader, parseTicks } from './wasm/demoparser2.js';
import { appendChangedInfernoFrame } from './demo/infernoFrames.js';
import { smokeVoxelFramesFromRow } from './demo/smokeVoxels.js';

let parserReady;
let wasmInstance;
let demoBytes;
let demoParts = [];
let partOffsets = [];
let partSkips = [];
let partEvents = [];
let allEvents = [];
let allProjectiles = [];
let allSmokeVoxelFrames = [];
let allInfernoFrames = [];
let activeWeaponNamesByPart = [];
let equippedWeaponsByPlayer = new Map();
let currentPhase = 'idle';
let phaseStartedAt = 0;
const CACHE_SCHEMA_VERSION = 30;
const ACTIVE_WEAPON_HANDLE_PROP = 'CCSPlayerPawn.CCSPlayer_WeaponServices.m_hActiveWeapon';
// Some GOTV demos retain the player controller but lose its pawn association.
// These controller fields keep the roster/state truthful even when coordinates cannot be recovered.
const CONTROLLER_TEAM_PROP = 'CCSPlayerController.m_iTeamNum';
const CONTROLLER_PENDING_TEAM_PROP = 'CCSPlayerController.m_iPendingTeamNum';
const CONTROLLER_HEALTH_PROP = 'CCSPlayerController.m_iPawnHealth';
const CONTROLLER_ALIVE_PROP = 'CCSPlayerController.m_bPawnIsAlive';
const controllerFallbackProps = [CONTROLLER_TEAM_PROP, CONTROLLER_PENDING_TEAM_PROP, CONTROLLER_HEALTH_PROP, CONTROLLER_ALIVE_PROP];
const GRENADE_ENTITY_PROPS = ['Grenade.m_flThrowStrength', 'Grenade.m_bJumpThrow', 'Grenade.m_fThrowTime', 'Grenade.m_vInitialVelocity', 'Grenade.m_vSmokeDetonationPos', 'Grenade.m_VoxelFrameData', 'Grenade.m_nVoxelFrameDataSize', 'Grenade.m_nVoxelUpdate', 'Grenade.m_firePositions', 'Grenade.m_bFireIsBurning', 'Grenade.m_BurnNormal', 'Grenade.m_fireCount', 'Grenade.m_nFireLifetime'];
const eventNames = ['round_start', 'round_freeze_end', 'round_end', 'player_death', 'player_hurt', 'player_blind', 'weapon_fire', 'weapon_reload', 'fire_bullets', 'item_equip', 'item_pickup', 'item_purchase', 'hltv_fixed', 'hltv_chase', 'grenade_thrown', 'smokegrenade_detonate', 'smokegrenade_expired', 'inferno_startburn', 'inferno_expire', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate', 'bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused'];
const replayProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'user_id', 'team_rounds_total', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'inventory', 'armor_value', 'has_helmet', 'has_defuser', 'flash_duration', 'flash_max_alpha', 'is_scoped', 'is_walking', 'active_weapon_ammo', 'is_alive', 'is_defusing', 'balance', 'cash_spent_this_round', 'round_start_equip_value', 'current_equip_value', ...controllerFallbackProps];
const analysisProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'is_alive', ...controllerFallbackProps];
const throwProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'is_airborne', 'is_walking', 'FIRE', 'RIGHTCLICK', 'FORWARD', 'BACK', 'LEFT', 'RIGHT', 'WALK', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'has_defuser', 'last_place_name', ...controllerFallbackProps];
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
  const parsed = parseEvents(part, eventNames, ['X', 'Y', 'Z', 'pitch', 'yaw', 'team_num']);
  return Object.values(parsed || {}).map(toPlainObject).map(normalizeEvent);
}

function grenadeWeaponName(type = '') {
  const normalized = String(type).toLowerCase();
  if (normalized.includes('smoke')) return 'smokegrenade';
  if (normalized.includes('flash')) return 'flashbang';
  if (normalized.includes('molotov') || normalized.includes('incendiary') || normalized.includes('incgrenade')) return 'molotov';
  if (normalized.includes('decoy')) return 'decoy';
  return 'hegrenade';
}

function parsePartGrenades(part, recoverHeldGrenades) {
  const projectiles = [];
  const smokeVoxelFrames = [];
  const infernoFrames = [];
  const latestInfernoByEntity = new Map();
  const throwStates = new Map();
  const lastProjectileByEntity = new Map();
  // CInferno is a non-projectile world entity. Always request this class; the
  // patched parser already collapses held weapons to changed throw-time rows.
  for (const value of parseGrenades(part, GRENADE_ENTITY_PROPS, true) || []) {
    const row = toPlainObject(value);
    const readProp = (name) => row[name] ?? row[`Grenade.${name}`];
    if (String(row.grenade_type || '').includes('Inferno')) {
      appendChangedInfernoFrame(infernoFrames, latestInfernoByEntity, row, readProp);
      continue;
    }
    if (String(row.grenade_type || '') === 'CSmokeGrenadeProjectile') {
      smokeVoxelFrames.push(...smokeVoxelFramesFromRow(row, readProp));
    }
    if (String(row.grenade_type || '').includes('Projectile')) {
      if (row.x != null && row.y != null && row.z != null) {
        const entityId = row.entity_id ?? row.grenade_entity_id;
        const previous = lastProjectileByEntity.get(entityId);
        const startsLifecycle = !previous || row.tick - previous.tick > 2 || row.grenade_type !== previous.grenade_type;
        const projectile = { ...row };
        GRENADE_ENTITY_PROPS.forEach((prop) => { delete projectile[prop]; delete projectile[prop.split('.').at(-1)]; });
        const initialVelocity = readProp('m_vInitialVelocity');
        projectiles.push({ ...projectile, entity_id: entityId, thrower_steamid: String(row.thrower_steamid ?? row.steamid ?? ''), thrower_name: row.thrower_name ?? row.name ?? '', ...(startsLifecycle && initialVelocity ? { initial_velocity: initialVelocity } : {}) });
        lastProjectileByEntity.set(entityId, row);
      }
      continue;
    }
    if (!recoverHeldGrenades || !(Number(readProp('m_fThrowTime')) > 0)) continue;
    const steamid = String(row.thrower_steamid ?? row.steamid ?? '');
    throwStates.set(`${row.tick}:${steamid}:${grenadeWeaponName(row.grenade_type)}`, { strength: readProp('m_flThrowStrength'), jumpThrow: readProp('m_bJumpThrow'), throwTime: readProp('m_fThrowTime') });
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
      if (previous && record.tick - previous.tick <= 2 && record.grenade_type === previous.grenade_type) return;
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

function buildActiveWeaponNames(part, events) {
  const fires = events.filter((event) => event.event_name === 'weapon_fire' && event.user_steamid && event.weapon);
  if (!fires.length) return new Map();
  const ticks = [...new Set(fires.map((event) => event.tick))].sort((left, right) => left - right);
  const players = [...new Set(fires.map((event) => String(event.user_steamid)))];
  const fireByPlayerTick = new Map(fires.map((event) => [`${event.tick}:${event.user_steamid}`, event]));
  const names = new Map();
  parseTicksBatched(part, [ACTIVE_WEAPON_HANDLE_PROP], ticks, players).forEach((row) => {
    const event = fireByPlayerTick.get(`${row.tick}:${row.steamid}`);
    const handle = row[ACTIVE_WEAPON_HANDLE_PROP];
    if (event && handle != null) names.set(String(handle), event.weapon);
  });
  return names;
}

function restoreActiveWeapon(row, names) {
  if (!row.active_weapon_name) row.active_weapon_name = names.get(String(row[ACTIVE_WEAPON_HANDLE_PROP])) || '';
  return row;
}

function findPartOffsets(parts) {
  const offsets = [0];
  partSkips = [-1];
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

const includesPartTick = (tick, index) => index === 0 ? tick >= 0 : tick > partSkips[index];

function buildRounds(events) {
  const starts = events.filter((event) => event.event_name === 'round_start');
  const ends = events.filter((event) => event.event_name === 'round_end');
  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const playableStart = events.find((event) => event.event_name === 'round_freeze_end' && event.tick > start.tick && (!nextStart || event.tick < nextStart.tick));
    const startTick = playableStart?.tick ?? start.tick;
    const end = ends.find((candidate) => candidate.tick > startTick && (!nextStart || candidate.tick < nextStart.tick));
    const bufferedEnd = end ? end.tick + 192 : startTick;
    return { sourceRound: start.round ?? null, freezeStartTick: start.tick, startTick, endTick: nextStart ? Math.min(bufferedEnd, nextStart.tick - 1) : bufferedEnd, winner: end?.winner ?? null, reason: end?.reason ?? null, timeSeconds: startTick / 64 };
  }).filter((round) => round.endTick > round.startTick).map((round, index) => ({ ...round, round: index + 1 }));
}

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

function normalizeRows(rows, round) {
  const snapshots = new Map();
  rows.forEach((row) => {
    row = toPlainObject(row);
    if (!snapshots.has(row.tick)) snapshots.set(row.tick, []);
    const inventory = Array.isArray(row.inventory) ? row.inventory.map((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item)).filter(Boolean) : [];
    const parsedTeam = Number(row.team_num ?? row[CONTROLLER_TEAM_PROP] ?? row[CONTROLLER_PENDING_TEAM_PROP]);
    const team = Number.isFinite(parsedTeam) ? parsedTeam : null;
    const parsedHealth = Number(row.health ?? row[CONTROLLER_HEALTH_PROP]);
    const health = Number.isFinite(parsedHealth) ? parsedHealth : null;
    const rawPosition = [row.X, row.Y, row.Z];
    const hasPosition = rawPosition.every((value) => value != null && value !== '' && Number.isFinite(Number(value)));
    const numericPosition = rawPosition.map(Number);
    // `is_alive` defaults to false when pawn lookup fails; only override it for that failure mode.
    const alive = hasPosition
      ? row.is_alive ?? row[CONTROLLER_ALIVE_PROP] ?? (health != null && health > 0)
      : row[CONTROLLER_ALIVE_PROP] ?? row.is_alive ?? (health != null && health > 0);
    snapshots.get(row.tick).push({
      name: row.name, steamid: row.steamid, userId: row.user_id ?? null,
      team, side: team === 2 ? 'T' : team === 3 ? 'CT' : '', health, armor: row.armor_value ?? 0,
      hasHelmet: Boolean(row.has_helmet), hasDefuser: Boolean(row.has_defuser), pitch: row.pitch ?? 0, yaw: row.yaw ?? 0,
      duckAmount: row.duck_amount ?? 0, isAirborne: Boolean(row.is_airborne), movement: ['FORWARD', 'BACK', 'LEFT', 'RIGHT'].filter((key) => Boolean(row[key])),
      walking: Boolean(row.WALK || row.is_walking), fire: Boolean(row.FIRE), secondaryFire: Boolean(row.RIGHTCLICK),
      flashDuration: row.flash_duration ?? 0, flashMaxAlpha: row.flash_max_alpha ?? 0, scoped: Boolean(row.is_scoped),
      placeName: row.last_place_name || '', activeWeaponAmmo: row.active_weapon_ammo ?? null, alive: Boolean(alive),
      defusing: Boolean(row.is_defusing), balance: row.balance ?? null,
      cashSpentThisRound: row.cash_spent_this_round ?? null, roundStartEquipValue: row.round_start_equip_value ?? null, currentEquipValue: row.current_equip_value ?? null,
      score: row.team_rounds_total ?? 0,
       activeWeapon: row.active_weapon_name || '', inventory,
      hasC4: inventory.some((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item).toLowerCase().includes('c4')),
      // Keep a stable position shape for consumers, but never render/analyse the zero fallback.
      hasPosition,
      raw: { x: hasPosition ? numericPosition[0] : null, y: hasPosition ? numericPosition[1] : null, z: hasPosition ? numericPosition[2] : null },
      position: { x: hasPosition ? numericPosition[1] * 0.0254 : 0, y: hasPosition ? numericPosition[2] * 0.0254 : 0, z: hasPosition ? numericPosition[0] * 0.0254 : 0 },
    });
  });
  return restoreEquippedWeapons([...snapshots.entries()].map(([tick, players]) => ({ tick, timeSeconds: tick / 64, players })));
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
          self.postMessage({ type: 'status', message: '正在读取道具与投掷物轨迹…' });
            const grenadeDataByPart = demoParts.map((part, index) => parsePartGrenades(part, !partEvents[index].some((event) => event.event_name === 'grenade_thrown')));
            const projectilesByPart = grenadeDataByPart.map((data) => data.projectiles);
            partEvents = partEvents.map((events, index) => events.some((event) => event.event_name === 'grenade_thrown') ? events : [...events, ...inferProjectileThrows(projectilesByPart[index], events, grenadeDataByPart[index].throwStates)].sort((left, right) => left.tick - right.tick));
            allEvents = partEvents.flatMap((events, index) => events.filter((event) => includesPartTick(event.tick, index)).map((event) => ({ ...event, tick: event.tick + partOffsets[index], timeSeconds: (event.tick + partOffsets[index]) / 64 }))).sort((left, right) => left.tick - right.tick);
            equippedWeaponsByPlayer = indexEquippedWeapons(allEvents);
            allProjectiles = projectilesByPart.flatMap((projectiles, index) => projectiles.filter((projectile) => includesPartTick(projectile.tick, index)).map((projectile) => ({ ...projectile, tick: projectile.tick + partOffsets[index] })));
            allSmokeVoxelFrames = grenadeDataByPart.flatMap((data, index) => data.smokeVoxelFrames.filter((frame) => includesPartTick(frame.tick, index)).map((frame) => ({ ...frame, tick: frame.tick + partOffsets[index] })));
            allInfernoFrames = grenadeDataByPart.flatMap((data, index) => data.infernoFrames.filter((frame) => includesPartTick(frame.tick, index)).map((frame) => ({ ...frame, tick: frame.tick + partOffsets[index] })));
            activeWeaponNamesByPart = demoParts.map((part, index) => buildActiveWeaponNames(part, partEvents[index]));
        const sampleRate = [1, 2, 4, 8, 16, 32].includes(Number(data.sampleRate)) ? Number(data.sampleRate) : 8;
       const sampleStep = 64 / sampleRate;
       const maxTick = allEvents.at(-1)?.tick || 0;
       const rounds = buildRounds(allEvents);
         beginPhase('ticks');
         self.postMessage({ type: 'status', message: `正在一次性解析 ${rounds.length} 个回合位置…` });
             const throwPlans = demoParts.map((part, index) => {
             const offset = partOffsets[index];
              const localThrows = partEvents[index].filter((event) => event.event_name === 'grenade_thrown' && includesPartTick(event.tick, index));
             const localTicks = [...new Set(localThrows.flatMap((event) => Array.from({ length: 129 }, (_, tickIndex) => Math.max(0, event.tick - 128 + tickIndex))))].sort((left, right) => left - right);
             const throwers = [...new Set(localThrows.map((event) => String(event.user_steamid)).filter(Boolean))];
              return { part, index, offset, localTicks, throwers };
           });
            const roundTickPlans = rounds.map((round) => {
              const ticks = [];
              for (let tick = round.startTick; tick <= round.endTick; tick += sampleStep) ticks.push(tick);
              if (ticks.at(-1) !== round.endTick) ticks.push(round.endTick);
              return demoParts.map((part, index) => {
                const offset = partOffsets[index];
                const localTicks = ticks.filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
                 return { part, index, offset, localTicks };
              });
            });
            const totalBatches = roundTickPlans.flat().reduce((sum, plan) => sum + Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE), 0) + throwPlans.reduce((sum, plan) => sum + (plan.throwers.length ? Math.ceil(plan.localTicks.length / PARSE_TICK_BATCH_SIZE) : 0), 0) + 1;
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
             const throwRows = throwPlans.flatMap(({ part, index, offset, localTicks, throwers }) => localTicks.length && throwers.length ? parseTicksBatched(part, throwProps, localTicks, throwers, reportProgress).map((plainRow) => ({ ...restoreActiveWeapon(plainRow, activeWeaponNamesByPart[index]), tick: plainRow.tick + offset })) : []);
            const throwSnapshots = normalizeRows(throwRows, 0);
            const playerNameSet = new Set();
            const playerPositionCoverage = new Map();
            const roundData = [];
            let snapshotCount = 0;
            let estimatedBytes = throwSnapshots.length * 240 + allEvents.length * 256 + allProjectiles.length * 128 + estimateDataBytes(allSmokeVoxelFrames) + estimateDataBytes(allInfernoFrames);
             rounds.forEach((round, roundIndex) => {
                const rows = roundTickPlans[roundIndex].flatMap(({ part, index, offset, localTicks }) => localTicks.length ? parseTicksBatched(part, replayProps, localTicks, null, reportProgress).map((plainRow) => ({ ...restoreActiveWeapon(plainRow, activeWeaponNamesByPart[index]), tick: plainRow.tick + offset })) : []);
              const snapshots = normalizeRows(rows, 0);
              snapshots.forEach((snapshot) => snapshot.players.forEach((player) => {
                if (player.name) playerNameSet.add(player.name);
                if (!player.name || ![2, 3].includes(player.team)) return;
                const key = String(player.steamid || player.name);
                const coverage = playerPositionCoverage.get(key) || { name: player.name, steamid: player.steamid || '', samples: 0, positionedSamples: 0 };
                coverage.samples += 1;
                if (player.hasPosition) coverage.positionedSamples += 1;
                playerPositionCoverage.set(key, coverage);
              }));
              snapshotCount += snapshots.length;
              estimatedBytes += estimateDataBytes(snapshots);
              const dataForRound = { round: round.round, snapshots, throwSnapshots: throwSnapshots.filter((snapshot) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick), projectiles: allProjectiles.filter((projectile) => projectile.tick >= round.startTick && projectile.tick <= round.endTick), smokeVoxelFrames: allSmokeVoxelFrames.filter((frame) => frame.tick >= round.startTick && frame.tick <= round.endTick), infernoFrames: allInfernoFrames.filter((frame) => frame.tick >= round.startTick && frame.tick <= round.endTick) };
              const representative = snapshots.find((snapshot) => snapshot.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || snapshots[0];
               roundData.push({ round: round.round, snapshots: representative ? [representative] : [] });
               self.postMessage({ type: 'round', data: dataForRound });
             });
            reportProgress();
            const playerNames = [...playerNameSet].sort();
            const analysisStep = 32;
            const analysisGlobalTicks = [];
            rounds.forEach((round) => { for (let tick = round.startTick; tick <= round.endTick; tick += analysisStep) analysisGlobalTicks.push(tick); });
             const analysisRows = demoParts.flatMap((part, index) => {
              const offset = partOffsets[index];
              const localTicks = [...new Set(analysisGlobalTicks)].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
              if (localTicks.length === 0) return [];
               return parseTicksBatched(part, analysisProps, localTicks).map((plainRow) => ({ ...restoreActiveWeapon(plainRow, activeWeaponNamesByPart[index]), tick: plainRow.tick + offset }));
            });
            const analysis = normalizeRows(analysisRows, 0);
             // Report only players with no usable position in any gameplay sample; brief spawn/disconnect gaps are normal.
             const missingPositionPlayers = [...playerPositionCoverage.values()]
               .filter((player) => player.samples > 0 && player.positionedSamples === 0)
               .map(({ name, steamid }) => ({ name, steamid }));
             const warnings = missingPositionPlayers.length ? [{ type: 'missing-player-position', players: missingPositionPlayers }] : [];
             self.postMessage({ type: 'diagnostic', phase: 'ticks', data: { elapsedMs: performance.now() - phaseStartedAt, throwSnapshots: throwSnapshots.length, snapshots: snapshotCount, analysis: analysis.length, memory: memoryDiagnostics() } });
            self.postMessage({ type: 'status', message: `Demo 已读取，${rounds.length} 个回合已全部就绪` });
            allProjectiles = [];
            allSmokeVoxelFrames = [];
            allInfernoFrames = [];
             const result = { cacheSchemaVersion: CACHE_SCHEMA_VERSION, demo: { fileName: data.fileName, bytes: demoParts.reduce((sum, part) => sum + part.byteLength, 0), map: header.map_name, patch: header.patch_version, guid: header.demo_version_guid || '', version: header.demo_version_name || '', demoFileStamp: header.demo_file_stamp || '', serverName: header.server_name || '', clientName: header.client_name || '', tickRate: 64, sampleRate, maxTick, durationSeconds: maxTick / 64, header }, summary: { rounds: rounds.length, kills: allEvents.filter((event) => event.event_name === 'player_death').length, damageEvents: allEvents.filter((event) => event.event_name === 'player_hurt').length, shots: allEvents.filter((event) => event.event_name === 'fire_bullets').length, players: playerNames }, warnings, rounds, roundData, events: allEvents, players: playerNames, analysisRows: analysis, analysisBytes: estimateDataBytes(analysis) };
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
              return parseTicksBatched(part, analysisProps, localTicks).map((plainRow) => ({ ...restoreActiveWeapon(plainRow, activeWeaponNamesByPart[index]), tick: plainRow.tick + offset }));
       });
        const normalized = normalizeRows(rows, 0);
        self.postMessage({ type: 'analysis', rows: normalized, estimatedBytes: estimateDataBytes(normalized) });
       self.postMessage({ type: 'status', message: '全场移动数据已就绪' });
     }
  } catch (error) {
    self.postMessage({ type: 'error', message: `${currentPhase}: ${error?.message || String(error)}`, diagnostic: { phase: currentPhase, elapsedMs: phaseStartedAt ? performance.now() - phaseStartedAt : null, error: describeError(error), memory: memoryDiagnostics(), bytes: demoBytes?.byteLength || null } });
  }
};
