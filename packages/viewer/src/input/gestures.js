// Shared wheel/trackpad and two-finger plan-view gestures. No host globals.
import * as THREE from 'three';
export default function createGestures({renderer,camera,controls,trackpadDetectionRef,wheelGestureRef,onCameraInterrupt,onManualInteraction,canEnableControls,wheelEnabled=true,touchEnabled=true,wheelMode='zoom',wheelSpeed=1,wheelInvert=false}) {
  const element=renderer.domElement, doc=element.ownerDocument;
  const abort=new doc.defaultView.AbortController();
  const touchPoints=new Map();let touchAngle,attached=false;
  const touchDown=event=>{if(event.pointerType==='touch')touchPoints.set(event.pointerId,[event.clientX,event.clientY]);};
  const touchMove=event=>{if(!touchPoints.has(event.pointerId)||!canEnableControls())return;touchPoints.set(event.pointerId,[event.clientX,event.clientY]);if(camera.planView&&touchPoints.size===2){const [a,b]=[...touchPoints.values()],angle=Math.atan2(b[1]-a[1],b[0]-a[0]);if(touchAngle!=null){onCameraInterrupt();onManualInteraction();camera.planRotation=(camera.planRotation||0)+Math.atan2(Math.sin(angle-touchAngle),Math.cos(angle-touchAngle));}touchAngle=angle;}};
  const touchUp=event=>{touchPoints.delete(event.pointerId);touchAngle=undefined;};
  const onWheel = (event) => {
    if (!canEnableControls()) return;
    event.stopImmediatePropagation();
    onCameraInterrupt();
    onManualInteraction();
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1,element.clientHeight) : 1;
    const rawX = event.deltaX * unit, rawY = event.deltaY * unit;
    const direction = wheelInvert ? -1 : 1;
    const deltaX = rawX * wheelSpeed * direction, deltaY = rawY * wheelSpeed * direction;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const magnitude = Math.max(Math.abs(rawX), Math.abs(rawY));
    const gesture = wheelGestureRef.current;
    const now = performance.now();
    if (now - gesture.lastTime > 120 || event.ctrlKey !== (gesture.mode === 'pinch')) gesture.mode = null;
    gesture.lastTime = now;
    // Lock the gesture type briefly so one physical gesture cannot switch modes mid-stream.
    if (!gesture.mode) {
      if (wheelMode === 'zoom') gesture.mode = event.ctrlKey ? 'pinch' : 'wheel';
      else if (wheelMode === 'trackpad') gesture.mode = event.ctrlKey ? 'pinch' : 'trackpad';
      else if (!trackpadDetectionRef.current) gesture.mode = 'wheel';
      else if (event.ctrlKey) gesture.mode = 'pinch';
      else if (event.deltaMode === 0 && (Math.abs(deltaX) > 0 || magnitude < 40 || !Number.isInteger(magnitude))) gesture.mode = 'trackpad';
      else gesture.mode = 'wheel';
    }
    const isTrackpad = gesture.mode === 'trackpad';
    const isTrackpadPinch = gesture.mode === 'pinch';
    if(camera.planView && event.altKey && wheelMode !== 'zoom') {
      camera.planRotation=(camera.planRotation || 0)+(deltaX || deltaY)*.003*controls.rotateSpeed;
    } else if (event.shiftKey && isTrackpad || camera.planView && isTrackpad && !event.ctrlKey) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      const pan = right.multiplyScalar(deltaX).add(up.multiplyScalar(-deltaY)).multiplyScalar(controls.panSpeed*(camera.planView ? camera.planSpan/camera.zoom/Math.max(1,element.clientHeight) : offset.length()*.0015));
      camera.position.add(pan);
      controls.target.add(pan);
    } else if (event.ctrlKey || !isTrackpad) {
      const zoomSensitivity = isTrackpadPinch ? 0.0045 : 0.0015;
      if(camera.planView){camera.zoom=THREE.MathUtils.clamp(camera.zoom*Math.exp(-deltaY*zoomSensitivity),.1,20);camera.updateProjectionMatrix();}
      else { const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(deltaY * zoomSensitivity), controls.minDistance, controls.maxDistance);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset); }
    } else {
      spherical.theta += deltaX * 0.003 * controls.rotateSpeed;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaY * 0.003 * controls.rotateSpeed, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    }
    camera.lookAt(controls.target);
    controls.update();
  };

  return { attach() {
    if(attached)return;attached=true;
    if(wheelEnabled)element.addEventListener('wheel',onWheel,{capture:true,passive:false,signal:abort.signal});
    if(touchEnabled){element.addEventListener('pointerdown',touchDown,{capture:true,signal:abort.signal});element.addEventListener('pointermove',touchMove,{capture:true,signal:abort.signal});element.addEventListener('pointerup',touchUp,{signal:abort.signal});element.addEventListener('pointercancel',touchUp,{signal:abort.signal});}
  }, dispose(){abort.abort();touchPoints.clear();} };
}
