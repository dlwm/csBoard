import { getPlatform } from '../platform/index.js';

let resources = { icons: {}, models: {} };
let pendingReload = false;
export const resourceReloadPending = () => pendingReload;
export const markResourcesChanged = () => { pendingReload = true; };
const workerIcons = new Set(JSON.parse(import.meta.env.VITE_WORKER_RESOURCE_ICONS || '[]'));

// Load once before React mounts. Applying a new pack is an explicit page reload,
// so active 3D scenes never retain textures or geometry from a half-updated pack.
export async function initializeResourcePacks() {
  if (!getPlatform().capabilities.resourceImport) return;
  try { resources = await getPlatform().resources.status(); }
  catch (error) { console.warn('Resource pack status unavailable; using NAV and default icons.', error); }
}

export function importedIconUrl(name) {
  return (getPlatform().capabilities.resourceImport ? resources.icons[name] : workerIcons.has(name)) ? `/resource-pack/icons/${name}.svg` : null;
}

export function hasMapModel(mapName) {
  return !getPlatform().capabilities.resourceImport || mapName === 'cs_tutorial' || Boolean(resources.models[mapName]);
}

export function desktopModelBase(mapName) {
  return hasMapModel(mapName) ? `${location.origin}/resource-pack/models` : null;
}

export function mapModelSource(mapName, webBases) {
  return getPlatform().capabilities.resourceImport
    ? { bases: [desktopModelBase(mapName)], file: `${mapName}.glb` }
    : { bases: webBases, file: `${mapName}/${mapName}.glb` };
}
