// Refresh only the small overview reference table; no map images or model assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const revision = '3d82674b31c75704586a7ca232aa8c734ffd3261';
const repository = 'CS2OpenDev/CS2OpenDev-Docs';
const sourcePath = 'docs/generated/data/maps.json';
const read = async file => {
  const response = await fetch(`https://raw.githubusercontent.com/${repository}/${revision}/${file}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cannot read pinned map reference: ${response.status}`);
  return response.text();
};
const [raw, license] = await Promise.all([read(sourcePath), read('LICENSE')]);
const source = JSON.parse(raw);
const bundled = new Set((await fs.readdir(path.join(root, 'src/data/nav'))).map(file => file.replace(/\.json$/, '')));
const maps = {};
for (const map of source.maps) {
  if (!bundled.has(map.name)) continue;
  const overview = { posX: Number(map.posX), posY: Number(map.posY), scale: Number(map.scale) };
  if (!Object.values(overview).every(Number.isFinite) || overview.scale <= 0) throw new Error(`Invalid overview: ${map.name}`);
  const markers = {};
  for (const [id, prefix] of [['A', 'bombA'], ['B', 'bombB'], ['CT', 'ctSpawn'], ['T', 'tSpawn']]) {
    const rawX = map[`${prefix}X`]; const rawY = map[`${prefix}Y`];
    if (rawX === '' || rawX == null || rawY === '' || rawY == null) continue;
    const x = Number(rawX); const y = Number(rawY);
    if (![x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error(`Invalid marker: ${map.name}/${id}`);
    markers[id] = [overview.posX + x * 1024 * overview.scale, overview.posY - y * 1024 * overview.scale];
  }
  maps[map.name] = { overview, markers };
}
const result = { version: 1, source: { url: `https://github.com/${repository}`, revision, path: sourcePath, readAt: '2026-09-30', kind: 'radar_overview_markers', license }, maps };
await fs.writeFile(path.join(root, 'src/data/mapLandmarks.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Generated map references for ${Object.keys(maps).length} maps from ${revision}`);
