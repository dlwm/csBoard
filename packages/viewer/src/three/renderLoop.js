// Presentation is an injected host port, not Electron/Capacitor/global app state.
export function createRenderLoop(render, { presentation, document: doc = globalThis.document,
  requestFrame = callback => globalThis.requestAnimationFrame(callback), cancelFrame = id => globalThis.cancelAnimationFrame(id) } = {}) {
  let frame = null, stopped = false, nativeVisible = true, revision = 0;
  const visible = () => !doc?.hidden && nativeVisible;
  const tick = now => {
    frame = null;
    if (stopped || !visible()) return;
    frame = requestFrame(tick); render(now);
  };
  const update = () => {
    if (stopped) return;
    if (!visible() && frame != null) { cancelFrame(frame); frame = null; }
    else if (visible() && frame == null) frame = requestFrame(tick);
  };
  const unsubscribe = presentation?.subscribe(value => { revision++; nativeVisible = value; update(); });
  presentation?.current().then(value => { if (!revision) { nativeVisible = value; update(); } }).catch(() => {});
  doc?.addEventListener('visibilitychange', update); update();
  return () => { stopped = true; if (frame != null) cancelFrame(frame); unsubscribe?.(); doc?.removeEventListener('visibilitychange', update); };
}
