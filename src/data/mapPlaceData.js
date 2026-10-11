import { validatePlaceRegions } from './mapPlaceRegions.js';
// Vite supplies the bundled registry; plain Node consumers have no bundled annotations.
let modules = {};
try { modules = import.meta.glob('./mapPlaces/*.json', { eager: true, import: 'default' }); }
catch (error) { if (!(error instanceof TypeError)) throw error; }
const byMap = Object.fromEntries(Object.entries(modules).map(([file, data]) => [file.split('/').at(-1).replace(/\.json$/, ''), data]));
const validated = new WeakMap();
export function getMapPlaceAnnotations(nav, mapName) {
  const document = byMap[mapName];
  if (!document || !nav) return { regions: [], spawnPoints: [] };
  if (validated.get(nav)?.mapName === mapName) return validated.get(nav).annotations;
  let annotations = { regions: [], spawnPoints: [] };
  try { annotations = validatePlaceRegions(document, nav, mapName); annotations.regions = annotations.regions.filter(region => region.areaIds.length); }
  catch (error) { console.warn(`${mapName} place annotations skipped: ${error.message}`); }
  validated.set(nav, { mapName, annotations });
  return annotations;
}

export function getMapPlaceRegions(nav, mapName) { return getMapPlaceAnnotations(nav, mapName).regions; }
