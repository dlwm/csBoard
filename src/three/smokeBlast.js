import * as THREE from 'three';
import { HE_SMOKE_CLEAR_SECONDS } from '../demo/effectLifetime.js';

const GAME_TO_SCENE = 0.0254;
// Visual smoke-clearing radius, not a published HE damage or smoke simulation constant.
export const HE_SMOKE_CLEAR_RADIUS = 4.0;

const smooth = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

export function activeSmokeBlasts(events, tick, tickRate = 64, modelCenter = { x: 0, y: 0, z: 0 }) {
  const rate = Number.isFinite(tickRate) && tickRate > 0 ? tickRate : 64;
  return events.filter((event) => event.event_name === 'hegrenade_detonate'
    && Number.isFinite(event.tick) && [event.x, event.y, event.z].every(Number.isFinite))
    .map((event) => {
      const age = (tick - event.tick) / rate;
      if (age < 0 || age >= HE_SMOKE_CLEAR_SECONDS) return null;
      return {
        key: `${event.tick}:${event.entityid ?? ''}:${event.x}:${event.y}:${event.z}`,
        x: event.y * GAME_TO_SCENE - modelCenter.x,
        y: event.z * GAME_TO_SCENE - modelCenter.y,
        z: event.x * GAME_TO_SCENE - modelCenter.z,
        radius: HE_SMOKE_CLEAR_RADIUS * smooth(age / 0.18),
        strength: age < 0.32 ? 1 : 1 - smooth((age - 0.32) / (HE_SMOKE_CLEAR_SECONDS - 0.32)),
      };
    }).filter(Boolean);
}

export function smokeBlastHasLineOfSight(blast, smokeCenter, collisionMeshes, raycaster) {
  if (!collisionMeshes?.length) return true;
  const origin = new THREE.Vector3(blast.x, blast.y + 0.15, blast.z);
  const direction = smokeCenter.clone().sub(origin);
  const distance = direction.length();
  if (distance < 0.5) return true;
  raycaster.set(origin, direction.multiplyScalar(1 / distance));
  raycaster.near = 0.15;
  raycaster.far = distance - 0.2;
  return raycaster.intersectObjects(collisionMeshes, false).length === 0;
}
