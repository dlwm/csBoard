const gamePosition = point => ({ x: point.z / .0254, y: point.x / .0254, z: point.y / .0254 });

// Immediate, render-only preview for the existing Utility Notes focus controller.
// Sequence indices are not replay ticks. Saving always fetches recorded data.
// 快速预览仅用于展示，序号不是实际 tick；保存始终重新读取完整记录。
export function analysisUtilityPreviewNote(utility) {
  const start = gamePosition(utility.throwPosition), landing = gamePosition(utility.landing);
  return { id: `analysis-preview-${utility.id}`, grenadeType: utility.kind, position: [start.x, start.y, start.z],
    replay: { projectiles: utility.projectiles.map((point, index) => ({ ...gamePosition(point), tick: index })),
      events: [{ event_name: 'preview_landing', ...landing }] } };
}
