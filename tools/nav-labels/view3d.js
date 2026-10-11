import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Source Z is up; use the same Source-to-Three mapping as the board.
const units = .0254;
const position = p => new THREE.Vector3(p.y * units, p.z * units, p.x * units);
export function createNavView({ canvas, labels, brushSize, isErasing, isVisible, onHover, onStrokeStart, onPaint, toolMode, onPlace, onSelectPoint }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1516');
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 10000);
  camera.position.set(100, 150, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.enableDamping = false;
  const raycaster = new THREE.Raycaster(), cursor = new THREE.Vector2();
  const ring = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 48), new THREE.MeshBasicMaterial({ color: '#e5ffb6', side: THREE.DoubleSide, depthTest: true, depthWrite: false }));
  ring.visible = false; scene.add(ring);
  const markers = new THREE.Group(); scene.add(markers);
  let markerKey = '';
  let mesh, wire, areas = [], triangleAreas = [], labelsData = [], drawing = false, previous, strokeHeight, pending = false;
  function requestDraw() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } }
  function pick(x, y) {
    cursor.set(x / canvas.clientWidth * 2 - 1, 1 - y / canvas.clientHeight * 2);
    camera.updateMatrixWorld(); raycaster.setFromCamera(cursor, camera);
    const hit = mesh && raycaster.intersectObject(mesh, false)[0];
    return hit ? { ...hit, area: triangleAreas[hit.faceIndex] } : null;
  }
  function pointer(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function paint(point, deleting) {
    deleting = deleting || isErasing();
    const hit = pick(point.x, point.y);
    if (!hit) { ring.visible = false; onHover(null); requestDraw(); return; }
    // A stroke stays on its surface. A fresh click can select another storey.
    // 64 Source units allow sloped ground without crossing a full floor.
    if (drawing && Math.abs(hit.point.y - strokeHeight) > 64 * units) return;
    if (drawing) strokeHeight = hit.point.y;
    const radius = Number(brushSize());
    const ids = new Set();
    const step = Math.max(4, radius / 4);
    ids.add(hit.area.area_id);
    // Raycast each brush sample: hidden lower floors cannot receive paint.
    if (drawing) for (let x = -radius; x <= radius; x += step) for (let y = -radius; y <= radius; y += step) {
      if (x*x + y*y > radius*radius) continue;
      const sample = pick(point.x + x, point.y + y);
      if (sample && Math.abs(sample.point.y - hit.point.y) <= 64 * units) ids.add(sample.area.area_id);
    }
    const normal = hit.face.normal.clone(); if (normal.y < 0) normal.negate();
    ring.position.copy(hit.point).addScaledVector(normal, .02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal);
    const worldRadius = 2 * camera.position.distanceTo(hit.point) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / canvas.clientHeight * radius;
    ring.scale.setScalar(worldRadius); ring.material.color.set(deleting ? '#ff8888' : '#e5ffb6'); ring.visible = true;
    onHover({ areaId: hit.area.area_id, height: hit.point.y / units });
    if (drawing) onPaint(ids, deleting);
    requestDraw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !mesh) return;
    const point = pointer(event), hit = pick(point.x, point.y), mode = toolMode();
    if (mode === 'place' || mode === 'move') {
      if (hit) onPlace({ position:[hit.point.z/units,hit.point.x/units,hit.point.y/units], areaId:hit.area.area_id });
      return;
    }
    const marker = raycaster.intersectObject(markers,true).find(candidate => !hit || candidate.distance <= hit.distance + .05);
    if (marker) { onSelectPoint(marker.object.userData.pointId); return; }
    if (mode !== 'region' || !hit) return;
    drawing = true; controls.enabled = false; previous = point; strokeHeight = hit.point.y;
    canvas.setPointerCapture(event.pointerId); onStrokeStart(); paint(point, event.shiftKey);
  });
  canvas.addEventListener('pointermove', event => {
    const point = pointer(event);
    if (drawing) {
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / Math.max(4, brushSize()/2)));
      for (let i = 1; i <= steps; i++) paint({ x: previous.x + (point.x-previous.x)*i/steps, y: previous.y + (point.y-previous.y)*i/steps }, event.shiftKey);
      previous = point;
    } else if (!event.buttons) paint(point, event.shiftKey);
  });
  function end() { drawing = false; controls.enabled = true; previous = null; }
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('pointerleave', () => { if (!drawing) { ring.visible = false; onHover(null); requestDraw(); } });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  controls.addEventListener('change', () => { ring.visible = false; requestDraw(); });
  function rebuild() {
    for (const object of [mesh, wire]) if (object) { scene.remove(object); object.geometry.dispose(); object.material.dispose(); }
    const vertices = []; triangleAreas = [];
    for (const area of areas.filter(isVisible)) {
      const points = area.corners.map(position);
      // NAV areas are convex polygons, triangulated without losing their heights.
      for (let i = 1; i < points.length - 1; i++) { for (const p of [points[0], points[i], points[i+1]]) vertices.push(p.x,p.y,p.z); triangleAreas.push(area); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vertices.length), 3)); geometry.computeVertexNormals();
    mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); scene.add(mesh);
    wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color:'#65828b', transparent:true, opacity:.35 })); scene.add(wire);
    ring.visible = false;
  }
  function render() {
    renderer.render(scene, camera);
    labels.replaceChildren();
    for (const label of labelsData) {
      const members = areas.filter(area => isVisible(area) && label.ids.has(area.area_id)); if (!members.length) continue;
      const mean = members.reduce((p,a) => p.add(position({x:a.x,y:a.y,z:a.height})), new THREE.Vector3()).multiplyScalar(1/members.length);
      const anchor = members.reduce((a,b) => position({x:a.x,y:a.y,z:a.height}).distanceToSquared(mean) < position({x:b.x,y:b.y,z:b.height}).distanceToSquared(mean) ? a : b);
      const world = label.position ? position({x:label.position[0],y:label.position[1],z:label.position[2]}) : position({x:anchor.x,y:anchor.y,z:anchor.height}), projected = world.clone().project(camera);
      if (Math.abs(projected.x)>1 || Math.abs(projected.y)>1 || Math.abs(projected.z)>1) continue;
      const x = (projected.x+1)*canvas.clientWidth/2, y=(1-projected.y)*canvas.clientHeight/2;
      const hit = pick(x,y); if (!hit || !label.ids.has(hit.area.area_id)) continue;
      const element = document.createElement('span'); element.textContent = label.name; element.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; labels.append(element);
    }
  }
  function recolor(owners, selectedId, color) {
    if (!mesh) return;
    const attribute = mesh.geometry.getAttribute('color'), tint = new THREE.Color();
    triangleAreas.forEach((area, face) => {
      const owner = owners.get(area.area_id); tint.set(owner ? color(owner.id) : '#29404b');
      if (owner && owner.id !== selectedId) tint.multiplyScalar(.65);
      for (let i=0;i<3;i++) attribute.setXYZ(face*3+i,tint.r,tint.g,tint.b);
    }); attribute.needsUpdate = true; requestDraw();
  }
  function setPoints(points, selectedId) {
    const shown = points.filter(p => areas.some(a=>a.area_id === p.areaId && isVisible(a)));
    const key = JSON.stringify([shown,selectedId]); if (key === markerKey) return; markerKey = key;
    for (const child of [...markers.children]) {
      markers.remove(child);
      child.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
    }
    for (const point of shown) {
      const group = new THREE.Group(); group.position.copy(position({x:point.position[0],y:point.position[1],z:point.position[2]}));
      const color = point.id === selectedId ? '#e5ffb6' : point.enabled === false ? '#627178' : point.team === 'T' ? '#ffa954' : '#65b5ff';
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.28,12,8),new THREE.MeshBasicMaterial({color})); ball.position.y=.35; group.add(ball);
      const yaw = THREE.MathUtils.degToRad(point.yaw);
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),new THREE.Vector3(0,.35,0),1.3,color,.35,.2); group.add(arrow);
      // ArrowHelper geometries are shared by Three.js; clone before owning/disposal.
      arrow.line.geometry = arrow.line.geometry.clone(); arrow.cone.geometry = arrow.cone.geometry.clone();
      group.traverse(object => { object.userData.pointId = point.id; }); markers.add(group);
    }
    markers.updateMatrixWorld(true); requestDraw();
  }
  function focusPoint(point) {
    const target=position({x:point.position[0],y:point.position[1],z:point.position[2]});
    const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(12);
    controls.target.copy(target); camera.position.copy(target).add(offset); controls.update(); requestDraw();
  }
  function fit(top = false) {
    if (!mesh?.geometry.getAttribute('position').count) return;
    mesh.geometry.computeBoundingBox(); const bounds = mesh.geometry.boundingBox, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length()/2, 1), distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov/2)) / Math.min(1, camera.aspect) * 1.1;
    controls.target.copy(center); camera.up.set(0,1,0);
    camera.position.copy(center).add(new THREE.Vector3(top ? .001 : .7, top ? 1 : 1, top ? .001 : .7).normalize().multiplyScalar(distance));
    camera.near = .1; camera.far = Math.max(10000,distance*10); camera.updateProjectionMatrix(); controls.update(); requestDraw();
  }
  new ResizeObserver(() => { const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight); renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix(); requestDraw(); }).observe(canvas);
  return { setAreas(next) { end(); areas=next; rebuild(); }, refreshVisibility() { end(); rebuild(); }, recolor,
    setLabels(next) { labelsData=next; requestDraw(); }, setPoints, focusPoint, fit, hoverRefresh: requestDraw };
}
