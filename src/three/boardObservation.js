import * as THREE from 'three';
import { NAV_FLOOR_BOUNDARIES } from '../data/navTopView.js';

const round = value => Math.round(value * 100) / 100;

// Render into a temporary target. Never move the user's camera or retain a drawing buffer.
export function createBoardObservation({ renderer, scene, getCamera, getTarget, getNav, getFloor, getModel, getGround, getMapName, viewportSize, gameToBoard, boardToGame }) {
  const views = new Map();
  const observe = ({ view = 'current', focus, radius = 384, azimuth = 45, elevation = 55, markers = [], includeImage = false }) => {
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context is unavailable; reopen the map');
    const sourceCamera = getCamera();
    const bounds = new THREE.Box3();
    for (const area of Object.values(getNav()?.areas || {})) for (const point of area.corners || []) bounds.expandByPoint(new THREE.Vector3(...gameToBoard([point.x, point.y, point.z])));
    if (bounds.isEmpty()) throw new Error('Map NAV is not ready');
    const center = focus ? new THREE.Vector3(...gameToBoard(focus)) : bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3());
    let width = 960; let height = 640; let camera;
    if (view === 'current') {
      camera = sourceCamera.clone();
      const aspect = Math.max(0.1, sourceCamera.aspect || 1.5);
      width = Math.round(Math.min(960, 720 * aspect)); height = Math.round(width / aspect);
    } else if (view === 'top') {
      const halfWidth = focus ? radius * 0.0254 : Math.max(extent.z / 2, extent.x / 2 * width / height) * 1.08;
      camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfWidth * height / width, -halfWidth * height / width, 0.1, Math.max(1000, extent.length() * 4));
      camera.position.copy(center).setY(bounds.max.y + Math.max(50, extent.length()));
      camera.up.set(1, 0, 0); camera.lookAt(center);
    } else {
      camera = sourceCamera.clone(); camera.aspect = width / height; camera.fov = 48;
      const distance = radius * 0.0254 * 2;
      // Source +X maps to board +Z, Source +Y to board +X.
      // 方位角采用 Source 地面坐标，俯仰角是观察点高于地面的角度。
      const bearing = azimuth * Math.PI / 180; const pitch = elevation * Math.PI / 180;
      camera.position.copy(center).add(new THREE.Vector3(Math.sin(bearing) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(bearing) * Math.cos(pitch) * distance));
      camera.up.set(0, 1, 0); camera.far = Math.max(1000, distance * 10); camera.lookAt(center);
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
    const projected = markers.slice(0, 96).map((marker, index) => {
      const point = new THREE.Vector3(...gameToBoard(marker.position));
      const pixel = point.clone().project(camera);
      const inFrustum = Math.abs(pixel.x) <= 1 && Math.abs(pixel.y) <= 1 && Math.abs(pixel.z) <= 1;
      let geometryOccluded = null;
      const model = getModel();
      if (inFrustum && model) {
        const origin = camera.isOrthographicCamera ? new THREE.Vector3(pixel.x, pixel.y, -1).unproject(camera) : camera.position.clone();
        const direction = point.clone().sub(origin); const distance = direction.length();
        if (distance > 0.01) { ray.set(origin, direction.normalize()); ray.far = Math.max(0, distance - 0.05); geometryOccluded = ray.intersectObject(model, true).length > 0; }
      }
      return { ...marker, number: index + 1, screen: { x: round((pixel.x + 1) / 2 * width), y: round((1 - pixel.y) / 2 * height), inFrustum }, floorFiltered: !getFloor().visible(point.y), geometryOccluded };
    });
    const viewId = crypto.randomUUID();
    views.set(viewId, { camera, width, height, floor: getFloor().name, origin: boardToGame([0, 0, 0]) });
    if (views.size > 3) views.delete(views.keys().next().value);
    const result = {
      viewId, view, width, height, capturedAt: new Date().toISOString(), floor: getFloor().name,
      camera: { projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective', position: boardToGame(camera.position.toArray()).map(round), target: (view === 'current' ? boardToGame(getTarget().toArray()) : boardToGame(center.toArray())).map(round), upInBoardCoordinates: camera.up.toArray(), ...(camera.isPerspectiveCamera ? { fov: camera.fov } : {}) },
      coordinateSystem: 'Source [X,Y,Z], game units. Image pixels: origin top-left; +x right, +y down.',
      orientation: view === 'top' ? 'Source +X points right; +Y points up. Heights are not flattened.' : 'Use projected markers and camera orientation; screen directions are not map callouts.',
      markers: projected, markerCount: markers.length, markersTruncated: markers.length > 96,
      modelAvailable: Boolean(getModel()), buildingsIncluded: false, groundSource: 'NAV polygons, not building geometry',
      ...(view === 'focus' ? { azimuth, elevation } : {}),
      warnings: ['Numbered markers are overlays, including hidden objects; floorFiltered markers are not drawn.', 'Building geometry is excluded from this view. geometryOccluded is a separate imported-geometry diagnostic, not visible image content or CS2 visibility validation.', 'A top view can overlap floors; use explicit Source Z and NAV area IDs. Pixel positions cannot be used as edit coordinates.'],
    };
    if (!includeImage) return { ...result, imageDelivery: 'disabled_text_only' };
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    const previousTarget = renderer.getRenderTarget();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(); const autoClear = renderer.autoClear; const oldViewportSize = viewportSize.clone();
    const model = getModel(); const modelVisible = model?.visible;
    const ground = getGround?.(); const groundVisible = ground?.visible;
    const positions = [];
    for (const area of Object.values(getNav()?.areas || {})) {
      const corners = (area.corners || []).map(point => gameToBoard([point.x, point.y, point.z]));
      for (let index = 1; index + 1 < corners.length; index += 1) {
        const triangle = [corners[0], corners[index], corners[index + 1]];
        if (getFloor().visible(triangle.reduce((sum, point) => sum + point[1] / 3, 0))) triangle.forEach(point => positions.push(...point));
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({ color: '#627769', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const observationGround = new THREE.Mesh(geometry, material);
    try {
      if (model) model.visible = false;
      if (ground) ground.visible = false;
      scene.add(observationGround);
      viewportSize.set(width, height);
      renderer.setRenderTarget(target); renderer.setViewport(0, 0, width, height); renderer.setScissorTest(false); renderer.autoClear = true;
      renderer.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screenshot canvas is unavailable');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) image.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
      context.putImageData(image, 0, 0);
      context.font = 'bold 13px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      for (const marker of projected.filter(item => item.screen.inFrustum && !item.floorFiltered)) {
        const { x, y } = marker.screen;
        context.fillStyle = marker.kind === 'player' ? marker.team === 'T' ? '#f5c568' : '#91c6ff' : '#d3ef95';
        context.beginPath(); context.arc(x, y, 11, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#101716'; context.fillText(String(marker.number), x, y);
      }
      let dataUrl;
      for (const quality of [0.72, 0.55, 0.35, 0.2]) { dataUrl = canvas.toDataURL('image/jpeg', quality); if (dataUrl.length <= 170_000) break; }
      if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 170_000) return { ...result, imageDelivery: 'size_limit', warnings: [...result.warnings, 'Screenshot exceeded the image budget; structured spatial information remains available.'] };
      return { ...result, imageDelivery: 'attached', image: { dataUrl, width, height } };
    } finally {
      if (model) model.visible = modelVisible;
      if (ground) ground.visible = groundVisible;
      scene.remove(observationGround); geometry.dispose(); material.dispose();
      renderer.setRenderTarget(previousTarget); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.autoClear = autoClear; viewportSize.copy(oldViewportSize); target.dispose();
    }
  };
  observe.resolvePoint = ({ viewId, pixel, floor }) => {
    const saved = views.get(viewId);
    if (!saved) throw new Error('View expired; inspect_board_view again');
    if (saved.origin.some((value, index) => Math.abs(value - boardToGame([0, 0, 0])[index]) > 0.001)) throw new Error('Map coordinate transform changed; inspect_board_view again');
    if (pixel[0] < 0 || pixel[0] >= saved.width || pixel[1] < 0 || pixel[1] >= saved.height) throw new Error('Pixel is outside this view');
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pixel[0] / saved.width * 2 - 1, 1 - pixel[1] / saved.height * 2), saved.camera);
    const hits = []; const selectedFloor = floor || saved.floor; const cut = NAV_FLOOR_BOUNDARIES[getMapName()];
    for (const area of Object.values(getNav()?.areas || {})) {
      const corners = (area.corners || []).map(point => new THREE.Vector3(...gameToBoard([point.x, point.y, point.z])));
      for (let i = 1; i + 1 < corners.length; i += 1) {
        const hit = raycaster.ray.intersectTriangle(corners[0], corners[i], corners[i + 1], false, new THREE.Vector3());
        if (!hit) continue;
        const position = boardToGame(hit.toArray());
        const hitFloor = cut != null && position[2] < cut ? 'lower' : 'main';
        if (selectedFloor && selectedFloor !== 'all' && selectedFloor !== hitFloor) continue;
        if (!hits.some(item => item.areaId === area.area_id)) hits.push({ areaId: area.area_id, position, floor: hitFloor, rayDistance: hit.distanceTo(raycaster.ray.origin) / 0.0254 });
      }
    }
    hits.sort((a, b) => a.rayDistance - b.rayDistance);
    return { viewId, pixel, floor: selectedFloor || 'all', status: hits.length ? 'matched' : 'no_match', totalCandidates: hits.length, candidates: hits.slice(0, 8), truncated: hits.length > 8, guidance: 'Ray intersections with NAV triangles, ignoring walls and props. Multiple candidates require explicit height selection; nearest is not automatically the intended floor. Use a chosen Source position to preserve the selected pixel location; areaId placement uses the polygon center.' };
  };
  return observe;
}
