import * as THREE from 'three';
import { ViewerError } from '../core/controller.js';

// Scene-local metres, Source pitch/yaw in degrees. No parser-specific fields.
// 输入为场景米坐标与 Source 角度；缺少视角数据时不编造朝向。
export function cs2AnglesToSceneDirection(pitch = 0, yaw = 0) {
  const p = THREE.MathUtils.degToRad(pitch), y = THREE.MathUtils.degToRad(yaw);
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)).normalize();
}
const validPose = pose => Array.isArray(pose?.position) && pose.position.length === 3 && pose.position.every(Number.isFinite) && Number.isFinite(pose.pitch) && Number.isFinite(pose.yaw);

export function applyPlayerCamera(camera, pose, { target = new THREE.Vector3(), aspect = camera.aspect, far = camera.far, scoped = pose?.scoped === true } = {}) {
  if (!validPose(pose)) throw new ViewerError('missing_view', 'Player camera requires position, pitch and yaw');
  const crouch = Math.max(0, Math.min(1, Number.isFinite(pose.crouchAmount) ? pose.crouchAmount : 0));
  camera.position.fromArray(pose.position); camera.position.y += 1.62 - crouch * .34;
  target.copy(camera.position).add(cs2AnglesToSceneDirection(pose.pitch, pose.yaw).multiplyScalar(8));
  camera.fov = scoped ? 35 : 68; camera.aspect = aspect; camera.far = far;
  camera.updateProjectionMatrix(); camera.lookAt(target); camera.updateMatrixWorld();
  return target;
}

export function createPlayerCameraController({ camera, controls, readPose, onState = () => {} }) {
  let saved = null, playerId = null, status = 'idle';
  const state = () => ({ playerId, status });
  const publish = next => { if (next === status) return; status = next; onState(state()); };
  const update = () => {
    if (!playerId) return false;
    const pose = readPose(playerId);
    if (!validPose(pose) || pose.alive === false) { publish('unavailable'); return false; }
    applyPlayerCamera(camera, pose, { target: controls.target }); controls.enabled = false; publish('following'); return true;
  };
  const release = () => {
    if (!saved && !playerId) return;
    if (saved) {
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.up.copy(saved.up);
      camera.fov = saved.fov; camera.zoom = saved.zoom; camera.far = saved.far;
      controls.target.copy(saved.target); controls.enabled = saved.enabled;
      camera.updateProjectionMatrix(); controls.update();
    }
    saved = null; playerId = null; status = 'idle'; onState(state());
  };
  const validate = id => {
      if (typeof id !== 'string' || !id) throw new ViewerError('invalid_argument', 'Player ID is required');
      const pose = readPose(id);
      if (!pose || pose.alive === false) throw new ViewerError('unavailable_player', 'Player is unavailable in the current frame');
      if (!validPose(pose)) throw new ViewerError('missing_view', 'Player position or view angles are unavailable');
      if (camera.planView) throw new ViewerError('camera_mode', 'Switch to 3D before following a player');
  };
  return Object.freeze({
    getState: state, validate,
    follow(id) {
      validate(id);
      if (!saved) saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov, zoom: camera.zoom, far: camera.far, target: controls.target.clone(), enabled: controls.enabled };
      playerId = id; status = 'idle'; update();
    },
    update, release,
    dispose() { saved = null; playerId = null; status = 'idle'; },
  });
}
