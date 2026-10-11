import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildResourceTool } from './build-resource-tool.js';
import pin from '../config/resources/source2viewer.json' with { type:'json' };
import { parseNavBuffer } from '../src/navParser.js';
import { navFingerprint, validatePlaceRegions } from '../src/data/mapPlaceRegions.js';
import { competitiveSpawnPoints } from '../src/data/competitiveSpawns.js';
import { parseEntities, parsePhysics, insideVolume, groundHeight } from './maps/entity-data.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.includes('--help')) { console.log('make map-places ARGS="[--map de_dust2] [--input .local/maps] [--sync-nav]"\nImports map entities without exporting world models/textures. Keeps developer annotations.'); process.exit(0); }
let syncNav=false,mapFilter,input=path.join(root,'.local/maps');
for(let i=0;i<args.length;i++) { if(args[i]==='--map') mapFilter=args[++i]; else if(args[i]==='--sync-nav') syncNav=true; else if(args[i]==='--input') input=path.resolve(args[++i]); else throw new Error(`Unknown option: ${args[i]}`); }
if(mapFilter && !/^de_[a-z0-9_]+$/.test(mapFilter)) throw new Error('Invalid map name');
const maps=(await fs.readdir(input)).filter(name=>/^de_[a-z0-9_]+\.vpk$/.test(name)).map(name=>name.slice(0,-4)).filter(name=>!mapFilter || name===mapFilter).sort();
if(!maps.length) throw new Error('No map VPKs found');
const tool=path.join(await buildResourceTool(),process.platform==='win32'?'Source2Viewer-CLI.exe':'Source2Viewer-CLI');
const outputRoot=path.join(root,'src/data/mapPlaces'), workRoot=path.join(root,'.local/map-annotations');
await fs.mkdir(outputRoot,{recursive:true}); await fs.mkdir(workRoot,{recursive:true});
function run(args) { return new Promise((resolve,reject)=>{ const child=spawn(tool,args,{stdio:['ignore','pipe','pipe']}); let out='',err=''; child.stdout.on('data',chunk=>out+=chunk); child.stderr.on('data',chunk=>err+=chunk); child.on('error',reject); child.on('close',code=>code===0?resolve(out):reject(new Error(`Source2Viewer failed (${code}): ${err || out}`))); }); }
async function files(dir,extension) { const found=[]; for(const entry of await fs.readdir(dir,{withFileTypes:true})) { const file=path.join(dir,entry.name); if(entry.isDirectory()) found.push(...await files(file,extension)); else if(entry.name.endsWith(extension)) found.push(file); } return found; }
async function hash(file) { const digest=createHash('sha256'); for await(const chunk of createReadStream(file)) digest.update(chunk); return digest.digest('hex'); }
const results=[];
for(const mapName of maps) {
  console.log(`${mapName}: extracting entities and NAV…`);
  const vpk=path.join(input,`${mapName}.vpk`), work=path.join(workRoot,mapName);
  const sourceHash=await hash(vpk), extracted=path.join(work,`source-${sourceHash.slice(0,16)}`);
  await fs.mkdir(extracted,{recursive:true});
  try {
    const navPath=path.join(root,'src/data/nav',`${mapName}.json`), originalNav=await fs.readFile(navPath,'utf8');
    let nav=JSON.parse(originalNav), navUpdated=false;
    await run(['-i',vpk,'-o',path.join(extracted,'entities'),'--vpk_extensions','vents_c','-d']);
    await run(['-i',vpk,'-o',path.join(extracted,'nav'),'--vpk_extensions','nav']);
    const entities=(await Promise.all((await files(path.join(extracted,'entities'),'.vents')).map(async file=>parseEntities(await fs.readFile(file,'utf8'))))).flat();
    const navFile=path.join(extracted,'nav','maps',`${mapName}.nav`), bytes=await fs.readFile(navFile);
    const sourceNav=parseNavBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if(navFingerprint(sourceNav)!==navFingerprint(nav)) {
      if(!syncNav) throw new Error('Map NAV differs from bundled NAV; use --sync-nav to import the matching NAV.');
      let previousDocument;
      try { previousDocument=JSON.parse(await fs.readFile(path.join(outputRoot,`${mapName}.json`),'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
      if(previousDocument?.regions.some(r=>r.source==='developer_annotation') || previousDocument?.spawnPoints?.some(p=>p.source==='developer_annotation')) throw new Error('NAV changed and manual annotations exist; remap them explicitly before syncing NAV.');
      await fs.writeFile(path.join(work,'bundled-nav-before-import.json'),originalNav,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST') throw error;});
      nav=sourceNav; navUpdated=true; console.log(`${mapName}: using matching NAV from the VPK.`);
    }
    const volumes=entities.filter(e=>['env_cs_place','func_buyzone','func_bomb_target'].includes(e.classname) && typeof e.model==='string');
    const models=[...new Set(volumes.map(e=>`${e.model}_c`))];
    if(models.length) await run(['-i',vpk,'-o',path.join(extracted,'models'),'--vpk_filepath',models.join(','),'--threads','2']);
    const loaded=[]; const warnings=[];
    for(const entity of volumes) {
      const file=path.join(extracted,'models',`${entity.model}_c`);
      try { const text=await run(['-i',file,'-b','PHYS']); const hulls=parsePhysics(text); loaded.push({...entity,hulls}); }
      catch(error) { warnings.push({entityId:entity.hammeruniqueid,name:entity.place_name || entity.classname,error:error.message}); }
    }
    const areas=Object.values(nav.areas).filter(a=>a.corners?.length>=3);
    const regions=[], grouped=new Map();
    for(const entity of loaded) {
      const team=entity.classname==='func_buyzone' ? ({2:'T',3:'CT'})[entity.teamnum] : null;
      if(entity.classname==='func_buyzone' && !team) { warnings.push({name:'buyzone',error:'Unsupported team number'}); continue; }
      const site=entity.classname==='func_bomb_target' ? ({0:'A',1:'B'})[entity.bomb_site_designation] : null;
      if(entity.classname==='func_bomb_target' && !site) { warnings.push({name:'bombsite',error:'Missing A/B designation'}); continue; }
      const kind=site?'bombsite':team?'buyzone':'place', name=site?`Bombsite ${site}`:team?`${team} Buy Zone`:entity.place_name;
      if(!name) continue;
      const key=`${kind}:${name}`;
      if(!grouped.has(key)) grouped.set(key,{id:`game-${createHash('sha256').update(key).digest('hex').slice(0,12)}`,name,aliases:site?[site,`${site}包点`]:[],kind,...(site?{site}:{}),...(team?{team}:{}),source:'game_place_volume',areaIds:[],volumes:[]});
      grouped.get(key).volumes.push({entityId:String(entity.hammeruniqueid || entity.compile_source_id),origin:entity.origin,angles:entity.angles,scales:entity.scales,targetName:entity.targetname || '',enabled:entity.enabled!==false && entity.enabled!==0 && entity.enabled!=='0',hulls:entity.hulls});
    }
    // The region represents the NAV cell's centroid, evaluated 16 units above ground.
    // Use real convex planes and Source XYZ, not XY bounding boxes; floors remain separate.
    const assignments=new Set();
    for(const region of grouped.values()) for(const area of areas) {
      const center=area.corners.reduce((p,c)=>p.map((v,i)=>v+[c.x,c.y,c.z][i]/area.corners.length),[0,0,0]); 
      if(region.volumes.some(volume=>(region.kind==='place' ? [16] : [0,16,32]).some(offset=>insideVolume([center[0],center[1],center[2]+offset],volume,volume.hulls)))) {
        const key=`${region.kind}:${area.area_id}`; if(assignments.has(key)) continue;
        assignments.add(key); region.areaIds.push(area.area_id);
      }
    }
    for(const region of grouped.values()) if(region.areaIds.length) regions.push(region);
    // Official place names describing spawn areas become a distinct overlay.
    for(const place of regions.filter(r=>r.kind==='place')) {
      const team=/^(tspawn|terroristspawn)$/i.test(place.name)?'T':/^(ctspawn|counterterroristspawn)$/i.test(place.name)?'CT':null;
      if(team) regions.push({...place,id:`${place.id}-spawn`,kind:'spawn_region',team,name:`${team} Spawn Region`,aliases:[place.name,`${team} spawn`,`${team}出生区`]});
    }
    const spawnEntities=entities.filter(e=>['info_player_terrorist','info_player_counterterrorist'].includes(e.classname)), spawnPoints=[], unresolved=[];
    const counts={T:0,CT:0};
    for(const entity of spawnEntities) {
      const team=entity.classname==='info_player_terrorist'?'T':'CT', origin=entity.origin;
      if(!Array.isArray(origin) || !origin.every(Number.isFinite)) { unresolved.push(entity);continue; }
      const matches=areas.map(area=>({area,height:groundHeight(area,origin[0],origin[1])})).filter(c=>c.height!=null && origin[2]-c.height>=-16 && origin[2]-c.height<=128).sort((a,b)=>Number(a.height>origin[2]+.1)-Number(b.height>origin[2]+.1) || Math.abs(origin[2]-a.height)-Math.abs(origin[2]-b.height));
      const nearest=matches[0]; if(!nearest) { unresolved.push(entity);continue; }
      const areaId=nearest.area.area_id, position=[origin[0],origin[1],nearest.height], number=++counts[team];
      const entityId=String(entity.hammeruniqueid || entity.compile_source_id);
      spawnPoints.push({id:`game-spawn-${createHash('sha256').update(team+':'+entityId).digest('hex').slice(0,12)}`,name:`${team} Spawn ${number}`,aliases:[],team,position,areaId,yaw:entity.angles?.[1] || 0,
        regionId:regions.find(r=>r.kind==='spawn_region' && r.team===team && r.areaIds.includes(areaId))?.id || null,
        source:'game_spawn_entity',entityId,entityOrigin:origin,entityAngles:entity.angles || [0,0,0],priority:Number(entity.priority || 0),enabled:entity.enabled!==false && entity.enabled!==0 && entity.enabled!=='0',targetName:entity.targetname || ''});
    }
    const allSpawnPoints=[...spawnPoints];
    spawnPoints.splice(0,spawnPoints.length,...competitiveSpawnPoints(spawnPoints));
    await fs.writeFile(path.join(work,'all-spawn-entities.json'),JSON.stringify(allSpawnPoints,null,2)+'\n');
    // Official place volumes need not surround every actual spawn (e.g. 2v2
    // spawns, relocated starts). Mark only their occupied NAV cells as candidates;
    // never invent a bounding rectangle/convex hull across walls or storeys.
    const occupied=new Set(regions.filter(r=>r.kind==='spawn_region').flatMap(r=>r.areaIds));
    const candidates=new Map();
    for(const point of spawnPoints.filter(p=>!p.regionId)) {
      if(occupied.has(point.areaId)) continue;
      const key=`${point.team}:${point.targetName}:${point.enabled}`;
      if(!candidates.has(key)) candidates.set(key,{id:`spawn-candidate-${createHash('sha256').update(key).digest('hex').slice(0,12)}`,
        name:`${point.team} Spawn Cells${point.enabled ? '' : ' (disabled)'}`,aliases:[],kind:'spawn_region',team:point.team,
        source:'game_spawn_nav_cells',confirmed:false,derivedFromSpawnIds:[],areaIds:[]});
      const region=candidates.get(key);
      // A NAV cell can contain multiple starts. Attach them to the existing
      // same-team candidate rather than creating duplicate region ownership.
      const assigned=regions.find(r=>r.kind==='spawn_region' && r.team===point.team && r.areaIds.includes(point.areaId)) ||
        [...candidates.values()].find(r=>r.team===point.team && r.areaIds.includes(point.areaId));
      if(assigned && assigned.id!==region.id) { point.regionId=assigned.id; assigned.derivedFromSpawnIds?.push(point.id); continue; }
      if(!region.areaIds.includes(point.areaId)) region.areaIds.push(point.areaId);
      region.derivedFromSpawnIds.push(point.id); point.regionId=region.id;
    }
    // Resolve rare cross-team overlaps conservatively rather than merging teams.
    const usedCells=new Set(regions.filter(r=>r.kind==='spawn_region').flatMap(r=>r.areaIds));
    for(const region of candidates.values()) {
      region.areaIds=region.areaIds.filter(id=>!usedCells.has(id));
      if(region.areaIds.length) { region.derivedFromSpawnIds=region.derivedFromSpawnIds.filter(id=>spawnPoints.some(p=>p.id===id && region.areaIds.includes(p.areaId))); regions.push(region); for(const id of region.areaIds) usedCells.add(id); }
    }
    const destination=path.join(outputRoot,`${mapName}.json`);
    let previous; try { const existing=JSON.parse(await fs.readFile(destination,'utf8')); if(!navUpdated) previous=validatePlaceRegions(existing,nav,mapName); } catch(error) { if(error.code!=='ENOENT') throw new Error(`Existing annotations cannot be merged: ${error.message}`); }
    // Preserve developer edits. Imported game records are regenerated deterministically.
    const manualRegions=previous?.regions.filter(r=>r.source==='developer_annotation') || [];
    for(const manual of manualRegions) for(const generated of regions) if(generated.kind===manual.kind) generated.areaIds=generated.areaIds.filter(id=>!manual.areaIds.includes(id));
    const manualPoints=previous?.spawnPoints.filter(p=>p.source==='developer_annotation') || [];
    const document={version:1,mapName,navFingerprint:navFingerprint(nav),sourceInfo:{mapVpkSha256:sourceHash,extractorVersion:pin.version,assignment:'place: NAV centroid +16 Z; triggers: ground/+16/+32 Z; convex game volumes'},regions:[...regions.filter(r=>r.areaIds.length && !manualRegions.some(m=>m.id===r.id)),...manualRegions],spawnPoints:[...spawnPoints.filter(p=>!manualPoints.some(m=>m.id===p.id)),...manualPoints]};
    for(const point of document.spawnPoints) if(point.regionId && !document.regions.some(r=>r.id===point.regionId && r.team===point.team && r.areaIds.includes(point.areaId))) point.regionId=null;
    const normalized=validatePlaceRegions(document,nav,mapName);
    if(navUpdated) { const staging=`${navPath}.tmp`; await fs.writeFile(staging,JSON.stringify(nav)+'\n'); await fs.rename(staging,navPath); }
    const temporary=`${destination}.tmp`; await fs.writeFile(temporary,JSON.stringify(normalized,null,2)+'\n'); await fs.rename(temporary,destination);
    const result={mapName,navUpdated,unlinkedSpawnPoints:normalized.spawnPoints.filter(p=>!p.regionId).length,derivedSpawnRegions:normalized.regions.filter(r=>r.source==='game_spawn_nav_cells').length,regions:normalized.regions.length,spawnPoints:spawnPoints.length,spawnEntities:spawnEntities.length,excludedNonCompetitiveSpawns:allSpawnPoints.length-spawnPoints.length,unresolved:unresolved.length,warnings,sourceHash};
    await fs.writeFile(path.join(work,'report.json'),JSON.stringify({...result,unresolvedEntities:unresolved},null,2)+'\n'); results.push(result);
    console.log(`${mapName}: ${normalized.regions.length} regions, ${spawnPoints.length}/${spawnEntities.length} spawn points (${unresolved.length} unresolved).`);
  } catch(error) { results.push({mapName,error:error.message}); console.error(`${mapName}: ${error.message}`); }
}
let summary=results;
if(mapFilter) {
  let previous=[]; try { previous=JSON.parse(await fs.readFile(path.join(workRoot,'summary.json'),'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  summary=[...previous.filter(row=>!results.some(r=>r.mapName===row.mapName)),...results].sort((a,b)=>a.mapName.localeCompare(b.mapName));
}
await fs.writeFile(path.join(workRoot,'summary.json'),JSON.stringify(summary,null,2)+'\n');
if(results.some(r=>r.error || r.warnings?.length || r.unresolved)) process.exitCode=1;
