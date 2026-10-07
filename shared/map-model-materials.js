// Decorative Source 2 overlays are separate surfaces, not structural geometry.
// 保留覆盖层标记供简洁地图隐藏；剥离贴图后不依赖完整原始材质参数。
export const isMapModelOverlay = material => {
  const data = material?.userData || material?.extras || {};
  return data.csboardMapOverlay === true || String(data.vmat?.ShaderName || '').endsWith('static_overlay.vfx');
};
