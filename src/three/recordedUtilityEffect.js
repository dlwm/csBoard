import * as THREE from 'three';
import { grenadeKind } from '../demo/grenades.js';
import { createGrenadeEffect } from './grenadeEffects.js';
import { createSmokeVoxelVolume, SMOKE_VOLUME_SCALE } from './smokeVoxelVolume.js';
import { createInfernoEffect, updateInfernoEffect } from './infernoEffect.js';
import { enableObjectFloorFade } from './floorFade.js';

// Static previews reuse the same voxel/fire factories as replay. Never replace
// missing recorded smoke/fire volumes with an invented shape in an overview.
// 静态展示复用回放的烟体素和火焰工厂；总览不以默认形状冒充缺失的记录。
export function createRecordedUtilityEffect(note, { modelCenter, nav, navData, floorFade, requireRecordedVolumes = false }) {
  const kind = grenadeKind(note.grenadeType);
  const latest = frames => frames?.filter(frame => frame?.voxels?.length || frame?.cells?.length).reduce((last, frame) => !last || frame.tick > last.tick ? frame : last, null);
  const smoke = kind === 'smoke' && latest(note.replay?.smokeVoxelFrames);
  const fire = kind === 'fire' && latest(note.replay?.infernoFrames);
  const landing = note.replay?.events?.find(event => event.event_name !== 'grenade_thrown' && event.tick === note.replay.effectTick && [event.x, event.y, event.z].every(Number.isFinite));
  let effect;
  if (smoke) {
    effect = createSmokeVoxelVolume({ ...smoke, voxels: Uint16Array.from(smoke.voxels) }, modelCenter);
    effect.scale.setScalar(SMOKE_VOLUME_SCALE);
  } else if (fire) {
    effect = createInfernoEffect({ ...fire, cells: Float32Array.from(fire.cells) }, modelCenter, nav);
    updateInfernoEffect(effect, fire.tick);
  } else {
    if (!landing || (requireRecordedVolumes && ['smoke', 'fire'].includes(kind))) return null;
    const position = new THREE.Vector3(landing.y * .0254 - modelCenter.x, landing.z * .0254 - modelCenter.y, landing.x * .0254 - modelCenter.z);
    effect = createGrenadeEffect(position, kind === 'he' ? 'explosion' : kind, navData, nav);
  }
  if (floorFade) enableObjectFloorFade(effect, floorFade);
  return effect;
}
