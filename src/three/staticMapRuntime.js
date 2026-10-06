import { isSource2Overlay } from './source2Overlays.js';
// Keep one display material per source material, not one per mesh. Simple mode
// needs just one shared material. Shader uniforms are map-wide in both modes.
// 显示材质按源材质复用，简洁模式只用一个；切换时集中释放旧显示材质。
export function createMapMaterialRuntime(root, createMaterial) {
  const meshes = [];
  root.traverse(object => { if (object.userData.originalMapMaterial) meshes.push(object); });
  let displayMaterials = new Set(), currentStyle = null;
  return {
    applyStyle(style) {
      if (currentStyle === style) return;
      const cache = new Map(), next = new Set();
      for (const object of meshes) {
        const original = object.userData.originalMapMaterial;
        const display = (Array.isArray(original) ? original : [original]).map(source => {
          const hiddenOverlay = style !== 'original' && isSource2Overlay(source);
          const key = style === 'original' ? source : hiddenOverlay ? 'overlay-hidden' : null;
          if (!cache.has(key)) { const material = createMaterial(style === 'original' ? source : null); if (hiddenOverlay) material.visible = false; cache.set(key, material); next.add(material); }
          return cache.get(key);
        });
        object.material = Array.isArray(original) ? display : display[0];
      }
      for (const material of displayMaterials) material.dispose();
      displayMaterials = next;
      currentStyle = style;
      root.userData.renderStats = { meshes: meshes.length, displayMaterials: next.size, style };
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
