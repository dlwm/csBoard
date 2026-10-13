// Canvas CSS pixels, bottom-left origin. Hosts may provide another layout.
// 主视图保留左侧空间；右侧使用一/两列，不依赖页面 DOM 或固定菜单。
export function createMonitorLayout(width, height, ids) {
  if (!(width >= 32 && height >= 8) || !ids.length) return null;
  const mainWidth = Math.max(1, width * .68 - 10), sideWidth = width - mainWidth - 10;
  const columns = ids.length <= 4 ? 1 : 2, rows = Math.ceil(ids.length / columns);
  const tileWidth = sideWidth / columns, tileHeight = height / rows;
  return { width, height, mainWidth, tiles: ids.map((id, index) => ({ id,
    x: mainWidth + 10 + index % columns * tileWidth, y: height - (Math.floor(index / columns) + 1) * tileHeight,
    width: Math.max(0, tileWidth - 4), height: Math.max(0, tileHeight - 4),
  })) };
}
