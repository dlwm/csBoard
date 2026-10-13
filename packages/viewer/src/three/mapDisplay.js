import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { bindMapObjectVisibility } from './mapObjectVisibility.js';
import { createMapMaterialRuntime } from './staticMapRuntime.js';
import { createStaticMapBatches } from './staticMapBatches.js';
import { isMapModelOverlay } from '../data/mapModelMaterials.js';

// One initialization pipeline for host and standalone maps. Resource leases
// own final disposal; this controller owns display/batching state only.
// 应用与独立视图共用初始化；最终资源释放属于租约，显示控制器不重复释放模型。
export function createMapDisplayController({ gltf, renderer, createMaterial, copyBudget = 64 * 1024 ** 2 }) {
  const root = gltf.scene, objects = bindMapObjectVisibility(gltf), collisions = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    if (!object.geometry.boundsTree && object.geometry.getAttribute('position')?.count >= 3) object.geometry.boundsTree = new MeshBVH(object.geometry);
    object.raycast = acceleratedRaycast; collisions.push(object); object.frustumCulled = true;
    object.renderOrder = (Array.isArray(object.material) ? object.material : [object.material]).some(isMapModelOverlay) ? 4 : 3;
    if (object.material) object.userData.sourceMapMaterial = object.material;
  });
  const materials = createMapMaterialRuntime(root, createMaterial), batches = createStaticMapBatches(root, renderer, copyBudget);
  materials.apply(); batches.rebuild();
  root.userData.disposeRenderBatches = batches.clear;
  return Object.freeze({ objects, collisions, batches,
    setObjects(ids, visible, signature) { objects.setVisible(ids, visible, signature); batches.syncVisibility(); },
    setOpacity(value) { root.traverse(object => { for (const material of [].concat(object.material || [])) material.opacity = value; }); },
  });
}
