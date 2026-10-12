import * as THREE from 'three';
import { ViewerError } from '../core/controller.js';
import { directorCameraPose } from './directorCamera.js';

// One saved free camera survives director-mode changes. Missing events/targets
// hold the last view; seeks snap instead of flying through the map.
// 保存一次自由视角；缺少机位/人员时保留画面，跳转直接定位，避免穿图。
export function createDirectorCameraController({ camera, controls, readEvent, readPlayer, onState = () => {} }) {
  let mode = null, saved = null, status = 'idle', eventKey = null, previousTime = null, snap = true, disposed = false, playerId = null, reason = null;
  const state = () => ({ mode, status, eventKey, playerId, reason });
  const publish = (next, why = null) => { if (status === next && reason === why) return; status = next; reason = why; onState(state()); };
  const validate = next => {
    if (disposed) throw new ViewerError('disposed', 'Director is disposed');
    if (!['follow', 'fixed', 'chase'].includes(next)) throw new ViewerError('invalid_argument', 'Director mode must be follow, fixed or chase');
    if (camera.planView) throw new ViewerError('camera_mode', 'Switch to 3D before enabling the director');
  };
  const update = timestamp => {
    if (!mode || disposed) return false;
    const event = readEvent(mode), pose = directorCameraPose(event, event ? readPlayer(event.targetId) : null, event ? readPlayer(event.secondaryId) : null);
    const elapsed = Number.isFinite(timestamp) && previousTime != null ? Math.max(0, Math.min(.25, (timestamp - previousTime) / 1000)) : 0;
    if (Number.isFinite(timestamp)) previousTime = timestamp;
    if (!pose) { playerId = null; controls.enabled = false; publish('unavailable', event ? 'missing_target_or_pose' : 'missing_event'); return false; }
    const key = `${event.type}:${event.tick}`, changed = key !== eventKey;
    const inertia = THREE.MathUtils.clamp(Number.isFinite(event.inertia) ? event.inertia : 0, 0, 1);
    // 60 Hz legacy fractions converted to exponential time-based blending:
    // a(dt) = 1 - (1 - a60)^(dt * 60). 与刷新率无关的过渡。
    const blend = fraction => snap || status !== 'following' ? 1 : 1 - Math.pow(1 - fraction, elapsed * 60);
    camera.position.lerp(pose.position, blend(changed ? .1 : THREE.MathUtils.lerp(.22, .06, inertia)));
    controls.target.lerp(pose.target, blend(changed ? .13 : THREE.MathUtils.lerp(.28, .08, inertia)));
    camera.fov = THREE.MathUtils.lerp(camera.fov, pose.fov, blend(changed ? .12 : .2));
    camera.updateProjectionMatrix(); camera.lookAt(controls.target); camera.updateMatrixWorld(); controls.enabled = false;
    snap = false; eventKey = key; playerId = event.inEye ? event.targetId || null : null;
    if (status !== 'following') publish('following'); else if (changed) onState(state());
    return true;
  };
  const release = () => {
    if (!mode && !saved) return;
    if (saved) {
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.up.copy(saved.up);
      camera.fov = saved.fov; camera.zoom = saved.zoom; camera.far = saved.far;
      controls.target.copy(saved.target); controls.enabled = saved.enabled;
      camera.updateProjectionMatrix(); controls.update();
    }
    saved = null; mode = null; status = 'idle'; reason = null; playerId = null; eventKey = null; previousTime = null; snap = true; onState(state());
  };
  return Object.freeze({ getState: state, validate,
    start(next) {
      validate(next);
      if (!saved) saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov, zoom: camera.zoom, far: camera.far, target: controls.target.clone(), enabled: controls.enabled };
      mode = next; status = 'idle'; reason = null; playerId = null; snap = true; eventKey = null; previousTime = null; update();
    },
    invalidate() { snap = true; previousTime = null; }, update, release,
    dispose() { release(); disposed = true; },
  });
}
