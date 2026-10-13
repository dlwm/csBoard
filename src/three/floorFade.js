import { NAV_FLOOR_BOUNDARIES } from '../data/navTopView.js';
import { deriveNavFloorRanges, applyFloorRange } from '../../packages/viewer/src/data/floorRanges.js';
// Host adapter chooses the map-specific cut; the library owns range calculation.
export function updateFloorFadeState(state, mapName, floor, modelCenterY = 0, navData = null) {
  applyFloorRange(state, floor === 'all' ? null : deriveNavFloorRanges(navData, NAV_FLOOR_BOUNDARIES[mapName] ?? null)[floor] ?? null, modelCenterY);
}
export { floorVisibilityAtY, enableMaterialFloorFade, enableObjectFloorFade } from '../../packages/viewer/src/three/floorMaterial.js';
