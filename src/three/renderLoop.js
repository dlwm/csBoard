import { getHost } from '../platform/index.js';

// Native visibility matters when backgroundThrottling is disabled: Chromium's
// document visibility alone need not reflect minimization on every platform.
export function startRenderLoop(render) {
  const presentation = getHost().presentation;
  let frame = null, stopped = false, nativeVisible = true, revision = 0;
  const visible = () => !document.hidden && nativeVisible;
  const tick = now => {
    frame = null;
    if (stopped || !visible()) return;
    frame = requestAnimationFrame(tick);
    render(now);
  };
  const update = () => {
    if (stopped) return;
    if (!visible() && frame != null) { cancelAnimationFrame(frame); frame = null; }
    else if (visible() && frame == null) frame = requestAnimationFrame(tick);
  };
  const unsubscribe = presentation?.subscribe(value => { revision++; nativeVisible = value; update(); });
  presentation?.current().then(value => { if (!revision) { nativeVisible = value; update(); } }).catch(() => {});
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
    stopped = true;
    if (frame != null) cancelAnimationFrame(frame);
    unsubscribe?.(); document.removeEventListener('visibilitychange', update);
  };
}
