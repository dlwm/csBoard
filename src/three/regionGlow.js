import * as THREE from 'three';

// A rising light curtain, not a coplanar solid slab. Ground position controls
// floor clipping; the beam's top must not accidentally select another storey.
export function createRegionGlow(edges, floorState, color='#ffe7a0') {
  // A low, quiet halo leaves players and trajectories readable inside the zone.
  // 光幕高度与透明度集中在此调整，不使用额外 bloom 或全屏渲染。
  const height=1.2, positions=[], rises=[], along=[];
  let arc=0;
  for(const [a,b] of edges) {
    const length=Math.hypot(...a.map((v,i)=>v-b[i]));
    for(const [end,rise] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
      const p=end ? b : a; positions.push(p[1]*.0254,p[2]*.0254+.075+rise*height,p[0]*.0254);
      rises.push(rise); along.push(arc+(end ? length*.0254 : 0));
    }
    arc+=length*.0254;
  }
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aRise',new THREE.Float32BufferAttribute(rises,1)); geometry.setAttribute('aAlong',new THREE.Float32BufferAttribute(along,1));
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uHeight:{value:height},uColor:{value:new THREE.Color(color)},uFloor:{value:floorState},uOpacity:{value:1}},
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`attribute float aRise; attribute float aAlong; uniform float uHeight;
      varying float vRise; varying float vAlong; varying float vGroundY;
      void main(){ vRise=aRise; vAlong=aAlong; vec4 world=modelMatrix*vec4(position,1.);
        vGroundY=world.y-aRise*uHeight; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader:`uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform vec4 uFloor;
      varying float vRise; varying float vAlong; varying float vGroundY;
      void main(){ if(uFloor.w>.5 && (vGroundY<uFloor.x || vGroundY>uFloor.y)) discard;
        float ray=pow(.5+.5*sin(vAlong*1.1-uTime*.18),3.);
        float fade=pow(max(0.,1.-vRise),2.8);
        float alpha=fade*(.12+.06*ray)*uOpacity;
        if(alpha<.003) discard;
        vec3 glow=mix(uColor,vec3(1.),.7*exp(-vRise*5.));
        gl_FragColor=vec4(glow,alpha);
        #include <colorspace_fragment>
      }`,
  });
  material.userData.csboardIgnoreFloorFade=true;
  const mesh=new THREE.Mesh(geometry,material); mesh.renderOrder=3; mesh.raycast=()=>{};
  return mesh;
}
