import { parseNavBuffer } from '../../src/navParser.js';

const MAP_NAME = /^de_(dust2|mirage|nuke|ancient|anubis|cache|inferno|overpass|train|vertigo)$/;
const json = (body, status = 200) => Response.json(body, { status });
const toPlainObject = (value) => value instanceof Map ? Object.fromEntries(value) : value;

async function parseDemo(request, parser) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: '缺少 Demo 文件' }, 400);
  }
  const file = form.get('demo');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: '缺少 Demo 文件' }, 400);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = toPlainObject(parser.parseHeader(bytes));
    const eventMap = parser.parseEvents(bytes, ['round_start', 'round_end', 'player_death', 'bomb_planted', 'bomb_defused']);
    const events = Object.values(eventMap || {}).map(toPlainObject).sort((left, right) => left.tick - right.tick).map((event) => ({ ...event, timeSeconds: event.tick / 64 }));
    const rounds = events.filter((event) => event.event_name === 'round_start').length;
    const kills = events.filter((event) => event.event_name === 'player_death').length;
    const players = [...new Set(events.flatMap((event) => [event.attacker_name, event.user_name]).filter(Boolean))];
    const maxTick = events.at(-1)?.tick || 0;
    const sampleStep = 128;
    const sampleTicks = Array.from({ length: Math.max(1, Math.floor(maxTick / sampleStep) + 1) }, (_value, index) => index * sampleStep);
    const positionRows = parser.parseTicks(bytes, ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'team_rounds_total', 'active_weapon_name', 'inventory'], sampleTicks);
    const snapshotsByTick = new Map();
    positionRows.map(toPlainObject).forEach((row) => {
      if (!snapshotsByTick.has(row.tick)) snapshotsByTick.set(row.tick, []);
      snapshotsByTick.get(row.tick).push({ name: row.name, steamid: row.steamid, team: row.team_num, health: row.health, pitch: row.pitch ?? 0, yaw: row.yaw ?? 0, raw: { x: row.X, y: row.Y, z: row.Z }, position: { x: row.Y * 0.0254, y: row.Z * 0.0254, z: row.X * 0.0254 } });
    });
    const snapshots = [...snapshotsByTick.entries()].map(([tick, snapshotPlayers]) => ({ tick, timeSeconds: tick / 64, players: snapshotPlayers }));
    const roundTimeline = events.filter((event) => ['round_start', 'round_end'].includes(event.event_name));
    return json({ demo: { fileName: file.name, bytes: file.size, map: header.map_name, patch: header.patch_version, tickRate: 64, maxTick, durationSeconds: maxTick / 64 }, summary: { rounds, kills, players }, rounds: roundTimeline, events, players, snapshots });
  } catch (error) {
    return json({ error: `Demo 解析失败：${error.message}` }, 422);
  }
}

async function parseMapNav(mapName, mapBaseUrl) {
  if (!MAP_NAME.test(mapName)) return json({ error: '地图不存在' }, 404);
  try {
    const response = await fetch(`${mapBaseUrl}/maps/${mapName}/${mapName}.nav`);
    if (!response.ok) return json({ error: '地图没有 NAV 数据' }, 404);
    return json(parseNavBuffer(await response.arrayBuffer()));
  } catch (error) {
    return json({ error: `NAV 解析失败：${error.message}` }, 500);
  }
}

export function createHttpHandler(parser) {
  return async function handleHttp(request, env = {}) {
    const url = new URL(request.url);
    const mapBaseUrl = String(env.MAP_BASE_URL || '').replace(/\/$/, '');
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, parser: 'demoparser2' });
    if (request.method === 'POST' && url.pathname === '/api/parse') return parseDemo(request, parser);
    const navMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/maps\/([^/]+)\/nav$/) : null;
    if (navMatch) return mapBaseUrl ? parseMapNav(navMatch[1], mapBaseUrl) : json({ error: '未配置地图资源地址' }, 503);
    if (request.method === 'GET' && url.pathname.startsWith('/maps/')) return mapBaseUrl ? fetch(`${mapBaseUrl}${url.pathname}`) : json({ error: '未配置地图资源地址' }, 503);
    return null;
  };
}
