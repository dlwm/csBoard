import { getHost } from '../platform/index.js';
import { createRenderLoop } from '../../packages/viewer/src/three/renderLoop.js';

// CSBoard supplies native visibility; the library scheduler has no host globals.
export function startRenderLoop(render) {
  return createRenderLoop(render, { presentation: getHost().presentation });
}
