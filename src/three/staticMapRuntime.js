import { isMapModelOverlay } from '../../shared/map-model-materials.js';

// All map surfaces share one display material; decorative overlays stay hidden.
// 地图统一简洁显示，按覆盖层标记隐藏装饰；不再保留材质切换状态。
export function createMapMaterialRuntime(root, createMaterial) {
  let applied = false;
  return {
    apply() {
      if (applied) return;
      const cache = new Map(); let meshes = 0;
      root.traverse(object => {
        if (!object.userData.sourceMapMaterial) return;
        meshes++;
        const source = object.userData.sourceMapMaterial;
        const display = (Array.isArray(source) ? source : [source]).map(material => {
          const hidden = isMapModelOverlay(material);
          if (!cache.has(hidden)) {
            const next = createMaterial(); next.visible = !hidden; cache.set(hidden, next);
          }
          return cache.get(hidden);
        });
        object.material = Array.isArray(source) ? display : display[0];
      });
      root.userData.renderStats = { meshes, displayMaterials: cache.size };
      applied = true;
    },
  };
}

// Imported map nodes never animate. Cache the entire subtree's world transforms
// until its root or parent transform actually changes. Object visibility and
// materials remain editable; the root still supports the model's Y offset.
// 地图子节点为静态：根/父级变换不变时跳过整棵树，显隐和材质仍可修改。
// Only install on static imported maps, never on players or animated GLTFs.
export function cacheStaticMapTransforms(root) {
  root.updateMatrixWorld(true);
  root.traverse(object => { if (object !== root) { object.updateMatrix(); object.matrixAutoUpdate = false; } });
  const update = root.updateMatrixWorld.bind(root);
  const world = root.matrixWorld.clone();
  const lastWorld = root.matrixWorld.clone();
  root.updateMatrixWorld = () => {
    if (root.matrixAutoUpdate) root.updateMatrix();
    if (root.parent) world.multiplyMatrices(root.parent.matrixWorld, root.matrix);
    else world.copy(root.matrix);
    // A ray query can update the root alone via updateWorldMatrix(). Compare
    // with the last completed subtree update, not the root's mutable matrix.
    if (world.equals(lastWorld)) { root.matrixWorldNeedsUpdate = false; return; }
    update(true);
    lastWorld.copy(root.matrixWorld);
  };
}
