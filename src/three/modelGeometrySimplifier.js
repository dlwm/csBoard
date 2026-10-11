import * as THREE from 'three';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// Compact only referenced vertices, then use meshoptimizer's error-bounded
// edge collapse. Lock open borders so neighbouring building parts do not crack.
// 仅压缩实际引用顶点；用误差受限的边折叠简化，锁定开放边界，避免建筑破洞。
export async function simplifyDisplayGeometry(original,{cell,ratio=.25,valid=()=>true,onProgress=()=>{},yieldControl=pause}) {
  const position=original.attributes.position;
  if(!position || Object.keys(original.morphAttributes).length || !MeshoptSimplifier.supported)return null;
  await MeshoptSimplifier.ready;if(!valid())return null;
  const index=original.index,total=index?.count ?? position.count,start=original.drawRange.start,end=Math.min(total,start+original.drawRange.count);
  const groups=original.groups.length ? original.groups : [{start:0,count:total,materialIndex:0}];
  const ids=new Map(),representatives=[],bounds=new THREE.Box3(),point=new THREE.Vector3();let scanned=0;
  for(const group of groups)for(let i=Math.max(start,group.start);i<Math.min(end,group.start+group.count);i++) {
    if(scanned%32768===0){onProgress(.25*i/Math.max(1,total));await yieldControl();if(!valid())return null;}scanned++;
    const vertex=index?index.getX(i):i;
    if(!ids.has(vertex)){ids.set(vertex,representatives.length);representatives.push(vertex);bounds.expandByPoint(point.fromBufferAttribute(position,vertex));}
  }
  // Fine decoration may disappear, but large open walls retain their borders.
  if(Math.max(...bounds.getSize(new THREE.Vector3()).toArray())<cell*.25)return false;
  const positions=new Float32Array(representatives.length*3);
  for(let i=0;i<representatives.length;i++){
    if(i%8192===0){await yieldControl();if(!valid())return null;}
    const vertex=representatives[i];positions[i*3]=position.getX(vertex);positions[i*3+1]=position.getY(vertex);positions[i*3+2]=position.getZ(vertex);
  }
  const output=[],resultGroups=[];let processed=0;
  for(const group of groups) {
    const from=Math.max(start,group.start),to=Math.min(end,group.start+group.count),source=new Uint32Array(Math.max(0,Math.floor((to-from)/3)*3));
    for(let i=0;i<source.length;i++)source[i]=ids.get(index?index.getX(from+i):from+i);
    if(!source.length)continue;
    await yieldControl();if(!valid())return null;
    const target=Math.max(3,Math.floor(source.length/3*ratio)*3);
    const [simplified]=MeshoptSimplifier.simplify(source,positions,3,target,cell*.2,['LockBorder','ErrorAbsolute','Prune']);
    const offset=output.length;for(const vertex of simplified)output.push(vertex);
    if(output.length>offset)resultGroups.push({start:offset,count:output.length-offset,materialIndex:group.materialIndex});
    processed+=source.length;onProgress(.3+.65*processed/Math.max(1,end-start));
  }
  if(!output.length)return false;
  const used=new Map(),vertices=[];
  for(let i=0;i<output.length;i++){const old=output[i];if(!used.has(old)){used.set(old,vertices.length);vertices.push(old);}output[i]=used.get(old);}
  const geometry=new THREE.BufferGeometry(),compacted=new Float32Array(vertices.length*3);
  for(let i=0;i<vertices.length;i++)for(let j=0;j<3;j++)compacted[i*3+j]=positions[vertices[i]*3+j];
  geometry.setAttribute('position',new THREE.BufferAttribute(compacted,3));geometry.setIndex(output);
  for(const [name,attribute] of Object.entries(original.attributes)) {
    if(['position','normal','tangent','skinIndex','skinWeight'].includes(name) || attribute.itemSize>4)continue;
    const array=new Float32Array(vertices.length*attribute.itemSize),getters=['getX','getY','getZ','getW'];
    for(let i=0;i<vertices.length;i++)for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute[getters[j]](representatives[vertices[i]]);
    geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize));
  }
  if(original.groups.length)for(const group of resultGroups)geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();onProgress(1);return geometry;
}
