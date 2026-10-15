// Installed-package consumer: public imports only, without CSBoard aliases.
import { createViewer, createGltfResourceLoader, sourceToScene, sceneToSource, CAMERA_INPUT_PRESETS } from '@csboard/viewer';
import { openReplayPackageSource } from '@csboard/viewer/format';
import * as THREE from 'three';
import { predictSmokeVoxelsAsync, smokeVoxelToSource } from '@csboard/viewer/smoke';
import { createSmokeCollisionWorld, createPredictedSmokeVolume, disposePredictedSmokeVolume } from '@csboard/viewer/smoke/three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const checks = [], events = [], observerErrors = [];
const makeViewer = options => createViewer({ ...options, onObserverError: error => observerErrors.push(error) });
const assert = (value, label) => { if (!value) throw Error(label); checks.push(label); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (read, label) => { const end=Date.now()+10000; while(!read()){if(Date.now()>end)throw Error(label);await pause(30);} };
const key = (code, type) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'ArrowUp' ? 'ArrowUp' : 'w', bubbles: true }));
const container = document.querySelector('#viewport');
let viewer, source, modelUrl, approval = null;
async function command(type, args={}) {
  const result = await viewer.execute({type,...args},{origin:'external-consumer'});
  assert(result.status === 'succeeded', `${type} succeeds`); return result;
}
async function run() {
  // External consumer exercises public calculation, collision and renderer APIs.
  const collisionRoot=new THREE.Group();
  const wall=new THREE.Mesh(new THREE.BoxGeometry(20,8,.2),new THREE.MeshBasicMaterial());
  wall.position.set(0,2,1.27);collisionRoot.add(wall);
  const smokeWorld=createSmokeCollisionWorld({root:collisionRoot});
  const predicted=await predictSmokeVoxelsAsync({origin:[0,0,0],collision:smokeWorld});
  assert(predicted.source==='predicted' && [...predicted.frame.voxels].every(id=>smokeVoxelToSource(id,[0,0,0])[0]<46),'installed smoke prediction respects supplied collision geometry');
  const smoke=createPredictedSmokeVolume(predicted);
  const smokeRenderer=new THREE.WebGLRenderer({antialias:true});smokeRenderer.setSize(160,120);
  const smokeScene=new THREE.Scene();smokeScene.add(smoke);
  const smokeCamera=new THREE.PerspectiveCamera(45,160/120,.1,100);smokeCamera.position.set(7,6,8);smokeCamera.lookAt(0,1,0);
  smokeRenderer.render(smokeScene,smokeCamera);
  assert(smokeRenderer.info.render.calls>0 && smoke.children[0].userData.smokeDensityTexture.isData3DTexture,'installed predicted voxels render with the shared density shader');
  disposePredictedSmokeVolume(smoke);smokeWorld.dispose();wall.geometry.dispose();wall.material.dispose();smokeRenderer.dispose();smokeRenderer.forceContextLoss();

  const navData={areas:{one:{corners:[{x:-100,y:-100,z:20},{x:100,y:-100,z:20},{x:100,y:100,z:20},{x:-100,y:100,z:20}]}}};
  // Exercise real DOM wheel events and camera motion, not only configuration.
  // 中文：平滑滚轮不能误判为旋转；关闭输入必须把滚动交还宿主。
  const offset = state => new THREE.Vector3().fromArray(state.position).sub(new THREE.Vector3().fromArray(state.target));
  async function wheel(options) {
    await until(()=>viewer.getState().renderStats.frame>1,'wheel viewport is ready');
    const before=viewer.getState().camera, event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...options});
    container.querySelector('canvas').dispatchEvent(event);await pause(30);
    return {before,after:viewer.getState().camera,event};
  }
  viewer=makeViewer({container,navData});await until(()=>viewer.getState().renderStats.frame>1,'default input renderer');
  assert(viewer.apiVersion==='0.2' && viewer.getState().input.wheelMode==='zoom' && !viewer.getState().input.wrap,'default input is explicit Orbit without pointer wrapping');
  let motion=await wheel({deltaX:2.5,deltaY:4.5});
  assert(motion.event.defaultPrevented && offset(motion.after).length()>offset(motion.before).length(),'smooth wheel zooms by default');
  assert(offset(motion.before).normalize().distanceTo(offset(motion.after).normalize())<1e-6 && equal(motion.before.target,motion.after.target),'smooth wheel never changes orbit or target by default');
  motion=await wheel({deltaY:-5,ctrlKey:true});
  assert(offset(motion.after).length()<offset(motion.before).length(),'trackpad pinch zooms toward scene');
  motion=await wheel({deltaY:1,deltaMode:1});
  const lineRatio=offset(motion.after).length()/offset(motion.before).length();
  assert(Math.abs(lineRatio-Math.exp(16*.0015))<1e-5,'line wheel deltas use consistent pixel units');
  const projected=viewer.projectSource([0,0,20]);
  const surface=viewer.pickSurface(projected);
  assert(projected.visible && surface?.surface==='nav' && Math.abs(surface.sourcePosition[2]-20)<1e-5,'public projection and picking share NAV coordinates');
  for (const pointer of [null,{}, {clientX:NaN,clientY:1}]) {
    let error;try {viewer.pickSurface(pointer);} catch(caught){error=caught;}
    assert(error?.code==='invalid_argument','invalid surface pointer reports a structured error');
  }
  assert(viewer.pickSurface({clientX:-1,clientY:-1})===null,'picking outside the viewport returns no surface');
  const shared=new THREE.MeshBasicMaterial({depthTest:false,depthWrite:false});
  const custom=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),shared);
  let context, cleanups=0, frames=0, cloneDisposed=0;
  const remove=viewer.mountSceneExtension('host-object',value=>{
    context=value;value.addObject(custom);custom.material.addEventListener('dispose',()=>cloneDisposed++);
    return {update(){frames++;},dispose(){cleanups++;}};
  });
  assert(custom.material!==shared && custom.material.depthTest && custom.material.depthWrite && !shared.depthTest,'managed host geometry uses scene depth without mutating shared materials');
  await pause(50);
  assert(frames>0 && context.pickSurface(projected)?.surface==='nav','scene extension updates and surface queries work in the installed package');
  remove();remove();
  assert(cleanups===1 && cloneDisposed===1 && custom.material===shared && !custom.parent && context.signal.aborted,'extension removal restores materials and releases owned state exactly once');
  let releasedQuery;try{context.pickSurface(projected);}catch(error){releasedQuery=error;}
  assert(releasedQuery?.code==='disposed','released extensions cannot continue surface queries');
  const removeOverlay=viewer.mountSceneExtension('overlay',value=>{value.addObject(custom,{occlusion:'overlay'});});
  assert(!custom.material.depthTest && !custom.material.depthWrite && custom.renderOrder===1000,'see-through host markers require explicit overlay mode');
  removeOverlay();
  custom.geometry.dispose();shared.dispose();
  viewer.dispose();
  let disposedQuery;try {viewer.pickSurface(projected);}catch(error){disposedQuery=error;}
  assert(disposedQuery?.code==='disposed','surface queries reject a disposed viewer');
  for (const input of [false,{rotate:[],pan:[],zoom:false,touch:false}]) {
    viewer=makeViewer({container,navData,input});
    let bubbled=false;const hostWheel=()=>{bubbled=true;};container.addEventListener('wheel',hostWheel);
    motion=await wheel({deltaY:20});container.removeEventListener('wheel',hostWheel);
    assert(!motion.event.defaultPrevented && bubbled && equal(motion.before.position,motion.after.position) && container.querySelector('canvas').style.touchAction==='auto','disabled input preserves host scrolling and camera');
    await command('camera.focusPoint',{position:[5,0,5]});
    assert(equal(viewer.getState().camera.target,[5,0,5]),'camera API remains available without interactive input');viewer.dispose();
  }
  viewer=makeViewer({container,navData,input:{zoom:true,wheelInvert:true,wheelSpeed:2}});
  motion=await wheel({deltaY:10});
  const invertedRatio=offset(motion.after).length()/offset(motion.before).length();
  assert(Math.abs(invertedRatio-Math.exp(-20*.0015))<1e-5,`wheel inversion and speed change actual zoom distance (${invertedRatio})`);viewer.dispose();
  viewer=makeViewer({container,navData,input:{...CAMERA_INPUT_PRESETS.orbit,wheelMode:'trackpad',rotateSpeed:.5,panSpeed:2}});
  motion=await wheel({deltaX:8,deltaY:4});
  assert(offset(motion.before).normalize().distanceTo(offset(motion.after).normalize())>1e-4,'explicit trackpad mode rotates camera');
  motion=await wheel({deltaX:8,deltaY:4,shiftKey:true});
  assert(!equal(motion.before.target,motion.after.target),'explicit trackpad Shift scroll pans camera');
  assert(viewer.getState().input.rotateSpeed===.5 && viewer.getState().input.panSpeed===2,'rotation and pan speeds are observable');viewer.dispose();
  viewer=makeViewer({container,navData,input:{...CAMERA_INPUT_PRESETS.orbit,wheelMode:'trackpad',maxPolarAngle:Math.PI}});
  motion=await wheel({deltaY:400});
  assert(offset(motion.after).y<0,'explicit underside views use configured polar limits for trackpad input too');viewer.dispose();
  viewer=makeViewer({container,navData,input:'csboard'});
  assert(viewer.getState().input.wheelMode==='zoom' && viewer.getState().input.wrap && viewer.getState().input.forward==='KeyW','CSBoard preset retains middle-button/WASD controls with predictable wheel zoom');
  motion=await wheel({deltaX:2,deltaY:4});
  assert(motion.event.defaultPrevented && offset(motion.after).length()>offset(motion.before).length() && offset(motion.before).normalize().distanceTo(offset(motion.after).normalize())<1e-6 && equal(motion.before.target,motion.after.target),'CSBoard preset smooth wheel zooms without rotating or panning');viewer.dispose();
  {
  viewer=makeViewer({container,navData,input:{...CAMERA_INPUT_PRESETS.csboard,wrap:false}});
  const initialOrbit=viewer.getState().camera;
  let rotationCamera;
  viewer.mountSceneExtension('camera-observer',context=>{rotationCamera=context.camera;});
  const canvas=container.querySelector('canvas'), rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'mouse',button:1,buttons:4,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
  document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',button:1,buttons:4,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height*5}));
  document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',button:1,buttons:4,clientX:rect.left+rect.width/2,clientY:rect.top-rect.height*5}));
  document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'mouse',button:1,buttons:0}));
  await pause(100);
  const rotated=viewer.getState().camera, delta=offset(rotated);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(rotationCamera.quaternion);
  assert(!equal(initialOrbit.position,rotated.position) && delta.y>0 && Math.acos(delta.y/delta.length())<=Math.PI*.49+1e-6 && Math.abs(right.y)<1e-6,'large vertical orbit moves and stays above the ground without camera roll');
  viewer.dispose();
  }
  for (const input of [{wheelMode:'guess'},{wheelSpeed:0},{rotateSpeed:-1},{panSpeed:NaN},{minPolarAngle:1,maxPolarAngle:.5},{maxPolarAngle:4}]) {
    let error;try {viewer=makeViewer({container,navData,input});} catch (caught) {error=caught;}
    assert(error?.code==='invalid_argument','invalid camera option returns structured error');
  }
  let resolveCount=0;
  const loader=createGltfResourceLoader({resolve:key=>{resolveCount++;return key==='world-model' && modelUrl ? [modelUrl] : [];}});
  viewer=makeViewer({container,navData,mapName:'de_dust2',input:{forward:'ArrowUp',speed:2},resourceLoader:loader});
  viewer.on('*',event=>events.push(event));
  await until(()=>viewer.getState().renderStats.frame>1,'real WebGL rendering');
  assert(container.querySelector('canvas')?.width>0,'rendered canvas');
  assert(resolveCount===0,'model stays lazy until requested');
  const original=[13,27,20],origin=viewer.getState().coordinates.origin;
  const restored=sceneToSource(sourceToScene(original,origin),origin);
  assert(restored.every((value,index)=>Math.abs(value-original[index])<1e-8),'Source coordinates round-trip');
  const canvas=container.querySelector('canvas');canvas.focus();
  let before=viewer.getState().camera.position;
  key('KeyW','keydown');await pause(180);key('KeyW','keyup');
  assert(equal(before,viewer.getState().camera.position),'omitted WASD binding does not move camera');
  key('ArrowUp','keydown');await pause(180);key('ArrowUp','keyup');
  assert(!equal(before,viewer.getState().camera.position),'custom arrow binding moves camera');
  const frozen=viewer.getState().camera.position;canvas.blur();
  key('ArrowUp','keydown');await pause(180);key('ArrowUp','keyup');
  assert(equal(frozen,viewer.getState().camera.position),'unfocused keyboard does not move camera');
  container.style.width='640px';container.style.height='360px';await pause(100);
  const rect=canvas.getBoundingClientRect();
  assert(rect.width===640 && rect.height===360,'ResizeObserver updates viewport');
  await command('camera.mode',{mode:'2d'});
  assert(viewer.getState().camera.mode==='2d','2D mode exposed in state');
  await command('camera.mode',{mode:'3d'});
  const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x5da9ff}));scene.add(mesh);
  const glb=await new GLTFExporter().parseAsync(scene,{binary:true});
  mesh.geometry.dispose();mesh.material.dispose();
  modelUrl=URL.createObjectURL(new Blob([glb],{type:'model/gltf-binary'}));
  await command('model.visibility',{visible:true});
  await until(()=>viewer.getState().resources.some(state=>state.status==='ready'),'GLB import');
  assert(events.some(event=>event.type==='resource.state' && event.payload.status==='ready'),'GLB ready event');
  assert(viewer.pickSurface(viewer.projectSource([0,0,0]))?.surface==='model','surface picking reuses the imported model');
  const emptyModelPoint=viewer.projectSource([70,70,20]);
  assert(viewer.pickSurface(emptyModelPoint)===null,'visible model misses do not select NAV behind it');
  await command('camera.mode',{mode:'2d'});
  assert(viewer.pickSurface(viewer.projectSource([0,0,20]))?.surface==='nav','2D picking uses NAV even when model visibility is enabled');
  await command('camera.mode',{mode:'3d'});
  await command('model.visibility',{visible:false});
  assert(!viewer.getState().modelVisible,'model visibility can be disabled');
  assert(viewer.pickSurface(viewer.projectSource([0,0,20]))?.surface==='nav','hidden model switches surface picking back to NAV');
  await command('model.unload');
  assert(!viewer.getState().resources.some(state=>state.status==='ready'),'model unload releases resource');
  const invalid=await viewer.execute({type:'camera.mode',mode:'invalid'});
  assert(invalid.status==='failed' && typeof invalid.error.code==='string' && typeof invalid.error.message==='string','invalid command returns structured error');
  const badSource=await openReplayPackageSource(new Uint8Array([80,75])).then(()=>null,error=>error);
  assert(badSource?.code==='invalid_zip','invalid standard package reports format error');
  source=await openReplayPackageSource(await (await fetch('/fixture.cs2df')).blob());
  viewer.setDataSource(source);
  await command('replay.open',{segmentId:'round-1'});
  await command('replay.seek',{tick:32});
  assert(viewer.getState().playback.tick===32,'standard package seeks to source tick');
  assert(viewer.getState().workspace.points.length===1,'standard player reaches rendered scene');
  await command('replay.play');await until(()=>viewer.getState().playback.tick>32,'playback advances');await command('replay.pause');
  assert(events.some(event=>event.type.startsWith('playback.')),'public replay callbacks delivered');
  const frame=viewer.getState().renderStats.frame;
  await pause(100);assert(viewer.getState().renderStats.frame>=frame,'renderer remains usable after model unload and replay');
  viewer.dispose();viewer.dispose();
  assert(!container.querySelector('canvas'),'dispose removes canvas');
  assert(events.some(event=>event.type==='lifecycle.disposed'),'dispose callback delivered');
  assert(source.listSegments().length===1,'viewer does not dispose borrowed source');
  source.dispose();source=null;
  viewer=makeViewer({container,navData,input:false,policy:()=>approval});
  before=viewer.getState().camera.position;container.querySelector('canvas').focus();
  key('KeyW','keydown');key('ArrowUp','keydown');await pause(180);key('KeyW','keyup');key('ArrowUp','keyup');
  assert(equal(before,viewer.getState().camera.position),'disabled input remains disabled after recreation');
  await until(()=>viewer.getState().renderStats.frame>1,'recreated renderer');
  assert(viewer.getContract().profile==='standalone' && !viewer.getCapabilities().commands.includes('utility.place'),'discovery distinguishes host capabilities');
  const layout=[{id:'layout-1',name:'Original',team:'CT',position:[0,0,0],rotationY:0,crouched:false,baseColor:'#5da9ff'}];
  await command('workspace.players',{players:layout});
  const revision=viewer.getWorkspace().revision;
  const stale=await viewer.execute({type:'workspace.players',players:[]},{expectedRevision:revision-1});
  assert(stale.status==='failed' && stale.error.code==='revision_conflict' && viewer.getWorkspace().players.length===1,'stale layout cannot erase current players');
  const snapshot=viewer.getWorkspace();snapshot.players[0].name='Mutated';
  assert(viewer.getWorkspace().players[0].name==='Original','query snapshots cannot mutate internal state');
  const cancelled=new AbortController();let approve;
  approval=new Promise(resolve=>{approve=resolve;});
  const pending=viewer.execute({type:'player.rename',id:'layout-1',name:'Cancelled'},{signal:cancelled.signal,operationId:'cancel-edit'});
  const busy=await viewer.execute({type:'camera.mode',mode:'2d'});
  assert(busy.status==='failed' && busy.error.code==='operation_busy','pending approval rejects conflicting command');
  cancelled.abort();const stopped=await pending;approve(true);approval=null;await pause(30);
  assert(stopped.status==='cancelled' && stopped.operationId==='cancel-edit' && viewer.getWorkspace().players[0].name==='Original','cancelled approval cannot apply a late edit');
  approval=false;
  const denied=await viewer.execute({type:'player.rename',id:'layout-1',name:'Denied'});approval=null;
  assert(denied.status==='failed' && denied.error.code==='permission_denied' && viewer.getWorkspace().players[0].name==='Original','host denial preserves current layout');
  await command('player.rename',{id:'layout-1',name:'Recovered'});
  assert(viewer.getWorkspace().players[0].name==='Recovered','cancelled and denied operations release command lane');
  const unknown=await viewer.execute({type:'not.registered'});
  assert(unknown.status==='failed' && unknown.error.code==='unknown_command','unknown command returns discoverable error');
  assert(observerErrors.length===0, 'real viewer events satisfy the published payload schemas');
  return {checks,events:events.map(({type,origin})=>({type,origin})),state:viewer.getState()};
}
window.consumerCheck=run().then(result=>({ok:true,...result}),error=>({ok:false,error:error.stack,checks}));
window.addEventListener('pagehide',()=>{viewer?.dispose();source?.dispose();if(modelUrl)URL.revokeObjectURL(modelUrl);},{once:true});
