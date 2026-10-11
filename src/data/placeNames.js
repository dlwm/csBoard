import { getMapPlaceAnnotations } from './mapPlaceData.js';
import { insideVolume, groundHeight } from './placeGeometry.js';

const indices = new WeakMap();
function index(nav,mapName) {
  const cached=indices.get(nav); if(cached?.mapName===mapName) return cached;
  const regions=getMapPlaceAnnotations(nav,mapName).regions.filter(region=>region.kind==='place');
  const byArea=new Map(Object.values(nav.areas || {}).map(area=>[area.area_id,area]));
  const result={mapName,regions,byArea}; indices.set(nav,result); return result;
}
export function resolvePlaceName(nav,mapName,position) {
  if(!nav || !Array.isArray(position) || position.length!==3 || !position.every(Number.isFinite)) return null;
  const data=index(nav,mapName), [x,y,z]=position;
  const navContains = region => region.areaIds.some(id=>{
    const area=data.byArea.get(id); if(!area) return false;
    const ground=groundHeight(area,x,y);
    // Manual NAV labels may describe space immediately above the ground;
    // do not assign a distant floor or invent a nearest-place fallback.
    return ground!=null && z>=ground-16 && z<=ground+96;
  });
  const manual=data.regions.find(region=>region.source==='developer_annotation' && navContains(region));
  if(manual) return {name:manual.name,regionId:manual.id,source:manual.source,precision:'named_nav_region'};
  const official=data.regions.find(region=>region.volumes?.some(volume=>insideVolume(position,volume,volume.hulls)));
  if(official) return {name:official.name,regionId:official.id,source:official.source,precision:'game_place_volume'};
  // Older annotations without volumes remain usable, but real game volumes must
  // not fall back to NAV centroids outside their original three-dimensional shape.
  const legacy=data.regions.find(region=>!region.volumes?.length && navContains(region));
  return legacy ? {name:legacy.name,regionId:legacy.id,source:legacy.source,precision:'named_nav_region'} : null;
}
