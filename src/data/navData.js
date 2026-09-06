// Loads committed NAV data from the frontend bundle without any runtime request.
const rawModules = import.meta.glob('./nav/*.json', { eager: true, import: 'default', query: '?raw' });
const rawByMap = Object.fromEntries(Object.entries(rawModules).map(([file, raw]) => [file.split('/').at(-1).replace(/\.json$/, ''), raw]));
const parsedByMap = new Map();

export function getBundledNavData(mapName) {
  if (!rawByMap[mapName]) return null;
  // Parse on first selection to avoid materializing every map's thousands of areas at startup.
  if (!parsedByMap.has(mapName)) parsedByMap.set(mapName, JSON.parse(rawByMap[mapName]));
  return parsedByMap.get(mapName);
}
