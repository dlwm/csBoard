import * as THREE from 'three';
import { cs2AnglesToSceneDirection } from './playerCamera.js';

// All inputs are scene-local metres, except Source pitch/yaw in degrees.
// 场景米坐标；解析器距离/固定坐标在适配器转换，不传旧缓存字段。
export function directorCameraPose(event, target, secondary = null) {
  if (!event) return null;
  if (event.type === 'hltv_fixed') {
    if (!event.position?.every(Number.isFinite) || event.position.length !== 3) return null;
    const position = new THREE.Vector3(...event.position);
    return { position, target: position.clone().add(cs2AnglesToSceneDirection(event.pitch || 0, event.yaw || 0).multiplyScalar(8)), fov: THREE.MathUtils.clamp(event.fov || 55, 1, 179) };
  }
  if (event.type !== 'hltv_chase') return null;
  if (!target?.position?.every(Number.isFinite) || target.position.length !== 3) return null;
  const anchor = new THREE.Vector3(...target.position).add(new THREE.Vector3(0, 1.1, 0));
  if (event.inEye) {
    if (!Number.isFinite(target.pitch) || !Number.isFinite(target.yaw)) return null;
    const position = anchor.clone().add(new THREE.Vector3(0, .5 - (target.crouchAmount || 0) * .34, 0));
    return { position, target: position.clone().add(cs2AnglesToSceneDirection(target.pitch, target.yaw).multiplyScalar(8)), fov: target.scoped ? 35 : 68 };
  }
  const other = secondary?.position?.length === 3 && secondary.position.every(Number.isFinite) ? new THREE.Vector3(...secondary.position).add(new THREE.Vector3(0, 1.1, 0)) : null;
  const focus = other ? anchor.clone().lerp(other, .5) : anchor;
  const direction = other?.clone().sub(anchor), pairDistance = other ? anchor.distanceTo(other) : 0;
  const baseYaw = direction?.lengthSq() ? Math.atan2(direction.x, direction.z) : THREE.MathUtils.degToRad(target.yaw || 0);
  const yaw = baseYaw + THREE.MathUtils.degToRad(event.yaw || 0);
  const distance = Math.max(2.4, event.distanceMetres || 112 * .0254, pairDistance * 1.15);
  const height = Math.sin(THREE.MathUtils.degToRad(event.pitch ?? 20)) * distance;
  return { position: focus.clone().add(new THREE.Vector3(-Math.sin(yaw) * distance, Math.max(.8, height), -Math.cos(yaw) * distance)), target: focus, fov: THREE.MathUtils.clamp(48 + pairDistance * 1.3, 48, 72) };
}
