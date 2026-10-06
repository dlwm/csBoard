import * as THREE from 'three';
import { ObjectBVH } from 'three-mesh-bvh';

const indices = new WeakMap();

// Geometry BVHs accelerate triangles; this outer index avoids testing every
// mesh for every player's aim ray. Bounds stay in the static map's local frame.
// 外层索引先筛选网格，内层 BVH 再检测三角形；模型整体平移不用重建。
export function registerMapCollisionIndex(objects, root = null) {
  indices.delete(objects);
  if (!objects.length || objects.some(object => object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh)) return;
  root?.updateMatrixWorld(true);
  for (const object of objects) object.updateWorldMatrix(true, false);
  try {
    const matrixWorld = root?.matrixWorld || new THREE.Matrix4();
    const tree = new ObjectBVH(objects, { matrixWorld, includeInstances: false });
    const state = { tree, root, objects: new Set(objects), ray: new THREE.Ray(), inverse: new THREE.Matrix4(), point: new THREE.Vector3(), hits: [], stats: { queries: 0, testedMeshes: 0 } };
    indices.set(objects, state);
    if (root) root.userData.collisionStats = state.stats;
  } catch (error) { console.info('Map collision uses individual meshes:', error.message); }
}

export function releaseMapCollisionIndex(objects) { indices.delete(objects); }

export function firstMapCollisionHit(objects, raycaster) {
  const state = indices.get(objects);
  if (!state) return raycaster.intersectObjects(objects, false)[0] || null;
  const { tree, root, ray, inverse, point, hits, stats } = state;
  root?.updateMatrixWorld();
  inverse.copy(tree.matrixWorld).invert();
  ray.copy(raycaster.ray).applyMatrix4(inverse);
  let closest = null, closestDistance = raycaster.far;
  const firstHitOnly = raycaster.firstHitOnly;
  raycaster.firstHitOnly = true;
  stats.queries++; stats.testedMeshes = 0;
  try {
    tree.shapecast({
      boundsTraverseOrder: box => box.distanceToPoint(ray.origin),
      intersectsBounds: box => {
        if (!ray.intersectBox(box, point)) return false;
        if (box.containsPoint(ray.origin)) return true;
        return point.applyMatrix4(tree.matrixWorld).distanceTo(raycaster.ray.origin) <= closestDistance;
      },
      intersectsObject: object => {
        if (!state.objects.has(object) || !object.layers.test(raycaster.layers)) return false;
        // Raycaster's existing collision path includes visually hidden meshes.
        // Do not use ObjectBVH.raycast(), which drops invisible objects.
        // 显隐只影响显示；隐藏网格仍保持碰撞，与现有 Raycaster 语义一致。
        hits.length = 0; stats.testedMeshes++;
        object.raycast(raycaster, hits);
        for (const hit of hits) if (hit.distance <= closestDistance) { closest = hit; closestDistance = hit.distance; }
        return false;
      },
    });
  } finally { raycaster.firstHitOnly = firstHitOnly; hits.length = 0; }
  return closest;
}
