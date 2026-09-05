// Normalizes wheel/trackpad gestures and Shift+middle-button wrapped panning.
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
  let nativePanActive = false;
  let wrappedPanRequested = false;
  let wrappedPanDenied = false;
  let wrappedPanActive = false;
  let wrappedPanX = 0;
  let wrappedPanY = 0;

  const positionCursor = () => {
    cursor.style.transform = `translate(${wrappedPanX}px, ${wrappedPanY}px)`;
  };

  const endPan = (exitPointerLock = true) => {
    const wasWrapped = wrappedPanActive;
    nativePanActive = false;
    wrappedPanRequested = false;
    if (!wrappedPanActive) return wasWrapped;
    wrappedPanActive = false;
    cursor.hidden = true;
    element.style.cursor = '';
    if (exitPointerLock && document.pointerLockElement === element) document.exitPointerLock?.();
    if (canEnableControls()) controls.enabled = true;
    return wasWrapped;
  };

  const requestWrappedPan = (event) => {
    if (!nativePanActive || wrappedPanRequested || wrappedPanDenied || wrappedPanActive) return;
    const bounds = element.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const edge = 1;
    const atLeft = localX <= edge;
    const atRight = localX >= bounds.width - edge;
    const atTop = localY <= edge;
    const atBottom = localY >= bounds.height - edge;
    if (!atLeft && !atRight && !atTop && !atBottom) return;
    wrappedPanX = atLeft ? Math.max(0, bounds.width - 2) : atRight ? 1 : THREE.MathUtils.clamp(localX, 0, Math.max(0, bounds.width - 1));
    wrappedPanY = atTop ? Math.max(0, bounds.height - 2) : atBottom ? 1 : THREE.MathUtils.clamp(localY, 0, Math.max(0, bounds.height - 1));
    wrappedPanRequested = true;
    // Pointer Lock keeps receiving motion after the cursor reaches a viewport edge.
    try {
      const request = element.requestPointerLock();
      request?.catch?.(() => {
        wrappedPanRequested = false;
        wrappedPanDenied = true;
      });
    } catch {
      wrappedPanRequested = false;
      wrappedPanDenied = true;
    }
  };

  const beginPan = (event) => {
    nativePanActive = event.shiftKey && typeof element.requestPointerLock === 'function';
    wrappedPanRequested = false;
    wrappedPanDenied = false;
    if (nativePanActive) requestWrappedPan(event);
  };

  const continuePan = (event) => {
    if (nativePanActive && !(event.buttons & 4)) endPan();
    else if (nativePanActive) requestWrappedPan(event);
    return wrappedPanActive;
  };

  const onWrappedPanMove = (event) => {
    if (!wrappedPanActive || document.pointerLockElement !== element) return;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    wrappedPanX = (wrappedPanX + event.movementX + width) % width;
    wrappedPanY = (wrappedPanY + event.movementY + height) % height;
    positionCursor();
    const distance = camera.position.distanceTo(controls.target);
    const scale = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / height;
    camera.updateMatrix();
    const pan = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-event.movementX * scale);
    pan.add(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(event.movementY * scale));
    camera.position.add(pan);
    controls.target.add(pan);
    camera.lookAt(controls.target);
    controls.update();
  };

  const onPointerLockChange = () => {
    if (wrappedPanRequested && nativePanActive && document.pointerLockElement === element) {
      wrappedPanRequested = false;
      wrappedPanActive = true;
      cursor.hidden = false;
      element.style.cursor = 'none';
      positionCursor();
      controls.enabled = false;
    } else if (!wrappedPanActive && document.pointerLockElement === element) {
      document.exitPointerLock?.();
    } else if (wrappedPanActive && document.pointerLockElement !== element) {
      endPan(false);
    }
  };

  const onPointerLockError = () => {
    wrappedPanRequested = false;
    wrappedPanDenied = true;
  };

  const onWheel = (event) => {
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
    element.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mousemove', onWrappedPanMove, { signal: abortController.signal });
    document.addEventListener('mouseup', (event) => { if (event.button === 1) endPan(); }, { signal: abortController.signal });
    document.addEventListener('pointerlockchange', onPointerLockChange, { signal: abortController.signal });
    document.addEventListener('pointerlockerror', onPointerLockError, { signal: abortController.signal });
  };

  const dispose = () => {
    endPan();
    abortController.abort();
    element.removeEventListener('wheel', onWheel);
    cursor.remove();
    attached = false;
  };

  return {
    attach,
    beginPan,
    continuePan,
    endPan,
    dispose,
    get active() { return wrappedPanActive; },
  };
}
