import * as THREE from 'three';

// Keep a single camera identity for commands, raycasters and camera persistence,
// but switch to a genuine orthographic projection for the plan view. OrbitControls
// uses the standard camera flags and frustum to pan/zoom without perspective.
// 相机引用保持稳定；二维模式采用正交投影，操控、拾取和机位共用同一相机。
export class BoardCamera extends THREE.PerspectiveCamera {
  setPlanView(enabled, span = 30) {
    if (enabled === Boolean(this.planView)) return;
    this.planView = enabled;
    this.isPerspectiveCamera = !enabled;
    this.isOrthographicCamera = enabled;
    this.zoom = 1;
    if (enabled) { this.planSpan = Math.max(1, span); this.planRotation=0; }
    this.updateProjectionMatrix();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.planView = Boolean(source.planView); this.planSpan = source.planSpan;
    this.isPerspectiveCamera = !this.planView; this.isOrthographicCamera = this.planView;
    if (this.planView) { this.left = source.left; this.right = source.right; this.top = source.top; this.bottom = source.bottom; }
    return this;
  }
  updateProjectionMatrix() {
    if (!this.planView) { super.updateProjectionMatrix(); return; }
    const half = this.planSpan / 2;
    this.left = -half * this.aspect; this.right = half * this.aspect;
    this.top = half; this.bottom = -half;
    this.projectionMatrix.makeOrthographic(this.left / this.zoom, this.right / this.zoom, this.top / this.zoom, this.bottom / this.zoom, this.near, this.far, this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

export function createBoardProjectionController(camera, controls, getPlanFrame = null) {
  let saved;
  let originalRotate, originalMiddle, originalTouch;
  return {
    reset(){if(!camera.planView)return false;const frame=getPlanFrame?.();if(frame?.target)controls.target.copy(frame.target);if(frame?.span)camera.planSpan=frame.span;camera.zoom=1;camera.planRotation=0;camera.updateProjectionMatrix();return true;},
    update(planView) {
      if (planView && !camera.planView) {
        originalRotate = controls.enableRotate; originalMiddle = controls.mouseButtons.MIDDLE; originalTouch = controls.touches.ONE;
        saved = { position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(), fov: camera.fov, far:camera.far, zoom:camera.zoom };
        const frame=getPlanFrame?.();
        const span=frame?.span || 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        if(frame?.target)controls.target.copy(frame.target);
        camera.setPlanView(true, span);
        camera.up.set(1, 0, 0);
        camera.planAltitude=Math.max(60,span*2);
        camera.position.copy(controls.target).add(new THREE.Vector3(0,camera.planAltitude,0));
        camera.far = Math.max(camera.far, span * 4 + 100);
        controls.enableRotate = false; controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN; controls.touches.ONE = THREE.TOUCH.PAN;
      } else if (!planView && camera.planView) {
        camera.setPlanView(false);
        camera.position.copy(saved.position); camera.up.copy(saved.up); camera.fov = saved.fov;camera.far=saved.far;camera.zoom=saved.zoom;
        controls.target.copy(saved.target); controls.enableRotate = originalRotate; controls.mouseButtons.MIDDLE = originalMiddle; controls.touches.ONE = originalTouch;
        camera.updateProjectionMatrix(); controls.update();
      }
      if (camera.planView) { camera.up.set(Math.cos(camera.planRotation || 0), 0, Math.sin(camera.planRotation || 0)); camera.zoom=THREE.MathUtils.clamp(camera.zoom,.1,20);camera.position.set(controls.target.x,controls.target.y+camera.planAltitude,controls.target.z); camera.lookAt(controls.target); camera.updateMatrixWorld(); }
    },
  };
}
