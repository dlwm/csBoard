import { isDesktopRuntime } from './runtime.js';

let resources = { icons: {}, models: {} };

// Load once before React mounts. Applying a new pack is an explicit page reload,
// so active 3D scenes never retain textures or geometry from a half-updated pack.
export async function initializeResourcePacks() {
  if (!isDesktopRuntime()) return;
  try { resources = await window.csboardDesktop.resources.status(); }
  catch (error) { console.warn('Resource pack status unavailable; using NAV and default icons.', error); }
}

export function importedIconUrl(name) {
  return isDesktopRuntime() && resources.icons[name] ? `/resource-pack/icons/${name}.svg` : null;
}

export function hasMapModel(mapName) {
  return !isDesktopRuntime() || mapName === 'cs_tutorial' || Boolean(resources.models[mapName]);
}

export function desktopModelBase(mapName) {
  return hasMapModel(mapName) ? `${location.origin}/resource-pack/models` : null;
}
