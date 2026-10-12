// Dispose shared display materials and any legacy/fallback source textures once.
// 统一释放共享显示材质与旧/回退资源的贴图，避免重复释放或累积显存。
export function disposeMapModel(root) {
  root?.userData.disposeRenderBatches?.();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const value of [object.material, object.userData?.sourceMapMaterial]) {
      for (const material of Array.isArray(value) ? value : [value]) if (material) materials.add(material);
    }
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const geometry of geometries) { geometry.disposeBoundsTree?.(); geometry.dispose(); }
  for (const material of materials) material.dispose();
  const images = new Set();
  for (const texture of textures) { texture.dispose(); if (texture.source?.data) images.add(texture.source.data); }
  for (const image of images) image.close?.();
}
