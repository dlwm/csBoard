import * as THREE from 'three';
import { csIconUrl } from '../assets/cs-icon-urls.js';
import { weaponIconKey } from '../assets/weapon-icons.js';
import { demoWeaponKind } from '../demo/playerState.js';

const FIREARMS = new Set(['rifle', 'pistol', 'sniper', 'smg', 'shotgun', 'machinegun']);
export const isFirearm = weapon => FIREARMS.has(demoWeaponKind(weapon));
// Scene units: silhouette length follows weapon class, with a small real depth.
// 场景单位：枪型决定长度，厚度独立于 SVG 像素尺寸；修改这些值可调整表现。
const LENGTHS = { rifle: 1.15, pistol: .65, sniper: 1.5, smg: .95, shotgun: 1.2, machinegun: 1.25 };
const DEPTH = .07;
const RESOLUTION = 512;
// Subpixel contour tolerance removes raster stair steps without losing cutouts.
// 亚像素轮廓简化：消除栅格台阶，保留枪械小镂空；单位为采样像素。
const CONTOUR_TOLERANCE = .8;
const silhouetteCache = new Map();
const states = new WeakMap();

function simplifyContour(points) {
  const simplify = segment => {
    const a = segment[0], b = segment[segment.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    let index = 0, maximum = CONTOUR_TOLERANCE ** 2;
    for (let i = 1; i < segment.length - 1; i++) {
      const p = segment[i];
      const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
      const distanceSquared = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (distanceSquared > maximum) { maximum = distanceSquared; index = i; }
    }
    return index ? [...simplify(segment.slice(0, index + 1)).slice(0, -1), ...simplify(segment.slice(index))] : [a, b];
  };
  // Split the closed contour at its farthest point before simplifying two arcs.
  let split = 1;
  for (let i = 2; i < points.length; i++) if (points[i].distanceToSquared(points[0]) > points[split].distanceToSquared(points[0])) split = i;
  const result = [...simplify(points.slice(0, split + 1)).slice(0, -1), ...simplify([...points.slice(split), points[0]]).slice(0, -1)];
  return result.length >= 3 ? result : points;
}

// Trace the rendered SVG alpha mask, not individual overlapping SVG paths.
// This preserves mask cutouts (trigger guards/scopes), unions overlapping parts,
// and avoids SVGLoader treating unsupported masks as solid gun interiors.
// 轮廓来自 SVG 最终透明度：保留扳机/瞄具镂空，并合并相互覆盖的路径。
function contoursFromPixels(data, width, height) {
  const solid = (x, y) => x >= 0 && x < width && y >= 0 && y < height && data[(y * width + x) * 4 + 3] >= 128;
  const edges = [], starts = new Map();
  const add = (x, y, endX, endY, direction) => {
    const edge = { x, y, endX, endY, direction, used: false };
    edges.push(edge);
    const key = y * (width + 1) + x;
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key).push(edge);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x, y - 1)) add(x, y, x + 1, y, 0);
    if (!solid(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
    if (!solid(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
    if (!solid(x - 1, y)) add(x, y + 1, x, y, 3);
  }
  const contours = [];
  for (const first of edges) {
    if (first.used) continue;
    const points = [];
    let edge = first;
    while (edge && !edge.used) {
      edge.used = true;
      points.push(new THREE.Vector2(edge.x, -edge.y));
      if (edge.endX === first.x && edge.endY === first.y) break;
      const candidates = starts.get(edge.endY * (width + 1) + edge.endX) || [];
      // Prefer a right turn: diagonally touching pixels remain separate loops.
      edge = [1, 0, 3, 2].map(turn => candidates.find(next => !next.used && next.direction === (edge.direction + turn) % 4)).find(Boolean);
    }
    if (points.length >= 3) {
      const reduced = points.filter((point, index) => {
        const before = points[(index + points.length - 1) % points.length], after = points[(index + 1) % points.length];
        return (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x);
      });
      const smoothed = simplifyContour(reduced);
      const area = THREE.ShapeUtils.area(smoothed);
      if (Math.abs(area) >= 2) contours.push({ points: smoothed, area });
    }
  }
  return contours;
}

function contains(points, point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

async function loadSilhouette(url) {
  if (silhouetteCache.has(url)) return silhouetteCache.get(url);
  const promise = (async () => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Weapon SVG could not be loaded'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Weapon SVG has no dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = RESOLUTION;
    canvas.height = Math.max(8, Math.min(RESOLUTION, Math.round(RESOLUTION * image.naturalHeight / image.naturalWidth)));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const contours = contoursFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    const outer = contours.filter(loop => loop.area < 0).map(loop => ({ ...loop, shape: new THREE.Shape(loop.points) }));
    for (const hole of contours.filter(loop => loop.area > 0)) {
      const parent = outer.filter(loop => contains(loop.points, hole.points[0])).sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
      parent?.shape.holes.push(new THREE.Path(hole.points));
    }
    if (!outer.length) throw new Error('Weapon SVG has no visible silhouette');
    return { shapes: outer.map(loop => loop.shape), width: canvas.width, height: canvas.height };
  })();
  silhouetteCache.set(url, promise);
  // Only CPU contours are shared; every player owns their GPU geometry.
  // 只缓存 CPU 轮廓，每个人物独占 GPU 几何，删除人物不会破坏其他枪械。
  if (silhouetteCache.size > 64) silhouetteCache.delete(silhouetteCache.keys().next().value);
  return promise;
}

export function createWeaponModel(weapon, { side = 'T' } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#b5c2c5', roughness: .55, metalness: .35 });
  // An empty sentinel makes normal scene disposal cancel even an in-flight load.
  const sentinel = new THREE.Mesh(new THREE.BufferGeometry(), material);
  sentinel.visible = false;
  group.add(sentinel);
  const state = { material, sentinel, url: null, token: 0, disposed: false };
  states.set(group, state);
  group.userData.weaponModel = true;
  group.userData.weaponModelRevision = 0;
  group.position.set(0, .03, -.3);
  material.addEventListener('dispose', () => { state.disposed = true; state.token++; });
  updateWeaponModel(group, weapon, { side });
  return group;
}

export function updateWeaponModel(group, weapon, { side = 'T' } = {}) {
  const state = states.get(group);
  if (!state || state.disposed) return;
  const key = weaponIconKey(weapon, { side });
  const url = isFirearm(weapon) ? csIconUrl[key] : null;
  group.userData.weaponIconKey = key;
  if (state.url === url) return;
  state.url = url;
  const token = ++state.token;
  group.userData.weaponModelRevision++;
  for (const child of [...group.children]) if (child !== state.sentinel) { child.geometry?.dispose(); group.remove(child); }
  if (!url) return;
  const length = LENGTHS[demoWeaponKind(weapon)] || 1.15;
  loadSilhouette(url).then(({ shapes, width, height }) => {
    if (state.disposed || token !== state.token) return;
    const scale = length / width;
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH / scale, steps: 1, bevelEnabled: false });
    geometry.translate(-width / 2, height / 2, -DEPTH / scale / 2);
    geometry.scale(scale, scale, scale);
    // SVG horizontal muzzle -> local -Z, SVG depth -> local X, up -> Y.
    // 枪口沿人物的 -Z 朝向，SVG 轮廓处于 YZ 平面，厚度沿 X。
    geometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    const mesh = new THREE.Mesh(geometry, state.material);
    mesh.userData.weaponSilhouette = key;
    group.add(mesh);
    group.userData.weaponModelRevision++;
  }).catch(error => {
    if (!state.disposed && token === state.token) console.warn(`Weapon model unavailable (${key}): ${error.message}`);
  });
}
