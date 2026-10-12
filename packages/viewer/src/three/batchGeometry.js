import * as THREE from 'three';

// A batch copies geometry buffers. Keep only attributes its display material
// reads; source geometry, collision data and original textures stay untouched.
// 合批只复制显示材质所需属性；原几何、碰撞和贴图不修改。
// Custom shaders retain every attribute because their inputs cannot be inferred.
export function createBatchGeometryCache() {
  const cache = new WeakMap();
  return (geometry, material) => {
    if (!material.isMeshStandardMaterial && !material.isMeshBasicMaterial) return geometry;
    const names = new Set(['position', 'normal']);
    if (material.vertexColors) names.add('color');
    if (material.normalMap || material.clearcoatNormalMap || material.anisotropy > 0) names.add('tangent');
    for (const [name, texture] of Object.entries(material)) {
      if (name === 'envMap' || !texture?.isTexture || !(name === 'map' || name.endsWith('Map'))) continue;
      names.add(texture.channel > 0 ? `uv${texture.channel}` : 'uv');
    }
    const attributes = [...names].filter(name => geometry.hasAttribute(name)).sort();
    if (attributes.length === Object.keys(geometry.attributes).length) return geometry;
    const key = attributes.join('|');
    let views = cache.get(geometry);
    if (!views) { views = new Map(); cache.set(geometry, views); }
    if (!views.has(key)) {
      // This lightweight view borrows source buffers. BatchedMesh copies them
      // into its own storage; the view is never uploaded or disposed separately.
      const view = new THREE.BufferGeometry();
      for (const name of attributes) view.setAttribute(name, geometry.getAttribute(name));
      view.setIndex(geometry.index);
      view.boundingBox = geometry.boundingBox;
      view.boundingSphere = geometry.boundingSphere;
      views.set(key, view);
    }
    return views.get(key);
  };
}
