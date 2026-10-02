// Route per pointer, never per device: an attached mouse keeps its usual controls.
// One finger edits a hit object or rotates empty space; two fingers navigate.
export function createTouchInputController({ element, down, move, up, cancel, editing }) {
  const touches = new Map();
  let navigating = false, seedingCamera = false;
  const pointerDown = event => {
    if (seedingCamera) return;
    if (event.pointerType !== 'touch') { down(event); return; }
    touches.set(event.pointerId, event);
    if (touches.size > 1) {
      navigating = true;
      if (editing()) {
        const first = [...touches.values()].find(value => value.pointerId !== event.pointerId);
        // Complete the single-finger edit with its undo entry before navigation.
        up(new PointerEvent('pointerup', { pointerId: first.pointerId, pointerType: 'touch', button: 0, clientX: first.clientX, clientY: first.clientY }));
        // Editing prevented OrbitControls from tracking the first finger.
        seedingCamera = true;
        try { element.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: first.pointerId, pointerType: 'touch', button: 0, buttons: 1,
          clientX: first.clientX, clientY: first.clientY, bubbles: true,
        })); } finally { seedingCamera = false; }
      }
      return;
    }
    if (!navigating) {
      down(event);
      // Touch has no hover: expose marker previews at the initial contact.
      if (!editing()) move(event);
    }
  };
  const pointerMove = event => {
    if (event.pointerType !== 'touch') { move(event); return; }
    if (touches.has(event.pointerId)) touches.set(event.pointerId, event);
    if (!navigating && touches.size === 1 && editing()) move(event);
  };
  const pointerUp = event => {
    if (event.pointerType !== 'touch') { up(event); return; }
    if (!navigating) up(event);
    touches.delete(event.pointerId);
    if (!touches.size) navigating = false;
  };
  const pointerCancel = event => {
    touches.delete(event.pointerId);
    if (!touches.size) navigating = false;
    cancel();
  };
  return { pointerDown, pointerMove, pointerUp, pointerCancel };
}
