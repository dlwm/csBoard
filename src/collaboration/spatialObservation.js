const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const center = area => area.corners.reduce((point, corner) => point.map((value, i) => value + [corner.x, corner.y, corner.z][i] / area.corners.length), [0, 0, 0]);
const rounded = point => point.map(value => Math.round(value * 100) / 100);

export function spatialObservation({ nav, references, position, radius = 512, limit = 12, entities }) {
  const areas = Object.values(nav?.areas || {}).filter(area => area.corners?.length >= 3).map(area => ({ raw: area, position: center(area) }));
  const byId = new Map(areas.map(area => [area.raw.area_id, area]));
  const nearby = areas.map(area => ({ ...area, distance: distance(area.position, position) })).filter(area => area.distance <= radius).sort((a, b) => a.distance - b.distance);
  const selected = nearby.slice(0, limit);
  return {
    origin: position, radius, coordinateSystem: 'Source [X,Y,Z], game units; vertical axis is Z.',
    originReference: references.describe(position), totalNearbyAreas: nearby.length, truncated: nearby.length > limit,
    areas: selected.map(({ raw, position: areaPosition, distance: offset }) => ({
      areaId: raw.area_id, position: rounded(areaPosition), distance: Math.round(offset), delta: rounded(areaPosition.map((value, i) => value - position[i])),
      corners: raw.corners.map(corner => rounded([corner.x, corner.y, corner.z])),
      bounds: { min: [Math.min(...raw.corners.map(c => c.x)), Math.min(...raw.corners.map(c => c.y)), Math.min(...raw.corners.map(c => c.z))], max: [Math.max(...raw.corners.map(c => c.x)), Math.max(...raw.corners.map(c => c.y)), Math.max(...raw.corners.map(c => c.z))] },
      floor: references.describe(areaPosition)?.floor,
      connectedAreaIds: raw.connections || [],
      connections: (raw.connections || []).slice(0, 24).map(id => ({ areaId: id, ...(byId.has(id) ? { position: rounded(byId.get(id).position), heightDelta: Math.round(byId.get(id).position[2] - areaPosition[2]) } : { missingGeometry: true }) })), connectionsTruncated: (raw.connections || []).length > 24,
    })),
    entityLimit: 32,
    entities: entities.map(entity => ({ ...entity, distance: distance(entity.position, position), delta: rounded(entity.position.map((value, i) => value - position[i])), floor: references.describe(entity.position)?.floor })).filter(entity => entity.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 32),
    warnings: ['Nearby areas are sorted by 3D center distance, not containing polygons or traversable route distance.', 'Connections are raw directed NAV adjacency; no jump, crouch, ladder, movement timing or obstruction validation.', 'Nearby coordinates do not establish cover, line of sight or grenade coverage.'],
  };
}
