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

function beginPhase(phase) {
  currentPhase = phase;
  phaseStartedAt = performance.now();
}

const normalizeEvent = (event) => ({ ...event, timeSeconds: event.tick / 64 });

function toPlainObject(value) {
  return value instanceof Map ? Object.fromEntries(value) : value;
}

function parsePartEvents(part) {
  const parsed = parseEvents(part, ['round_start', 'round_freeze_end', 'round_end', 'player_death', 'weapon_fire', 'grenade_thrown', 'smokegrenade_detonate', 'inferno_startburn', 'inferno_expire', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_detonate'], ['X', 'Y', 'Z', 'team_num']);
  return Object.values(parsed || {}).map(toPlainObject).map(normalizeEvent);
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
    return { round: start.round ?? index + 1, startTick, endTick: end?.tick ?? startTick, winner: end?.winner ?? null, reason: end?.reason ?? null, timeSeconds: startTick / 64 };
  });
}

function normalizeRows(rows, round) {
  const snapshots = new Map();
  rows.forEach((row) => {
     row = toPlainObject(row);
     if (!snapshots.has(row.tick)) snapshots.set(row.tick, []);
     snapshots.get(row.tick).push({ name: row.name, steamid: row.steamid, team: row.team_num, side: row.team_num === 2 ? 'T' : 'CT', health: row.health, pitch: row.pitch ?? 0, yaw: row.yaw ?? 0, raw: { x: row.X, y: row.Y, z: row.Z }, position: { x: row.Y * 0.0254, y: row.Z * 0.0254, z: row.X * 0.0254 } });
  });
  return [...snapshots.entries()].map(([tick, players]) => ({ tick, timeSeconds: tick / 64, players }));
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      beginPhase('wasm');
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
         allProjectiles = demoParts.flatMap((part, index) => (parseGrenades(part) || []).map(toPlainObject).filter((projectile) => projectile.x != null && projectile.y != null && projectile.z != null && projectile.tick > partSkips[index]).map((projectile) => ({ ...projectile, tick: projectile.tick + partOffsets[index] })));
      const maxTick = allEvents.at(-1)?.tick || 0;
      const rounds = buildRounds(allEvents);
       self.postMessage({ type: 'status', message: 'Demo 已读取，请选择回合…' });
       self.postMessage({ type: 'loaded', data: { demo: { fileName: data.fileName, bytes: demoBytes.byteLength, map: header.map_name, patch: header.patch_version, tickRate: 64, maxTick, durationSeconds: maxTick / 64 }, summary: { rounds: rounds.length, kills: null, players: [] }, rounds, events: allEvents, players: [] } });
    }
     if (data.type === 'round') {
      if (!demoBytes) return;
       beginPhase('ticks');
      self.postMessage({ type: 'status', message: `正在解析第 ${data.round} 回合位置…` });
      const step = 16;
      const ticks = new Int32Array(Math.floor((data.endTick - data.startTick) / step) + 1);
      for (let index = 0; index < ticks.length; index += 1) ticks[index] = Math.min(data.endTick, data.startTick + index * step);
       const rows = demoParts.flatMap((part, index) => {
         const offset = partOffsets[index];
         const localTicks = [...ticks].filter((tick) => tick >= offset && tick - offset <= 1000000).map((tick) => tick - offset);
         if (localTicks.length === 0) return [];
          return parseTicks(part, ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw'], new Int32Array(localTicks), null, false).map((row) => { const plainRow = toPlainObject(row); return { ...plainRow, tick: plainRow.tick + offset }; });
       });
       self.postMessage({ type: 'round', round: data.round, snapshots: normalizeRows(rows, data.round), projectiles: allProjectiles.filter((projectile) => projectile.tick >= data.startTick && projectile.tick <= data.endTick) });
       self.postMessage({ type: 'status', message: `第 ${data.round} 回合已就绪` });
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
         return parseTicks(part, ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw'], new Int32Array(localTicks), null, false).map((row) => { const plainRow = toPlainObject(row); return { ...plainRow, tick: plainRow.tick + offset }; });
       });
       self.postMessage({ type: 'analysis', rows: normalizeRows(rows, 0) });
       self.postMessage({ type: 'status', message: '全场移动数据已就绪' });
     }
  } catch (error) {
    self.postMessage({ type: 'error', message: `${currentPhase}: ${error?.message || String(error)}`, diagnostic: { phase: currentPhase, elapsedMs: phaseStartedAt ? performance.now() - phaseStartedAt : null, error: describeError(error), memory: memoryDiagnostics(), bytes: demoBytes?.byteLength || null } });
  }
};
