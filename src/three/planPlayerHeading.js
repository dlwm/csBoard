import * as THREE from 'three';
import { floorVisibilityAtY } from './floorFade.js';

// Temporary 2D representation: original aim geometry and saved data stay intact.
// 仅二维临时显示方向三角标；不改视线几何、人物朝向或存档数据。
export function createPlanPlayerHeadings(getPlayers,floorState) {
  const records=new Map(),position=new THREE.Vector3();
  return {
    update(enabled){
      const players=getPlayers(),active=new Set(players);
      for(const [player,record] of records)if(!active.has(player)){record.arrow.removeFromParent();record.arrow.geometry.dispose();record.arrow.material.dispose();records.delete(player);}
      for(const player of players) {
        let record=records.get(player);
        if(!record && enabled){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1.35,-.67,-.16,1.35,-.35,.16,1.35,-.35],3));const arrow=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#ffb347',side:THREE.DoubleSide,depthTest:true,depthWrite:false}));arrow.name='plan-player-heading';arrow.renderOrder=6;arrow.raycast=()=>{};arrow.material.userData.csboardIgnoreFloorFade=true;player.add(arrow);record={arrow,original:new Map(),active:false};records.set(player,record);}
        if(!record)continue;
        record.arrow.visible=enabled && floorVisibilityAtY(player.getWorldPosition(position).y,floorState)>.05;
        record.arrow.material.color.set(player.userData.baseColor || (player.userData.team==='CT'?'#5da9ff':'#ffb347'));
        for(const child of player.children)if(child.userData.aimRay || child.userData.aimTarget){if(enabled){if(!record.active)record.original.set(child,child.visible);child.visible=false;}else if(record.active && record.original.has(child) && (!child.userData.aimRay || player.userData.collabPlayer))child.visible=record.original.get(child);}
        record.active=enabled;
      }
    },
    dispose(){for(const {arrow} of records.values()){arrow.removeFromParent();arrow.geometry.dispose();arrow.material.dispose();}records.clear();},
  };
}
