import * as THREE from 'three';

export const TUTORIAL_MAP_ID = 'cs_tutorial';

const SCALE = 0.0254;
const navHeight = (x, z) => Math.sin((x + z) * 0.22) * 0.12 + Math.cos((x - z) * 0.18) * 0.08;
const rectangleArea = (id, minX, maxX, minZ, maxZ, baseHeight = 0, variation = navHeight) => ({
  area_id: id,
  hull_index: 0,
  dynamic_attribute_flags: 0,
  corners: [
    { x: minZ / SCALE, y: minX / SCALE, z: (baseHeight + variation(minX, minZ)) / SCALE },
    { x: minZ / SCALE, y: maxX / SCALE, z: (baseHeight + variation(maxX, minZ)) / SCALE },
    { x: maxZ / SCALE, y: maxX / SCALE, z: (baseHeight + variation(maxX, maxZ)) / SCALE },
    { x: maxZ / SCALE, y: minX / SCALE, z: (baseHeight + variation(minX, maxZ)) / SCALE },
  ],
  connections: [],
  ladders_above: [],
  ladders_below: [],
});

const splitCorridor = (areas, rect, count, axis, baseHeight = 0, variation = navHeight) => {
  const [minX, maxX, minZ, maxZ] = rect;
  for (let index = 0; index < count; index += 1) {
    const start = index / count;
    const end = (index + 1) / count;
    const area = axis === 'x'
      ? rectangleArea(areas.length + 1, THREE.MathUtils.lerp(minX, maxX, start), THREE.MathUtils.lerp(minX, maxX, end), minZ, maxZ, baseHeight, variation)
      : rectangleArea(areas.length + 1, minX, maxX, THREE.MathUtils.lerp(minZ, maxZ, start), THREE.MathUtils.lerp(minZ, maxZ, end), baseHeight, variation);
    areas.push(area);
  }
};

const splitGrid = (areas, rect, columns, rows, baseHeight, variation) => {
  const [minX, maxX, minZ, maxZ] = rect;
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    areas.push(rectangleArea(
      areas.length + 1,
      THREE.MathUtils.lerp(minX, maxX, column / columns),
      THREE.MathUtils.lerp(minX, maxX, (column + 1) / columns),
      THREE.MathUtils.lerp(minZ, maxZ, row / rows),
      THREE.MathUtils.lerp(minZ, maxZ, (row + 1) / rows),
      baseHeight,
      variation,
    ));
  }
};

const tutorialAreas = [];
splitCorridor(tutorialAreas, [-13, 13, -11, -8], 6, 'x');
splitCorridor(tutorialAreas, [-13, 13, 8, 11], 6, 'x');
splitCorridor(tutorialAreas, [-13, -10, -8, 8], 5, 'z');
splitCorridor(tutorialAreas, [10, 13, -8, 8], 5, 'z');
splitCorridor(tutorialAreas, [-10, 10, -2, 2], 6, 'x');
splitCorridor(tutorialAreas, [-2, 2, -8, -2], 3, 'z');
splitCorridor(tutorialAreas, [-2, 2, 2, 8], 3, 'z');
const upperVariation = (x, z) => navHeight(x, z) * 0.14;
[[-10, -2, -8, -2], [2, 10, -8, -2], [-10, -2, 2, 8], [2, 10, 2, 8]].forEach((rect) => splitGrid(tutorialAreas, rect, 3, 2, 3.38, upperVariation));
[
  [-2, 2, -6, -4],
  [-2, 2, 4, 6],
  [-7, -5, -2, 2],
  [5, 7, -2, 2],
].forEach((rect) => splitCorridor(tutorialAreas, rect, 2, rect[1] - rect[0] > rect[3] - rect[2] ? 'x' : 'z', 3.38, upperVariation));
splitCorridor(tutorialAreas, [-12, -10, -8, -2], 3, 'z', 0, (_x, z) => (z + 8) / 6 * 3.38);
splitCorridor(tutorialAreas, [10, 12, 2, 8], 3, 'z', 0, (_x, z) => (8 - z) / 6 * 3.38);

export const tutorialNavData = {
  version: 'tutorial-3',
  sub_version: 0,
  is_analyzed: true,
  areas: Object.fromEntries(tutorialAreas.map((area) => [area.area_id, area])),
};

export const tutorialWorkspaceArchive = {
  id: 'csboard-tutorial-basics',
  name: 'Training Basics',
  mapName: TUTORIAL_MAP_ID,
  savedAt: '2026-01-01T00:00:00.000Z',
  activeFrameId: 'tutorial-frame-1',
  frames: [{
    id: 'tutorial-frame-1',
    name: 'Practice',
    workspace: { points: [], paths: [], grenades: [], collabUtilities: [], brushStrokes: [] },
  }],
  workspace: { points: [], paths: [], grenades: [], collabUtilities: [], brushStrokes: [], cameraSlots: [] },
};

export function createTutorialMap() {
  const group = new THREE.Group();
  group.name = 'CSBoard Tutorial Map';

  const buildingGeometry = new THREE.BoxGeometry(8, 3.2, 6);
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: '#27343a',
    roughness: 0.86,
    metalness: 0.04,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: '#35464d',
    roughness: 0.76,
    metalness: 0.08,
  });
  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: '#40535a', roughness: 0.7, metalness: 0.12 });
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#86a99a', transparent: true, opacity: 0.42 });

  [[-6, -5], [6, -5], [-6, 5], [6, 5]].forEach(([x, z], index) => {
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial.clone());
    building.name = `Tutorial Building ${index + 1}`;
    building.position.set(x, 1.6, z);
    group.add(building);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.16, 6), roofMaterial.clone());
    roof.position.set(x, 3.28, z);
    group.add(roof);

    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(buildingGeometry), lineMaterial.clone());
    outline.position.copy(building.position);
    group.add(outline);
  });

  [[0, -5, 4, 2], [0, 5, 4, 2], [-6, 0, 2, 4], [6, 0, 2, 4]].forEach(([x, z, width, depth], index) => {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, depth), bridgeMaterial.clone());
    bridge.name = `Tutorial Upper Bridge ${index + 1}`;
    bridge.position.set(x, 3.25, z);
    group.add(bridge);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(bridge.geometry), lineMaterial.clone());
    outline.position.copy(bridge.position);
    group.add(outline);
  });

  const rampLength = Math.hypot(6, 3.38);
  [[-11, -5, -1], [11, 5, 1]].forEach(([x, z, direction], index) => {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2, 0.18, rampLength), bridgeMaterial.clone());
    ramp.name = `Tutorial Level Ramp ${index + 1}`;
    ramp.position.set(x, 1.69, z);
    ramp.rotation.x = direction * Math.atan2(3.38, 6);
    group.add(ramp);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(ramp.geometry), lineMaterial.clone());
    outline.position.copy(ramp.position);
    outline.rotation.copy(ramp.rotation);
    group.add(outline);
  });

  const borderGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-13, 0.04, -11), new THREE.Vector3(13, 0.04, -11),
    new THREE.Vector3(13, 0.04, -11), new THREE.Vector3(13, 0.04, 11),
    new THREE.Vector3(13, 0.04, 11), new THREE.Vector3(-13, 0.04, 11),
    new THREE.Vector3(-13, 0.04, 11), new THREE.Vector3(-13, 0.04, -11),
  ]);
  group.add(new THREE.LineSegments(borderGeometry, lineMaterial.clone()));
  return group;
}
