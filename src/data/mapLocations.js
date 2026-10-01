import { navAreaGeometry } from './navQueries.js';
import landmarks from './mapLandmarks.json';
import { NAV_FLOOR_BOUNDARIES } from './navTopView.js';
import { squareRadarBounds } from './radarBounds.js';

const geometryCache = new WeakMap();
const point = values => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite) ? values : null;
const normalize = text => String(text || '').toLowerCase().replace(/[\s_-]+/g, '');
const markerAliases = {
  A: ['A', 'A点', 'A包点', 'A site', 'BombsiteA', 'Bombsite A'],
  B: ['B', 'B点', 'B包点', 'B site', 'BombsiteB', 'Bombsite B'],
  CT: ['CT出生', 'CT出生点', '警家', 'CT spawn', 'CTSpawn'],
  T: ['T出生', 'T出生点', '匪家', 'T spawn', 'TSpawn'],
};
const placeAliases = {
  middle: ['中路', 'mid'], connector: ['连接', '连接通道'], palace: ['宫殿'], apartments: ['公寓'],
  banana: ['香蕉道'], ramp: ['斜坡'], heaven: ['天堂'], lobby: ['大厅'], outside: ['外场'],
  tunnels: ['隧道'], long: ['长廊'], short: ['短路'],
};
export const mapLocationSource = { ...landmarks.source, license: 'MIT; full notice bundled in mapLandmarks.json' };

function geometry(nav, mapName) {
  if (!nav || typeof nav !== 'object') return { areas: [], byId: new Map(), cells: [], bounds: null };
  const cached = geometryCache.get(nav);
  if (cached?.mapName === mapName) return cached;
  const cut = NAV_FLOOR_BOUNDARIES[mapName];
  const areas = Object.values(nav.areas || {}).filter(a => a.corners?.length >= 3).map(a => {
    const position = a.corners.reduce((r, p) => r.map((n, i) => n + [p.x, p.y, p.z][i] / a.corners.length), [0, 0, 0]);
    return { ...navAreaGeometry(a), position, floor: cut != null && position[2] < cut ? 'lower' : 'main', connectedAreaIds: a.connections || [] };
  }).filter(a => point(a.position));
  if (!areas.length) return { areas: [], byId: new Map(), cells: [], bounds: null };
  const corners = Object.values(nav.areas).flatMap(a => a.corners || []);
  const bounds = squareRadarBounds(Math.min(...corners.map(p => p.x)), Math.max(...corners.map(p => p.x)), Math.min(...corners.map(p => p.y)), Math.max(...corners.map(p => p.y)));
  const buckets = new Map();
  for (const area of areas) {
    const x = Math.max(0, Math.min(7, Math.floor((area.position[0] - bounds.minX) / bounds.size * 8)));
    const y = Math.max(0, Math.min(7, Math.floor((bounds.minY + bounds.size - area.position[1]) / bounds.size * 8)));
    area.grid = `${String.fromCharCode(65 + x)}${y + 1}`;
    const key = `grid:${area.floor}:${area.grid}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(area);
  }
  const cells = [...buckets].map(([id, members]) => ({ id, name: `${members[0].floor}:${members[0].grid}`, floor: members[0].floor, areaCount: members.length, areaIds: members.map(a => a.areaId) }));
  const result = { mapName, areas, byId: new Map(areas.map(a => [a.areaId, a])), cells, bounds };
  geometryCache.set(nav, result);
  return result;
}

const horizontalDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearestArea = (areas, position) => {
  let best = null; let distance = Infinity;
  for (const area of areas) {
    const next = Math.hypot(...area.position.map((v, i) => v - position[i]));
    if (next < distance) { best = area; distance = next; }
  }
  return best;
};

export function createMapLocations(nav, mapName, notes = []) {
  const g = geometry(nav, mapName);
  const anchors = [];
  for (const [key, xy] of Object.entries(landmarks.maps[mapName]?.markers || {})) {
    const closest = g.areas.map(area => ({ area, distance: horizontalDistance(area.position, xy) })).sort((a, b) => a.distance - b.distance);
    // The overview has no Z. Retain nearby height alternatives instead of choosing a roof or tunnel silently.
    const candidates = [];
    for (const candidate of closest) {
      if (candidate.distance > 256 || candidate.distance > (closest[0]?.distance || 0) + 128) break;
      if (candidates.some(p => Math.abs(p.position[2] - candidate.area.position[2]) < 96)) continue;
      candidates.push({ ...candidate.area, horizontalOffset: candidate.distance });
      if (candidates.length >= 4) break;
    }
    anchors.push({ id: `overview:${key}`, name: key === 'A' || key === 'B' ? `${key}包点附近` : `${key}出生区附近`, aliases: markerAliases[key],
      source: 'radar_overview_marker', precision: 'approximate_xy', sourcePositionXY: xy, candidates, heightAmbiguous: candidates.length > 1,
      warning: 'Radar label anchor, not a bomb-zone boundary or verified tactical stand. Confirm height when multiple candidates exist.' });
  }
  for (const note of notes.filter(n => n.mapName === mapName)) {
    const throwEvent = note.replay?.events?.find(e => e?.event_name === 'grenade_thrown');
    const observations = [ ['start', note.startPlace, point(note.position)], ['release', note.throwPlace, point([throwEvent?.user_X, throwEvent?.user_Y, throwEvent?.user_Z])] ];
    const grouped = new Map();
    for (const [kind, label, position] of observations) {
      if (!label?.trim() || !position) continue;
      const nearest = nearestArea(g.areas, position);
      if (!nearest || horizontalDistance(nearest.position, position) > 128 || Math.abs(nearest.position[2] - position[2]) > 96) continue;
      const key = normalize(label);
      const existing = grouped.get(key);
      if (existing) {
        existing.observations.push({ kind, position, areaId: nearest.areaId });
        existing.referenceIds.push(`note:${note.id}:${kind}`);
        if (!existing.candidates.some(c => c.areaId === nearest.areaId)) existing.candidates.push({ ...nearest });
        existing.heightAmbiguous = existing.candidates.some(c => Math.abs(c.position[2] - existing.candidates[0].position[2]) >= 96);
        continue;
      }
      const anchor = { id: `note:${note.id}:${kind}`, name: label.trim(), aliases: [label.trim(), ...(placeAliases[key] || []), ...Object.values(markerAliases).filter(names => names.some(name => normalize(name) === key)).flat()],
        source: 'saved_place_name', precision: 'observed_anchor', noteId: note.id, observedPosition: position, candidates: [{ ...nearest }], heightAmbiguous: false,
        observations: [{ kind, position, areaId: nearest.areaId }], referenceIds: [`note:${note.id}:${kind}`],
        warning: 'Place label attached to saved observations; may be user-entered or last-known game place. Does not define the whole region.' };
      grouped.set(key, anchor); anchors.push(anchor);
    }
  }
  const matches = (anchor, query) => !query || [anchor.id, anchor.name, ...anchor.aliases].some(name => normalize(name).includes(normalize(query)));
  const describe = position => {
    if (!point(position)) return null;
    const nearest = nearestArea(g.areas, position);
    if (!nearest) return null;
    return { floor: nearest.floor, grid: nearest.grid, areaId: nearest.areaId, navOffset: Math.hypot(...nearest.position.map((v, i) => v - position[i])),
      nearbyNamedAnchors: anchors.filter(a => a.candidates.some(c => Math.abs(c.position[2] - position[2]) < 96 && horizontalDistance(c.position, position) <= 256)).slice(0, 6).map(a => ({ id: a.id, name: a.name, source: a.source, precision: a.precision })) };
  };
  const catalog = new Map();
  for (const anchor of anchors) {
    const key = normalize(anchor.name);
    const entry = catalog.get(key) || { name: anchor.name, aliases: [], locationIds: [], floors: [], sources: [], precisions: [] };
    entry.aliases = [...new Set([...entry.aliases, ...anchor.aliases])];
    entry.locationIds.push(anchor.id);
    entry.floors = [...new Set([...entry.floors, ...anchor.candidates.map(c => c.floor)])];
    entry.sources = [...new Set([...entry.sources, anchor.source])];
    entry.precisions = [...new Set([...entry.precisions, anchor.precision])];
    catalog.set(key, entry);
  }
  const namedPlaces = [...catalog.values()];
  const coverage = { completeCallouts: false, namedRegions: 0, namedPlaces: namedPlaces.length, radarAnchors: anchors.filter(anchor => anchor.source === 'radar_overview_marker').length, observedAnchors: anchors.filter(anchor => anchor.source === 'saved_place_name').length, navPolygonsAvailable: g.areas.length > 0 };
  const listPlaces = ({ offset = 0, limit = 40 } = {}) => ({ mapName, total: namedPlaces.length, offset, coverage,
    nextOffset: offset + limit < namedPlaces.length ? offset + limit : null, places: namedPlaces.slice(offset, offset + limit),
    scope: 'Indexed reference names only; not a complete callout map. Grid cells are excluded.' });
  const search = ({ query = '', locationId, areaId, near, floor, limit = 8, includeGrid = false } = {}) => {
    query = query.trim();
    const mode = areaId != null ? 'area' : locationId ? 'reference' : query ? 'name' : near ? 'near' : 'overview';
    const effectiveQuery = normalize(query);
    const exact = effectiveQuery ? anchors.filter(a => [a.id, a.name, ...a.aliases].some(name => normalize(name) === effectiveQuery)) : [];
    let named = effectiveQuery ? (exact.length ? exact : anchors.filter(a => matches(a, query))) : [];
    let grid = effectiveQuery ? g.cells.filter(c => normalize(c.id).includes(effectiveQuery) || normalize(c.name).includes(effectiveQuery)) : [];
    if (locationId) {
      named = (query ? named : anchors).filter(a => a.id === locationId || a.referenceIds?.includes(locationId));
      grid = (query ? grid : g.cells).filter(c => c.id === locationId);
    }
    const unknownName = Boolean(query && !named.length && !grid.length);
    const unknownReference = Boolean(locationId && !named.length && !grid.length);
    if (floor) {
      named = named.map(a => ({ ...a, candidates: a.candidates.filter(c => c.floor === floor) })).filter(a => a.candidates.length);
      grid = grid.filter(c => c.floor === floor);
    }
    let selected = g.areas;
    if (locationId || query) {
      const ids = new Set([...named.flatMap(a => a.candidates.map(c => c.areaId)), ...grid.flatMap(c => c.areaIds)]);
      selected = selected.filter(a => ids.has(a.areaId));
    }
    if (areaId != null) selected = selected.filter(a => a.areaId === areaId);
    if (floor) selected = selected.filter(a => a.floor === floor);
    // Single-area requests never dump unrelated map catalogs, even with optional filters.
    if (areaId != null) { named = named.filter(a => a.candidates.some(c => c.areaId === areaId)); grid = grid.filter(c => c.areaIds.includes(areaId)); }
    if (near) selected = [...selected].sort((a, b) => Math.hypot(...a.position.map((v, i) => v - near[i])) - Math.hypot(...b.position.map((v, i) => v - near[i])));
    const totalLocations = selected.length;
    if (!query && !locationId && !near && areaId == null) {
      const step = Math.max(1, Math.floor(selected.length / limit));
      selected = selected.filter((_, i) => i % step === 0);
    }
    const available = unknownName || unknownReference ? namedPlaces.slice(0, 40).map(({ name, aliases, locationIds }) => ({ name, aliases, locationIds })) : [];
    if (includeGrid && !query && !locationId) { const ids = new Set(selected.slice(0, limit).map(a => a.areaId)); grid = g.cells.filter(c => c.areaIds.some(id => ids.has(id))); }
    return { mapName, mode, appliedFilter: { query, locationId: locationId || null, areaId: areaId ?? null, near: near || null, floor: floor || null, limit, includeGrid },
      namedMatches: named.slice(0, limit), gridMatches: includeGrid ? grid.slice(0, limit).map(({ areaIds, areaCount, ...cell }) => ({ ...cell, kind: 'geometric_grid_not_callout' })) : [],
      locations: selected.slice(0, limit).map(area => ({ ...area, ...(near ? { distance: Math.hypot(...area.position.map((v, i) => v - near[i])), distanceXY: horizontalDistance(area.position, near), distanceUnit: 'Source game units' } : {}) })),
      totalNamedMatches: named.length, totalGridMatches: grid.length, totalLocations, unknownName, unknownReference,
      status: selected.length ? 'matched' : 'no_match', reason: unknownName ? 'name_not_indexed' : unknownReference ? 'reference_not_indexed' : !selected.length ? 'no_nav_candidates_for_filter' : null,
      availableNames: available, availableNamesTotal: namedPlaces.length,
      guidance: unknownName || unknownReference ? 'Not indexed. Use availableNames or list_map_places once; do not keep trying synonyms or invent coordinates.' : null };
  };
  return { describe, search, listPlaces, overview: ({ includeGrid = false } = {}) => ({ mapName, coordinateSystem: 'Source [X,Y,Z], game units',
    coverage, bounds: g.bounds, grid: { columns: 'A–H in increasing Source X', rows: '1–8 in decreasing Source Y', kind: 'geometric_grid_not_callout', layers: [...new Set(g.areas.map(a => a.floor))], totalCells: g.cells.length, cells: includeGrid ? g.cells.map(({ areaIds, areaCount, ...cell }) => cell) : [] },
    namedAnchors: anchors.slice(0, 8), totalNamedAnchors: anchors.length, namedAnchorsTruncated: anchors.length > 8, namedPlacesTotal: namedPlaces.length, namedPlacesTool: 'list_map_places', source: mapLocationSource,
    warnings: ['Grid cells are geometric references, not official callouts.', 'Overview anchors have approximate XY and no authoritative Z; choose an explicit NAV area after inspecting candidates.', 'No region polygons, path times, cover or visibility validation.'] }) };
}
