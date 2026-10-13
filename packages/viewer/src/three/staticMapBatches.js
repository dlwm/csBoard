import * as THREE from 'three';
import { createBatchGeometryCache } from './batchGeometry.js';

const MIN_BATCH_OBJECTS = 6;
const MAX_BATCH_OBJECTS = 256;
const MAX_BATCH_COPY_BYTES = 8 * 1024 ** 2;
const MAX_GEOMETRY_VERTICES = 32768;
const DEFAULT_COPY_BUDGET = 64 * 1024 ** 2;

function geometryLayout(geometry) {
  return `${Boolean(geometry.index)}:${Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attribute]) =>
    `${name}:${attribute.itemSize}:${attribute.normalized}:${(attribute.array || attribute.data.array).constructor.name}`).join('|')}`;
}
function geometryBytes(geometry) {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.count * attribute.itemSize * (attribute.array || attribute.data.array).BYTES_PER_ELEMENT, 0)
    + (geometry.index?.count || 0) * 4;
}
function objectVisible(object, root) {
  for (let current = object; current && current !== root; current = current.parent) if (!current.visible) return false;
  return true;
}

// Multi-draw batches reduce submission cost without reducing map geometry.
// Original meshes remain available for collision and object-tree visibility;
// invisible material clones prevent their duplicate drawing, not raycasting.
// 按材质和顶点格式合批，不简化模型。原网格保留碰撞和显隐语义，仅停止重复绘制。
// Bound extra copied geometry memory; fall back for unsupported drivers,
// mirrored/animated meshes, transparency, custom draw ranges and small groups.
export function createStaticMapBatches(root, renderer, copyBudget = DEFAULT_COPY_BUDGET) {
  const batches = [], bindings = [], invisibleMaterials = new Set();
  const supported = renderer.extensions.has('WEBGL_multi_draw');
  const clear = () => {
    for (const { object, material } of bindings) object.material = material;
    for (const batch of batches) { root.remove(batch); batch.dispose(); }
    for (const material of invisibleMaterials) material.dispose();
    batches.length = 0; bindings.length = 0; invisibleMaterials.clear();
    root.userData.renderStats = { ...root.userData.renderStats, multiDraw: supported, batchedMeshes: 0, batches: 0, batchCopiedBytes: 0 };
  };
  const syncVisibility = () => {
    for (const { object, batch, instance } of bindings) batch.setVisibleAt(instance, objectVisible(object, root));
  };
  return {
    clear, syncVisibility,
    rebuild() {
      clear();
      if (!supported) return;
      root.updateMatrixWorld(true);
      const inverse = root.matrixWorld.clone().invert(), relative = new THREE.Matrix4();
      const batchGeometry = createBatchGeometryCache();
      const groups = new Map();
      root.traverse(object => {
        const geometry = object.geometry, material = object.material;
        if (!object.userData.sourceMapMaterial || !object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || Array.isArray(material)
          || object.layers.mask !== 1 || material.visible === false || material.transparent || material.transmission > 0 || Object.keys(geometry.morphAttributes).length
          || geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
          || geometry.getAttribute('position').count > MAX_GEOMETRY_VERTICES) return;
        relative.multiplyMatrices(inverse, object.matrixWorld);
        if (relative.determinant() <= 0) return;
        const displayGeometry = batchGeometry(geometry, material);
        const key = `${material.id}:${geometryLayout(displayGeometry)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ object, geometry: displayGeometry, matrix: relative.clone() });
      });
      const candidates = [];
      for (const objects of groups.values()) {
        // Small meshes first: an oversized group must not consume the whole
        // map's budget or prevent many cheaper objects from being batched.
        objects.sort((a, b) => geometryBytes(a.geometry) - geometryBytes(b.geometry));
        let entries = [], geometries = new Set(), bytes = 0;
        const flush = () => {
          if (entries.length >= MIN_BATCH_OBJECTS) candidates.push({ entries, geometries: [...geometries], bytes });
          entries = []; geometries = new Set(); bytes = 0;
        };
        for (const entry of objects) {
          const geometry = entry.geometry;
          const addedBytes = (geometries.has(geometry) ? 0 : geometryBytes(geometry)) + 128;
          if (entries.length && (entries.length >= MAX_BATCH_OBJECTS || bytes + addedBytes > MAX_BATCH_COPY_BYTES)) flush();
          bytes += (geometries.has(geometry) ? 0 : geometryBytes(geometry)) + 128;
          entries.push(entry); geometries.add(geometry);
        }
        flush();
      }
      // Spend the copy budget on groups that eliminate the most submissions per byte.
      // 优先处理单位内存收益最高的小物件，避免再复制一份完整的大地图。
      candidates.sort((a, b) => b.entries.length / b.bytes - a.entries.length / a.bytes);
      let copiedBytes = 0;
      const invisibleCache = new Map();
      for (const { entries, geometries, bytes } of candidates) {
        if (copiedBytes + bytes > copyBudget) continue;
        const vertices = geometries.reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0);
        const indices = geometries.reduce((sum, geometry) => sum + (geometry.index?.count || 0), 0);
        const material = entries[0].object.material;
        const batch = new THREE.BatchedMesh(entries.length, vertices, indices, material);
        batch.name = 'csboard_map_batch'; batch.renderOrder = entries[0].object.renderOrder;
        batch.frustumCulled = false; batch.perObjectFrustumCulled = true;
        try {
          const ids = new Map(geometries.map(geometry => [geometry, batch.addGeometry(geometry)]));
          const groupBindings = entries.map(({ object, geometry, matrix }) => {
            const instance = batch.addInstance(ids.get(geometry));
            batch.setMatrixAt(instance, matrix); batch.setVisibleAt(instance, objectVisible(object, root));
            return { object, material, batch, instance };
          });
          if (!invisibleCache.has(material)) { const hidden = material.clone(); hidden.visible = false; invisibleCache.set(material, hidden); invisibleMaterials.add(hidden); }
          for (const { object } of groupBindings) object.material = invisibleCache.get(material);
          bindings.push(...groupBindings); batches.push(batch); root.add(batch);
          batch.updateMatrix(); batch.matrixAutoUpdate = false;
          // A style change can happen after the static transform cache is installed.
          batch.updateWorldMatrix(true, false);
          copiedBytes += bytes;
        } catch (error) {
          batch.dispose();
          console.info('Map batch uses individual meshes:', error.message);
        }
      }
      root.userData.renderStats = { ...root.userData.renderStats, batchedMeshes: bindings.length, batches: batches.length, batchCopiedBytes: copiedBytes };
    },
  };
}
