import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fallbackNavData from './data/de_dust2.json';
import { createNavMesh } from './three/navMesh.js';
import { createGhostMaterial } from './three/materials.js';
import { createTacticalPoint, updateTacticalPoint } from './three/tacticalPoint.js';
import { createFireNavEffect, createGrenadeEffect, disposeGrenadeEffect, grenadeTypeFromPointer } from './three/grenadeEffects.js';
import './styles.css';

const MAPS = [
  { id: 'de_dust2', label: 'Dust II' },
  { id: 'de_mirage', label: 'Mirage' },
  { id: 'de_nuke', label: 'Nuke' },
  { id: 'de_ancient', label: 'Ancient' },
  { id: 'de_anubis', label: 'Anubis' },
  { id: 'de_cache', label: 'Cache' },
  { id: 'de_inferno', label: 'Inferno' },
  { id: 'de_overpass', label: 'Overpass' },
  { id: 'de_train', label: 'Train' },
  { id: 'de_vertigo', label: 'Vertigo' },
];

function ThreeBoard({ mapName, navData, showEdges, showGrid, showModel, modelViewMode, deletePointId, pointUpdate, onPointSelect, onGrenadeWheel, onReady }) {
  const mountRef = useRef(null);
  const edgesRef = useRef(null);
  const modelModeRef = useRef(null);
  const navFocusRef = useRef(null);
  const gridRef = useRef(null);
  const modelRef = useRef(null);
  const modelVisibilityRef = useRef(showModel);
  const pointsRef = useRef([]);
  const pathLinesRef = useRef([]);
  const pointSelectRef = useRef(onPointSelect);
  pointSelectRef.current = onPointSelect;
  const grenadeWheelRef = useRef(onGrenadeWheel);
  grenadeWheelRef.current = onGrenadeWheel;
  const [error, setError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError('当前浏览器不支持 WebGL，无法显示 3D 地图');
      return undefined;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d0d');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(17, 23, 25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 5;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.enableZoom = false;
    const onWheel = (event) => {
      event.preventDefault();
      const deltaX = event.deltaX * (event.deltaMode === 1 ? 16 : 1);
      const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.shiftKey) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const pan = right.multiplyScalar(deltaX).add(up.multiplyScalar(deltaY)).multiplyScalar(offset.length() * 0.0015);
        camera.position.add(pan);
        controls.target.add(pan);
      } else if (event.ctrlKey) {
        const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(deltaY * 0.0015), controls.minDistance, controls.maxDistance);
        offset.setLength(distance);
        camera.position.copy(controls.target).add(offset);
      } else {
        spherical.theta += deltaX * 0.003;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaY * 0.003, 0.1, Math.PI * 0.49);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      }
      camera.lookAt(controls.target);
      controls.update();
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    const pressedKeys = new Set();
    let placing = false;
    let pathMode = false;
    let pathPreview;
    let pathOrigin;
    let pathPointerDown = false;
    const pathPoints = [];
    const pathLines = pathLinesRef.current;
    const groundRaycaster = new THREE.Raycaster();
    let grenadeWheelOpen = false;
    let grenadeType = 'smoke';
    let grenadeOrigin;
    let grenadePreview;
    let grenadeStartPointer;
    let activeGrenade;
    const grenadeEffects = [];
    let grenadeAdjusting = false;
    let grenadeAdjustStartPointer;
    let grenadeAdjustOrigin;
    let grenadeAdjustRange = 1;
    let pointerCurrent = new THREE.Vector2(0, 0);
    const focusScreen = new THREE.Vector2(0.5, 0.5);
    const viewportSize = new THREE.Vector2(1, 1);
    const focusEnabled = { value: showModel && modelViewMode === 1 ? 1 : 0 };
    navFocusRef.current = focusEnabled;
    const modelMode = { value: modelViewMode };
    modelModeRef.current = modelMode;
    const raycaster = new THREE.Raycaster();
    let previewPoint;
    let placementOrigin;
    let placementStartPointer;
    let pointPointerTarget;
    let pointPointerStart;
    let pointPointerTime = 0;
    let pointPointerBaseRotation = 0;
    let pointPointerBasePitch = 0;
    let pointPointerRayLength = 0.05;
    let pointPointerDragging = false;
    const pointerToSurface = (pointer) => {
      raycaster.setFromCamera(pointer, camera);
      const targets = [nav?.mesh].filter(Boolean);
      const hit = raycaster.intersectObjects(targets, true)[0];
      return hit?.point.clone() || null;
    };
    const pointerToAim = (pointer, height) => {
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
    };
    const pointerPosition = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const updatePathPoint = (point, position) => {
      point.position.copy(position).add(new THREE.Vector3(0, 0.002, 0));
      const previous = pathPoints[pathPoints.length - 1];
      const direction = previous ? point.position.clone().sub(previous.position) : new THREE.Vector3(0, 0, 1);
      direction.y = 0;
      const rayLength = Math.max(direction.length(), 0.15);
      point.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : point.rotation.y;
      const aimRay = point.children.find((child) => child.userData.aimRay);
      if (aimRay) aimRay.scale.z = rayLength;
    };
    const updatePathAim = (point, target) => {
      if (!pathOrigin) return;
      const direction = target.clone().sub(pathOrigin);
      direction.y = 0;
      const rayLength = Math.max(direction.length(), 0.15);
      if (direction.lengthSq()) point.rotation.y = Math.atan2(-direction.x, -direction.z);
      const aimRay = point.children.find((child) => child.userData.aimRay);
      if (aimRay) aimRay.scale.z = rayLength;
    };
    const createPathPreview = (position) => {
      const point = createTacticalPoint(position, new THREE.Vector3(0, 0, 1), null, 0.15);
      point.userData.pathPoint = true;
      point.userData.aimTarget.visible = false;
      point.traverse((object) => { if (object.material) object.material.opacity = 0.58; });
      updatePathPoint(point, position);
      return point;
    };
    const createGroundPathPoints = (from, to) => {
      const points = [];
      for (let index = 0; index <= 32; index += 1) {
        const amount = index / 32;
        const x = THREE.MathUtils.lerp(from.x, to.x, amount);
        const z = THREE.MathUtils.lerp(from.z, to.z, amount);
        let y = THREE.MathUtils.lerp(from.y, to.y, amount);
        if (nav?.mesh) {
          groundRaycaster.set(new THREE.Vector3(x, Math.max(from.y, to.y) + 20, z), new THREE.Vector3(0, -1, 0));
          const hit = groundRaycaster.intersectObject(nav.mesh, true)[0];
          if (hit) y = hit.point.y;
        }
        points.push(new THREE.Vector3(x, y + 0.035, z));
      }
      return points;
    };
    const commitPathPoint = () => {
      if (!pathPreview) return;
      pathPreview.userData.pointId = `${Date.now()}-${pointsRef.current.length}`;
      const previous = pathPoints[pathPoints.length - 1];
      if (previous) {
        const geometry = new THREE.BufferGeometry().setFromPoints(createGroundPathPoints(previous.position, pathPreview.position));
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: '#ffd166', dashSize: 0.18, gapSize: 0.12, linewidth: 2, transparent: true, opacity: 0.9 }));
        line.computeLineDistances();
        line.renderOrder = 6;
        line.userData.pathPointIds = [previous.userData.pointId, pathPreview.userData.pointId];
        scene.add(line);
        pathLines.push(line);
      }
      pathPoints.push(pathPreview);
      pointsRef.current.push(pathPreview);
      pathPreview = null;
      pathOrigin = null;
    };
    const onKeyDown = (event) => {
      if (['w', 'a', 's', 'd', 'shift', 'control'].includes(event.key.toLowerCase())) {
        pressedKeys.add(event.key.toLowerCase());
        event.preventDefault();
      }
      if (event.key.toLowerCase() === 'e' && !placing) {
        placing = true;
        controls.enabled = false;
        placementStartPointer = pointerCurrent.clone();
        placementOrigin = pointerToSurface(pointerCurrent);
        if (placementOrigin) {
           previewPoint = createTacticalPoint(placementOrigin, new THREE.Vector3(0, 0, 1), null, 0.05);
           previewPoint.userData.aimTarget.visible = false;
           previewPoint.traverse((object) => { if (object.material) object.material.opacity = 0.52; });
          scene.add(previewPoint);
        }
      }
      if (event.key.toLowerCase() === 'control' && !pathMode && !placing && !grenadeWheelOpen) {
        pathMode = true;
        pathPoints.length = 0;
        controls.enabled = false;
        event.preventDefault();
      }
      if (event.key.toLowerCase() === 'q' && !grenadeWheelOpen) {
        grenadeWheelOpen = true;
        grenadeType = grenadeTypeFromPointer(pointerCurrent);
        grenadeStartPointer = pointerCurrent.clone();
        grenadeOrigin = pointerToSurface(pointerCurrent);
        if (grenadeOrigin) { grenadePreview = createGrenadeEffect(grenadeOrigin, grenadeType, navData, nav); scene.add(grenadePreview); }
        grenadeWheelRef.current?.({ open: true, type: grenadeType });
      }
    };
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      pressedKeys.delete(key);
      if (key === 'e') {
        placing = false;
        controls.enabled = true;
        if (previewPoint && placementOrigin) {
          const direction = pointerToAim(pointerCurrent, placementOrigin.y)?.sub(placementOrigin) || new THREE.Vector3(0, 0, 1);
          const rayLength = Math.max(new THREE.Vector3(direction.x, 0, direction.z).length(), 0.05);
          const point = createTacticalPoint(placementOrigin, direction, `${Date.now()}-${pointsRef.current.length}`, rayLength);
          scene.remove(previewPoint);
          pointsRef.current.push(point);
          scene.add(point);
          previewPoint = null;
          placementOrigin = null;
          placementStartPointer = null;
        }
      }
      if (key === 'control' && pathMode) {
        pathMode = false;
        pathPointerDown = false;
        controls.enabled = true;
        if (pathPreview) { scene.remove(pathPreview); disposeGrenadeEffect(pathPreview); pathPreview = null; }
        pathOrigin = null;
      }
      if (event.key.toLowerCase() === 'q' && grenadeWheelOpen) {
        grenadeWheelOpen = false;
        activeGrenade = grenadePreview;
        if (activeGrenade) {
          activeGrenade.userData.grenadeOrigin = grenadeOrigin.clone();
          activeGrenade.userData.grenadeRange = 1;
          grenadeEffects.push(activeGrenade);
        }
        grenadePreview = null;
        grenadeOrigin = null;
        grenadeStartPointer = null;
        grenadeWheelRef.current?.({ open: false, type: grenadeType });
      }
    };
    const onPointerDown = (event) => {
      pointerCurrent = pointerPosition(event);
      focusScreen.set(pointerCurrent.x * 0.5 + 0.5, pointerCurrent.y * 0.5 + 0.5);
      if (event.button === 0 && pathMode) {
        const position = pointerToSurface(pointerCurrent);
        if (!position) return;
        pathOrigin = position;
        pathPreview = createPathPreview(position);
        scene.add(pathPreview);
        pathPointerDown = true;
        const target = pointerToAim(pointerCurrent, pathOrigin.y);
        if (target && pathPreview) updatePathAim(pathPreview, target);
        return;
      }
      if (event.button === 0 && !grenadeWheelOpen && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        const objectHit = raycaster.intersectObjects(grenadeEffects, true)[0]?.object;
        let owner = objectHit;
        while (owner && !owner.userData.grenadeEffect) owner = owner.parent;
        activeGrenade = owner || null;
      }
      if (event.button === 0 && activeGrenade && !grenadeWheelOpen && !placing) {
        grenadeAdjusting = true;
        grenadeAdjustStartPointer = pointerCurrent.clone();
        grenadeAdjustOrigin = activeGrenade.userData.grenadeOrigin.clone();
        grenadeAdjustRange = activeGrenade.userData.grenadeRange || 1;
        controls.enabled = false;
        return;
      }
      if (event.button === 0 && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        const hit = raycaster.intersectObjects(pointsRef.current, true)[0]?.object;
        if (hit) {
          let pointOwner = hit;
          while (pointOwner?.parent && pointOwner.parent.userData.pointId) pointOwner = pointOwner.parent;
          pointPointerTarget = pointOwner?.userData.pointId ? pointOwner : null;
          pointPointerStart = pointerCurrent.clone();
          pointPointerTime = performance.now();
          if (pointPointerTarget) {
            controls.enabled = false;
            pointPointerBaseRotation = pointPointerTarget.rotation.y;
            const aimTarget = pointPointerTarget.userData.aimTarget;
            const targetY = aimTarget?.position.y ?? 0.15;
            const targetZ = aimTarget?.position.z ?? -0.05;
            pointPointerRayLength = Math.max(Math.hypot(targetY - 0.15, targetZ), 0.05);
            pointPointerBasePitch = Math.atan2(targetY - 0.15, -targetZ);
            pointPointerDragging = !hit.userData.aimTarget;
          }
        }
      }
    };
    const onPointerMove = (event) => {
      pointerCurrent = pointerPosition(event);
      focusScreen.set(pointerCurrent.x * 0.5 + 0.5, pointerCurrent.y * 0.5 + 0.5);
      if (pathMode) {
        if (pathPointerDown && pathPreview) {
          const target = pointerToAim(pointerCurrent, pathOrigin.y);
          if (target) updatePathAim(pathPreview, target);
        }
        return;
      }
      if (grenadeAdjusting && activeGrenade && grenadeAdjustStartPointer && grenadeAdjustOrigin) {
        const deltaX = pointerCurrent.x - grenadeAdjustStartPointer.x;
        const deltaY = pointerCurrent.y - grenadeAdjustStartPointer.y;
        const activeType = activeGrenade.userData.grenadeEffect;
        const range = (activeType === 'smoke' || activeType === 'fire') ? Math.max(0.35, grenadeAdjustRange + deltaX * 4.5) : grenadeAdjustRange;
        const height = activeType === 'fire' ? 0 : THREE.MathUtils.clamp(deltaY * 10, -5, 8);
        activeGrenade.position.set(grenadeAdjustOrigin.x, grenadeAdjustOrigin.y + height, grenadeAdjustOrigin.z);
        activeGrenade.scale.set(range, activeType === 'smoke' ? 1 / Math.pow(range, 0.65) : 1, range);
        activeGrenade.userData.grenadeRange = range;
        if (activeGrenade.userData.aimTarget) activeGrenade.userData.aimTarget.scale.set(1 / range, 1, 1 / range);
        if (activeType === 'fire' && navData && nav) {
          const oldFire = activeGrenade.children.find((child) => child.userData.fireNav);
          if (oldFire) { activeGrenade.remove(oldFire); disposeGrenadeEffect(oldFire); }
          const fireNav = createFireNavEffect(grenadeAdjustOrigin, navData, nav, range);
          fireNav.scale.set(1 / range, 1, 1 / range);
          activeGrenade.add(fireNav);
        }
        return;
      }
      if (grenadeWheelOpen && grenadeOrigin && grenadeStartPointer) {
        const nextType = grenadeTypeFromPointer(pointerCurrent);
        if (nextType !== grenadeType) {
          if (grenadePreview) { scene.remove(grenadePreview); disposeGrenadeEffect(grenadePreview); }
          grenadeType = nextType;
          grenadePreview = createGrenadeEffect(grenadeOrigin, grenadeType, navData, nav);
          scene.add(grenadePreview);
        }
        grenadeWheelRef.current?.({ open: true, type: grenadeType });
      }
      if (placing && previewPoint && placementOrigin) {
        const position = pointerToAim(pointerCurrent, placementOrigin.y);
        if (position) {
          const direction = position.clone().sub(placementOrigin);
          direction.y = 0;
          previewPoint.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : 0;
          let aimRay;
          previewPoint.traverse((object) => { if (object.userData.aimRay) aimRay = object; });
          if (aimRay) aimRay.scale.z = Math.max(new THREE.Vector3(direction.x, 0, direction.z).length(), 0.05);
        }
      }
      if (pointPointerTarget && !placing && !grenadeAdjusting) {
        const deltaX = pointerCurrent.x - pointPointerStart.x;
        const deltaY = pointerCurrent.y - pointPointerStart.y;
        const aimRay = pointPointerTarget.children.find((child) => child.userData.aimRay);
        const aimTarget = pointPointerTarget.userData.aimTarget;
        if (pointPointerDragging) {
          const targetPosition = pointerToSurface(pointerCurrent);
          if (targetPosition) pointPointerTarget.position.copy(targetPosition).add(new THREE.Vector3(0, 0.002, 0));
        } else if (pressedKeys.has('control')) {
          const pitch = THREE.MathUtils.clamp(pointPointerBasePitch + deltaY * Math.PI, -Math.PI * 0.42, Math.PI * 0.42);
          if (aimRay) {
            aimRay.rotation.x = pitch;
            aimRay.scale.z = pointPointerRayLength;
          }
          if (aimTarget) aimTarget.position.set(0, 0.15 + Math.sin(pitch) * pointPointerRayLength, -Math.cos(pitch) * pointPointerRayLength);
        } else {
          const targetPosition = pointerToAim(pointerCurrent, pointPointerTarget.position.y);
          if (targetPosition) {
            const direction = targetPosition.sub(pointPointerTarget.position);
            direction.y = 0;
            const rayLength = Math.max(direction.length(), 0.05);
            if (direction.lengthSq()) pointPointerTarget.rotation.y = Math.atan2(-direction.x, -direction.z);
            if (aimRay) aimRay.scale.z = rayLength;
            if (aimTarget) aimTarget.position.set(0, 0.15 + Math.sin(pointPointerBasePitch) * rayLength, -Math.cos(pointPointerBasePitch) * rayLength);
          }
        }
      }
    };
    const onPointerUp = (event) => {
      if (event.button === 0 && pathMode && pathPointerDown) {
        pathPointerDown = false;
        const target = pointerToAim(pointerCurrent, pathOrigin?.y ?? pathPreview?.position.y);
        if (target && pathPreview) updatePathAim(pathPreview, target);
        commitPathPoint();
        return;
      }
      if (event.button === 0 && grenadeAdjusting) {
        grenadeAdjusting = false;
        controls.enabled = true;
        return;
      }
      if (event.button !== 0 || !pointPointerTarget) return;
      const distance = pointPointerStart.distanceTo(pointerPosition(event));
      if (performance.now() - pointPointerTime < 450 && distance < 0.03) pointSelectRef.current?.(pointPointerTarget.userData.pointId);
      pointPointerTarget = null;
      pointPointerDragging = false;
      controls.enabled = true;
    };
    const onContextMenu = (event) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    scene.add(new THREE.HemisphereLight('#d8efc0', '#111919', 2.4));
    const sun = new THREE.DirectionalLight('#fff3d1', 2.6);
    sun.position.set(12, 25, 10);
    scene.add(sun);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-label', 'Dust II 3D tactical map');
    mount.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    const floor = new THREE.GridHelper(240, 48, '#354239', '#17231d');
    floor.position.y = -0.32;
    scene.add(floor);
    gridRef.current = floor;
    const nav = navData ? createNavMesh(navData, focusScreen, focusEnabled, viewportSize) : null;
    if (nav) {
      edgesRef.current = nav.edgeLines;
      scene.add(nav.group);
    }
    let worldModel;
    let disposed = false;
    new GLTFLoader().load(`/maps/${mapName}/${mapName}.glb`, (gltf) => {
      if (disposed) return;
      worldModel = gltf.scene;
      const modelBounds = new THREE.Box3().setFromObject(worldModel);
      const modelCenter = modelBounds.getCenter(new THREE.Vector3());
      worldModel.position.sub(modelCenter);
      floor.position.y = -modelCenter.y - 0.35;
      if (nav) {
        nav.group.position.copy(modelCenter).multiplyScalar(-1);
      }
      const modelSize = modelBounds.getSize(new THREE.Vector3()).length();
      const resetCamera = () => {
        const distance = Math.max(modelSize * 0.72, 18);
        camera.position.set(distance * 0.68, distance * 0.9, distance);
        camera.far = Math.max(modelSize * 4, 200);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.maxDistance = Math.max(modelSize * 2.2, 70);
        controls.update();
      };
      worldModel.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = true;
        object.renderOrder = 3;
        if (object.material) object.material = Array.isArray(object.material) ? object.material.map(() => createGhostMaterial(focusScreen, viewportSize, modelMode)) : createGhostMaterial(focusScreen, viewportSize, modelMode);
      });
      scene.add(worldModel);
      modelRef.current = worldModel;
      worldModel.visible = modelVisibilityRef.current;
      resetCamera();
      onReady({ reset: resetCamera });
    }, undefined, (loadError) => {
      console.info(`${mapName} visual model unavailable.`, loadError.message);
      if (nav) {
        nav.group.position.copy(nav.center).multiplyScalar(-1);
        const distance = Math.max(nav.size * 0.8, 18);
        camera.position.set(distance * 0.68, distance * 0.9, distance);
        camera.far = Math.max(nav.size * 4, 200);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.maxDistance = Math.max(nav.size * 2.2, 70);
        controls.update();
        onReady({ reset: () => { camera.position.set(distance * 0.68, distance * 0.9, distance); controls.target.set(0, 0, 0); controls.update(); } });
      }
    });
    controls.target.set(0, 0, 0);
    controls.update();
    onReady({ reset: () => { camera.position.set(17, 23, 25); controls.target.set(0, 0, 0); controls.update(); } });
    const resize = () => { const { width, height } = mount.getBoundingClientRect(); renderer.setSize(width, height, false); renderer.getDrawingBufferSize(viewportSize); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
    resize();
    window.addEventListener('resize', resize);
    let frame;
    let lastMoveTime = performance.now();
    const moveCamera = (now) => {
      const elapsed = Math.min((now - lastMoveTime) / 1000, 0.05);
      lastMoveTime = now;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const movement = new THREE.Vector3();
      if (pressedKeys.has('w')) movement.add(forward);
      if (pressedKeys.has('s')) movement.sub(forward);
      if (pressedKeys.has('d')) movement.add(right);
      if (pressedKeys.has('a')) movement.sub(right);
      if (movement.lengthSq() === 0) return;
      movement.normalize().multiplyScalar(elapsed * (pressedKeys.has('shift') ? 51 : 18));
      camera.position.add(movement);
      controls.target.add(movement);
    };
    const animate = (now) => { moveCamera(now); controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
    animate(performance.now());
    return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); renderer.domElement.removeEventListener('wheel', onWheel); renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('contextmenu', onContextMenu); controls.dispose(); [...new Set([...grenadeEffects, grenadePreview, activeGrenade].filter(Boolean))].forEach(disposeGrenadeEffect); [...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); })); pathLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); scene.remove(line); }); pathLines.length = 0; pointsRef.current = []; gridRef.current = null; modelRef.current = null; navFocusRef.current = null; if (nav) { nav.geometry.dispose(); nav.edgeGeometry.dispose(); nav.mesh.material.dispose(); nav.edgeLines.material.dispose(); } if (worldModel) scene.remove(worldModel); renderer.dispose(); mount.removeChild(renderer.domElement); };
  }, [mapName]);

  useEffect(() => {
    if (!deletePointId) return;
    const index = pointsRef.current.findIndex((point) => point.userData.pointId === deletePointId);
    if (index < 0) return;
    const [point] = pointsRef.current.splice(index, 1);
    pathLinesRef.current.filter((line) => line.userData.pathPointIds?.includes(deletePointId)).forEach((line) => {
      line.parent?.remove(line);
      line.geometry.dispose();
      line.material.dispose();
      pathLinesRef.current.splice(pathLinesRef.current.indexOf(line), 1);
    });
    point.parent?.remove(point);
    point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    onPointSelect?.(null);
  }, [deletePointId, onPointSelect]);

  useEffect(() => {
    if (!pointUpdate) return;
    const point = pointsRef.current.find((item) => item.userData.pointId === pointUpdate.id);
    if (point) updateTacticalPoint(point, pointUpdate.team || point.userData.team, pointUpdate.type || point.userData.type);
  }, [pointUpdate]);

  useEffect(() => {
    if (edgesRef.current) edgesRef.current.visible = showEdges;
  }, [showEdges]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    modelVisibilityRef.current = showModel;
    if (modelRef.current) modelRef.current.visible = showModel;
    if (navFocusRef.current) navFocusRef.current.value = showModel && modelViewMode === 1 ? 1 : 0;
    if (modelModeRef.current) modelModeRef.current.value = modelViewMode;
  }, [showModel, modelViewMode]);

  return <div ref={(node) => { mountRef.current = node; }} className="three-board">{error && <div className="board-error">{error}</div>}</div>;
}

function App() {
  const [mapName, setMapName] = useState('de_dust2');
  const [navData, setNavData] = useState(fallbackNavData);
  const [showEdges, setShowEdges] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showModel, setShowModel] = useState(true);
  const [modelViewMode, setModelViewMode] = useState(0);
  const modelModeLabels = ['REACHABLE SURFACE', 'MOUSE LENS', 'CAMERA LENS'];
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdate] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const boardRef = useRef(null);
  const onReady = (value) => { boardRef.current = value; };
  useEffect(() => {
    let cancelled = false;
    setNavData(mapName === 'de_dust2' ? fallbackNavData : null);
    fetch(`/api/maps/${mapName}/nav`).then((response) => response.json()).then((data) => { if (!cancelled && data.areas) setNavData(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapName]);
  return <main className="board-shell">
    <header className="board-header">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>CS<span>BOARD</span></span></div>
      <div className="header-title"><b>TACTICAL SPACE</b><span>/</span><span>{mapName.toUpperCase()} · VPK WORLD</span></div>
      <div className="key-hints"><span><kbd>MMB</kbd> ORBIT</span><span><kbd>SHIFT + MMB</kbd> PAN</span><span><kbd>W A S D</kbd> MOVE</span><span><kbd>Q</kbd> UTILITY</span><span><kbd>E</kbd> POINT</span><span><kbd>CTRL</kbd> PATH / TILT</span></div>
      <div className="header-status"><i /> REF DATA LOADED</div>
    </header>
    <section className="board-stage">
       <ThreeBoard key={`${mapName}-${navData ? navData.version : 'loading'}`} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelViewMode={modelViewMode} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={setSelectedPoint} onGrenadeWheel={setGrenadeWheel} onReady={onReady} />
      <div className="stage-vignette" />
      <div className="map-name"><span>01</span><h1>{mapName.toUpperCase()}</h1><p>OFFICIAL VPK WORLD / 3D RECONSTRUCTION</p></div>
      <div className="map-axis"><span>N</span><div /></div>
      {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>烟</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>火</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>闪</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>雷</div><span className="wheel-key">Q</span></div>}
      <div className="hud hud-left"><span>DATASET</span><strong>VALVE VPK / WORLD GLB</strong><span>COORDINATE SYSTEM</span><strong>CS2 WORLD SPACE</strong></div>
       <div className="hud hud-right"><span>VIEW CONTROLS</span><strong>MMB <em>ROTATE</em></strong><strong>SHIFT + MMB <em>PAN</em></strong><strong>SCROLL <em>ZOOM</em></strong><strong>WASD <em>MOVE</em></strong><strong>LEFT CLICK <em>POINT MENU</em></strong></div>
       {selectedPoint && <div className="point-actions"><span>TACTICAL POINT</span><div className="point-choice"><b>TEAM</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div><div className="point-choice"><b>TYPE</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button></div><button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); }}>DELETE</button></div>}
       <div className="board-tools"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> GRID</button><button type="button" onClick={() => setShowModel((value) => !value)} className={showModel ? 'selected' : ''}><i /> MODEL</button><button type="button" onClick={() => setModelViewMode((value) => (value + 1) % 3)} className={showModel ? 'selected' : ''}><i /> {modelModeLabels[modelViewMode]}</button>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}><i /> AREA EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET VIEW</button></div>
      <div className="board-footer"><span>NAV PRIMARY / VPK REFERENCE</span><span>{navData ? `${Object.keys(navData.areas).length.toLocaleString()} NAV AREAS` : 'LOADING NAV'}</span><span>LIVE 3D</span></div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
