// Shared by mobile H5 and native WebViews. VisualViewport tracks the keyboard
// and browser chrome without disabling browser zoom or changing shell features.
export function installMobileViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = null;
  const update = () => {
    frame = null;
    // Pinch zoom should magnify the workspace, rather than reflow it.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    root.style.setProperty('--mobile-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
  };
  const schedule = () => {
    if (frame == null) frame = requestAnimationFrame(update);
  };
  update();
  window.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  return () => {
    if (frame != null) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    root.style.removeProperty('--mobile-viewport-height');
  };
}
