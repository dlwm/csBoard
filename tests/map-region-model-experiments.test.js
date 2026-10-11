import { nearestBoardSnap } from '../src/three/boardSnap.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { triggerRegionSurfaces, mergeRegionSurfaces, groupRegionSurfaces } from '../src/data/regionSurfaces.js';
import { insideVolume, groundHeight } from '../src/data/placeGeometry.js';
import { competitiveSpawnPoints } from '../src/data/competitiveSpawns.js';
import { createModelSimplification } from '../src/three/modelSimplification.js';
import createCollabUtilitySceneController from '../src/three/collabUtilitySceneController.js';

test('regions merge only along selected NAV connections and never add air bridges',()=>{
  const a=Object.assign([[0,0,0],[10,0,0],[10,10,0],[0,10,0]],{areaId:1});
  const b=Object.assign([[30,0,0],[40,0,0],[40,10,0],[30,10,0]],{areaId:2});
  const corners=p=>p.map(([x,y,z])=>({x,y,z}));
  const areas=[{area_id:1,corners:corners(a),connections:[]},{area_id:2,corners:corners(b),connections:[]}];
  assert.equal(groupRegionSurfaces([a,b],areas).length,2);
  areas[0].connections=[2];assert.equal(groupRegionSurfaces([a,b],areas).length,2);
  const touching=Object.assign([[10,0,0],[20,0,0],[20,10,0],[10,10,0]],{areaId:3});
  areas.push({area_id:3,corners:corners(touching),connections:[1]});assert.equal(groupRegionSurfaces([a,touching],areas).length,1);
  const merged=mergeRegionSurfaces([a,b],areas);
  assert.equal(merged.triangles.length,4);
  assert.ok(merged.triangles.flat().every(p=>p[0]<=10 || p[0]>=30));
  const high=Object.assign(b.map(p=>[p[0],p[1],p[2]+100]),{areaId:2});
  assert.equal(groupRegionSurfaces([a,high],areas).length,2);
});
test('Mirage thin triggers preserve actual terrain triangles and primary purchase pools',()=>{
  const data=JSON.parse(readFileSync(new URL('../src/data/mapPlaces/de_mirage.json',import.meta.url)));
  const nav=JSON.parse(readFileSync(new URL('../src/data/nav/de_mirage.json',import.meta.url)));
  const areas=Object.values(nav.areas),starts=competitiveSpawnPoints(data.spawnPoints);
  for(const region of data.regions.filter(r=>['bombsite','buyzone'].includes(r.kind))) {
    const surfaces=triggerRegionSurfaces(region,areas,starts);
    assert.ok(surfaces.length>0,region.name);
    for(const triangle of surfaces) for(const point of triangle) {
      assert.ok(region.volumes.some(volume=>[0,16,32].some(offset=>insideVolume([point[0],point[1],point[2]+offset],volume,volume.hulls))),region.name);
      assert.ok(areas.some(area=>{const height=groundHeight(area,point[0],point[1]);return height!=null && Math.abs(height-point[2])<.1;}));
    }
    const merged=mergeRegionSurfaces(surfaces,areas);assert.ok(merged.triangles.length && merged.boundary.length);
  }
  const t=data.regions.find(r=>r.kind==='buyzone' && r.team==='T');
  const extra={...t.volumes[0],origin:[-3300,350,0]};
  assert.ok(triggerRegionSurfaces({...t,kind:'bombsite',volumes:[extra]},areas).length>0);
  assert.equal(triggerRegionSurfaces({...t,volumes:t.volumes.map(v=>({...v,targetName:'2v2'}))},areas,starts).length,0);
  assert.deepEqual(triggerRegionSurfaces({...t,volumes:[...t.volumes,extra]},areas,starts),triggerRegionSurfaces(t,areas,starts));
});
test('model simplification reduces faces, retains collision and restores originals',async()=>{
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();
  const tiny=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material);
  const big=new THREE.Mesh(new THREE.SphereGeometry(2,48,24),material);big.position.x=3;root.add(tiny,big);
  const original=big.geometry,raycast=big.raycast;
  const batches={clear(){},rebuild(){}};
  const controller=createModelSimplification(root,batches,()=>{tiny.visible=true;big.visible=true;});
  const simplified=await controller.apply({simplify:60});assert.ok(simplified.after<simplified.before);assert.notEqual(big.geometry,original);
  const displayed=big.geometry;
  // Actual raycasting uses the original geometry while the display proxy remains assigned.
  const caster=new THREE.Raycaster(new THREE.Vector3(3,0,10),new THREE.Vector3(0,0,-1));
  root.updateMatrixWorld(true);const hits=[];big.raycast(caster,hits);assert.ok(hits.length);assert.equal(big.geometry,displayed);
  const pending=controller.apply({simplify:90});const restored=await controller.apply({});await pending;
  assert.equal(big.geometry,original);assert.equal(tiny.visible,true);assert.equal(restored.after,restored.before);
  controller.dispose();assert.equal(big.raycast,raycast);root.traverse(o=>o.geometry?.dispose());material.dispose();
});
test('collaboration utility origins remain exact, expose live anchors and survive serialization',()=>{
  const scene=new THREE.Scene(),floor=new THREE.Vector4(),editingRef={current:true};let edits=0;
  const controller=createCollabUtilitySceneController({scene,navData:null,editingRef,floorFadeRef:{current:floor},getModelCenter:()=>new THREE.Vector3(),getNav:()=>null,pushHistory(){},notifyEdit(){edits++;}});
  const note={id:'note',name:'Flash',position:[10,20,0],grenadeType:'flash',replay:{projectiles:[{tick:1,x:10,y:20,z:0},{tick:2,x:30,y:40,z:10}],events:[]}};
  const item=controller.add(note,'u');assert.equal(edits,1);assert.equal(controller.getOriginMarkers().length,1);
  assert.ok(Math.abs(item.position.x-(20*.0254))<1e-9);
  assert.deepEqual(controller.getOriginAnchors(),[{id:'utility-origin:u',position:item.position.toArray()}]);
  const saved=controller.serialize();assert.equal(saved[0].id,'u');assert.deepEqual(saved[0].position,item.position.toArray());
  controller.restore(saved,[note]);assert.equal(controller.getOriginMarkers().length,1);assert.deepEqual(controller.serialize()[0].position,saved[0].position);controller.dispose();
});

test('all bundled competitive regions retain terrain and finite linked geometry',()=>{
  for(const file of readdirSync(new URL('../src/data/mapPlaces/',import.meta.url)).filter(name=>name.endsWith('.json'))) {
    const data=JSON.parse(readFileSync(new URL('../src/data/mapPlaces/'+file,import.meta.url)));
    const nav=JSON.parse(readFileSync(new URL('../src/data/nav/'+file,import.meta.url)));
    const starts=competitiveSpawnPoints(data.spawnPoints);
    for(const region of data.regions.filter(r=>['buyzone','bombsite'].includes(r.kind))) {
      const surfaces=triggerRegionSurfaces(region,Object.values(nav.areas),starts);
      assert.ok(surfaces.length,file+' '+region.name);
      const merged=mergeRegionSurfaces(surfaces,Object.values(nav.areas));assert.ok(merged.triangles.length && merged.boundary.length);
      assert.ok(merged.triangles.flat(2).every(Number.isFinite));
    }
  }
});

test('player snapping finds added utility origins outside spawn areas and rejects other floors',()=>{
  const spawn={id:'spawn',kind:'spawn',position:[0,0,0]};
  const origin={id:'utility-origin:u',kind:'utility_origin',position:[500,600,100]};
  assert.equal(nearestBoardSnap([origin,spawn],[512,608,100]),origin);
  assert.equal(nearestBoardSnap([origin,spawn],[512,608,150]),null);
  assert.equal(nearestBoardSnap([origin,spawn],[529,600,100],{previousId:origin.id}),origin);
  assert.equal(nearestBoardSnap([spawn],[512,608,100]),null);
});

test('model slider simplifies multi-material meshes and finite draw ranges with progress',async()=>{
  const root=new THREE.Group(),materials=Array.from({length:6},()=>new THREE.MeshBasicMaterial());
  const original=new THREE.BoxGeometry(3,3,3,12,12,12);original.setDrawRange(0,original.index.count-6);
  const mesh=new THREE.Mesh(original,materials);root.add(mesh);
  const controller=createModelSimplification(root,{clear(){},rebuild(){}},()=>{mesh.visible=true;});
  const progress=[];const result=await controller.apply({simplify:60},value=>progress.push(value.percent));
  assert.ok(result.after<result.before);assert.notEqual(mesh.geometry,original);
  assert.equal(mesh.geometry.groups.length,6);assert.ok(mesh.geometry.attributes.uv);assert.equal(progress.at(-1),100);
  await controller.apply({});assert.equal(mesh.geometry,original);controller.dispose();original.dispose();materials.forEach(m=>m.dispose());
});

test('shared global vertex pools do not defeat small-object simplification',async()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(.1,.1,.1),original=geometry.attributes.position;
  const pool=new Float32Array(original.array.length+300000);pool.set(original.array);
  for(let i=original.array.length;i<pool.length;i++)pool[i]=10000;
  geometry.setAttribute('position',new THREE.BufferAttribute(pool,3));
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);root.add(mesh);
  const controller=createModelSimplification(root,{clear(){},rebuild(){}},()=>{mesh.visible=true;});
  const result=await controller.apply({simplify:80});assert.equal(mesh.visible,false);assert.equal(result.after,0);
  await controller.apply({});assert.equal(mesh.visible,true);controller.dispose();geometry.dispose();material.dispose();
});

// Connected slopes need all height intersections, not just the first hit.
// 遗迹 T/CT 连通坡面应各自只有一个外围轮廓，不产生内部光墙。
test('Ancient purchase slopes union every height probe into one continuous outline',()=>{
  const data=JSON.parse(readFileSync(new URL('../src/data/mapPlaces/de_ancient.json',import.meta.url)));
  const areas=Object.values(JSON.parse(readFileSync(new URL('../src/data/nav/de_ancient.json',import.meta.url))).areas);
  for(const region of data.regions.filter(r=>r.kind==='buyzone')) {
    const surfaces=triggerRegionSurfaces(region,areas,competitiveSpawnPoints(data.spawnPoints));
    const groups=groupRegionSurfaces(surfaces,areas);assert.equal(groups.length,1,region.team);
    const rings=surfaces.map(triangle=>[triangle.map(point=>point.slice(0,2).map(value=>Math.round(value*4)/4))]);
    const union=polygonClipping.union(...rings);assert.equal(union.length,1,region.team);
    const merged=mergeRegionSurfaces(surfaces,areas);assert.equal(merged.boundary.length,union[0][0].length-1,region.team);
    for(const triangle of surfaces) for(const [x,y,z] of triangle) {
      assert.ok(areas.some(area=>area.area_id===triangle.areaId && Math.abs((groundHeight(area,x,y) ?? Infinity)-z)<.1));
      assert.ok(region.volumes.some(volume=>[0,16,32].some(offset=>insideVolume([x,y,z+offset],volume,volume.hulls))));
    }
  }
});
