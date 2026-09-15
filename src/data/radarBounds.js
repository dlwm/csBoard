// Both the NAV image and its overlays must use the same square world extent.
export function squareRadarBounds(minX, maxX, minY, maxY) {
  const size = Math.max(maxX - minX, maxY - minY, .001);
  return {
    minX: (minX + maxX - size) / 2,
    minY: (minY + maxY - size) / 2,
    size,
  };
}
