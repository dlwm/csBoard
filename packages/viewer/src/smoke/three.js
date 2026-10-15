import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { registerMapCollisionIndex, releaseMapCollisionIndex, firstMapCollisionHit } from '../three/mapCollisionIndex.js';
import { isMapModelOverlay } from '../data/mapModelMaterials.js';
import { createSmokeVoxelVolume } from '../three/smokeVoxelVolume.js';
import { SmokePredictionError, smokeVoxelToSource } from './predict.js';

const ownedVolumes = new WeakSet();

// Snapshot static collision geometry; display visibility/material side must not
// change smoke physics. Never replace the caller's raycast, materials or BVH.
// 中文：独立碰撞快照，显示隐藏不等于墙消失；销毁只释放本适配器拥有的数据。
export function createSmokeCollisionWorld({ root, objects, sceneOrigin = [0,0,0], filter, maxTriangles = 2000000, maxBytes = 256*1024**2 } = {}) {
  const fail = message => { throw new SmokePredictionError('invalid_argument', message); };
  if ((!root?.isObject3D && !Array.isArray(objects)) || !Array.isArray(sceneOrigin) || sceneOrigin.length!==3 || !sceneOrigin.every(Number.isFinite)) fail('Provide a Three.js root or mesh array and finite sceneOrigin XYZ metres');
  if (objects != null && !Array.isArray(objects)) fail('objects must be an array of static meshes');
  if (root != null && !root.isObject3D) fail('root must be a Three.js Object3D');
  if (filter != null && typeof filter !== 'function') fail('filter must be a function');
  if (!Number.isSafeInteger(maxTriangles) || maxTriangles < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) fail('Collision budgets must be positive safe integers');
  sceneOrigin = [...sceneOrigin];
  const meshes=[];
  const collect = object => { if(object?.isMesh && !object.isBatchedMesh && !(Array.isArray(object.material)?object.material:[object.material]).every(isMapModelOverlay) && (!filter || filter(object))) meshes.push(object); };
  if (objects) objects.forEach(collect); else root.traverse(collect);
  const unique=[...new Set(meshes)], clones=new Map(), proxies=[], holder=new THREE.Group(), material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let disposed=false,triangles=0,bytes=0,raycasts=0;
  const check=()=>{if(disposed)throw new SmokePredictionError('disposed','Smoke collision world is disposed');};
  const dispose=()=>{if(disposed)return;disposed=true;releaseMapCollisionIndex(proxies);holder.clear();for(const geometry of clones.values()){geometry.boundsTree=null;geometry.dispose();}clones.clear();proxies.length=0;material.dispose();};
  try {
    for(const object of unique){
      if(object.isSkinnedMesh || object.isInstancedMesh || Object.keys(object.geometry?.morphAttributes || {}).length) fail('Smoke collision requires static meshes; supply a baked collision mesh or filter animated meshes');
      const source=object.geometry,position=source?.getAttribute('position');if(!position?.count)continue;
      if (position.itemSize !== 3) fail('Collision positions require three components');
      for (let i=0;i<position.count;i++) if (![position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite)) fail('Collision positions must be finite');
      const count=(source.index?.count ?? position.count)/3;
      if(!Number.isInteger(count))fail('Collision mesh requires complete triangles');
      triangles+=count;
      if(triangles>maxTriangles)throw new SmokePredictionError('budget_exceeded','Collision triangle budget exceeded',{maxTriangles});
      let geometry=clones.get(source);
      if(!geometry){
        // Include a conservative BVH allowance in the pre-allocation budget.
        const estimated=position.count*12+(source.index?.count || 0)*4+count*64;
        if(bytes+estimated>maxBytes)throw new SmokePredictionError('budget_exceeded','Collision memory budget exceeded',{maxBytes});
        bytes+=estimated;geometry=new THREE.BufferGeometry();clones.set(source,geometry);
        if(position.isInterleavedBufferAttribute){const packed=new Float32Array(position.count*3);for(let i=0;i<position.count;i++){packed[i*3]=position.getX(i);packed[i*3+1]=position.getY(i);packed[i*3+2]=position.getZ(i);}geometry.setAttribute('position',new THREE.BufferAttribute(packed,3));}
        else geometry.setAttribute('position',position.clone());
        if(source.index)geometry.setIndex(source.index.clone());
        geometry.boundsTree=new MeshBVH(geometry);
      }
      object.updateWorldMatrix(true,false);
      if(Math.abs(object.matrixWorld.determinant())<1e-12)fail('Collision mesh has a singular transform');
      const proxy=new THREE.Mesh(geometry,material);proxy.raycast=acceleratedRaycast;proxy.matrixAutoUpdate=false;proxy.matrix.copy(object.matrixWorld);holder.add(proxy);proxies.push(proxy);
    }
    if(!proxies.length)fail('No static collision triangles were supplied');
    holder.updateMatrixWorld(true);registerMapCollisionIndex(proxies,holder);
  }catch(error){dispose();throw error;}
  const fromScene=p=>new THREE.Vector3(p[1]*.0254-sceneOrigin[0],p[2]*.0254-sceneOrigin[1],p[0]*.0254-sceneOrigin[2]);
  const raycaster=new THREE.Raycaster();raycaster.firstHitOnly=true;
  const isBlocked=(from,to)=>{
    check();
    for(const p of [from,to])if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))fail('Collision positions must be finite Source XYZ inches');
    const start=fromScene(from),end=fromScene(to),direction=end.sub(start),length=direction.length();
    if(length<1e-8)return false;
    raycaster.set(start,direction.divideScalar(length));raycaster.near=1e-6;raycaster.far=length+1e-6;raycasts++;
    return Boolean(firstMapCollisionHit(proxies,raycaster));
  };
  return Object.freeze({ isBlocked,
    isCellBlocked(center,halfSize){check();if(!Number.isFinite(halfSize)||halfSize<=0)fail('Cell half-size must be positive');
      // Corners detect diagonal surfaces missed by axis-only probes. Inset by
      // 0.01 inch so touching a surface does not reject a whole adjacent cell.
      const h=Math.max(0,halfSize-.01);
      for(const x of [-h,h])for(const y of [-h,h])for(const z of [-h,h])if(isBlocked(center,[center[0]+x,center[1]+y,center[2]+z]))return true;
      return false;
    },
    getStats:()=>{check();return {meshes:proxies.length,triangles,estimatedBytes:bytes,raycasts};}, dispose,
  });
}
export function createPredictedSmokeVolume(prediction, sceneOrigin = [0,0,0]) {
  if(!prediction?.frame || !['predicted','illustrative'].includes(prediction.source) || !Array.isArray(sceneOrigin)||sceneOrigin.length!==3||!sceneOrigin.every(Number.isFinite)) throw new SmokePredictionError('invalid_argument','Provide a smoke prediction and scene origin in XYZ metres');
  const {frame}=prediction;
  if (!(frame.voxels instanceof Uint16Array) || frame.voxels.length > 8192) throw new SmokePredictionError('invalid_argument','Prediction voxels must be a Uint16Array with at most 8192 cells');
  // Validate before allocating GPU resources. 中文：GPU 分配前检查坐标及体素范围。
  smokeVoxelToSource(0, frame.origin);
  for (const voxel of frame.voxels) if (voxel > 32767) throw new SmokePredictionError('invalid_argument','Invalid packed smoke voxel');
  const volume=createSmokeVoxelVolume({...frame,seq:frame.sequence},new THREE.Vector3(...sceneOrigin));
  volume.userData.smokeSource=prediction.source;volume.userData.smokeAlgorithm=prediction.algorithm;
  ownedVolumes.add(volume);
  return volume;
}

// Only call on volumes created by createPredictedSmokeVolume; borrowed map
// geometry is never owned here. 中文：仅释放本工厂创建的烟体，重复调用安全。
export function disposePredictedSmokeVolume(volume) {
  if (!ownedVolumes.has(volume)) return;
  ownedVolumes.delete(volume);
  volume.removeFromParent();
  volume.traverse(object => {
    object.userData.smokeDensityTexture?.dispose();
    object.geometry?.dispose();
    object.material?.dispose();
  });
}
