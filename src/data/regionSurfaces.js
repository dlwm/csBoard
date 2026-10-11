import polygonClipping from 'polygon-clipping';
import * as THREE from 'three';
import { clipToVolume, groundHeight, insideVolume } from './placeGeometry.js';

// Nearly coincident clip intersections can form cyclic sweep predecessors in
// polygon-clipping. Normalize geometry before union rather than patching the
// library or changing its recursion limit. Units below are Source units.
// 裁切浮点误差会产生近重合边与零面积碎片；合并前规整坐标，避免扫描线循环。
const FOOTPRINT_PRECISIONS = [.001, .01, .1];
function normalizedFootprints(polygons, precision) {
  const keys = new Set(), result = [];
  for (const polygon of polygons) {
    const ring = [];
    for (const point of polygon[0]) {
      if (!point.every(Number.isFinite)) continue;
      const next = point.map(value => Math.round(value / precision) * precision);
      if (!ring.length || next.some((value, i) => value !== ring.at(-1)[i])) ring.push(next);
    }
    if (ring.length > 1 && ring[0].every((value, i) => value === ring.at(-1)[i])) ring.pop();
    const area = ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (ring.length < 3 || Math.abs(area) <= precision * precision) continue;
    if (area < 0) ring.reverse();
    // Same footprint at multiple height probes only needs to participate once.
    const first = ring.reduce((best, point, i) => point[0] < ring[best][0] || (point[0] === ring[best][0] && point[1] < ring[best][1]) ? i : best, 0);
    const ordered = [...ring.slice(first), ...ring.slice(0, first)], key = JSON.stringify(ordered);
    if (keys.has(key)) continue;
    keys.add(key); result.push([ordered]);
  }
  return result;
}
function unionFootprints(polygons) {
  let lastError;
  for (const precision of FOOTPRINT_PRECISIONS) {
    const normalized = normalizedFootprints(polygons, precision);
    if (!normalized.length) return [];
    try { return polygonClipping.union(...normalized); }
    catch (error) { lastError = error; }
  }
  // Retain real clipped surfaces if an unusual union still fails. Never bridge
  // disconnected terrain or let display geometry crash the workspace.
  // 极端情况保留各个有效地面片段，不跨空隙补面，也不让显示计算中断工作区。
  console.warn('Map footprint union failed; retaining individual surfaces:', lastError.message);
  return normalizedFootprints(polygons, FOOTPRINT_PRECISIONS[0]).map(polygon => polygon.map(ring => [...ring, ring[0]]));
}

// Preserve the terrain-clipped shape, including concavities and real holes.
// 包点/购买区保留真实不规则轮廓；只合并地面分块，不取凸包或完整体积截面。
export function triggerRegionSurfaces(region, areas, spawns=[]) {
  if(!region.volumes?.length) {
    const ids=new Set(region.areaIds);
    return areas.filter(area=>ids.has(area.area_id)).map(area=>Object.assign(area.corners.map(p=>[p.x,p.y,p.z]),{areaId:area.area_id}));
  }
  let volumes=region.volumes;
  if(region.kind==='buyzone') volumes=competitiveBuyVolumes(volumes,spawns.filter(p=>p.team===region.team),areas);
  const result=[];
  // A NAV quad can be non-planar. Clip its real triangles, not an imaginary
  // flat quad; retain the original per-triangle height when drawing the fill.
  // NAV 四边形可能不共面；按实际三角面裁切，避免迷城薄触发区和坡面失真。
  for(const area of areas) for(let i=1;i<area.corners.length-1;i++) {
    const corners=[area.corners[0],area.corners[i],area.corners[i+1]];
    const triangle={corners},pieces=[];
    for(const volume of volumes) for(const hull of volume.hulls) for(const offset of [0,16,32]) {
      const polygon=clipToVolume(corners.map(p=>[p.x,p.y,p.z+offset]),volume,hull);
      if(!polygon.length) continue;
      // Each height probe can cover a different part of a slope. Union all
      // valid intersections; stopping at the first leaves false interior gaps.
      // 不同高度探测可覆盖同一坡面的不同部分；全部合并，避免内部假裂缝。
      pieces.push([polygon.map(([x,y])=>[x,y])]);
    }
    if(!pieces.length) continue;
    for(const polygon of unionFootprints(pieces)) {
      const rings=polygon.map(ring=>ring.slice(0,-1));
      const flat=rings.flat(),to2d=ring=>ring.map(p=>new THREE.Vector2(...p));
      for(const indices of THREE.ShapeUtils.triangulateShape(to2d(rings[0]),rings.slice(1).map(to2d)))
        result.push(Object.assign(indices.map(index=>{const [x,y]=flat[index];return [x,y,groundHeight(triangle,x,y) ?? corners[0].z];}),{areaId:area.area_id}));
    }
  }
  if(region.kind==='buyzone') {
    const starts=spawns.filter(point=>point.team===region.team);
    return groupRegionSurfaces(result,areas).filter(group=>group.some(polygon=>starts.some(point=>point.areaId===polygon.areaId || Math.abs((groundHeight({corners:polygon.map(([x,y,z])=>({x,y,z}))},point.position[0],point.position[1]) ?? Infinity)-point.position[2])<=12))).flat();
  }
  return result;
}

function competitiveBuyVolumes(volumes,spawns,areas) {
  if(!spawns.length) return [];
  const points=areas.flatMap(area=>area.corners);
  const bounds=points.reduce((b,p)=>[Math.min(b[0],p.x),Math.max(b[1],p.x),Math.min(b[2],p.y),Math.max(b[3],p.y)],[Infinity,-Infinity,Infinity,-Infinity]);
  const height=spawns.map(p=>p.position[2]).toSorted((a,b)=>a-b)[Math.floor(spawns.length/2)]+16;
  const quad=[[bounds[0],bounds[2],height],[bounds[1],bounds[2],height],[bounds[1],bounds[3],height],[bounds[0],bounds[3],height]];
  const parts=[];
  for(const volume of volumes) {
    if(volume.enabled===false || /2v2|wingman|casual|deathmatch|warmup/i.test(volume.targetName || '')) continue;
    for(const hull of volume.hulls) {
      const footprint=clipToVolume(quad,volume,hull).map(p=>p.slice(0,2));
      const seed=spawns.some(p=>[0,16,32].some(offset=>insideVolume([p.position[0],p.position[1],p.position[2]+offset],volume,[hull])));
      parts.push({volume,hull,footprint,selected:seed});
    }
  }
  // Keep adjoining parts of the same primary purchase zone (e.g. Mirage's
  // end caps), but exclude disconnected mode-specific pools without a start.
  let changed=true;
  while(changed) { changed=false;for(const part of parts) if(!part.selected && part.footprint.length>=3 && parts.some(other=>other.selected && other.footprint.length>=3 && unionFootprints([[part.footprint],[other.footprint]]).length===1)) {part.selected=true;changed=true;} }
  return parts.filter(part=>part.selected).map(part=>({...part.volume,hulls:[part.hull]}));
}

// A NAV connection may be a jump/drop link, not touching ground. Keep visual
// regions connected only where the original surfaces meet horizontally, with
// a small step tolerance. Configurable display tolerances, not game physics.
// 导航连接可能跨跳跃空隙；区域只沿接壤地面合并。阈值为显示规则，非游戏物理。
export const REGION_CONTACT_XY=1;
export const REGION_CONTACT_HEIGHT=18;
function surfacesTouch(a,b) {
  if(!a?.corners?.length || !b?.corners?.length)return false;
  const check=(first,second)=>first.some(p=>second.some((q,i)=>{
    const r=second[(i+1)%second.length],dx=r.x-q.x,dy=r.y-q.y,den=dx*dx+dy*dy;
    const t=den ? Math.max(0,Math.min(1,((p.x-q.x)*dx+(p.y-q.y)*dy)/den)) : 0;
    return Math.hypot(p.x-q.x-dx*t,p.y-q.y-dy*t)<=REGION_CONTACT_XY && Math.abs(p.z-q.z-(r.z-q.z)*t)<=REGION_CONTACT_HEIGHT;
  }));
  return check(a.corners,b.corners) || check(b.corners,a.corners);
}

// Use the region's NAV graph, not global height proximity or centroid distance.
// Only selected NAV areas can connect components; do not route through unrelated
// map areas, ladders/floors or fill the empty space between disconnected pieces.
// 以区域内 NAV 连接分组；不按距离跨空隙架桥、不经区域外绕路合并。
export function groupRegionSurfaces(polygons,areas=[]) {
  const byId=new Map(areas.map(area=>[area.area_id,area])),byArea=new Map();
  polygons.forEach((polygon,index)=>{const id=polygon.areaId ?? `unassigned-${index}`;if(!byArea.has(id))byArea.set(id,[]);byArea.get(id).push(polygon);});
  const adjacency=new Map([...byArea.keys()].map(id=>[id,new Set()]));
  const ranges=new Map([...byArea].map(([id,items])=>{const heights=items.flat().map(p=>p[2]);return [id,[Math.min(...heights),Math.max(...heights)]];}));
  for(const [id] of byArea) for(const next of byId.get(id)?.connections || []) {
    if(!byArea.has(next) || !surfacesTouch(byId.get(id),byId.get(next)))continue;
    const a=ranges.get(id),b=ranges.get(next);
    // NAV jump/drop edges can lead onto elevated props. They are not a single
    // ground region when the clipped surfaces have a step greater than 32 units.
    if(a[0]>b[1]+32 || b[0]>a[1]+32)continue;
    adjacency.get(id).add(next);adjacency.get(next).add(id);
  }
  const remaining=new Set(byArea.keys()),groups=[];
  while(remaining.size) {
    const queue=[remaining.values().next().value],group=[];remaining.delete(queue[0]);
    for(let i=0;i<queue.length;i++){group.push(...byArea.get(queue[i]));for(const next of adjacency.get(queue[i]))if(remaining.delete(next))queue.push(next);}
    groups.push(group);
  }
  return groups;
}

export function mergeRegionSurfaces(polygons,areas=[]) {
  const snap=value=>Math.round(value*4)/4;
  const groups=groupRegionSurfaces(polygons,areas);
  const triangles=[],boundary=[];
  for(const group of groups) {
    const records=group.map(points=>({points,ring:points.map(p=>[snap(p[0]),snap(p[1])])})).filter(record=>record.ring.length>=3 && Math.abs(record.ring.reduce((sum,p,i)=>{const q=record.ring[(i+1)%record.ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0))>.01);
    if(!records.length)continue;
    const vertices=records.flatMap(record=>record.points);
    const union=unionFootprints(records.map(record=>[record.ring]));
    const heightAt=([x,y])=>{
      // Return a real surface height, never the mean between overlapping floors.
      let nearest=vertices[0],distance=Infinity;
      for(const point of vertices){const d=Math.hypot(point[0]-x,point[1]-y);if(d<distance){nearest=point;distance=d;}}
      const candidates=records.map(record=>groundHeight({corners:record.points.map(([x,y,z])=>({x,y,z}))},x,y)).filter(value=>value!=null);
      return candidates.length ? candidates.reduce((a,b)=>Math.abs(a-nearest[2])<Math.abs(b-nearest[2])?a:b) : nearest[2];
    };
    for(const record of records)for(const indices of THREE.ShapeUtils.triangulateShape(record.points.map(p=>new THREE.Vector2(p[0],p[1])),[]))triangles.push(indices.map(index=>record.points[index]));
    for(const polygon of union){const outer=polygon[0].slice(0,-1).map(point=>[...point,heightAt(point)]);for(let i=0;i<outer.length;i++)boundary.push([outer[i],outer[(i+1)%outer.length]]);}
  }
  return {triangles,boundary,componentCount:groups.length};
}
