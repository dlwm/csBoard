import * as THREE from 'three';
import createDemoGrenadeSceneController from './demoGrenadeSceneController.js';
import { groupDemoProjectiles } from '../data/grenades.js';

// Neutral track bridge into the same effect controller used by CSBoard.
// 来源扩展字段由宿主解码注入；库不理解 CSBoard 的存储标签或 JSON 编码。
export function createReplayEffects({ scene, navData, nav, origin, readProducerFields = () => ({}), getCollisionMeshes = () => [nav.mesh], getCollisionVersion = () => 0, floorState = new THREE.Vector4(0, 0, 0, 0) }) {
  const ref = value => ({ current: value });
  const refs = { tick: ref(0), segments: ref([]), grenades: ref([]), smokeVoxelFrames: ref([]), infernoFrames: ref([]), projectileGroups: ref(new Map()), display: ref({ effects: true, trajectories: true }), source: ref({ tickRate: 64 }) };
  const controller = createDemoGrenadeSceneController({ scene, navData, refs, floorFadeRef: ref(floorState), getModelCenter: () => origin, getNav: () => nav, getCollisionMeshes, getCollisionVersion });
  return {
    setTracks(tracks, { tickRate }) {
      controller.dispose(); refs.source.current = { tickRate };
      refs.grenades.current = (tracks.events || []).map(row => {
        const attributes = readProducerFields(row.producerFields) || {};
        return { ...attributes, event_name: row.type, tick: row.tick, entityid: row.entityId ?? attributes.entityid,
          ...(row.position ? { x: row.position[0], y: row.position[1], z: row.position[2] } : {}) };
      });
      refs.smokeVoxelFrames.current = (tracks.smokeFrames || []).map(row => ({ tick: row.tick, entityId: row.entityId, origin: row.origin, seq: row.sequence, voxels: row.voxels }));
      refs.infernoFrames.current = (tracks.fireFrames || []).map(row => ({ tick: row.tick, entityId: row.entityId, seq: row.sequence, lifetime: row.lifetime, cells: row.cells }));
      refs.projectileGroups.current = groupDemoProjectiles((tracks.projectiles || []).filter(row => row.position).map(row => ({ ...readProducerFields(row.producerFields), tick: row.tick, entity_id: row.entityId, grenade_type: row.type, x: row.position[0], y: row.position[1], z: row.position[2] })));
    },
    update(tick) { refs.tick.current = tick; controller.update(); },
    setDisplay(value) { refs.display.current = { ...refs.display.current, ...value }; },
    getDisplay() { return { ...refs.display.current }; },
    getCounts() { let smoke = 0, fire = 0, trajectories = 0, other = 0; for (const key of controller.objects.keys()) { if (key.startsWith('smoke-voxels')) smoke++; else if (key.startsWith('inferno-cells')) fire++; else if (key.startsWith('projectile')) trajectories++; else other++; } return { smoke, fire, trajectories, other }; },
    dispose: controller.dispose,
  };
}
