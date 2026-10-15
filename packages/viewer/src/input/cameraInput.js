import * as THREE from 'three';
import { ViewerError } from '../core/controller.js';
import createGestures from './gestures.js';

// Presets are explicit. Custom maps never inherit omitted actions.
// 中文：自定义绑定不补齐默认键；省略或传 null 即关闭该动作。
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const CAMERA_INPUT_PRESETS = freeze({
  csboard: { rotate: { button: 1 }, pan: [{ button: 1, keys: ['ShiftLeft', 'ShiftRight'] }, { button: 2 }],
    forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', fast: ['ShiftLeft', 'ShiftRight'], zoom: true, touch: true, wrap: true, wheelMode: 'zoom' },
  orbit: { rotate: { button: 0 }, pan: [{ button: 0, keys: ['ShiftLeft', 'ShiftRight'] }, { button: 2 }], zoom: true, touch: true, wheelMode: 'zoom' },
});
const actions = ['forward', 'backward', 'left', 'right', 'up', 'down', 'fast'];
const allowed = [...actions, 'rotate', 'pan', 'zoom', 'touch', 'wrap', 'speed', 'fastSpeed', 'keyboardScope', 'wheelMode', 'wheelSpeed', 'wheelInvert', 'rotateSpeed', 'panSpeed', 'minPolarAngle', 'maxPolarAngle'];
const codes = value => value == null ? [] : Array.isArray(value) ? value : [value];
export function resolveCameraInput(value = 'orbit') {
  const config = typeof value === 'string' ? CAMERA_INPUT_PRESETS[value] : value === false ? {} : value;
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !allowed.includes(key))) throw new ViewerError('invalid_argument', 'Invalid camera input configuration');
  const result = { ...config };
  for (const key of actions) if (codes(result[key]).some(code => typeof code !== 'string' || !code)) throw new ViewerError('invalid_argument', `${key} must use KeyboardEvent.code strings`);
  for (const action of ['rotate', 'pan']) for (const binding of codes(result[action])) {
    if (!binding || typeof binding !== 'object' || ![0, 1, 2].includes(binding.button) || Object.keys(binding).some(key => !['button', 'keys'].includes(key)) || codes(binding.keys).some(key => typeof key !== 'string' || !key)) throw new ViewerError('invalid_argument', `${action} requires a mouse button (0/1/2) and optional key codes`);
  }
  for (const key of ['zoom', 'touch', 'wrap', 'wheelInvert']) if (result[key] != null && typeof result[key] !== 'boolean') throw new ViewerError('invalid_argument', `${key} must be boolean`);
  for (const key of ['speed', 'fastSpeed', 'wheelSpeed', 'rotateSpeed', 'panSpeed']) if (result[key] != null && (!Number.isFinite(result[key]) || result[key] <= 0)) throw new ViewerError('invalid_argument', `${key} must be positive`);
  if (result.wheelMode != null && !['zoom', 'auto', 'trackpad'].includes(result.wheelMode)) throw new ViewerError('invalid_argument', 'wheelMode must be zoom, auto or trackpad');
  const minimum = result.minPolarAngle ?? 0, maximum = result.maxPolarAngle ?? Math.PI * .49;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum > Math.PI || minimum >= maximum) throw new ViewerError('invalid_argument', 'Polar angles require 0 <= minPolarAngle < maxPolarAngle <= PI (radians)');
  if (result.keyboardScope != null && !['viewport', 'window'].includes(result.keyboardScope)) throw new ViewerError('invalid_argument', 'keyboardScope must be viewport or window');
  return structuredClone(result);
}

export function createCameraInputController({ renderer, camera, controls, bindings = 'orbit',
  trackpadDetectionRef = { current: true }, wheelGestureRef = { current: { lastTime: 0, mode: null } },
  onCameraInterrupt = () => {}, onManualInteraction = () => {}, canEnableControls = () => controls.enabled } = {}) {
  const config = resolveCameraInput(bindings), element = renderer.domElement;
  const doc = element.ownerDocument, win = doc.defaultView;
  const abort = new win.AbortController(), pressed = new Set();
  const cursor = doc.createElement('i'); cursor.setAttribute('aria-hidden', 'true'); cursor.hidden = true;
  Object.assign(cursor.style, { position: 'absolute', pointerEvents: 'none', width: '8px', height: '8px', border: '1px solid currentColor', borderRadius: '50%', left: '0', top: '0', zIndex: '5' });
  const oldMouse = { ...controls.mouseButtons }, oldTouch = { ...controls.touches };
  const oldZoom = controls.enableZoom, oldEnabled = controls.enabled, oldTouchAction = element.style.touchAction, oldTabIndex = element.getAttribute('tabindex');
  const oldSpeeds = { rotateSpeed: controls.rotateSpeed, panSpeed: controls.panSpeed, minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle };
  controls.mouseButtons.LEFT = controls.mouseButtons.MIDDLE = controls.mouseButtons.RIGHT = null;
  controls.touches.ONE = config.touch ? THREE.TOUCH.ROTATE : null;
  controls.touches.TWO = config.touch ? THREE.TOUCH.DOLLY_PAN : null;
  controls.enableZoom = Boolean(config.zoom);
  for (const key of ['rotateSpeed', 'panSpeed']) if (config[key] != null) controls[key] = config[key];
  controls.minPolarAngle = config.minPolarAngle ?? 0;
  controls.maxPolarAngle = config.maxPolarAngle ?? Math.PI * .49;
  if (!config.touch) element.style.touchAction = 'auto';
  if (!codes(config.rotate).length && !codes(config.pan).length && !config.zoom && !config.touch && !actions.some(action => codes(config[action]).length)) controls.enabled = false;
  if (actions.some(action => codes(config[action]).length) && oldTabIndex == null) element.tabIndex = 0;
  // Hardware detection is opt-in. A smooth mouse wheel must not unexpectedly
  // become orbit/pan; disabling input must leave host scrolling available.
  // 中文：设备推断仅显式启用，平滑鼠标滚轮不自动变成旋转，禁用不抢宿主滚动。
  const gestures = createGestures({ renderer, camera, controls, trackpadDetectionRef, wheelGestureRef,
    onCameraInterrupt, onManualInteraction, canEnableControls, wheelEnabled: Boolean(config.zoom), touchEnabled: Boolean(config.touch),
    wheelMode: config.wheelMode ?? 'zoom', wheelSpeed: config.wheelSpeed ?? 1, wheelInvert: config.wheelInvert ?? false });
  let drag = null, lastTime = null, attached = false, disposed = false;
  const editable = target => target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]');
  const has = action => codes(config[action]).some(code => pressed.has(code));
  const modifier = (code, event) => pressed.has(code) || (code.startsWith('Shift') && event.shiftKey) || (code.startsWith('Control') && event.ctrlKey) || (code.startsWith('Alt') && event.altKey) || (code.startsWith('Meta') && event.metaKey);
  const match = (action, event) => codes(config[action]).find(binding => binding.button === event.button && (!codes(binding.keys).length || codes(binding.keys).some(code => modifier(code, event))));
  const interact = () => { onCameraInterrupt(); onManualInteraction(); };
  const endDrag = () => { const active = Boolean(drag); if (drag?.locked && doc.pointerLockElement === element) doc.exitPointerLock?.(); if (drag && element.hasPointerCapture?.(drag.pointerId)) element.releasePointerCapture(drag.pointerId); cursor.hidden = true; drag = null; return active; };
  const beginDrag = event => {
    if (disposed || event.pointerType === 'touch' || !canEnableControls()) return false;
    if (drag) return true;
    const action = match('pan', event) ? 'pan' : match('rotate', event) ? 'rotate' : null;
    if (!action || (action === 'pan' && !controls.enablePan) || (action === 'rotate' && !camera.planView && !controls.enableRotate)) return false;
    interact(); element.focus({ preventScroll: true });
    drag = { action, button: event.button, x: event.clientX, y: event.clientY, pointerId: event.pointerId, locked: false, cursorX: event.clientX - element.getBoundingClientRect().left, cursorY: event.clientY - element.getBoundingClientRect().top };
    element.setPointerCapture?.(event.pointerId);
    if (config.wrap && element.requestPointerLock) {
      const pending = drag;
      try { Promise.resolve(element.requestPointerLock()).then(() => { if ((disposed || drag !== pending) && doc.pointerLockElement === element) doc.exitPointerLock?.(); }).catch(() => { if (drag === pending) drag.locked = false; }); } catch { /* Native captured dragging remains usable. */ }
    }
    return true;
  };
  const move = event => {
    if (!drag) return;
    const mask = [1, 4, 2][drag.button]; if (!(event.buttons & mask)) { endDrag(); return; }
    const dx = drag.locked ? event.movementX : event.clientX - drag.x;
    const dy = drag.locked ? event.movementY : event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.locked) {
      const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
      drag.cursorX = ((drag.cursorX + dx) % width + width) % width; drag.cursorY = ((drag.cursorY + dy) % height + height) % height;
      cursor.style.transform = `translate(${drag.cursorX}px, ${drag.cursorY}px)`; cursor.hidden = false;
    }
    if (!canEnableControls()) { endDrag(); return; }
    const current = { ...event, button: drag.button, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey };
    const action = match('pan', current) ? 'pan' : match('rotate', current) ? 'rotate' : null;
    if (!action) return;
    onManualInteraction();
    if (action === 'pan') controls.pan(dx * controls.panSpeed * (camera.planView ? element.clientWidth / Math.max(1, camera.userData.planViewportWidth || element.clientWidth) : 1), dy * controls.panSpeed);
    else if (camera.planView) camera.planRotation = (camera.planRotation || 0) + dx * .006 * controls.rotateSpeed;
    else { const scale = 2 * Math.PI * controls.rotateSpeed / Math.max(1, element.clientHeight); controls.rotateLeft(dx * scale); controls.rotateUp(dy * scale); }
    controls.update();
  };
  const clear = () => { pressed.clear(); endDrag(); lastTime = null; };
  const attach = (mount = element.parentElement) => {
    if (attached || disposed) return; attached = true; mount.appendChild(cursor); gestures.attach(mount);
    const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });
    listen(element, 'pointerdown', event => { if (beginDrag(event)) { event.preventDefault(); } }, { capture: true });
    listen(doc, 'pointermove', move);
    listen(doc, 'pointerup', endDrag); listen(doc, 'pointercancel', endDrag);
    listen(element, 'contextmenu', event => { if (codes(config.pan).concat(codes(config.rotate)).some(binding => binding.button === 2)) event.preventDefault(); });
    listen(doc, 'pointerlockchange', () => { if (doc.pointerLockElement === element && drag) drag.locked = true; else if (drag?.locked) endDrag(); else if (doc.pointerLockElement === element) doc.exitPointerLock?.(); });
    listen(win, 'keydown', event => {
      if (editable(event.target) || !canEnableControls()) return;
      // Preserve host/browser shortcuts such as Ctrl+W, even with WASD enabled.
      if ((event.ctrlKey || event.metaKey || event.altKey) && !/^(Control|Meta|Alt)/.test(event.code)) return;
      if (config.keyboardScope !== 'window' && doc.activeElement !== element && doc.pointerLockElement !== element) return;
      const used = actions.some(action => codes(config[action]).includes(event.code)) || ['rotate', 'pan'].some(action => codes(config[action]).some(binding => codes(binding.keys).includes(event.code)));
      if (used) { pressed.add(event.code); event.preventDefault(); }
    });
    listen(win, 'keyup', event => pressed.delete(event.code)); listen(win, 'blur', clear);
    listen(doc, 'focusin', event => { if (editable(event.target)) pressed.clear(); });
    listen(doc, 'visibilitychange', () => { if (doc.hidden) clear(); });
    listen(element, 'blur', () => { if (config.keyboardScope !== 'window') pressed.clear(); });
  };
  const update = now => {
    const elapsed = lastTime == null ? 0 : Math.max(0, Math.min((now - lastTime) / 1000, .05)); lastTime = now;
    if (!canEnableControls()) { pressed.clear(); return; }
    const forward = new THREE.Vector3(); if (camera.planView) forward.copy(camera.up); else camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = forward.multiplyScalar(Number(has('forward')) - Number(has('backward'))).add(right.multiplyScalar(Number(has('right')) - Number(has('left'))));
    movement.y += Number(has('up')) - Number(has('down'));
    if (!movement.lengthSq() || !elapsed) return;
    interact(); movement.normalize().multiplyScalar(elapsed * (has('fast') ? config.fastSpeed ?? 51 : config.speed ?? 18) / (camera.planView ? camera.zoom : 1));
    camera.position.add(movement); controls.target.add(movement);
  };
  return { attach, update, beginDrag, continueDrag: () => Boolean(drag), endDrag,
    get active() { return Boolean(drag); },
    dispose() { if (disposed) return; clear(); disposed = true; abort.abort(); gestures.dispose(); cursor.remove(); Object.assign(controls.mouseButtons, oldMouse); Object.assign(controls.touches, oldTouch); Object.assign(controls, oldSpeeds); controls.enableZoom = oldZoom; controls.enabled = oldEnabled; element.style.touchAction = oldTouchAction; if (oldTabIndex == null) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', oldTabIndex); },
  };
}
