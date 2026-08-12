import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvents, parseHeader, parseTicks } from '@laihoe/demoparser2';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use('/maps', express.static(path.join(projectRoot, 'public/maps')));

function parseNav(buffer) {
  let offset = 0;
  const uint32 = () => { if (offset + 4 > buffer.length) return 0; const value = buffer.readUInt32LE(offset); offset += 4; return value; };
  const int64 = () => { offset += 8; };
  const byte = () => buffer[offset++];
  const uint16 = () => { if (offset + 2 > buffer.length) return 0; const value = buffer.readUInt16LE(offset); offset += 2; return value; };
  const float = () => { if (offset + 4 > buffer.length) return 0; const value = buffer.readFloatLE(offset); offset += 4; return value; };
  const string = () => { const start = offset; while (offset < buffer.length && buffer[offset] !== 0) offset += 1; const value = buffer.toString('utf8', start, offset); offset += 1; return value; };
  const skipKv3 = () => {
    offset = (offset + 7) & ~7;
    const magic = uint32();
    if ((magic & 0xffffff00) !== 0x4b563300) throw new Error('无效 KV3 数据');
    const version = magic & 0xff;
    offset += 16;
    const compression = uint32();
    if (version >= 2) offset += 4;
    const readInt = () => uint32();
    const bytes1 = readInt();
    const bytes4 = readInt();
    const bytes8 = readInt();
    readInt();
    let sizeUncompressed = 0;
    let sizeCompressed = 0;
    let blockCount = 0;
    let binaryBlobBytes = 0;
    if (version >= 2) {
      uint16(); uint16();
      sizeUncompressed = readInt(); sizeCompressed = readInt(); blockCount = readInt(); binaryBlobBytes = readInt();
    }
    if (version >= 4) { readInt(); readInt(); }
    const v5 = [];
    if (version >= 5) { for (let index = 0; index < 12; index += 1) v5.push(readInt()); }
    if (version >= 5) {
      const buffer1 = v5[0];
      const compressedBuffer1 = v5[1];
      const buffer2 = v5[2];
      const compressedBuffer2 = v5[3];
      offset += compression === 0 ? buffer1 : compressedBuffer1;
      offset += compression === 0 ? buffer2 : compressedBuffer2;
      if (blockCount) offset += binaryBlobBytes + 4;
    } else {
      offset += compression === 0 ? sizeUncompressed : sizeCompressed;
    }
    return offset;
  };
  if (uint32() !== 0xfeedface) throw new Error('无效 NAV 文件');
  const version = uint32();
  const subVersion = uint32();
  const analyzedFlags = uint32();
  if (version >= 36) skipKv3();
  const corners = [];
  const polygons = [];
  const cornerCount = uint32();
  if (cornerCount > 100000) throw new Error('NAV v36 KV3 偏移无法识别');
  for (let index = 0; index < cornerCount; index += 1) corners.push({ x: float(), y: float(), z: float() });
  const polygonCount = uint32();
  if (polygonCount > 100000) throw new Error('NAV v36 多边形数量异常');
  for (let index = 0; index < polygonCount; index += 1) {
    const polygon = [];
    const pointCount = byte();
    for (let point = 0; point < pointCount; point += 1) polygon.push(corners[uint32()]);
    if (version >= 35) uint32();
    polygons.push(polygon);
  }
  if (version >= 32) uint32();
  if (version >= 35) {
    const unknownCount = uint32();
    for (let index = 0; index < unknownCount; index += 1) { string(); offset += 48; }
  }
  if (version >= 36) skipKv3();
  const areas = {};
  const areaCount = uint32();
  if (areaCount > 20000) throw new Error('NAV v36 KV3 偏移无法识别');
  for (let index = 0; index < areaCount; index += 1) {
    const areaId = uint32();
    const dynamicFlags = int64();
    const hullIndex = byte();
    const points = polygons[uint32()] || [];
    uint32();
    const connections = [];
    for (let point = 0; point < points.length; point += 1) {
      const count = uint32();
      for (let connection = 0; connection < count; connection += 1) { connections.push(uint32()); uint32(); }
    }
    offset += 5;
    const above = [];
    for (let ladder = 0, count = uint32(); ladder < count; ladder += 1) above.push(uint32());
    const below = [];
    for (let ladder = 0, count = uint32(); ladder < count; ladder += 1) below.push(uint32());
    areas[areaId] = { area_id: areaId, hull_index: hullIndex, dynamic_attribute_flags: Number(dynamicFlags), corners: points, connections, ladders_above: above, ladders_below: below };
  }
  return { version, sub_version: subVersion, is_analyzed: Boolean(analyzedFlags & 1), areas };
}

function readVpkEntry(vpkBuffer, wantedPath) {
  if (vpkBuffer.readUInt32LE(0) !== 0x55aa1234) throw new Error('无效 VPK 文件');
  const treeSize = vpkBuffer.readUInt32LE(8);
  const treeEnd = 28 + treeSize;
  let offset = 28;
  const readString = () => { const start = offset; while (vpkBuffer[offset] !== 0) offset += 1; const value = vpkBuffer.toString('utf8', start, offset); offset += 1; return value; };
  while (offset < treeEnd) {
    const extension = readString();
    if (!extension) break;
    while (offset < treeEnd) {
      const directory = readString();
      if (!directory) break;
      while (offset < treeEnd) {
        const filename = readString();
        if (!filename) break;
        const target = `${directory === ' ' ? '' : `${directory}/`}${filename}.${extension}`;
        const crc = vpkBuffer.readUInt32LE(offset); offset += 4;
        const preloadBytes = vpkBuffer.readUInt16LE(offset); offset += 2;
        const archiveIndex = vpkBuffer.readUInt16LE(offset); offset += 2;
        const entryOffset = vpkBuffer.readUInt32LE(offset); offset += 4;
        const entryLength = vpkBuffer.readUInt32LE(offset); offset += 4;
        offset += 2;
        const preload = vpkBuffer.subarray(offset, offset + preloadBytes); offset += preloadBytes;
        if (target === wantedPath) {
          if (archiveIndex !== 0x7fff) throw new Error('分卷 VPK 暂不支持');
          return Buffer.concat([preload, vpkBuffer.subarray(treeEnd + entryOffset, treeEnd + entryOffset + entryLength)]);
        }
      }
    }
  }
  return null;
}

app.get('/api/maps/:map/nav', (request, response) => {
  const mapName = request.params.map;
  if (!/^de_(dust2|mirage|nuke|ancient|anubis|cache|inferno|overpass|train|vertigo)$/.test(mapName)) return response.status(404).json({ error: '地图不存在' });
  try {
    const navPath = path.join('ref', 'maps', mapName, `${mapName}.nav`);
    const vpkBuffer = fs.existsSync(navPath) ? null : fs.readFileSync(path.join('ref', 'vpk', `${mapName}.vpk`));
    const navBuffer = fs.existsSync(navPath) ? fs.readFileSync(navPath) : readVpkEntry(vpkBuffer, `maps/${mapName}.nav`) || readVpkEntry(vpkBuffer, `maps/${mapName}/${mapName}.nav`);
    if (!navBuffer) return response.status(404).json({ error: '地图没有 NAV 数据' });
    return response.json(parseNav(navBuffer));
  } catch (error) {
    return response.status(500).json({ error: `NAV 解析失败：${error.message}` });
  }
});

app.get('/api/health', (_request, response) => response.json({ ok: true, parser: 'demoparser2' }));

app.post('/api/parse', upload.single('demo'), (request, response) => {
  if (!request.file) return response.status(400).json({ error: '缺少 Demo 文件' });
  try {
    const header = parseHeader(request.file.buffer);
    const eventMap = parseEvents(request.file.buffer, ['round_start', 'round_end', 'player_death', 'bomb_planted', 'bomb_defused']);
    const events = Object.values(eventMap).sort((left, right) => left.tick - right.tick).map((event) => ({ ...event, timeSeconds: event.tick / 64 }));
    const rounds = events.filter((event) => event.event_name === 'round_start').length;
    const kills = events.filter((event) => event.event_name === 'player_death').length;
    const players = [...new Set(events.flatMap((event) => [event.attacker_name, event.user_name]).filter(Boolean))];
    const maxTick = events.at(-1)?.tick || 0;
    const sampleStep = 128;
    const sampleTicks = Array.from({ length: Math.max(1, Math.floor(maxTick / sampleStep) + 1) }, (_value, index) => index * sampleStep);
    const positionRows = parseTicks(request.file.buffer, ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw'], sampleTicks, null, false);
    const snapshotsByTick = new Map();
    positionRows.forEach((row) => {
      if (!snapshotsByTick.has(row.tick)) snapshotsByTick.set(row.tick, []);
      snapshotsByTick.get(row.tick).push({ name: row.name, steamid: row.steamid, team: row.team_num, health: row.health, pitch: row.pitch ?? 0, yaw: row.yaw ?? 0, raw: { x: row.X, y: row.Y, z: row.Z }, position: { x: row.Y * 0.0254, y: row.Z * 0.0254, z: row.X * 0.0254 } });
    });
    const snapshots = [...snapshotsByTick.entries()].map(([tick, snapshotPlayers]) => ({ tick, timeSeconds: tick / 64, players: snapshotPlayers }));
    const roundTimeline = events.filter((event) => ['round_start', 'round_end'].includes(event.event_name));
    return response.json({ demo: { fileName: request.file.originalname, bytes: request.file.size, map: header.map_name, patch: header.patch_version, tickRate: 64, maxTick, durationSeconds: maxTick / 64 }, summary: { rounds, kills, players }, rounds: roundTimeline, events, players, snapshots });
  } catch (error) {
    return response.status(422).json({ error: `Demo 解析失败：${error.message}` });
  }
});

app.listen(3001, () => console.log('CSBoard parser listening on http://localhost:3001'));
