// DOM-only overlay; no React, Three.js, assets or application globals.
// 独立 DOM 展示层：不拦截输入、不参与辅助技术焦点、不注册全局样式。
export const COMBAT_OVERLAY_THEME = Object.freeze({
  hurtBackground: 'radial-gradient(ellipse at center,transparent 0 72%,rgba(255,38,32,.08) 80%,rgba(190,12,10,.72) 100%)',
  hurtShadow: 'inset 0 0 42px rgba(255,28,22,.78)',
  flashBackground: 'radial-gradient(circle at center,rgba(105,109,108,.08) 0 9%,rgba(112,116,115,.35) 18%,rgba(132,136,135,.88) 52%,#a6aaa9 100%)',
  flashShadow: 'inset 0 0 110px rgba(135,139,138,.9)',
});
export function createCombatOverlay({ container, theme = {}, zIndex = 90 } = {}) {
  if (!container?.ownerDocument || !container.appendChild) throw new TypeError('Overlay container is required');
  if (!Number.isFinite(zIndex)) throw new TypeError('Overlay zIndex must be finite');
  const doc = container.ownerDocument, root = doc.createElement('div');
  root.className = 'csboard-viewer-combat-overlay'; root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: String(zIndex), overflow: 'hidden' });
  const colors = { ...COMBAT_OVERLAY_THEME, ...theme }, layers = {};
  for (const [name, order] of [['hurt', 0], ['flash', 1]]) {
    const layer = doc.createElement('div'); layer.dataset.combatLayer = name;
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: String(order), display: 'none', opacity: '0', background: colors[name + 'Background'], boxShadow: colors[name + 'Shadow'] });
    layers[name] = layer; root.append(layer);
  }
  container.appendChild(root);
  let disposed = false, lastState = null, rectKey = null;
  return Object.freeze({
    update(state) {
      if (disposed) return;
      lastState = { ...state };
      for (const name of ['hurt', 'flash']) {
        const opacity = state.active && Number.isFinite(state[name + 'Opacity']) ? Math.max(0, Math.min(1, state[name + 'Opacity'])) : 0;
        const text = String(opacity), layer = layers[name];
        if (layer.style.opacity !== text) layer.style.opacity = text;
        const display = opacity > 0 ? 'block' : 'none'; if (layer.style.display !== display) layer.style.display = display;
      }
    },
    setViewport(rect = null) {
      if (disposed) return;
      if (rect && ['left', 'top', 'width', 'height'].some(key => !Number.isFinite(rect[key]) || rect[key] < 0)) throw new TypeError('Overlay viewport must have nonnegative finite CSS coordinates');
      const key = JSON.stringify(rect); if (key === rectKey) return; rectKey = key;
      Object.assign(root.style, rect ? { inset: 'auto', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' }
        : { inset: '0', width: '', height: '' });
    },
    getState() { return lastState ? { ...lastState } : null; },
    dispose() { if (disposed) return; disposed = true; root.remove(); lastState = null; },
  });
}
