// Source XYZ convex-volume queries shared by map importing and runtime labels.
// 三维凸体积判断保留高度，不将多层区域简化为平面包围盒。
function volumeLocal(point, entity) {
  const origin=entity.origin || [0,0,0], scales=entity.scales || [1,1,1];
  let [x,y,z]=point.map((v,i)=>v-origin[i]);
  const [pitch,yaw,roll]=(entity.angles || [0,0,0]).map(v=>v*Math.PI/180);
  // Inverse Source AngleMatrix: Rz(yaw) * Ry(pitch) * Rx(roll) * scale.
  [x,y]=[Math.cos(yaw)*x+Math.sin(yaw)*y,-Math.sin(yaw)*x+Math.cos(yaw)*y];
  [x,z]=[Math.cos(pitch)*x-Math.sin(pitch)*z,Math.sin(pitch)*x+Math.cos(pitch)*z];
  [y,z]=[Math.cos(roll)*y+Math.sin(roll)*z,-Math.sin(roll)*y+Math.cos(roll)*z];
  [x,y,z]=[x/scales[0],y/scales[1],z/scales[2]];
  return [x,y,z];
}
export function insideVolume(point, entity, hulls) {
  const [x,y,z]=volumeLocal(point,entity);
  return hulls.some(hull=>hull.planes.every(p=>p[0]*x+p[1]*y+p[2]*z<=p[3]+.1));
}

export function groundHeight(area, x, y) {
  const a=area.corners[0];
  for(let i=1;i<area.corners.length-1;i++) {
    const b=area.corners[i],c=area.corners[i+1],den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
    if(Math.abs(den)<1e-8) continue;
    const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den, v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den;
    if(u>=-1e-5 && v>=-1e-5 && u+v<=1+1e-5) return u*a.z+v*b.z+(1-u-v)*c.z;
  }
  return null;
}

// Clip a ground polygon against the real three-dimensional convex trigger.
// Areas crossing a trigger edge are clipped, not included as whole NAV cells.
export function clipToVolume(polygon, volume, hull) {
  let output=polygon.map(p=>[...p]);
  for(const plane of hull.planes) {
    if(!output.length) break;
    const distance=point=>{
      // Transforming the plane via sample-space avoids dropping rotation/scale.
      const [x,y,z]=volumeLocal(point,volume);
      // Classification and intersection must use the same tolerance plane.
      // Mixing <=0.1 with an intersection at 0 extrapolates outside thin NAV
      // triangles, distorting places such as Mirage A and its T purchase zone.
      // 判内与求交使用同一容差平面，避免薄区域边缘交点越出原三角面。
      return plane[0]*x+plane[1]*y+plane[2]*z-plane[3]-(.1-1e-6);
    };
    const input=output; output=[];
    for(let i=0;i<input.length;i++) {
      const a=input[i],b=input[(i+1)%input.length], da=distance(a),db=distance(b), ai=da<=0,bi=db<=0;
      if(ai) output.push(a);
      if(ai!==bi) { const t=da/(da-db); output.push(a.map((v,j)=>v+(b[j]-v)*t)); }
    }
  }
  return output.length>=3 ? output : [];
}
