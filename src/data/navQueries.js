const position = area => area.corners.reduce((p, corner) => p.map((value, i) => value + [corner.x, corner.y, corner.z][i] / area.corners.length), [0, 0, 0]);
export function navAreaGeometry(area) {
  const corners = area.corners.map(corner => [corner.x, corner.y, corner.z]);
  return { areaId: area.area_id, position: position(area), polygon: corners, bounds: { min: [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))) }, connectedAreaIds: area.connections || [], hullIndex: area.hull_index ?? null };
}
export function listNavAreas(nav, { bounds, offset = 0, limit = 12 }) {
  if (bounds.min.some((value, i) => value > bounds.max[i])) throw new Error('Bounds min must not exceed max');
  const matching = Object.values(nav?.areas || {}).filter(area => area.corners?.length >= 3).map(navAreaGeometry).filter(area => area.bounds.min.every((value, i) => value <= bounds.max[i] && area.bounds.max[i] >= bounds.min[i]));
  return { bounds, total: matching.length, nextOffset: offset + limit < matching.length ? offset + limit : null, areas: matching.slice(offset, offset + limit), selection: 'Polygon bounding boxes overlap the supplied Source XYZ box; this is not an exact polygon intersection.', coordinateSystem: 'Source [X,Y,Z], game units', coverageVerified: false };
}
export function findNavPath(nav, { fromAreaId, toAreaId, limit = 24 }) {
  const areas = new Map(Object.values(nav?.areas || {}).filter(area => area.corners?.length >= 3).map(area => [area.area_id, area]));
  if (!areas.has(fromAreaId) || !areas.has(toAreaId)) throw new Error('Unknown path endpoint NAV area');
  const queue = [fromAreaId]; const previous = new Map([[fromAreaId, null]]); let head = 0;
  while (head < queue.length && !previous.has(toAreaId) && head < 8192) {
    const current = queue[head++];
    for (const next of areas.get(current).connections || []) {
      if (!areas.has(next) || previous.has(next)) continue;
      previous.set(next, current); queue.push(next);
      if (next === toAreaId) break;
    }
  }
  const ids = [];
  if (previous.has(toAreaId)) for (let current = toAreaId; current != null; current = previous.get(current)) ids.unshift(current);
  return { fromAreaId, toAreaId, status: ids.length ? 'matched' : 'no_match', reason: ids.length ? null : head >= 8192 ? 'search_budget_ended' : 'no_directed_nav_connection', routeType: 'raw_directed_NAV_adjacency', costMetric: 'fewest_area_hops', areaIds: ids, totalAreas: ids.length, areas: ids.slice(0, limit).map(id => navAreaGeometry(areas.get(id))), truncated: ids.length > limit, expandedAreas: head, coordinateSystem: 'Source [X,Y,Z], game units', warnings: ['This is not a validated movement route: jump, crouch, ladders, dynamic obstructions and travel time are not modeled.', 'Area centers are geometry references, not cover or trading positions.'] };
}
