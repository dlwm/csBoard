// Display clones share source textures; dispose each GPU resource only once.
// 显示材质与原始材质共享贴图，地图切换时统一释放，避免重复释放或累积显存。
export function disposeMapModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const value of [object.material, object.userData?.originalMapMaterial]) {
      for (const material of Array.isArray(value) ? value : [value]) if (material) materials.add(material);
    }
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const geometry of geometries) { geometry.disposeBoundsTree?.(); geometry.dispose(); }
  for (const material of materials) material.dispose();
  for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
}
