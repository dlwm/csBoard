// Named regions refer to actual NAV polygons, never to painted image pixels.
// 标注记录真实 NAV 多边形编号；高度随区域保留，不从截图猜测坐标。
export function navFingerprint(nav) {
  let hash = 2166136261;
  const areas = Object.values(nav?.areas || {}).sort((a, b) => a.area_id - b.area_id);
  for (const area of areas) for (const char of JSON.stringify([area.area_id, area.corners])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `nav1-${areas.length}-${hash.toString(16).padStart(8, '0')}`;
}
export function validatePlaceRegions(document, nav, mapName) {
  if (document?.version !== 1 || document.mapName !== mapName || document.navFingerprint !== navFingerprint(nav) || !Array.isArray(document.regions) || document.regions.length > 512) throw new Error('标注与当前地图/NAV 不匹配，请使用同一版本的 NAV。');
  const ids = new Set(), assigned = new Set(), known = new Set(Object.values(nav.areas).map(a => a.area_id));
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  function volumes(values) {
    if (values == null) return [];
    if (!Array.isArray(values) || values.length > 256) throw new Error('游戏区域体积无效。');
    return values.map(volume => {
      if (!text(volume.entityId) || !vector(volume.origin) || !vector(volume.angles) || !vector(volume.scales) || volume.scales.some(n=>n===0) || !Array.isArray(volume.hulls) || volume.hulls.length > 256) throw new Error('游戏区域变换无效。');
      const hulls=volume.hulls.map(hull=>{ if(!Array.isArray(hull.planes) || !hull.planes.length || hull.planes.length>256 || !hull.planes.every(p=>Array.isArray(p) && p.length===4 && p.every(Number.isFinite))) throw new Error('游戏区域平面无效。'); return {planes:hull.planes.map(p=>[...p])}; });
      return {entityId:volume.entityId,origin:[...volume.origin],angles:[...volume.angles],scales:[...volume.scales],targetName:typeof volume.targetName==='string'?volume.targetName:'',enabled:volume.enabled!==false,hulls};
    });
  }
  const regions = document.regions.map(region => {
    if (!/^[a-z0-9_-]{1,64}$/i.test(region.id || '') || ids.has(region.id) || !text(region.name) || !Array.isArray(region.aliases) || region.aliases.length > 24 || !region.aliases.every(text) || !Array.isArray(region.areaIds)) throw new Error('区域编号、名称或别名无效。');
    ids.add(region.id);
    const kind = region.kind ?? 'place';
    if (!['place', 'spawn_region', 'buyzone', 'bombsite'].includes(kind) || (['spawn_region','buyzone'].includes(kind) && !['T', 'CT'].includes(region.team))) throw new Error('出生区域需要指定 T 或 CT 阵营。');
    if(kind==='bombsite' && !['A','B'].includes(region.site)) throw new Error('包点需要指定 A 或 B。');
    const areaIds = [...new Set(region.areaIds)].sort((a, b) => a - b);
    for (const id of areaIds) {
      if (!Number.isInteger(id) || !known.has(id) || assigned.has(`${kind}:${id}`)) throw new Error(`NAV ${id} 不存在或被多个区域重复使用。`);
      assigned.add(`${kind}:${id}`);
    }
    return { id: region.id, name: region.name.trim(), aliases: [...new Set(region.aliases.map(v => v.trim()))], areaIds, kind, ...(kind==='bombsite' ? {site:region.site} : {}), ...(['spawn_region','buyzone'].includes(kind) ? { team: region.team } : {}), ...(region.volumes?.length ? {volumes:volumes(region.volumes)} : {}), source: ['game_place_volume','game_spawn_nav_cells'].includes(region.source) ? region.source : 'developer_annotation',
      ...(region.source==='game_spawn_nav_cells' ? {confirmed:false,derivedFromSpawnIds:Array.isArray(region.derivedFromSpawnIds) && region.derivedFromSpawnIds.every(id=>typeof id==='string' && /^[a-z0-9_-]{1,64}$/i.test(id)) ? [...new Set(region.derivedFromSpawnIds)] : []} : {}) };
  });
  if (document.spawnPoints != null && (!Array.isArray(document.spawnPoints) || document.spawnPoints.length > 512)) throw new Error('出生点列表无效或超过 512 个。');
  const byArea = new Map(Object.values(nav.areas).map(area => [area.area_id,area]));
  const spawnPoints = (document.spawnPoints || []).map(point => {
    if (!/^[a-z0-9_-]{1,64}$/i.test(point.id || '') || ids.has(point.id) || !text(point.name) ||
      !['T','CT'].includes(point.team) || !Array.isArray(point.position) || point.position.length !== 3 ||
      !point.position.every(Number.isFinite) || !Number.isInteger(point.areaId) || !byArea.has(point.areaId) ||
      !Number.isFinite(point.yaw) || (point.aliases != null && (!Array.isArray(point.aliases) || point.aliases.length > 24 || !point.aliases.every(text)))) throw new Error('出生点名称、阵营、坐标、朝向或 NAV 编号无效。');
    ids.add(point.id);
    const area = byArea.get(point.areaId), [x,y,z] = point.position;
    if (!polygonTouchesBrush(area.corners,x,y,.1) || z < Math.min(...area.corners.map(p => p.z)) - 16 || z > Math.max(...area.corners.map(p => p.z)) + 16) throw new Error('出生点坐标不在指定 NAV 地面范围内。');
    const regionId = point.regionId ?? null;
    if (regionId != null && !regions.some(r => r.id === regionId && r.kind === 'spawn_region' && r.team === point.team && r.areaIds.includes(point.areaId))) throw new Error('出生点不属于指定阵营的出生区域。');
    const imported=point.source === 'game_spawn_entity';
    if(imported && (!text(point.entityId) || !vector(point.entityOrigin) || !vector(point.entityAngles) || !Number.isInteger(point.priority) || typeof point.enabled !== 'boolean' || typeof point.targetName !== 'string' || point.targetName.length>256)) throw new Error('游戏出生实体元数据无效。');
    return { id:point.id, name:point.name.trim(), aliases:[...new Set((point.aliases || []).map(v=>v.trim()))], team:point.team,
      position:[...point.position], areaId:point.areaId, yaw:((point.yaw % 360)+360)%360, regionId, source:imported ? 'game_spawn_entity' : 'developer_annotation',
      ...(imported ? {entityId:point.entityId,entityOrigin:[...point.entityOrigin],entityAngles:[...point.entityAngles],priority:point.priority,enabled:point.enabled,targetName:point.targetName} : {}) };
  });
  const info=document.sourceInfo;
  if(info && (!/^[a-f0-9]{64}$/.test(info.mapVpkSha256 || '') || typeof info.extractorVersion !== 'string' || info.extractorVersion.length>32 || typeof info.assignment !== 'string' || info.assignment.length>256)) throw new Error('地图来源信息无效。');
  return { version: 1, mapName, navFingerprint: document.navFingerprint, regions, spawnPoints,
    ...(info ? {sourceInfo:{mapVpkSha256:info.mapVpkSha256,extractorVersion:info.extractorVersion,assignment:info.assignment}} : {}) };
}
export function polygonTouchesBrush(corners, x, y, radius) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[j], b = corners[i];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
    if ((x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2 <= radius * radius) return true;
  }
  return inside;
}
