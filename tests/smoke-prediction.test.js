import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { predictSmokeVoxels, predictSmokeVoxelsAsync, smokeVoxelToSource, compareSmokeVoxels } from '../packages/viewer/src/smoke/index.js';
import { createSmokeCollisionWorld, createPredictedSmokeVolume, disposePredictedSmokeVolume } from '../packages/viewer/src/smoke/three.js';

const positions = prediction => [...prediction.frame.voxels].map(id => smokeVoxelToSource(id, prediction.frame.origin));
const coded = code => error => error.code === code;
function boxSource(x,y,z,sx,sy,sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sy*.0254,sz*.0254,sx*.0254),new THREE.MeshBasicMaterial());
  mesh.position.set(y*.0254,z*.0254,x*.0254); return mesh;
}
function sceneFixture() {
  const root = new THREE.Group();
  root.add(boxSource(0,0,-20,1000,1000,20),boxSource(50,0,90,10,1000,200));
  return root;
}
function release(root) { root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();}); }

test('prediction packing, determinism, async parity and progress use the recorded coordinate convention',async()=>{
  assert.deepEqual(smokeVoxelToSource(17|(18<<5)|(19<<10),[100,200,300]),[160,240,320]);
  const progress=[];
  const a=predictSmokeVoxels({origin:[100,200,300],onProgress:p=>progress.push(p)});
  const b=await predictSmokeVoxelsAsync({origin:[100,200,300]});
  assert.deepEqual(a,b);assert.equal(a.source,'illustrative');assert.equal(a.frame.voxels.length,256);
  assert.equal(progress.at(-1).fraction,1);assert.ok(progress.every((p,i)=>!i||p.fraction>=progress[i-1].fraction));
  const comparison=compareSmokeVoxels(a.frame,b.frame);assert.equal(comparison.iou,1);assert.equal(comparison.meanDistance,0);
  const shifted={...b.frame,origin:[110,200,300]};
  assert.equal(compareSmokeVoxels(a.frame,shifted).iou,0);
  assert.equal(compareSmokeVoxels(a.frame,shifted,{tolerance:10}).f1,1);
});

test('reachable growth respects a wall but reaches the other side through a door, without crossing a floor',()=>{
  const wall=(a,b)=> (a[0]<30)!==(b[0]<30);
  const floor=(a,b)=>Math.min(a[2],b[2])<0;
  const closed=predictSmokeVoxels({origin:[0,0,0],maxVoxels:8192,collision:{isBlocked:(a,b)=>wall(a,b)||floor(a,b)}});
  assert.equal(closed.source,'predicted');assert.ok(positions(closed).every(p=>p[0]<30&&p[2]>=0));
  const open=predictSmokeVoxels({origin:[0,0,0],maxVoxels:8192,collision:{isBlocked:(a,b)=>(wall(a,b)&&Math.max(a[1],b[1])<40)||floor(a,b)}});
  assert.ok(positions(open).some(p=>p[0]>30));assert.ok(open.diagnostics.blockedEdges>0);
});

test('invalid inputs, blocked seeds and exhausted budgets are explicit; cancellation permits subsequent work',async()=>{
  for(const options of [{},{origin:[NaN,0,0]},{origin:[0,0,0],radius:[400,20,20]},{origin:[0,0,0],maxVoxels:0},{origin:[0,0,0],collision:{isBlocked:()=>Promise.resolve(false)}}]) assert.throws(()=>predictSmokeVoxels(options),coded('invalid_argument'));
  assert.throws(()=>predictSmokeVoxels({origin:[0,0,0],collision:{isBlocked:()=>true}}),coded('seed_blocked'));
  assert.throws(()=>predictSmokeVoxels({origin:[0,0,0],collision:{isBlocked:()=>false},maxCollisionChecks:1}),coded('budget_exceeded'));
  const abort=new AbortController();
  await assert.rejects(predictSmokeVoxelsAsync({origin:[0,0,0],signal:abort.signal,onProgress:p=>{if(p.accepted>=32)abort.abort();}}),{name:'AbortError'});
  assert.equal(predictSmokeVoxels({origin:[0,0,0],maxVoxels:1}).frame.voxels.length,1);
  assert.throws(()=>compareSmokeVoxels({origin:[0,0,0],voxels:[]},{origin:[0,0,0],voxels:[]}),coded('invalid_argument'));
});

test('Three collision snapshots hidden walls, handles scene offsets and owns no caller resources',()=>{
  const root=sceneFixture(),wall=root.children[1],originalRaycast=wall.raycast;
  wall.visible=false;root.position.set(-5,-6,-7);
  let sourceDisposed=false;wall.geometry.addEventListener('dispose',()=>{sourceDisposed=true;});
  const world=createSmokeCollisionWorld({root,sceneOrigin:[5,6,7]});
  assert.equal(world.isBlocked([0,0,40],[80,0,40]),true);
  const p=predictSmokeVoxels({origin:[0,0,0],collision:world,maxVoxels:8192});
  assert.ok(positions(p).every(v=>v[0]<45 && v[2]>=0));
  assert.ok(world.getStats().raycasts>0);
  world.dispose();world.dispose();assert.equal(sourceDisposed,false);assert.equal(wall.raycast,originalRaycast);assert.equal(wall.geometry.boundsTree,undefined);
  assert.throws(()=>world.isBlocked([0,0,0],[1,1,1]),coded('disposed'));release(root);
});

test('Three collision protects memory/triangle budgets and rejects animated or singular geometry',()=>{
  const root=sceneFixture();
  assert.throws(()=>createSmokeCollisionWorld({root,maxTriangles:1}),coded('budget_exceeded'));
  assert.throws(()=>createSmokeCollisionWorld({root,maxBytes:1}),coded('budget_exceeded'));
  root.scale.x=0;assert.throws(()=>createSmokeCollisionWorld({root}),coded('invalid_argument'));release(root);
  const animated=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),1);
  assert.throws(()=>createSmokeCollisionWorld({objects:[animated]}),coded('invalid_argument'));animated.geometry.dispose();animated.material.dispose();
});

test('predicted smoke uses the existing density renderer and releases GPU data exactly once',()=>{
  const p=predictSmokeVoxels({origin:[100,200,300]});
  const volume=createPredictedSmokeVolume(p,[1,2,3]);
  assert.equal(volume.userData.smokeSource,'illustrative');assert.equal(volume.children.length,1);
  assert.ok(volume.position.distanceTo(new THREE.Vector3(200*.0254-1,300*.0254-2,100*.0254-3))<1e-9);
  const texture=volume.children[0].userData.smokeDensityTexture;let releases=0;texture.addEventListener('dispose',()=>releases++);
  disposePredictedSmokeVolume(volume);disposePredictedSmokeVolume(volume);assert.equal(releases,1);
  assert.throws(()=>createPredictedSmokeVolume({...p,frame:{...p.frame,voxels:Uint16Array.of(65535)}}),coded('invalid_argument'));
});
