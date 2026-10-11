// Shared proximity snapping for board players, spawns and utility origins.
// 人员吸附目标包括出生位和已添加道具起点；这是一次性对齐，不是绑定。
// Source units: 24 = 0.6096 m entry distance; 36 = 0.9144 m release distance.
// Height is checked independently so a nearby position on another floor cannot snap.
export const BOARD_SNAP_DISTANCE=24;
export const BOARD_SNAP_RELEASE_DISTANCE=36;
export const BOARD_SNAP_HEIGHT=12;
export function nearestBoardSnap(points, position, {previousId=null,accept=()=>true}={}) {
  const valid=point=>Math.abs(point.position[2]-position[2])<=BOARD_SNAP_HEIGHT && accept(point);
  const distance=point=>Math.hypot(point.position[0]-position[0],point.position[1]-position[1]);
  const previous=points.find(point=>point.id===previousId);
  if(previous && valid(previous) && distance(previous)<=BOARD_SNAP_RELEASE_DISTANCE) return previous;
  return points.filter(valid).map(point=>({point,distance:distance(point)})).filter(candidate=>candidate.distance<=BOARD_SNAP_DISTANCE).sort((a,b)=>a.distance-b.distance)[0]?.point || null;
}
