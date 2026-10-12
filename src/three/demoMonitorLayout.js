// Application DOM is a host layout adapter, not part of the rendering library.
export function createDemoMonitorLayout({ mount, renderer }) {
  const win = mount.ownerDocument?.defaultView || globalThis;
  let layout = null, layoutReadAt = 0, observedWall = null, wallResize = null, wallChanges = null;
  const invalidate = () => { layout = null; layoutReadAt = 0; };
  const invalidateLayout = invalidate;
  const stopObserving = () => { wallResize?.disconnect(); wallChanges?.disconnect(); wallResize = null; wallChanges = null; observedWall = null; };
  const read = now => {
    if (layout && now - layoutReadAt < 250) return layout;
    layoutReadAt = now;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const wall = mount.parentElement?.querySelector('.demo-monitor-wall');
    if (!wall || canvasRect.width <= 0 || canvasRect.height <= 0) return null;
    if (wall !== observedWall) {
      stopObserving(); observedWall = wall;
      if (win?.ResizeObserver) { wallResize = new win.ResizeObserver(invalidateLayout); wallResize.observe(wall); }
      if (win?.MutationObserver) {
        wallChanges = new win.MutationObserver(invalidateLayout);
        wallChanges.observe(wall, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-monitor-player-id'] });
      }
    }
    const wallRect = wall.getBoundingClientRect();
    const mainWidth = Math.max(1, Math.min(canvasRect.width, wallRect.left - canvasRect.left - 10));
    const tiles = [...wall.querySelectorAll('[data-monitor-player-id]')].map(element => {
      const rect = element.getBoundingClientRect();
      const left = Math.max(canvasRect.left, rect.left), right = Math.min(canvasRect.right, rect.right);
      const top = Math.max(canvasRect.top, rect.top), bottom = Math.min(canvasRect.bottom, rect.bottom);
      return { id: element.dataset.monitorPlayerId, x: left - canvasRect.left, y: canvasRect.bottom - bottom,
        width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }).filter(tile => tile.width >= 2 && tile.height >= 2);
    layout = { width: canvasRect.width, height: canvasRect.height, mainWidth, tiles };
    return layout;
  };

  return { read, invalidate, dispose() { stopObserving(); layout = null; } };
}
