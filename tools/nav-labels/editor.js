import { validatePlaceRegions } from '../../src/data/mapPlaceRegions.js';
import { NAV_FLOOR_BOUNDARIES } from '../../src/data/navTopView.js';
import { createNavView } from './view3d.js';

const $ = id => document.getElementById(id), canvas = $('canvas');
let nav, areas = [], documentData, selectedId = '', dirty = false, generation = 0, editRevision = 0;
let erase = false, mode = 'region', selectedPointId = '';
let undo = [], redo = [];
const status = text => { $('status').textContent = text; };
const selectedPoint = () => documentData?.spawnPoints.find(point => point.id === selectedPointId);
function setMode(next) { mode = next; $('add-point').classList.toggle('active',next === 'place'); $('move-point').classList.toggle('active',next === 'move'); $('mode-status').textContent = ({region:'区域涂画模式',place:'点击可见地面添加出生点（可连续添加）',move:'点击可见地面重新定位当前出生点',inspect:'出生点查看模式'})[next]; }
const selected = () => documentData?.regions.find(region => region.id === selectedId);
const color = id => { const region = documentData?.regions.find(r=>r.id===id); if (region?.kind === 'spawn_region') return region.team === 'T' ? '#ffa954' : '#65b5ff'; let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return `hsl(${hash % 360}, 65%, 62%)`; };
const view = createNavView({
  canvas, labels: $('labels'), brushSize: () => Number($('brush').value), isErasing: () => erase, isVisible: visible,
  toolMode: () => mode, onPlace: placePoint, onSelectPoint: selectPoint,
  onStrokeStart: checkpoint,
  onPaint: (ids, deleting) => { if (paint(ids, erase || deleting)) changed(); },
  onHover: hit => { $('hover').textContent = hit ? `NAV ${hit.areaId} · Z ${hit.height.toFixed(1)}` : ''; },
});
function checkpoint() { if (!documentData) return; undo.push(JSON.stringify(documentData)); if (undo.length > 50) undo.shift(); redo = []; }
function changed() { editRevision++; dirty = true; draw(); renderRegions(); renderPoints(); }
function visible(area) {
  const cut = NAV_FLOOR_BOUNDARIES[documentData.mapName], floor = $('floor').value;
  if (cut != null && floor !== 'all' && (area.height < cut ? 'lower' : 'main') !== floor) return false;
  return ($('min-z').value === '' || area.height >= Number($('min-z').value)) && ($('max-z').value === '' || area.height <= Number($('max-z').value));
}
function renderRegions() {
  $('regions').replaceChildren();
  for (const region of documentData?.regions || []) {
    const button = document.createElement('button'); button.classList.toggle('active', region.id === selectedId);
    const dot = document.createElement('i'); dot.style.background = color(region.id);
    const name = document.createElement('span'); name.textContent = (region.source==='game_spawn_nav_cells' ? '[候选范围] ' : '') + (region.kind === 'spawn_region' ? `[${region.team} 出生区] ` : region.kind === 'buyzone' ? `[${region.team} 购买区] ` : '') + region.name;
    const count = document.createElement('small'); count.textContent = region.areaIds.length;
    button.append(dot, name, count); button.onclick = () => { selectedId = region.id; selectedPointId = ''; setMode('region'); renderRegions(); renderFields(); renderPoints(); draw(); };
    $('regions').append(button);
  }
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
}
function renderFields() { const region = selected(); $('region-team-label').hidden = !['spawn_region','buyzone'].includes(region?.kind); $('region-team').value = region?.team || 'T'; $('name').value = region?.name || ''; $('aliases').value = region?.aliases.join(', ') || ''; $('name').disabled = $('aliases').disabled = !region; }
function fit() { view.fit(); }
function draw() {
  if (!documentData) return;
  view.recolor(new Map([...documentData.regions].sort((a,b) => Number(a.id===selectedId)*2+Number(a.kind === 'spawn_region')-Number(b.id===selectedId)*2-Number(b.kind === 'spawn_region')).flatMap(region => region.areaIds.map(id => [id,region]))), selectedId, color);
  view.setLabels([...documentData.regions.map(region => ({name:region.name,ids:new Set(region.areaIds)})),
    ...documentData.spawnPoints.map(point => ({name:`${point.team} · ${point.name}`,ids:new Set([point.areaId]),position:point.position}))]);
  view.setPoints(documentData.spawnPoints,selectedPointId);
}
async function request(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取失败'); return data; }
async function load(map) {
  const revision = ++generation; status('正在读取 NAV…');
  document.querySelector('aside').inert = true; canvas.style.pointerEvents = 'none';
  try {
    const [geometry, document] = await Promise.all([request(`/src/data/nav/${map}.json`), request(`/__nav-labels/document?map=${map}`)]);
    if (generation !== revision) return;
    nav = geometry; documentData = validatePlaceRegions(document, nav, map);
    areas = Object.values(nav.areas).filter(area => area.corners?.length >= 3).map(area => ({ ...area, x: area.corners.reduce((n,p) => n + p.x / area.corners.length,0), y: area.corners.reduce((n,p) => n + p.y / area.corners.length,0), height: area.corners.reduce((n,p) => n + p.z / area.corners.length,0) }));
    selectedId = documentData.regions[0]?.id || ''; selectedPointId = ''; setMode('region'); dirty = false; undo = []; redo = [];
    $('floor').value = 'all'; $('min-z').value = $('max-z').value = '';
    view.setAreas(areas); renderRegions(); renderFields(); renderPoints(); draw(); fit(); status(`${areas.length} 个 NAV 单元。涂画仅命中可见地面，支持多层结构。`);
  } catch (error) { if (generation === revision) { status(error.message); if (documentData) $('map').value = documentData.mapName; } }
  finally { if (generation === revision) { document.querySelector('aside').inert = false; canvas.style.pointerEvents = ''; } }
}
function paint(ids, deleting = erase) {
  const region = selected(); if (!region && !deleting) { status('先新建或选择一个区域。'); return; }
  if (!ids.size) return;
  // No-op strokes do not mark the document dirty.
  const kind = region?.kind || 'place';
  const owners = new Map(documentData.regions.filter(r=>r.kind === kind).flatMap(r => r.areaIds.map(id => [id,r.id])));
  if (![...ids].some(id => deleting ? owners.has(id) : owners.get(id) !== selectedId)) return;
  for (const current of documentData.regions.filter(r=>r.kind === kind)) {
    if(current.areaIds.some(id=>ids.has(id))) markRegionEdited(current);
    current.areaIds = current.areaIds.filter(id => !ids.has(id));
  }
  if (!deleting) { markRegionEdited(region); region.areaIds.push(...ids); }
  clearInvalidLinks(); return true;
}
function markRegionEdited(region) { region.source='developer_annotation'; delete region.volumes; delete region.confirmed; delete region.derivedFromSpawnIds; }
function markPointEdited(point) { point.source='developer_annotation'; for(const key of ['entityId','entityOrigin','entityAngles','priority','enabled','targetName']) delete point[key]; }
function addRegion(team) {
  if (!documentData) return; checkpoint();
  const region = { id:`region-${crypto.randomUUID().slice(0,8)}`, name:team ? `${team} 出生区` : '新区域',
    aliases:team ? [`${team} spawn`,`${team}出生区`] : [], areaIds:[], kind:team ? 'spawn_region' : 'place',
    ...(team ? {team} : {}), source:'developer_annotation' };
  documentData.regions.push(region); selectedId=region.id; selectedPointId=''; setMode('region'); changed(); renderFields(); $('name').focus(); $('name').select();
}
$('add').onclick = () => addRegion(); $('spawn-t').onclick=()=>addRegion('T'); $('spawn-ct').onclick=()=>addRegion('CT');
$('region-team').onchange=()=>{ const region=selected(); if (!['spawn_region','buyzone'].includes(region?.kind)) return; checkpoint(); markRegionEdited(region); region.team=$('region-team').value; clearInvalidLinks(); changed(); };
function clearInvalidLinks() {
  for (const point of documentData.spawnPoints) if (point.regionId && !documentData.regions.some(r=>r.id===point.regionId && r.kind==='spawn_region' && r.team===point.team && r.areaIds.includes(point.areaId))) point.regionId=null;
}
function selectPoint(id) { selectedPointId=id; setMode('inspect'); renderPoints(); draw(); }
function renderPoints() {
  $('points').replaceChildren();
  for (const point of documentData?.spawnPoints || []) {
    const button=document.createElement('button'); button.classList.toggle('active',point.id===selectedPointId);
    const dot=document.createElement('i'); dot.style.background=point.team==='T' ? '#ffa954' : '#65b5ff';
    const name=document.createElement('span'); name.textContent=`${point.team} · ${point.name}${point.enabled === false ? '（禁用）' : ''}`; button.append(dot,name); button.onclick=()=>selectPoint(point.id); $('points').append(button);
  }
  const point=selectedPoint();
  $('point-name').value=point?.name || ''; $('point-yaw').value=point?.yaw ?? 0;
  if (point) $('point-team').value=point.team;
  for (const id of ['point-name','point-yaw','point-region','move-point','remove-point','focus-point']) $(id).disabled=!point;
  $('point-region').replaceChildren(new Option('未关联',''));
  for (const region of documentData?.regions || []) if (region.kind==='spawn_region' && region.team === point?.team && region.areaIds.includes(point.areaId)) $('point-region').append(new Option(region.name,region.id));
  $('point-region').value=point?.regionId || '';
  $('point-position').textContent=point ? `Source XYZ: ${point.position.map(n=>n.toFixed(2)).join(', ')} · NAV ${point.areaId}${point.source === 'game_spawn_entity' ? ` · 游戏实体，优先级 ${point.priority}，${point.enabled ? '启用' : '禁用'} · 原始 XYZ ${point.entityOrigin.map(n=>n.toFixed(2)).join(', ')}` : ' · 人工标记'}` : '';
}
function placePoint(hit) {
  if (!documentData) return;
  const team=$('point-team').value, regionId=documentData.regions.find(r=>r.kind==='spawn_region' && r.team===team && r.areaIds.includes(hit.areaId))?.id || null;
  const point=selectedPoint(); if (mode==='move' && !point) return;
  checkpoint();
  if (mode==='move') { markPointEdited(point); Object.assign(point,hit,{regionId}); setMode('inspect'); }
  else { const number=documentData.spawnPoints.filter(p=>p.team===team).length+1;
    const created={id:`spawn-${crypto.randomUUID().slice(0,8)}`,name:`${team} 出生点 ${number}`,aliases:[],team,yaw:0,regionId,source:'developer_annotation',...hit};
    documentData.spawnPoints.push(created); selectedPointId=created.id;
  }
  changed(); status('出生点已标记；朝向可在下方调整。手工标记不代表已验证游戏实体。');
}
$('add-point').onclick=()=>{ selectedPointId=''; renderPoints(); setMode('place'); draw(); };
$('move-point').onclick=()=>setMode('move');
$('focus-point').onclick=()=>{ const point=selectedPoint(); if (point) view.focusPoint(point); };
$('remove-point').onclick=()=>{ const point=selectedPoint(); if (!point || !confirm(`删除出生点“${point.name}”？`)) return; checkpoint(); documentData.spawnPoints=documentData.spawnPoints.filter(p=>p.id!==point.id); selectedPointId=''; setMode('inspect'); changed(); };
for (const id of ['point-name','point-yaw']) {
  $(id).onfocus=checkpoint; $(id).onblur=renderPoints;
  $(id).oninput=()=>{ const point=selectedPoint(); if (!point) return; const yaw=Number($('point-yaw').value); if (!Number.isFinite(yaw)) return;
    if(point.name!==$('point-name').value) markPointEdited(point); point.name=$('point-name').value; if(point.yaw!==((yaw%360)+360)%360) markPointEdited(point); point.yaw=((yaw%360)+360)%360;
    editRevision++; dirty=true; $('undo').disabled=!undo.length; $('redo').disabled=!redo.length; draw(); // Keep the focused input/caret intact.
    const label=$('points').querySelector('button.active span'); if (label) label.textContent=`${point.team} · ${point.name}`;
  };
}
$('point-team').onchange=()=>{ const point=selectedPoint(); if (!point || mode==='place') return; checkpoint(); markPointEdited(point); point.team=$('point-team').value; clearInvalidLinks(); changed(); };
$('point-region').onchange=()=>{ const point=selectedPoint(); if (!point) return; checkpoint(); markPointEdited(point); point.regionId=$('point-region').value || null; changed(); };
for (const id of ['name','aliases']) { $(id).onfocus = checkpoint; $(id).oninput = () => { const region = selected(); if (!region) return; markRegionEdited(region); region.name = $('name').value; region.aliases = $('aliases').value.split(/[,，]/).map(s => s.trim()).filter(Boolean); changed(); }; }
$('paint').onclick = () => { setMode('region'); erase = false; $('paint').classList.add('active'); $('erase').classList.remove('active'); draw(); };
$('erase').onclick = () => { setMode('region'); erase = true; $('erase').classList.add('active'); $('paint').classList.remove('active'); draw(); };
$('remove').onclick = () => { const region = selected(); if (!region || !confirm(`删除区域“${region.name}”？`)) return; checkpoint(); documentData.regions = documentData.regions.filter(r => r.id !== region.id); selectedId = documentData.regions[0]?.id || ''; clearInvalidLinks(); changed(); renderFields(); };
function restore(from, to) { if (!from.length) return; to.push(JSON.stringify(documentData)); documentData = JSON.parse(from.pop()); selectedPointId=''; setMode('region'); selectedId = documentData.regions.some(r => r.id === selectedId) ? selectedId : documentData.regions[0]?.id || ''; changed(); renderFields(); }
$('undo').onclick = () => restore(undo, redo); $('redo').onclick = () => restore(redo, undo);
$('fit').onclick = fit; $('top').onclick = () => view.fit(true);
for (const id of ['floor','min-z','max-z']) $(id).onchange = () => { view.refreshVisibility(); draw(); fit(); };
$('map').onchange = () => { const map = $('map').value; if (dirty && !confirm('切换地图会丢弃未保存的标注，继续？')) { $('map').value = documentData.mapName; return; } load(map); };
$('save').onclick = async () => { $('save').disabled = true; try { const revision = editRevision, generationAtSave = generation; const document = validatePlaceRegions(documentData, nav, documentData.mapName); const result = await request(`/__nav-labels/save?map=${document.mapName}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(document)}); if (generation === generationAtSave && editRevision === revision) { dirty = false; status(`已保存：${result.file}（${result.regions} 个区域）。重新构建应用后生效。`); } } catch (error) { status(error.message); } finally { $('save').disabled = false; } };
$('export').onclick = () => { try { const document = validatePlaceRegions(documentData, nav, documentData.mapName); const url = URL.createObjectURL(new Blob([JSON.stringify(document,null,2)+'\n'],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = `${document.mapName}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); } catch (error) { status(error.message); } };
$('import').onclick = () => $('file').click(); $('file').onchange = async event => { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { if (file.size > 4 * 1024 * 1024) throw new Error('标注文件不能超过 4 MB。'); const loadGeneration = generation; const content = await file.text(); if (generation !== loadGeneration) return; const imported = validatePlaceRegions(JSON.parse(content), nav, documentData.mapName); checkpoint(); documentData = imported; selectedId = imported.regions[0]?.id || ''; selectedPointId=''; setMode('region'); changed(); renderFields(); status('已导入；点击保存写入项目。'); } catch (error) { status(error.message); } };
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

try { const maps = await request('/__nav-labels/maps'); for (const map of maps) { const option = document.createElement('option'); option.value = option.textContent = map; $('map').append(option); } $('map').value = maps.includes('de_dust2') ? 'de_dust2' : maps[0]; await load($('map').value); } catch (error) { status(error.message); }
