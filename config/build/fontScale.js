// Convert only font sizes, preserving scene/viewports and all layout dimensions.
// 仅缩放字号，不修改地图画布、边栏宽度或操作区域的尺寸。
export function fontScalePlugin() {
  return {
    postcssPlugin: 'csboard-font-scale',
    Declaration(declaration) {
      if (!['font-size', 'font'].includes(declaration.prop) || declaration.value.includes('--ui-font-scale')) return;
      if (declaration.prop === 'font-size' && !/^\d+(?:\.\d+)?px$/.test(declaration.value)) return;
      declaration.value = declaration.value.replace(/\b(\d+(?:\.\d+)?)px\b/, 'calc($1px * var(--ui-font-scale, 1))');
    },
  };
}
