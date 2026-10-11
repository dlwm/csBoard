import { squareRadarBounds } from './radarBounds.js';
import { getMapPlaceAnnotations } from './mapPlaceData.js';
import { competitiveSpawnPoints } from './competitiveSpawns.js';
import { triggerRegionSurfaces } from './regionSurfaces.js';
import { regionColor, regionAnchor, svgText } from './mapRegionPresentation.js';

// Shared floor cuts keep the 2D NAV preview and 3D floor filter aligned.
export const NAV_FLOOR_BOUNDARIES = {
  cs_tutorial: 66.54,
  de_nuke: -495,
  // Main yards sit around -200; the lower yard is around -300.
  // -50 only isolated rooftops and incorrectly put both yards downstairs.
  de_train: -250,
  de_vertigo: 11700,
};

const svgDataUrl = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const averageHeight = (area) => {
  const heights = (area.corners || []).map((point) => Number(point.z)).filter(Number.isFinite);
  return heights.length ? heights.reduce((sum, height) => sum + height, 0) / heights.length : 0;
};

// Mixed polygon winding must not subtract overlapping walkable NAV surfaces.
const surfaceCorners = (area) => {
  const corners = area.corners;
  const winding = corners.reduce((sum, point, index) => {
    const next = corners[(index + 1) % corners.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  return winding < 0 ? [...corners].reverse() : corners;
};

// NAV uses game X/Y for the top plane. The SVG flips Y to match the 3D radar projection.
export function buildNavTopViewLayers(navData, mapName, { style = 'plain' } = {}) {
  const areas = Object.values(navData?.areas || {}).filter((area) => (area.corners || []).length >= 3);
  if (!areas.length) return [];
  const points = areas.flatMap((area) => area.corners);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const square = squareRadarBounds(minX, maxX, minY, maxY);
  const width = square.size;
  const height = square.size;
  // Radar markers reserve four percent on each side, so the NAV uses the same inset.
  const padX = width * 4 / 92;
  const padY = height * 4 / 92;
  const left = square.minX - padX;
  const top = -square.minY - square.size - padY;
  const viewBox = `${left} ${top} ${width + padX * 2} ${height + padY * 2}`;
  const annotations=getMapPlaceAnnotations(navData,mapName);
  const places=annotations.regions.filter(region=>region.kind==='place');
  const boundary = NAV_FLOOR_BOUNDARIES[mapName];
  const layerDefinitions = boundary == null
    ? [{ id: 'main', areas }]
    : [
      { id: 'main', areas: areas.filter((area) => averageHeight(area) >= boundary) },
      { id: 'lower', areas: areas.filter((area) => averageHeight(area) < boundary) },
    ];

  return layerDefinitions.filter((layer) => layer.areas.length).map((layer) => {
    const heights = layer.areas.map(averageHeight);
    const minHeight = Math.min(...heights);
    const heightRange = Math.max(...heights) - minHeight;
    const colors = layer.id === 'lower' ? [[37, 56, 66], [103, 130, 143]] : [[51, 70, 79], [151, 174, 184]];
    // Shade by NAV elevation, not screen position. A shared scale within each
    // floor keeps equal-height neighbors seamless and makes raised ground lighter.
    const heightColor = (height) => {
      const ratio = heightRange > 0 ? (height - minHeight) / heightRange : 0.5;
      return `rgb(${colors[0].map((value, index) => Math.round(value + (colors[1][index] - value) * ratio)).join(',')})`;
    };
    const surfaces = [...layer.areas]
      .sort((left, right) => averageHeight(left) - averageHeight(right))
      .map((area) => {
        const path = `M${surfaceCorners(area).map((point) => `${point.x} ${-point.y}`).join('L')}Z`;
        const color = heightColor(averageHeight(area));
        // Same-color overlap covers rasterization hairlines without showing NAV edges.
        return `<path d="${path}" fill="${color}" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`;
      })
      .join('');
    const byId=new Map(layer.areas.map(area=>[area.area_id,area]));
    const overlays=[],labels=[];
    const starts=competitiveSpawnPoints(annotations.spawnPoints);
    const clipped=region=>triggerRegionSurfaces(region,region.kind==='place'?region.areaIds.map(id=>byId.get(id)).filter(Boolean):layer.areas,starts).map(corners=>({corners:corners.map(([x,y,z])=>({x,y,z}))}));
    const label=(point,name,color)=>`<text x="${point[0]}" y="${-point[1]}" text-anchor="middle" dominant-baseline="central" fill="${color}" stroke="#09100f" stroke-width="${width*.0035}" paint-order="stroke" font-family="system-ui,sans-serif" font-weight="600" font-size="${width*.023}">${svgText(name)}</text>`;
    const fill=(selected,color,opacity)=>selected.map(area=>`<path d="M${surfaceCorners(area).map(point=>`${point.x} ${-point.y}`).join('L')}Z" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2"/>`).join('');
    if(style==='places') places.forEach((region,index)=>{const selected=clipped(region);if(!selected.length)return;const color=regionColor(index);overlays.push(fill(selected,color,.85));labels.push(label(regionAnchor(selected),region.name,'#f4f6f0'));});
    for(const region of annotations.regions.filter(region=>['buyzone','bombsite'].includes(region.kind))){const selected=clipped(region);if(!selected.length)continue;const color=region.kind==='bombsite'?'#ee6262':region.team==='T'?'#ffa954':'#65b5ff';overlays.push(fill(selected,color,.45));if(region.kind==='bombsite' && style!=='places')labels.push(label(regionAnchor(selected),region.site,color));}
    for(const spawn of competitiveSpawnPoints(annotations.spawnPoints).filter(point=>byId.has(point.areaId)))overlays.push(`<circle cx="${spawn.position[0]}" cy="${-spawn.position[1]}" r="${width*.006}" fill="${spawn.team==='T'?'#ffa954':'#65b5ff'}" stroke="#09100f" stroke-width="${width*.002}"/>`);
    return {
      id: layer.id,
      url: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><rect x="${left}" y="${top}" width="${width + padX * 2}" height="${height + padY * 2}" fill="#09100f"/>${surfaces}${overlays.join('')}${labels.join('')}</svg>`),
    };
  });
}
