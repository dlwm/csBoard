import * as THREE from 'three';

// glTF has no Source 2 overlay blend modes. VRF preserves these parameters in
// vmat extras even when the exported PBR material appears opaque.
// Source 2 贴花混合模式不属于 glTF 标准；按导出的 vmat 元数据恢复，不按地图
// 名称或贴图文件名猜测。模式定义对应 VRF RenderMaterial.DetermineRenderingMode。
export const isSource2Overlay = material => String(material?.userData?.vmat?.ShaderName || '').endsWith('static_overlay.vfx');

export function createSource2OverlayMaterial(source) {
  if (!isSource2Overlay(source)) return null;
  const params = source.userData.vmat;
  const mode = Number(params.IntParams?.F_BLEND_MODE) || 0;
  const material = new THREE.MeshBasicMaterial({
    name: source.name, color: source.color?.clone() || new THREE.Color(1, 1, 1),
    map: source.map, alphaMap: source.alphaMap, opacity: source.opacity,
    side: source.side, vertexColors: source.vertexColors,
    transparent: true, depthTest: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    toneMapped: false, userData: { ...source.userData, csboardSourceOverlay: true, csboardSourceBlendMode: mode },
  });
  // Overlay blending uses the colour already present in the framebuffer.
  // 3: result = 2 * source * destination (Mod2x), not an opaque replacement.
  // 4: result = source * alpha + destination; 5: source * destination.
  // 6: source * destination + (1 - alpha) * destination.
  if ([3, 5, 6].includes(mode)) {
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = mode === 5 ? THREE.ZeroFactor : THREE.DstColorFactor;
    material.blendDst = mode === 6 ? THREE.OneMinusSrcAlphaFactor : THREE.SrcColorFactor;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrcAlpha = THREE.ZeroFactor; material.blendDstAlpha = THREE.OneFactor;
  } else if (mode === 4) material.blending = THREE.AdditiveBlending;
  else if (mode === 2) material.alphaTest = source.alphaTest || 0.5;

  // Display the exported frame, not all 64 cells as a repeated wall texture.
  // 使用导出的静态帧；不把 8×8 动画图集全部铺在墙面。仅改变显示贴图副本的
  // UV 变换，不改原图字节或其他材质共享的纹理参数。
  const grid = params.VectorParams?.g_vAnimationGrid;
  const columns = Math.floor(Number(grid?.[0])), rows = Math.floor(Number(grid?.[1]));
  if (material.map && Number(params.IntParams?.F_TEXTURE_ANIMATION) === 1 && columns > 0 && rows > 0) {
    const cells = Math.min(columns * rows, Number(params.IntParams?.g_nNumAnimationCells) || columns * rows);
    const frame = Math.max(0, Math.floor(Number(params.FloatParams?.g_flAnimationFrame) || 0)) % cells;
    const texture = material.map.clone();
    texture.repeat.set(source.map.repeat.x / columns, source.map.repeat.y / rows);
    texture.offset.set((source.map.offset.x + frame % columns) / columns, (source.map.offset.y + rows - 1 - Math.floor(frame / columns)) / rows);
    material.map = texture;
    material.addEventListener('dispose', () => texture.dispose());
  }
  return material;
}

export function overlayFadeShader(mode) {
  // Modulation ignores source alpha in its blend factors. Fade towards the
  // neutral colour after output colour conversion, so opacity 0 leaves the
  // destination untouched (Mod2x neutral=.5, Multiply neutral=1).
  // 在输出色域中混向中性值，避免透明度为零仍把底层墙面乘暗或乘亮。
  if (mode === 3 || mode === 5) return `gl_FragColor.rgb = mix(vec3(${mode === 3 ? '0.5' : '1.0'}), gl_FragColor.rgb, clamp(diffuseColor.a, 0.0, 1.0));`;
  if (mode === 6) return 'gl_FragColor.rgb *= clamp(diffuseColor.a, 0.0, 1.0);';
  return '';
}
