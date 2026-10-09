// Normalizes wheel/trackpad gestures and wrapped middle-button camera drags.
import * as THREE from 'three';

export default function createCameraInputController({
  renderer,
  camera,
  controls,
  trackpadDetectionRef,
  wheelGestureRef,
  onCameraInterrupt,
  onManualInteraction,
  canEnableControls,
}) {
  const element = renderer.domElement;
  const cursor = document.createElement('i');
  cursor.className = 'wrapped-pan-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;

  const abortController = new AbortController();
  let attached = false;
  let dragActive = false;
  let wrappedDragRequested = false;
  let wrappedDragDenied = false;
  let wrappedDragActive = false;
  let wrappedDragX = 0;
  let wrappedDragY = 0;
  let dragGeneration = 0;
  let downEvent;
  const fallbackEvents = new WeakSet();

  const positionCursor = () => {
    cursor.style.transform = `translate(${wrappedDragX}px, ${wrappedDragY}px)`;
  };

  const endDrag = (exitPointerLock = true) => {
    const wasWrapped = wrappedDragActive || wrappedDragRequested;
    dragGeneration += 1;
    downEvent = null;
    dragActive = false;
    wrappedDragRequested = false;
    if (!wrappedDragActive) return wasWrapped;
    wrappedDragActive = false;
    cursor.hidden = true;
    element.style.cursor = '';
    if (exitPointerLock && document.pointerLockElement === element) document.exitPointerLock?.();
    if (canEnableControls()) controls.enabled = true;
    return wasWrapped;
  };

  const fallbackToNativeDrag = () => {
    wrappedDragRequested = false;
    wrappedDragDenied = true;
    const generation = dragGeneration;
    const saved = downEvent;
    // Replay only a still-held drag whose original OrbitControls down was
    // suppressed. Pointer Lock denial must leave ordinary navigation usable.
    // 申请失败时回交普通拖动；释放/切窗后的旧请求不能重新启动操作。
    queueMicrotask(() => {
      if (!dragActive || generation !== dragGeneration || !saved || wrappedDragActive) return;
      const event = new PointerEvent('pointerdown', { ...saved, bubbles: true });
      fallbackEvents.add(event);
      element.dispatchEvent(event);
    });
  };

  const beginDrag = (event) => {
    if (fallbackEvents.has(event)) return false;
    if (event.button !== 1 || event.pointerType === 'touch' || typeof element.requestPointerLock !== 'function') return false;
    dragActive = true;
    wrappedDragRequested = true;
    wrappedDragDenied = false;
    const generation = ++dragGeneration;
    downEvent = { pointerId: event.pointerId, pointerType: event.pointerType || 'mouse',
      button: 1, buttons: 4, clientX: event.clientX, clientY: event.clientY,
      shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
    const bounds = element.getBoundingClientRect();
    wrappedDragX = THREE.MathUtils.clamp(event.clientX - bounds.left, 0, Math.max(0, bounds.width - 1));
    wrappedDragY = THREE.MathUtils.clamp(event.clientY - bounds.top, 0, Math.max(0, bounds.height - 1));
    // Request within the trusted pointer-down activation, not a later edge move
    // after browser activation has expired. The virtual cursor wraps visually.
    // 中键按下即申请，避免拖到边缘时用户激活过期；虚拟指针负责跨边缘循环。
    try {
      element.requestPointerLock()?.catch?.(() => {
        if (generation === dragGeneration && wrappedDragRequested) fallbackToNativeDrag();
      });
    } catch { fallbackToNativeDrag(); }
    return true;
  };

  const continueDrag = (event) => {
    if (dragActive && !(event.buttons & 4)) endDrag();
    return wrappedDragActive || wrappedDragRequested;
  };

  const onWrappedDragMove = (event) => {
    if (!wrappedDragActive || document.pointerLockElement !== element) return;
    if (!(event.buttons & 4)) { endDrag(); return; }
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    wrappedDragX = ((wrappedDragX + event.movementX) % width + width) % width;
    wrappedDragY = ((wrappedDragY + event.movementY) % height + height) % height;
    positionCursor();
    onManualInteraction();
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (controls.enablePan) controls.pan(event.movementX * controls.panSpeed, event.movementY * controls.panSpeed);
    } else if (controls.enableRotate) {
      const radiansPerPixel = 2 * Math.PI * controls.rotateSpeed / height;
      controls.rotateLeft(event.movementX * radiansPerPixel);
      controls.rotateUp(event.movementY * radiansPerPixel);
    }
  };

  const onPointerLockChange = () => {
    if (wrappedDragRequested && dragActive && document.pointerLockElement === element) {
      wrappedDragRequested = false;
      wrappedDragActive = true;
      cursor.hidden = false;
      element.style.cursor = 'none';
      positionCursor();
      controls.enabled = false;
    } else if (!wrappedDragActive && document.pointerLockElement === element) {
      document.exitPointerLock?.();
    } else if (wrappedDragActive && document.pointerLockElement !== element) {
      endDrag(false);
    }
  };

  const onPointerLockError = () => {
    if (wrappedDragRequested && !wrappedDragDenied) fallbackToNativeDrag();
  };

  const onWheel = (event) => {
    event.stopImmediatePropagation();
    onCameraInterrupt();
    onManualInteraction();
    event.preventDefault();
    const deltaX = event.deltaX * (event.deltaMode === 1 ? 16 : 1);
    const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const gesture = wheelGestureRef.current;
    const now = performance.now();
    if (now - gesture.lastTime > 120) gesture.mode = null;
    gesture.lastTime = now;
    // Lock the gesture type briefly so one physical gesture cannot switch modes mid-stream.
    if (!gesture.mode) {
      if (!trackpadDetectionRef.current) gesture.mode = 'wheel';
      else if (event.ctrlKey) gesture.mode = 'pinch';
      else if (event.deltaMode === 0 && (Math.abs(deltaX) > 0 || magnitude < 40 || !Number.isInteger(magnitude))) gesture.mode = 'trackpad';
      else gesture.mode = 'wheel';
    }
    const isTrackpad = gesture.mode === 'trackpad';
    const isTrackpadPinch = gesture.mode === 'pinch';
    if (event.shiftKey && isTrackpad) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      const pan = right.multiplyScalar(deltaX).add(up.multiplyScalar(-deltaY)).multiplyScalar(offset.length() * 0.0015);
      camera.position.add(pan);
      controls.target.add(pan);
    } else if (event.ctrlKey || !isTrackpad) {
      const zoomSensitivity = isTrackpadPinch ? 0.0045 : 0.0015;
      const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(deltaY * zoomSensitivity), controls.minDistance, controls.maxDistance);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset);
    } else {
      spherical.theta += deltaX * 0.003;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaY * 0.003, 0.1, Math.PI * 0.49);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    }
    camera.lookAt(controls.target);
    controls.update();
  };

  const attach = (mount) => {
    if (attached) return;
    attached = true;
    mount.appendChild(cursor);
    // This controller owns wheel/trackpad input; OrbitControls owns touch zoom.
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    document.addEventListener('mousemove', onWrappedDragMove, { signal: abortController.signal });
    document.addEventListener('mouseup', (event) => { if (event.button === 1) endDrag(); }, { signal: abortController.signal });
    document.addEventListener('pointerlockchange', onPointerLockChange, { signal: abortController.signal });
    document.addEventListener('pointerlockerror', onPointerLockError, { signal: abortController.signal });
    window.addEventListener('blur', () => endDrag(), { signal: abortController.signal });
  };

  const dispose = () => {
    endDrag();
    abortController.abort();
    element.removeEventListener('wheel', onWheel, true);
    cursor.remove();
    attached = false;
  };

  return {
    attach,
    beginDrag,
    continueDrag,
    endDrag,
    dispose,
    get active() { return wrappedDragActive; },
  };
}
