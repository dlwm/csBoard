import { getBundledNavData } from '../data/navData.js';
import { resolvePlaceName } from '../data/placeNames.js';

const cache=new WeakMap();
const effects=new Set(['smokegrenade_detonate','inferno_startburn','flashbang_detonate','hegrenade_detonate','decoy_started','decoy_detonate']);
export function utilityLandingPosition(note) {
  const events=note?.replay?.events || [], effectTick=note?.replay?.effectTick;
  const expected=({smoke:['smokegrenade_detonate'],fire:['inferno_startburn'],flash:['flashbang_detonate'],he:['hegrenade_detonate'],decoy:['decoy_started','decoy_detonate']})[note?.grenadeType];
  const matches=events.filter(event=>effects.has(event?.event_name) && (!expected || expected.includes(event.event_name)) && [event.x,event.y,event.z].every(Number.isFinite));
  const event=matches.find(event=>event.tick===effectTick) || matches.sort((a,b)=>a.tick-b.tick)[0];
  // A last projectile sample is not proof of where the effect happened.
  if(event) return [event.x,event.y,event.z];
  return Array.isArray(note?.landingPosition) && note.landingPosition.length===3 && note.landingPosition.every(Number.isFinite) ? note.landingPosition : null;
}
export function withUtilityLandingPlace(note) {
  if(!note || typeof note!=='object') return note;
  const prior=cache.get(note); if(prior) return prior;
  const landingPosition=utilityLandingPosition(note);
  const place=landingPosition ? resolvePlaceName(getBundledNavData(note.mapName),note.mapName,landingPosition) : null;
  // Recompute from current map labels; old display names must not survive a changed map.
  const result={...note,landingPosition,landingPlace:place?.name || '',landingRegionId:place?.regionId || null,landingPlaceSource:place?.source || null};
  cache.set(note,result); return result;
}
export function compareUtilityLandingPlaces(left,right,locale) {
  if(Boolean(left.landingPlace)!==Boolean(right.landingPlace)) return left.landingPlace ? -1 : 1;
  return (left.landingPlace || '').localeCompare(right.landingPlace || '',locale,{numeric:true,sensitivity:'base'}) ||
    (left.grenadeType || '').localeCompare(right.grenadeType || '',locale) ||
    (left.name || '').localeCompare(right.name || '',locale,{numeric:true,sensitivity:'base'}) || String(left.id).localeCompare(String(right.id));
}
