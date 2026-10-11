// Shared 2D map legend: deterministic colors and labels anchored on real NAV.
// 二维地图共用配色及标签锚点；文字落在真实 NAV 内，不用包围盒中心猜位置。
const COLORS=['#6e9bc8','#ba87bc','#85b98a','#c7a566','#b47e7d','#79b3bc','#aaa778','#9292c4','#c49772','#7ea797','#b4a1c0','#97b87d'];
export function regionColor(index){return COLORS[index % COLORS.length];}
export function regionAnchor(areas){
  const centers=areas.map(area=>area.corners.reduce((sum,p)=>sum.map((v,i)=>v+[p.x,p.y,p.z][i]/area.corners.length),[0,0,0]));
  if(!centers.length)return null;
  const mean=centers.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/centers.length),[0,0,0]);
  return centers.reduce((a,b)=>Math.hypot(a[0]-mean[0],a[1]-mean[1])<Math.hypot(b[0]-mean[0],b[1]-mean[1])?a:b);
}
export const svgText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
