import { simplifyDisplayGeometry } from './modelGeometrySimplifier.js';
import * as THREE from 'three';

const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const triangles=geometry=>Math.floor((geometry.index?.count ?? geometry.attributes.position?.count ?? 0)/3);

// Experimental display geometry only. Preserve originals for restoration and
// raycasting; reuse the normal map batching/visibility lifecycle.
// 试验仅改变显示网格；原始几何保留用于恢复与碰撞，不写入资源包。
export function createModelSimplification(root,batches,restoreVisibility) {
  const records=[]; let generation=0,disposed=false,inFlight=0,lastYield=performance.now();
  const cache=new Map(),cachedGeometries=new Set();
  const CACHE_LIMIT=64*1024**2;
  const cooperate=async()=>{if(performance.now()-lastYield>=8){await pause();lastYield=performance.now();}};
  root.updateMatrixWorld(true);
  root.traverse(object=>{
    if(!object.geometry?.attributes.position?.count || !object.isMesh || object.isBatchedMesh || object.isInstancedMesh || object.isSkinnedMesh) return;
    const original=object.geometry,raycast=object.raycast;
    const bounds=new THREE.Box3();
    if(original.boundsTree?.getBoundingBox) original.boundsTree.getBoundingBox(bounds);
    else {
      const position=original.attributes.position,index=original.index,end=Math.min(index?.count ?? position.count,original.drawRange.start+original.drawRange.count),point=new THREE.Vector3();
      for(let i=original.drawRange.start;i<end;i++)bounds.expandByPoint(point.fromBufferAttribute(position,index?index.getX(i):i));
    }
    // Global shared accessors also give tiny props whole-map bounding spheres.
    // Use referenced geometry bounds so ordinary frustum culling works again.
    // 共享顶点池的全地图包围体不能用于小道具；按真实索引修正裁剪包围体。
    original.boundingBox=bounds.clone();original.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
    const record={object,original,raycast,originalVisible:object.visible,variant:null,hiddenBySimplify:false}; records.push(record);
    object.raycast=function(...args){const displayed=this.geometry;this.geometry=original;try{return raycast.apply(this,args);}finally{this.geometry=displayed;}};
  });
  const applyHidden=()=>{for(const record of records)if(record.hiddenBySimplify)record.object.visible=false;};
  const resetVisibility=()=>{for(const record of records)record.object.visible=record.originalVisible;restoreVisibility?.();};
  const entryBytes=entry=>entry.variants.reduce((sum,geometry)=>sum+(geometry ? [...Object.values(geometry.attributes),geometry.index].filter(Boolean).reduce((bytes,attribute)=>bytes+attribute.array.byteLength,0) : 0),0);
  function trimCache(current) {
    // Keep at most three camera qualities, with a 64 MiB cache budget. The active
    // result remains usable even when it alone exceeds the cache allowance.
    // 最多保留三种视角结果，缓存预算 64 MiB；当前模型结果不能被提前释放。
    let bytes=[...cache.values()].reduce((sum,entry)=>sum+entryBytes(entry),0);
    for(const [amount,entry] of cache)if(amount!==current && (cache.size>3 || bytes>CACHE_LIMIT)) {
      cache.delete(amount);bytes-=entryBytes(entry);for(const geometry of new Set(entry.variants)){cachedGeometries.delete(geometry);geometry?.dispose?.();}
    }
  }
  const restore=record=>{record.object.geometry=record.original;if(record.variant && !cachedGeometries.has(record.variant))record.variant.dispose();record.variant=null;record.hiddenBySimplify=false;};
  async function simplify(record,amount,valid,onProgress) {
    // Slider 0..100 requests up to 95% fewer triangles and allows at most
    // 0.4 metres of error. Lock mesh borders; retain original collision geometry.
    // 滑块越大简化越强：最多请求减少 95% 面数，误差上限 0.4 米；边界锁定。
    const cell=amount/100*2/Math.max(.0001,...record.object.getWorldScale(new THREE.Vector3()).toArray().map(Math.abs));
    return simplifyDisplayGeometry(record.original,{cell,ratio:Math.max(.05,1-amount/100*.95),valid,onProgress,yieldControl:cooperate});
  }
  return {
    applyHidden,
    cancel(){generation++;batches.clear();for(const record of records)restore(record);resetVisibility();},
    get busy(){return inFlight>0;},
    async apply(next={},onProgress=()=>{}) {
      inFlight++;
      try {
      const token=++generation,valid=()=>!disposed && generation===token;
      const requested={simplify:Math.max(0,Math.min(100,Number(next.simplify)||0))};batches.clear();for(const record of records)record.hiddenBySimplify=false;resetVisibility();applyHidden();
      const total=records.reduce((sum,record)=>sum+(record.original.index?.count ?? record.original.attributes.position.count),0);let completed=0,lastProgress=0,lastPercent=-1;
      // Throttle UI updates, including per-object completion, so thousands of
      // tiny meshes do not trigger thousands of workspace renders.
      // 对象完成也要限频，避免小网格导致整个工作区频繁重渲染。
      const report=(fraction=0,record=null)=>{const now=performance.now();if(now-lastProgress<60 && completed<total)return;
        const percent=Math.round((completed+(record ? record.original.index?.count ?? record.original.attributes.position.count : 0)*fraction)/Math.max(1,total)*100);
        if(percent===lastPercent)return;lastPercent=percent;lastProgress=now;onProgress({percent});};
      const cached=cache.get(requested.simplify);
      if(cached){cache.delete(requested.simplify);cache.set(requested.simplify,cached);}
      for(const [index,record] of records.entries()) {
        if(!valid())return {cancelled:true};
        const geometry=cached ? cached.variants[index] : requested.simplify>0 ? await simplify(record,requested.simplify,valid,fraction=>report(fraction,record)) : null;
        if(!valid()){if(!cached)geometry?.dispose?.();return {cancelled:true};}
        restore(record);
        if(geometry===false){record.hiddenBySimplify=true;record.object.visible=false;}
        else if(geometry){record.variant=geometry;record.object.geometry=geometry;}
        completed+=(record.original.index?.count ?? record.original.attributes.position.count);report(1);
        await cooperate();
      }
      if(requested.simplify>0 && !cached){const variants=records.map(record=>record.hiddenBySimplify ? false : record.variant);cache.set(requested.simplify,{variants});for(const geometry of variants)if(geometry)cachedGeometries.add(geometry);}
      trimCache(requested.simplify);resetVisibility();applyHidden();batches.rebuild();
      return {objects:records.length,visible:records.filter(record=>record.object.visible).length,simplified:records.filter(record=>record.variant || record.hiddenBySimplify).length,before:records.reduce((n,r)=>n+triangles(r.original),0),after:records.filter(r=>r.object.visible).reduce((n,r)=>n+triangles(r.object.geometry),0)};
      } finally {inFlight--;}
    },
    dispose(){disposed=true;generation++;batches.clear();for(const record of records){restore(record);record.object.raycast=record.raycast;}for(const entry of cache.values())for(const geometry of new Set(entry.variants)){cachedGeometries.delete(geometry);geometry?.dispose?.();}cache.clear();}
  };
}
