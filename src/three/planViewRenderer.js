import * as THREE from 'three';
import { NAV_FLOOR_BOUNDARIES } from '../data/navTopView.js';

// Two floor views share a camera/navigation state, never a copied scene or model.
// 两层共用相机和导航状态，按视口及楼层裁切重复绘制，不复制场景和模型。
export function createPlanViewRenderer({renderer,scene,camera,mapName,getModelCenter,onFloor}) {
  const size=new THREE.Vector2(),viewport=new THREE.Vector4(),scissor=new THREE.Vector4();
  const boundary=NAV_FLOOR_BOUNDARIES[mapName];let wasPlan=false;
  const layout=()=>{renderer.getSize(size);const split=camera.planView && boundary!=null,w=split?Math.floor(size.x/2)-2:size.x;return {split,width:w,height:size.y,views:split?[{floor:'main',x:0,width:w,height:size.y},{floor:'lower',x:size.x-w,width:w,height:size.y}]:[{floor:null,x:0,width:w,height:size.y}]};};
  const floorForPoint=point=>(point.y+getModelCenter().y)/.0254>=boundary?'main':'lower';
  return {
    layout,
    syncAspect(){if(!camera.planView && !wasPlan)return;wasPlan=Boolean(camera.planView);const view=layout();camera.userData.planViewportWidth=view.width;const aspect=view.width/Math.max(1,view.height);if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}},
    pointer(event){const rect=renderer.domElement.getBoundingClientRect(),views=layout().views;const x=event.clientX-rect.left,y=event.clientY-rect.top,view=views.find(v=>x>=v.x && x<=v.x+v.width) || views.at(-1);return {floor:view.floor,point:new THREE.Vector2((x-view.x)/view.width*2-1,1-y/view.height*2)};},
    viewportForPoint(point){const views=layout().views;return views.find(view=>view.floor===floorForPoint(point)) || views[0];},
    screen(point){const view=this.viewportForPoint(point),ndc=point.clone().project(camera);return {x:view.x+(ndc.x+1)*view.width/2,y:(1-ndc.y)*view.height/2,z:ndc.z};},
    render(){const current=layout();if(!current.split)return false;
      const autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();renderer.getViewport(viewport);renderer.getScissor(scissor);
      const autoUpdate=scene.matrixWorldAutoUpdate;if(autoUpdate)scene.updateMatrixWorld();scene.matrixWorldAutoUpdate=false;
      try{renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);renderer.clear();renderer.autoClear=false;renderer.setScissorTest(true);
        for(const view of current.views){onFloor(view.floor);renderer.setViewport(view.x,0,view.width,view.height);renderer.setScissor(view.x,0,view.width,view.height);renderer.render(scene,camera);}
      }finally{scene.matrixWorldAutoUpdate=autoUpdate;renderer.autoClear=autoClear;renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);onFloor(null);}
      return true;
    },
  };
}
