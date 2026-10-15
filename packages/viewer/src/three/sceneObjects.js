import { ViewerError } from '../core/controller.js';

// Clone materials, not geometry/textures: an extension must not change another
// view's shared assets. Geometry and texture lifetime remains with the host.
// 中文：仅克隆材质；不改变另一视窗的共享资源，几何与贴图仍由宿主释放。
export function createSceneObjectAttachments(group, changed) {
  const entries = new Set();
  function add(object, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['occlusion', 'surfaceBias'].includes(key))) throw new ViewerError('invalid_argument', 'Object options accept occlusion and surfaceBias');
    const { occlusion = 'world', surfaceBias = 0 } = options;
    if (!object?.isObject3D || object.parent || !['world', 'overlay'].includes(occlusion)
      || !Number.isFinite(surfaceBias) || Math.abs(surfaceBias) > 16) throw new ViewerError('invalid_argument', 'addObject requires an unattached Object3D, world/overlay occlusion and surfaceBias within -16..16');
    const originals = [], clones = new Map();
    let active = true;
    const restore = () => {
      if (!active) return; active = false; entries.delete(restore); object.removeFromParent();
      for (const { node, material, order } of originals) { node.material = material; node.renderOrder = order; }
      for (const material of clones.values()) material.dispose();
      changed();
    };
    try {
      object.traverse(node => {
        if (!node.material) return;
        const materials = [].concat(node.material);
        if (materials.some(material => !material?.isMaterial)) throw new ViewerError('invalid_argument', 'Scene object requires Three.js materials');
        const mapped = materials.map(source => {
          if (!clones.has(source)) {
            const material = source.clone();
            material.onBeforeCompile = source.onBeforeCompile;
            material.customProgramCacheKey = source.customProgramCacheKey;
            material.depthTest = occlusion === 'world';
            material.depthWrite = occlusion === 'world' && (!material.transparent || material.alphaHash || material.alphaToCoverage);
            // Raster depth bias only; never move Source coordinates or NAV Z.
            // 中文：只偏移光栅深度，不移动坐标或 NAV 高度。
            material.polygonOffset = surfaceBias !== 0;
            material.polygonOffsetFactor = material.polygonOffsetUnits = -surfaceBias;
            clones.set(source, material);
          }
          return clones.get(source);
        });
        originals.push({ node, material: node.material, order: node.renderOrder });
        node.material = Array.isArray(node.material) ? mapped : mapped[0];
        node.renderOrder = occlusion === 'overlay' ? 1000 : 3;
      });
      group.add(object); entries.add(restore); changed(); return restore;
    } catch (error) { restore(); throw error; }
  }
  return { add, dispose() { for (const restore of [...entries]) restore(); } };
}
