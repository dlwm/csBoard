// CS2's spawn priority chooses lower numbers first. For a competitive layout,
// use the enabled primary pool separately for each team, not the first five
// entities and not the overflow/2v2 pool. Some maps legitimately have >5 starts.
// 竞技候选池按每队最低优先级选择；不能随意截取五个，地图可能有更多合法随机出生位。
export function competitiveSpawnPoints(points) {
  const enabled=points.filter(point=>point.enabled!==false && !/2v2|wingman|casual|deathmatch|armsrace|gungame|warmup/i.test(point.targetName || ''));
  const minimum=new Map();
  for(const point of enabled) if(point.source==='game_spawn_entity' && Number.isFinite(point.priority)) minimum.set(point.team,Math.min(minimum.get(point.team) ?? Infinity,point.priority));
  return enabled.filter(point=>point.source!=='game_spawn_entity' || point.priority===minimum.get(point.team));
}
