import * as THREE from 'three';
import { getMapPlaceAnnotations } from '../data/mapPlaceData.js';
import { competitiveSpawnPoints } from '../data/competitiveSpawns.js';
import { groundHeight } from '../data/placeGeometry.js';
import { enableObjectFloorFade, floorVisibilityAtY } from './floorFade.js';
import { createRegionGlow } from './regionGlow.js';
import { triggerRegionSurfaces, mergeRegionSurfaces } from '../data/regionSurfaces.js';
import { NAV_FLOOR_BOUNDARIES } from '../data/navTopView.js';
import { regionColor, regionAnchor } from '../data/mapRegionPresentation.js';
import { translate } from '../i18n.js';

const scale=.0254;
const xyz=([x,y,z],lift=0)=>[y*scale,z*scale+lift,x*scale];
export function createMapMarkers({scene,navData,mapName,floorState,getModelCenter}) {
  const root=new THREE.Group(); root.name='map-reference-markers'; scene.add(root);
  const {regions,spawnPoints:allSpawns}=getMapPlaceAnnotations(navData,mapName);
  const spawnPoints=competitiveSpawnPoints(allSpawns);
  const groups=new Map(), labels=[], spawnBatches=[], glows=[];
  let language;
  function text(kind,side,locale) {
    if(kind==='bombsite') return side;
    return translate(locale, kind === "buyzone" ? "view.regions.buyzone" : "view.regions.spawn", { side });
  }
  function label(group,point,name,color,place=false) {
    const canvas=document.createElement('canvas'); canvas.width=96; canvas.height=64;
    const ctx=canvas.getContext('2d'); ctx.font='600 28px system-ui';if(place){canvas.width=Math.min(512,Math.ceil(ctx.measureText(name).width+24));ctx.font='600 28px system-ui';}ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='rgba(9,18,15,.82)'; ctx.fillRect(0,4,canvas.width,56); ctx.fillStyle=color; ctx.fillText(name,canvas.width/2,32,canvas.width-12);
    const texture=new THREE.CanvasTexture(canvas);
    const material=new THREE.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,transparent:true});
    material.userData.csboardIgnoreFloorFade=true;
    const sprite=new THREE.Sprite(material); sprite.position.fromArray(xyz(point,.22)); sprite.scale.set(.8*canvas.width/64,.8,1);
    sprite.userData.labelAspect=canvas.width/64;sprite.userData.placeLabel=place;
    sprite.renderOrder=4; sprite.center.set(.5,0); sprite.userData.groundY=point[2]*scale; group.add(sprite); labels.push(sprite);return sprite;
  }
  function regionGeometry(group,region,color) {
    const areas=Object.values(navData.areas || {}).filter(a=>a.corners?.length>=3);
    const polygons=triggerRegionSurfaces(region,areas,spawnPoints);
    const merged=mergeRegionSurfaces(polygons,areas);
    const positions=[],centers=[];
    for(const polygon of polygons) {
      centers.push(polygon.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/polygon.length),[0,0,0]));
    }
    for(const triangle of merged.triangles) for(const point of triangle) positions.push(...xyz(point,.035));
    if(!positions.length) return null;
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,opacity:.12,transparent:true,side:THREE.DoubleSide,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})); mesh.renderOrder=2; group.add(mesh);
    const boundary=merged.boundary;
    const glow=createRegionGlow(boundary,floorState,color); group.add(glow); glows.push(glow);
    mesh.material.blending=THREE.AdditiveBlending; mesh.material.opacity=.065;
    // Draw the merged shape as an overlay, so NAV depth cannot split it again.
    mesh.material.depthTest=true;
    const edgeGeometry=new THREE.BufferGeometry(); edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(boundary.flatMap(pair=>pair.flatMap(p=>xyz(p,.055))),3));
    const outline=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color,opacity:.45,transparent:true,depthTest:true,depthWrite:false})); outline.renderOrder=3; group.add(outline);
    outline.material.depthTest=true;
    const mean=centers.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/centers.length),[0,0,0]);
    return centers.reduce((a,b)=>Math.hypot(...a.map((v,i)=>v-mean[i]))<Math.hypot(...b.map((v,i)=>v-mean[i]))?a:b);
  }
  function build(kind,locale) {
    const group=new THREE.Group(); group.name=`map-region-${kind}`; root.add(group); groups.set(kind,group);
    const selected=regions.filter(region=>['spawns','places'].includes(kind)?false:region.kind=== (kind==='bombsites'?'bombsite':'buyzone'));
    for(const region of selected) {
      const color=region.kind==='bombsite'?'#ee6262':region.team==='T'?'#ffa954':'#65b5ff';
      const point=regionGeometry(group,region,color);
      if(point && region.kind==='bombsite') label(group,point,text(region.kind,region.site || region.team,locale)+(region.source==='game_spawn_nav_cells' ? translate(locale,"view.mapMarkers.draft") : ''),color);
    }
    if(kind==='places') {
      const byId=new Map(Object.values(navData.areas || {}).map(area=>[area.area_id,area]));
      regions.filter(region=>region.kind==='place').forEach((region,index)=>{
        const areas=triggerRegionSurfaces(region,region.areaIds.map(id=>byId.get(id)).filter(Boolean),spawnPoints).map(corners=>({corners:corners.map(([x,y,z])=>({x,y,z}))})),positions=[];
        for(const area of areas)for(let i=1;i<area.corners.length-1;i++)for(const p of [area.corners[0],area.corners[i],area.corners[i+1]])positions.push(...xyz([p.x,p.y,p.z],.045));
        if(!positions.length)return;
        const color=regionColor(index),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,depthTest:true,depthWrite:false,side:THREE.DoubleSide}));mesh.renderOrder=2;mesh.raycast=()=>{};group.add(mesh);
        // One label per floor avoids placing the lower floor's name on a roof.
        const floors=new Map();for(const area of areas){const height=area.corners.reduce((sum,p)=>sum+p.z/area.corners.length,0);const key=NAV_FLOOR_BOUNDARIES[mapName]==null?'main':height>=NAV_FLOOR_BOUNDARIES[mapName]?'main':'lower';if(!floors.has(key))floors.set(key,[]);floors.get(key).push(area);}
        for(const floor of floors.values()){const sprite=label(group,regionAnchor(floor),region.name,'#f4f6f0',true);sprite.userData.labelPriority=region.areaIds.length;}
      });
    }
    if(kind==='spawns') {
      // Instancing keeps two draw calls while ensuring exact centers remain
      // readable from the map overview. Align the glyph with its actual NAV slope.
      const byArea=new Map(Object.values(navData.areas || {}).map(area=>[area.area_id,area]));
      for(const team of ['T','CT']) {
        const vertices=[];
        const at=(angle,r)=>[Math.cos(angle)*r,0,Math.sin(angle)*r];
        for(let i=0;i<24;i++) {
          const a=i/24*Math.PI*2,b=(i+1)/24*Math.PI*2;
          for(const p of [at(a,.22),at(a,.3),at(b,.3),at(a,.22),at(b,.3),at(b,.22)]) vertices.push(...p);
        }
        // Center cross indicates the exact coordinate, not the ring's outer edge.
        for(const [x,z] of [[-.09,-.025],[.09,-.025],[.09,.025],[-.09,-.025],[.09,.025],[-.09,.025],
          [-.025,-.09],[.025,-.09],[.025,.09],[-.025,-.09],[.025,.09],[-.025,.09]]) vertices.push(x,0,z);
        for(const [x,z] of [[0,.95],[.18,.4],[-.18,.4]]) vertices.push(x,0,z);
        const records=spawnPoints.filter(p=>p.team===team && p.enabled!==false).map(point=>{
          const up=new THREE.Vector3(0,1,0),area=byArea.get(point.areaId);
          if(area) for(let i=1;i<area.corners.length-1;i++) {
            const triangle={corners:[area.corners[0],area.corners[i],area.corners[i+1]]};
            if(groundHeight(triangle,point.position[0],point.position[1])==null) continue;
            const corners=triangle.corners.map(p=>new THREE.Vector3(...xyz([p.x,p.y,p.z])));
            up.crossVectors(corners[1].clone().sub(corners[0]),corners[2].clone().sub(corners[0])).normalize();
            if(up.y<0) up.negate(); break;
          }
          const yaw=point.yaw*Math.PI/180,forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
          forward.addScaledVector(up,-forward.dot(up)).normalize();
          const right=new THREE.Vector3().crossVectors(up,forward);
          const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
          const center=new THREE.Vector3(...xyz(point.position)).addScaledVector(up,.12);
          return {center,rotation};
        });
        if(!records.length) continue;
        const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:team==='T'?'#ffa954':'#65b5ff',side:THREE.DoubleSide,transparent:true,opacity:.35,depthTest:true,depthWrite:false}),records.length);
        mesh.renderOrder=5; mesh.frustumCulled=false; group.add(mesh); spawnBatches.push({mesh,records});
      }
    }
    enableObjectFloorFade(group,floorState);
    if(kind==='bombsites' || kind==='buyzones') {
      const materials=new Set();
      group.traverse(object=>{for(const material of [object.material].flat()) if(material) materials.add(material);});
      group.userData.regionMaterials=[...materials].map(material=>({material,opacity:material.opacity}));
    }
  }
  function disposeGroup(group) {
    const geometries=new Set(),materials=new Set(),textures=new Set();
    group.traverse(object=>{if(object.geometry) geometries.add(object.geometry); if(object.material) materials.add(object.material); if(object.material?.map) textures.add(object.material.map);});
    for(const texture of textures) texture.dispose(); for(const material of materials) material.dispose(); for(const geometry of geometries) geometry.dispose(); root.remove(group);
  }
  return {
    update(options,locale='en',camera,viewportHeight=800) {
      if(language!==locale) { for(const group of groups.values()) disposeGroup(group); groups.clear(); labels.length=0; spawnBatches.length=0; glows.length=0; language=locale; }
      // NAV is an independent ground reference. Without it, zones fade with
      // the actual rendered model; preserve their base fill/outline/halo style.
      // NAV 开启时正常展示；关闭时区域整体强度乘以模型透明度，模型隐藏则区域隐藏。
      const zoneOpacity=options?.planView || options?.navVisible!==false ? 1
        : options?.modelVisible && Number.isFinite(options?.modelOpacity) ? Math.max(0,Math.min(1,options.modelOpacity)) : 0;
      for(const kind of ['spawns','bombsites','buyzones']) {
        const visible=kind==='spawns' ? Boolean(options?.showSpawns) : zoneOpacity>0;
        if(visible && !groups.has(kind)) build(kind,locale);
        const group=groups.get(kind);
        if(!group)continue;
        group.visible=visible;
        if(kind!=='spawns' && group.userData.zoneOpacity!==zoneOpacity) {
          group.userData.zoneOpacity=zoneOpacity;
          for(const {material,opacity} of group.userData.regionMaterials) {
            material.opacity=opacity*zoneOpacity;
            if(material.uniforms?.uOpacity) material.uniforms.uOpacity.value=zoneOpacity;
          }
        }
      }
      const showPlaces=Boolean(options?.planView && options?.style==='places');
      if(showPlaces && !groups.has('places'))build('places',locale);
      if(groups.has('places'))groups.get('places').visible=showPlaces;
      for(const glow of glows) glow.material.uniforms.uTime.value=performance.now()/1000;
      const center=getModelCenter(); root.position.copy(center).negate();
      if(camera) {
        const matrix=new THREE.Matrix4(),sizing=new THREE.Vector3(),world=new THREE.Vector3(),direction=new THREE.Vector3();
        camera.getWorldDirection(direction);
        for(const {mesh,records} of spawnBatches) {
          records.forEach((record,i)=>{
            world.copy(record.center).sub(center);
            const perPixel=camera.isOrthographicCamera ? (camera.top-camera.bottom)/camera.zoom/Math.max(1,viewportHeight) :
              2*Math.max(.1,world.clone().sub(camera.position).dot(direction))*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,viewportHeight);
            const factor=Math.max(1,perPixel*4/.3);
            matrix.compose(record.center,record.rotation,sizing.set(factor,1,factor)); mesh.setMatrixAt(i,matrix);
          }); mesh.instanceMatrix.needsUpdate=true;
        }
      }
      for(const sprite of labels){sprite.visible=floorVisibilityAtY(sprite.userData.groundY-center.y,floorState)>0;sprite.material.depthTest=!options?.planView;
        if(camera?.isOrthographicCamera){const height=(camera.top-camera.bottom)/camera.zoom/Math.max(1,viewportHeight)*24;sprite.scale.set(height*sprite.userData.labelAspect,height,1);}else sprite.scale.set(.8*sprite.userData.labelAspect,.8,1);
      }
      if(options?.planView && camera){
        // At an overview, keep major callouts readable; zoom reveals smaller ones.
        // 俯视总览优先保留大区域，避免标签互相遮挡；放大后自动显示细点位。
        const occupied=[],world=new THREE.Vector3(),pixel=(camera.top-camera.bottom)/camera.zoom/Math.max(1,viewportHeight);
        for(const sprite of [...labels].sort((a,b)=>(b.userData.labelPriority ?? Infinity)-(a.userData.labelPriority ?? Infinity))) {
          if(!sprite.visible)continue;const point=sprite.getWorldPosition(world).project(camera);
          if(Math.abs(point.x)>1 || Math.abs(point.y)>1){sprite.visible=false;continue;}
          const width=sprite.scale.x/pixel,height=sprite.scale.y/pixel,x=(point.x+1)*camera.aspect*viewportHeight/2,y=(1-point.y)*viewportHeight/2;
          const rect={left:x-width/2-2,right:x+width/2+2,top:y-height-2,bottom:y+2};
          if(sprite.userData.placeLabel && occupied.some(other=>rect.left<other.right && rect.right>other.left && rect.top<other.bottom && rect.bottom>other.top)){sprite.visible=false;continue;}
          occupied.push(rect);
        }
      }
    },
    dispose() { for(const group of groups.values()) disposeGroup(group); groups.clear(); labels.length=0; spawnBatches.length=0; glows.length=0; scene.remove(root); },
  };
}
