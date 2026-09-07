import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { createNavMesh } from './navMesh.js';
import { createZoneModel } from './zoneModel.js';
import { createTutorialMap, TUTORIAL_MAP_ID } from './tutorialMap.js';
import { createGhostMaterial, enableMapSquareFade } from './materials.js';
import { createTacticalPoint, updateTacticalPoint } from './tacticalPoint.js';
import { createCollabPlayer, randomPlayerName, renameCollabPlayer, setCollabPlayerCrouch, setCollabPlayerPitch, setCollabPlayerTeam, updateCollabPlayerAim } from './collabPlayer.js';
import { createFireNavEffect, createGrenadeEffect, disposeGrenadeEffect, grenadeTypeFromPointer, setGrenadeEffectRange } from './grenadeEffects.js';
import { cs2AnglesToSceneDirection } from '../demo/interpolation.js';
import { grenadeKind, groupDemoProjectiles } from '../demo/grenades.js';
import { effectEndTick, isEffectStartEvent } from '../demo/effectLifetime.js';
import { demoEquipmentKind, demoEventPlayerMatches, demoPlayerReload } from '../demo/playerState.js';
import { demoRosterRuntime } from './runtime.js';
import { enableMaterialFloorFade, floorVisibilityAtY, updateFloorFadeState } from './floorFade.js';
import createNavBoundaryCollider, { getNavSourceBounds } from './navBoundaryCollider.js';
import createAnalysisSceneController from './analysisSceneController.js';
import createCameraInputController from './cameraInputController.js';
import createCameraStateController from './cameraStateController.js';
import createC4SceneController from './c4SceneController.js';
import buildRadarCameraState from './radarCameraState.js';
import createDeathHeatSceneController from './deathHeatSceneController.js';
import createDemoGrenadeSceneController from './demoGrenadeSceneController.js';
import createUtilityNotesSceneController from './utilityNotesSceneController.js';
import createCollabUtilitySceneController from './collabUtilitySceneController.js';
import createDemoPlayerSceneUpdater from './demoPlayerSceneUpdater.js';
import useThreeBoardRuntimeRefs from './useThreeBoardRuntimeRefs.js';
import { createBrushLine, disposeBrushLine, serializeBrushLine, updateBrushLine } from './brushStroke.js';
import { ANALYSIS_HEAT_DATA_EVENT, loadViewPreferences, MAP_BASE, MAP_ZONE_MODELS_ENABLED, MODEL_VIEW_RANGE_EVENT, NAV_TOP_CAMERA_TARGET_MAPS } from '../app/config.js';
import { buildSavedThrowNote } from '../utility/savedThrow.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Owns the imperative Three.js scene and exposes its workspace API to the React shell.
export default function ThreeBoard(props) {
  const { mapName, navData, showEdges, showGrid, showModel, modelOpacity, modelViewMode, demoProjectiles, analysisRounds, deletePointId, pointUpdate, onCameraSlots, onReady } = props;
  const mountRef = useRef(null);
  const {
    edgesRef, modelModeRef, modelRangeRef, navFocusRef, navGroupRef, gridRef, modelRef,
    modelBasePositionRef, modelCenterYRef, floorFadeRef, mapFloorRef, demoSnapshotRef,
    demoSnapshotsRef, demoTickRef, demoFiresRef, demoHurtsRef, demoGrenadesRef,
    demoProjectilesRef, demoSmokeVoxelFramesRef, demoGrenadeSegmentsRef, demoSourceRef, demoGrenadeSelectRef, demoDeathsRef,
    demoC4EventsRef, demoHltvEventsRef, demoCameraModeRef, demoCameraInterruptRef,
    demoInEyePlayerRef, heatDeathsRef, analysisHeatDeathsRef, demoViewFlagsRef,
    showDemoNamesRef, hoveredDemoPlayerRef, utilityNotesRef, utilityNotesEnabledRef,
    utilityHoverRef, utilityFirstPersonRef, utilityProjectileFollowRef, analysisRowsRef,
    analysisUtilitiesRef, analysisHighlightedUtilityIdRef, analysisUtilitySelectRef,
    analysisUtilityHoverRef, analysisSelectedPlayersRef, analysisEnabledRef,
    pointPlacementEnabledRef, collabEditingEnabledRef, brushEnabledRef, brushColorRef,
    brushWidthRef, brushEraserRef, onBrushChangeRef, onCollabEditRef, modelLoadStateRef,
    modelViewRangeChangeRef, collabHistoryRef, analysisTimeRef, analysisSideRef,
    demoProjectileGroupsRef, demoPlayersRef, modelVisibilityRef, pointsRef, pointSelectRef,
    grenadeWheelRef, trackpadDetectionRef, wheelGestureRef,
  } = useThreeBoardRuntimeRefs(props);
  const [error, setError] = useState('');
  updateFloorFadeState(floorFadeRef.current, mapName, mapFloorRef.current, modelCenterYRef.current, navData);
  useEffect(() => {
    demoProjectileGroupsRef.current = groupDemoProjectiles(demoProjectiles);
  }, [demoProjectiles]);

  useEffect(() => {
    const onMapFloorChange = (event) => {
      if (event.detail?.mapName !== mapName) return;
      mapFloorRef.current = event.detail.floor;
      updateFloorFadeState(floorFadeRef.current, mapName, mapFloorRef.current, modelCenterYRef.current, navData);
    };
    window.addEventListener('csboard-map-floor', onMapFloorChange);
    return () => window.removeEventListener('csboard-map-floor', onMapFloorChange);
  }, [mapName]);

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
    const demoPlayers = new THREE.Group();
    const demoMarkers = new Map();
    const demoMovementTrails = new Map();
    let frameTween = null;
    const collisionMeshes = [];
    const isInteractiveFloorPoint = (point) => floorVisibilityAtY(point.y, floorFadeRef.current) > 0.05;
    const firstInteractiveFloorHit = (hits) => hits.find((hit) => isInteractiveFloorPoint(hit.point));
    const aimRaycaster = new THREE.Raycaster();
    aimRaycaster.firstHitOnly = true;
    let collisionVersion = 0;
    scene.add(demoPlayers);
    demoPlayersRef.current = demoPlayers;
    let modelCenter = new THREE.Vector3();
    const analysisScene = createAnalysisSceneController({
      scene,
      refs: {
        rows: analysisRowsRef,
        utilities: analysisUtilitiesRef,
        highlightedUtilityId: analysisHighlightedUtilityIdRef,
        selectedPlayers: analysisSelectedPlayersRef,
        enabled: analysisEnabledRef,
        flags: demoViewFlagsRef,
        side: analysisSideRef,
        time: analysisTimeRef,
      },
      getModelCenter: () => modelCenter,
    });
    const radarSourceBounds = getNavSourceBounds(navData);
    const navBoundaryCollider = createNavBoundaryCollider(navData, () => modelCenter);
    const deathHeatScene = createDeathHeatSceneController({
      scene,
      refs: {
        deaths: demoDeathsRef,
        heatDeaths: heatDeathsRef,
        analysisDeaths: analysisHeatDeathsRef,
        flags: demoViewFlagsRef,
        analysisEnabled: analysisEnabledRef,
        selectedPlayers: analysisSelectedPlayersRef,
        side: analysisSideRef,
        utilities: analysisUtilitiesRef,
        rows: analysisRowsRef,
      },
      floorFadeRef,
      getModelCenter: () => modelCenter,
      getNav: () => nav,
    });
    const demoGrenadeScene = createDemoGrenadeSceneController({
      scene,
      navData,
      refs: {
        projectileGroups: demoProjectileGroupsRef,
        smokeVoxelFrames: demoSmokeVoxelFramesRef,
        grenades: demoGrenadesRef,
        segments: demoGrenadeSegmentsRef,
        tick: demoTickRef,
      },
      floorFadeRef,
      getModelCenter: () => modelCenter,
      getNav: () => nav,
    });
    const utilityNotesScene = createUtilityNotesSceneController({
      scene,
      refs: { notes: utilityNotesRef, enabled: utilityNotesEnabledRef },
      getModelCenter: () => modelCenter,
      getCollisionVersion: () => collisionVersion,
    });
    const updateDemoPlayers = createDemoPlayerSceneUpdater({
      scene,
      demoPlayers,
      demoMarkers,
      demoMovementTrails,
      refs: {
        snapshot: demoSnapshotRef,
        snapshots: demoSnapshotsRef,
        tick: demoTickRef,
        fires: demoFiresRef,
        hurts: demoHurtsRef,
        inEyePlayer: demoInEyePlayerRef,
        utilityFirstPerson: utilityFirstPersonRef,
        showNames: showDemoNamesRef,
        hoveredPlayer: hoveredDemoPlayerRef,
      },
      floorFadeRef,
      aimRaycaster,
      getModelCenter: () => modelCenter,
      getCamera: () => camera,
      getRenderer: () => renderer,
      getCollisionMeshes: () => collisionMeshes,
      getCollisionVersion: () => collisionVersion,
    });
    const c4Scene = createC4SceneController({
      scene,
      refs: { events: demoC4EventsRef, tick: demoTickRef, snapshots: demoSnapshotsRef },
      getModelCenter: () => modelCenter,
      getNav: () => nav,
    });
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(17, 23, 25);
    const demoPovEquipment = new THREE.Group();
    demoPovEquipment.position.set(0.58, -0.48, -1.28);
    demoPovEquipment.rotation.set(-0.08, -0.1, -0.04);
    demoPovEquipment.scale.setScalar(1.45);
    const demoPovMuzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
    demoPovMuzzleFlash.position.set(0, 0, -1.05);
    demoPovMuzzleFlash.visible = false;
    demoPovEquipment.add(demoPovMuzzleFlash);
    camera.add(demoPovEquipment);
    const povThrownUtility = new THREE.Group();
    povThrownUtility.visible = false;
    camera.add(povThrownUtility);
    scene.add(camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    let utilityPlaybackCameraActive = false;
    let utilityProjectileCameraActive = false;
    const utilityFollowDirection = new THREE.Vector3(0, 0, 1);
    let utilityReturnCamera = null;
    let demoDirectorCameraActive = false;
    let demoDirectorEventKey = '';
    let cameraTransition = null;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 5;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.enableZoom = window.matchMedia?.('(pointer: coarse)').matches === true;
    const pressedKeys = new Set();
    const pathLines = [];
    let placing = false;
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
     const focusEnabled = { value: 0 };
    navFocusRef.current = focusEnabled;
    const modelMode = { value: modelViewMode };
    modelModeRef.current = modelMode;
    const savedModelViewRange = Number(loadViewPreferences().modelViewRange);
    const modelRange = { value: Number.isFinite(savedModelViewRange) ? THREE.MathUtils.clamp(savedModelViewRange, 0, 1) : 0.5 };
    modelRangeRef.current = modelRange;
    const restoreModelViewRange = (value) => {
      if (!Number.isFinite(value)) return;
      const range = THREE.MathUtils.clamp(value, 0, 1);
      modelRange.value = range;
      modelViewRangeChangeRef.current?.(range);
    };
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
    let pointPointerMoved = false;
    let pointPointerSnapshot = null;
    let lastClickTime = 0;
    let lastClickId = null;
    let grenadeAdjustSnapshot = null;
    const brushStrokes = [];
    const brushUndoStack = [];
    const brushRedoStack = [];
    let brushActive = false;
    let brushStrokePoints = [];
    let brushStrokeLine = null;
    let brushPointerDown = false;
    let brushLastInBounds = null;
    let brushCollabSnapshot = null;
    let eraserActive = false;
    let eraserLastPointer = null;
    let eraserChanged = false;
    const collabUndoStack = [];
    const collabRedoStack = [];
    const notifyCollabEdit = () => onCollabEditRef.current?.();
    const createBrushStrokeLine = () => {
      const line = createBrushLine(brushStrokePoints, { color: brushColorRef.current, width: brushWidthRef.current });
      scene.add(line);
      return line;
    };
    const updateBrushStrokeLine = () => {
      if (!brushStrokeLine) return;
      updateBrushLine(brushStrokeLine, brushStrokePoints);
    };
    const removeBrushStrokeLine = () => {
      if (!brushStrokeLine) return;
      disposeBrushLine(scene, brushStrokeLine);
      brushStrokeLine = null;
    };
    const clearBrushStrokes = () => {
      brushStrokes.forEach((line) => disposeBrushLine(scene, line));
      brushStrokes.length = 0;
      brushUndoStack.length = 0;
      brushRedoStack.length = 0;
      removeBrushStrokeLine();
      brushStrokePoints = [];
      brushActive = false;
      brushPointerDown = false;
      brushLastInBounds = null;
      notifyBrushChange();
    };
    const undoBrush = () => {
      if (!brushUndoStack.length) return;
      const line = brushUndoStack.pop();
      scene.remove(line);
      brushRedoStack.push(line);
      notifyBrushChange();
    };
    const redoBrush = () => {
      if (!brushRedoStack.length) return;
      const line = brushRedoStack.pop();
      scene.add(line);
      brushUndoStack.push(line);
      notifyBrushChange();
    };
    const startBrushStroke = (position) => {
      if (!position) return;
      brushActive = true;
      brushPointerDown = true;
      brushStrokePoints = [position.clone().add(new THREE.Vector3(0, 0.035, 0))];
      brushLastInBounds = position.clone();
      brushStrokeLine = createBrushStrokeLine();
    };
    const pointSegmentDistance = (point, a, b) => {
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      let t = lenSq > 0 ? ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = point.x - (a.x + abx * t);
      const dy = point.y - (a.y + aby * t);
      return Math.hypot(dx, dy);
    };
    const strokeWorldPoints = (line) => {
      const width = renderer.domElement.clientWidth || 1;
      const height = renderer.domElement.clientHeight || 1;
      const worldPoints = line.userData.worldPoints;
      const world = new THREE.Vector3();
      const project = (w) => {
        const projected = w.clone().project(camera);
        return new THREE.Vector2((projected.x * 0.5 + 0.5) * width, (-projected.y * 0.5 + 0.5) * height);
      };
      if (worldPoints && worldPoints.length) return worldPoints.map(project);
      const positions = line.geometry.attributes.position?.array;
      if (!positions) return [];
      const points = [];
      for (let index = 0; index < positions.length; index += 3) {
        world.set(positions[index], positions[index + 1], positions[index + 2]);
        line.localToWorld(world);
        points.push(project(world));
      }
      return points;
    };
    const eraseStrokesUnderPointer = (pointerScreen) => {
      if (!brushStrokes.length) return;
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const threshold = 1.5;
      const hitSet = new Set();
      brushStrokes.forEach((line) => {
        if (line.userData.worldPoints?.length && !line.userData.worldPoints.some(isInteractiveFloorPoint)) return;
        const screenPoints = strokeWorldPoints(line);
        for (let index = 0; index < screenPoints.length - 1; index += 1) {
          if (pointSegmentDistance(pointerScreen, screenPoints[index], screenPoints[index + 1]) <= threshold) {
            hitSet.add(line);
            break;
          }
        }
      });
      if (!hitSet.size) return false;
      hitSet.forEach((line) => {
        const index = brushStrokes.indexOf(line);
        if (index < 0) return;
        brushStrokes.splice(index, 1);
        const undoIndex = brushUndoStack.indexOf(line);
        if (undoIndex >= 0) brushUndoStack.splice(undoIndex, 1);
        disposeBrushLine(scene, line);
      });
      notifyBrushChange();
      return true;
    };
    const eraseAtPointer = (ndcPointer) => {
      const screenX = (ndcPointer.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      const screenY = (-ndcPointer.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      const pointerScreen = new THREE.Vector2(screenX, screenY);
      if (eraserLastPointer && pointerScreen.distanceTo(eraserLastPointer) < 6) return;
      const start = eraserLastPointer ? eraserLastPointer.clone() : pointerScreen.clone();
      eraserLastPointer = pointerScreen.clone();
      eraserChanged = eraseStrokesUnderPointer(start) || eraserChanged;
      eraserChanged = eraseStrokesUnderPointer(pointerScreen) || eraserChanged;
      const midpoint = start.clone().add(pointerScreen).multiplyScalar(0.5);
      eraserChanged = eraseStrokesUnderPointer(midpoint) || eraserChanged;
    };
    const pointerToSurface = (pointer) => {
      raycaster.setFromCamera(pointer, camera);
      const targets = [nav?.mesh].filter(Boolean);
      const hit = firstInteractiveFloorHit(raycaster.intersectObjects(targets, true));
      return hit?.point.clone() || null;
    };
    const pointerToAim = (pointer, height) => {
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
    };
    const isCollabPlacement = () => pointPlacementEnabledRef.current === true;
    const createPlacedObject = (position, direction, id, rayLength, team = 'T') => {
      if (isCollabPlacement()) {
        const existing = new Set(pointsRef.current.filter((point) => point.userData.collabPlayer && point.userData.playerName).map((point) => point.userData.playerName));
        const start = Math.floor(Math.random() * 0x1000);
        let name = null;
        for (let offset = 0; offset < 0x1000; offset += 1) {
          const candidate = ((start + offset) % 0x1000).toString(16).toUpperCase().padStart(3, '0');
          if (!existing.has(candidate)) { name = candidate; break; }
        }
        if (!name) return null;
        const player = createCollabPlayer({ position, id, name, team, weapon: 'ak47' });
        const flat = direction.clone(); flat.y = 0;
        if (flat.lengthSq()) player.rotation.y = Math.atan2(-flat.x, -flat.z);
        updateCollabPlayerAim(player, collisionMeshes, aimRaycaster, collisionVersion);
        return player;
      }
      return createTacticalPoint(position, direction, id, rayLength, team, 'T');
    };
    const applyPlacedAim = (point, target) => {
      if (point.userData.collabPlayer) {
        const flat = target.clone().sub(point.position); flat.y = 0;
        if (flat.lengthSq()) point.rotation.y = Math.atan2(-flat.x, -flat.z);
        point.userData.aimCollisionVersion = -1;
        updateCollabPlayerAim(point, collisionMeshes, aimRaycaster, collisionVersion);
        return;
      }
      const aimRay = point.children.find((child) => child.userData.aimRay);
      const rayLength = Math.max(target.distanceTo(point.position), 0.05);
      if (aimRay) aimRay.scale.z = rayLength;
    };
    const applyPlacedPreview = (point, direction) => {
      const flat = direction.clone(); flat.y = 0;
      if (flat.lengthSq()) point.rotation.y = Math.atan2(-flat.x, -flat.z);
      if (point.userData.collabPlayer) {
        point.userData.aimCollisionVersion = -1;
        updateCollabPlayerAim(point, collisionMeshes, aimRaycaster, collisionVersion);
      } else {
        const aimRay = point.children.find((child) => child.userData.aimRay);
        if (aimRay) aimRay.scale.z = Math.max(flat.length(), 0.05);
      }
    };
    const pointerPosition = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const collabUtilityScene = createCollabUtilitySceneController({
      scene,
      navData,
      editingRef: collabEditingEnabledRef,
      floorFadeRef,
      getModelCenter: () => modelCenter,
      getNav: () => nav,
      pushHistory: () => pushCollabHistory(),
      notifyEdit: notifyCollabEdit,
    });
    const addCollabUtility = collabUtilityScene.add;
    const removeCollabUtility = collabUtilityScene.remove;
    const promoteCollabUtility = collabUtilityScene.promote;
    const clearCollabUtilities = collabUtilityScene.clear;
    let collabUtilityPreviewCamera = null;
    let collabUtilityOrbit = null;
    let collabFocusedPlayer = null;
    const releaseCollabFocusedPlayer = () => {
      if (collabFocusedPlayer?.point) collabFocusedPlayer.point.visible = collabFocusedPlayer.visible;
      collabFocusedPlayer = null;
    };
    const transitionToCollabFocus = (preview) => {
      if (!preview?.focus) return;
      releaseCollabFocusedPlayer();
      if (!collabUtilityPreviewCamera) {
        collabUtilityPreviewCamera = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, modelMode: modelMode.value, modelRange: modelRange.value, modelVisible: modelVisibilityRef.current };
      }
      // Focus previews temporarily expose nearby geometry with a tight camera lens,
      // without publishing or persisting the user's normal visualization settings.
      modelMode.value = 2;
      modelRange.value = 0.2;
      if (modelRef.current) modelRef.current.visible = true;
      const focus = new THREE.Vector3().fromArray(preview.focus);
      const originalOffset = collabUtilityPreviewCamera.position.clone().sub(collabUtilityPreviewCamera.target);
      const distance = THREE.MathUtils.clamp(originalOffset.length(), 5.5, 13);
      const direction = originalOffset.lengthSq() > 0.001 ? originalOffset.normalize() : new THREE.Vector3(0.55, 0.72, 1).normalize();
      const toPosition = focus.clone().add(direction.multiplyScalar(distance));
      const orbitOffset = toPosition.clone().sub(focus);
      collabUtilityOrbit = { target: focus.clone(), radius: Math.max(2.5, Math.hypot(orbitOffset.x, orbitOffset.z)), height: orbitOffset.y, angle: Math.atan2(orbitOffset.z, orbitOffset.x), speed: 0.36, lastTime: null };
      cameraTransition = { elapsed: 0, duration: 320, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition, toTarget: focus };
      controls.enabled = false;
    };
    const previewCollabUtility = (note) => {
      if (note) transitionToCollabFocus(collabUtilityScene.preview(note));
    };
    // Existing anonymous frame utilities only need camera focus; rendering a second preview would overlap them.
    const focusCollabUtility = (itemId) => transitionToCollabFocus(collabUtilityScene.focus(itemId));
    const focusCollabPlayer = (pointId) => {
      const point = pointsRef.current.find((item) => item.userData.pointId === pointId && item.userData.collabPlayer);
      if (!point) return;
      if (!collabUtilityPreviewCamera) {
        collabUtilityPreviewCamera = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, modelMode: modelMode.value, modelRange: modelRange.value, modelVisible: modelVisibilityRef.current };
      }
      collabUtilityScene.clearPreview();
      collabUtilityOrbit = null;
      releaseCollabFocusedPlayer();
      // Reuse the player's aim-ray transform so the preview exactly follows its
      // saved yaw, pitch, crouch height, and collision-adjusted facing direction.
      point.updateMatrixWorld(true);
      const aimRay = point.userData.aimRay;
      const eye = aimRay ? point.localToWorld(aimRay.position.clone()) : point.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, point.userData.crouched ? 0.62 : 0.93, 0));
      const direction = new THREE.Vector3(0, 0, -1).applyEuler(aimRay?.rotation || new THREE.Euler()).applyQuaternion(point.quaternion).normalize();
      const target = eye.clone().add(direction.multiplyScalar(8));
      collabFocusedPlayer = { point, visible: point.visible };
      point.visible = false;
      cameraTransition = { elapsed: 0, duration: 320, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), fromFov: camera.fov, toPosition: eye, toTarget: target, toFov: 68 };
      controls.enabled = false;
    };
    // Utility Notes focus the rendered landing effect; manual notes without
    // replay data naturally fall back to an effect at their saved throw point.
    const focusUtilityNote = (note) => {
      if (note) transitionToCollabFocus(collabUtilityScene.preview(note));
    };
    const clearCollabUtilityPreview = (restoreCamera = true) => {
      collabUtilityScene.clearPreview();
      collabUtilityOrbit = null;
      releaseCollabFocusedPlayer();
      if (collabUtilityPreviewCamera) {
        modelMode.value = collabUtilityPreviewCamera.modelMode;
        modelRange.value = collabUtilityPreviewCamera.modelRange;
        if (modelRef.current) modelRef.current.visible = collabUtilityPreviewCamera.modelVisible;
      }
      if (restoreCamera && collabUtilityPreviewCamera) {
        cameraTransition = { elapsed: 0, duration: 320, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), fromFov: camera.fov, toPosition: collabUtilityPreviewCamera.position.clone(), toTarget: collabUtilityPreviewCamera.target.clone(), toFov: collabUtilityPreviewCamera.fov };
        controls.enabled = false;
      }
      collabUtilityPreviewCamera = null;
    };
    const getCollabPlayers = () => pointsRef.current.filter((point) => point.userData.collabPlayer && point.userData.pointId).map((point) => ({ id: point.userData.pointId, name: point.userData.playerName, team: point.userData.team, position: point.position.toArray(), rotationY: point.rotation.y, pitch: point.userData.collabPitch || 0 }));
    const renamePlayerPoint = (pointId, name) => {
      const point = pointsRef.current.find((item) => item.userData.pointId === pointId && item.userData.collabPlayer);
      if (point) { pushCollabHistory(); renameCollabPlayer(point, name); notifyCollabEdit(); }
    };
    const setPlayerTeamPoint = (pointId, team) => {
      const point = pointsRef.current.find((item) => item.userData.pointId === pointId && item.userData.collabPlayer);
      if (!point || point.userData.team === team) return;
      pushCollabHistory();
      setCollabPlayerTeam(point, team);
      notifyCollabEdit();
    };
    renamePlayerPoint.setTeam = setPlayerTeamPoint;
    const setCollabVisible = (visible) => {
      collabUtilityScene.setVisible(visible);
      pointsRef.current.forEach((point) => { if (point.userData.collabPlayer) point.visible = visible !== false; });
    };
    const setCollabEditingEnabled = (enabled) => { collabEditingEnabledRef.current = enabled === true; };
    const finalizeFrameTween = () => {
      if (frameTween) {
        frameTween.entries.forEach(({ point, to, toRot, toPitch }) => {
          point.position.copy(to);
          point.rotation.y = toRot;
          setCollabPlayerPitch(point, toPitch);
        });
        frameTween = null;
      }
    };
    const smoothRestoreFrame = (saved, includeCurrentCamera = true, cameraOverride = null, playTargetUtilities = false) => {
      finalizeFrameTween();
      let previousByName = new Map();
      try { previousByName = new Map(getCollabPlayers().map((player) => [player.name, { position: new THREE.Vector3().fromArray(player.position), rotationY: player.rotationY, pitch: player.pitch }])); } catch (error) { console.error('smoothRestoreFrame getCollabPlayers', error); }
      const savedCamera = saved?.camera && saved.camera.position && saved.camera.target ? { position: new THREE.Vector3().fromArray(saved.camera.position), target: new THREE.Vector3().fromArray(saved.camera.target), viewRange: saved.camera.viewRange } : null;
      const overrideCamera = cameraOverride?.position && cameraOverride?.target ? { position: new THREE.Vector3().fromArray(cameraOverride.position), target: new THREE.Vector3().fromArray(cameraOverride.target), viewRange: cameraOverride.viewRange } : null;
      const targetCamera = overrideCamera || (includeCurrentCamera ? savedCamera : null);
      restoreWorkspaceState(saved, false);
      // Frame navigation may replay the target frame's throws; ordinary workspace
      // restoration remains static so opening Collaboration does not auto-play.
      if (playTargetUtilities) collabUtilityScene.play();
      const tweenEntries = [];
      pointsRef.current.forEach((point) => {
        if (!point.userData.collabPlayer || !point.userData.playerName) return;
        const from = previousByName.get(point.userData.playerName);
        if (!from) return;
        tweenEntries.push({ point, from: from.position, to: point.position.clone(), fromRot: from.rotationY, toRot: point.rotation.y, fromPitch: from.pitch, toPitch: point.userData.collabPitch || 0 });
      });
      frameTween = { start: performance.now(), duration: 420, entries: tweenEntries };
      if (targetCamera) {
        restoreModelViewRange(targetCamera.viewRange);
        cameraTransition = { elapsed: 0, duration: 500, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: targetCamera.position.clone(), toTarget: targetCamera.target.clone() };
        controls.enabled = false;
      }
    };
    const cameraState = createCameraStateController({
      mapName,
      camera,
      controls,
      onSlotsChange: onCameraSlots,
      isPersistenceBlocked: () => utilityPlaybackCameraActive || demoDirectorCameraActive,
      getViewRange: () => modelRange.value,
      onRestoreViewRange: restoreModelViewRange,
      onRestoreSlot: (saved) => {
      restoreModelViewRange(saved.viewRange);
      cameraTransition = { elapsed: 0, duration: 450, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: saved.position.clone(), toTarget: saved.target.clone() };
      controls.enabled = false;
      },
    });
    const saveCameraSlot = cameraState.saveSlot;
    const restoreCameraSlot = cameraState.restoreSlot;
    const getCameraState = cameraState.getCameraState;
    const cameraInput = createCameraInputController({
      renderer,
      camera,
      controls,
      trackpadDetectionRef,
      wheelGestureRef,
      onCameraInterrupt: () => {
        if (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current) demoCameraInterruptRef.current?.();
      },
      onManualInteraction: cameraState.clearActiveSlot,
      canEnableControls: () => !cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive,
    });
    const getRadarCameraState = () => buildRadarCameraState({ camera, controls, snapshot: demoSnapshotRef.current, collabPoints: pointsRef.current, modelCenter, sourceBounds: radarSourceBounds });
    const collabSnapshot = () => {
      const workspace = getWorkspaceState();
      return { points: workspace.points.filter((p) => p.kind === 'player'), paths: [], grenades: grenadeEffects.map((effect, index) => ({ id: effect.userData.grenadeId || `grenade-${index}`, type: effect.userData.grenadeEffect, position: effect.position.toArray(), range: effect.userData.grenadeRange || effect.scale.x || 1 })), collabUtilities: collabUtilityScene.serialize(), brushStrokes: workspace.brushStrokes };
    };
    const pushCollabHistory = (snapshot = collabSnapshot()) => { collabUndoStack.push(snapshot); if (collabUndoStack.length > 60) collabUndoStack.shift(); collabRedoStack.length = 0; };
    const restoreCollabSnapshot = (snap) => {
      if (!snap) return;
      pointsRef.current.filter((p) => p.userData.collabPlayer).forEach((point) => { point.parent?.remove(point); point.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); });
      const kept = pointsRef.current.filter((p) => !p.userData.collabPlayer);
      pointsRef.current.length = 0;
      pointsRef.current.push(...kept);
      grenadeEffects.splice(0).forEach((effect) => { scene.remove(effect); disposeGrenadeEffect(effect); });
      clearCollabUtilities();
      (snap.points || []).forEach((item) => {
        const point = createCollabPlayer({ position: new THREE.Vector3().fromArray(item.position || [0, 0, 0]), id: item.id, name: item.name || randomPlayerName(), team: item.team || 'T', crouched: Boolean(item.crouched), pitch: item.pitch || 0, weapon: item.weapon || 'ak47' });
        point.rotation.y = item.rotationY || 0;
        point.userData.pointId = item.id;
        updateCollabPlayerAim(point, collisionMeshes, aimRaycaster, collisionVersion);
        scene.add(point);
        pointsRef.current.push(point);
        if (item.crouched) setCollabPlayerCrouch(point, true);
      });
      collabUtilityScene.restore(snap.collabUtilities, utilityNotesRef.current);
      (snap.grenades || []).forEach((item, index) => {
        const position = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
        const effect = createGrenadeEffect(position, item.type || 'smoke', navData, nav);
        const range = Math.max(0.35, item.range || 1);
        setGrenadeEffectRange(effect, item.type || 'smoke', range);
        effect.userData.grenadeId = item.id || `restored-grenade-${index}`;
        effect.userData.grenadeOrigin = position.clone();
        scene.add(effect);
        grenadeEffects.push(effect);
      });
      applyLiveBrushData(snap.brushStrokes || []);
      notifyBrushChange();
      notifyCollabEdit();
    };
    const undoCollab = () => {
      if (!collabUndoStack.length) return;
      const current = collabSnapshot();
      const previous = collabUndoStack.pop();
      collabRedoStack.push(current);
      restoreCollabSnapshot(previous);
    };
    const redoCollab = () => {
      if (!collabRedoStack.length) return;
      const current = collabSnapshot();
      const next = collabRedoStack.pop();
      collabUndoStack.push(current);
      restoreCollabSnapshot(next);
    };
    collabHistoryRef.current = { push: pushCollabHistory, undo: undoCollab, redo: redoCollab };
    const getWorkspaceState = ({ includeDemo = false } = {}) => {
      const points = pointsRef.current.filter((point) => point.userData.pointId).map((point) => ({ id: point.userData.pointId, position: point.position.toArray(), rotationY: point.rotation.y, team: point.userData.team, type: point.userData.type, rayLength: point.children.find((child) => child.userData.aimRay)?.scale.z || 0.05, aimTarget: point.userData.aimTarget?.position.toArray() || [0, 0, -0.05], kind: point.userData.collabPlayer ? 'player' : undefined, name: point.userData.playerName || undefined, weapon: point.userData.collabPlayer ? (point.userData.weapon || 'ak47') : undefined, crouched: point.userData.collabPlayer ? Boolean(point.userData.crouched) : undefined, pitch: point.userData.collabPlayer ? (point.userData.collabPitch || 0) : undefined }));
      const grenades = grenadeEffects.map((effect, index) => ({ id: effect.userData.grenadeId || `grenade-${index}`, type: effect.userData.grenadeEffect, position: effect.position.toArray(), range: effect.userData.grenadeRange || effect.scale.x || 1 }));
      const collabUtilities = collabUtilityScene.serialize();
      if (includeDemo) {
        (demoSnapshotRef.current?.players || []).filter((player) => player.health > 0 && player.hasPosition !== false && [player.position?.x, player.position?.y, player.position?.z].every(Number.isFinite)).forEach((player) => {
          const pitch = THREE.MathUtils.degToRad(player.pitch || 0);
          const rayLength = 5.25;
          const aimTarget = new THREE.Vector3(0, 0, -rayLength).applyEuler(new THREE.Euler(-pitch, 0, 0)).add(new THREE.Vector3(0, 0.15, 0));
          points.push({ id: `demo-${demoSnapshotRef.current.tick}-${player.steamid || player.name}`, position: [player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z], rotationY: Math.atan2(-Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), -Math.cos(THREE.MathUtils.degToRad(player.yaw || 0))), team: player.team === 3 ? 'CT' : 'T', type: 'T', rayLength, aimTarget: aimTarget.toArray(), source: 'demo', playerName: player.name });
        });
        demoGrenadesRef.current.filter(isEffectStartEvent).forEach((event) => {
          const tick = demoSnapshotRef.current?.tick || 0;
          const x = event.x ?? event.user_X; const y = event.y ?? event.user_Y; const z = event.z ?? event.user_Z;
          if (tick < event.tick || tick > effectEndTick(event, demoGrenadesRef.current) || x == null || y == null || z == null) return;
          const type = event.event_name === 'smokegrenade_detonate' ? 'smoke' : event.event_name === 'inferno_startburn' ? 'fire' : event.event_name === 'flashbang_detonate' ? 'flash' : event.event_name === 'decoy_started' ? 'decoy' : 'explosion';
          const segment = demoGrenadeSegmentsRef.current.find((candidate) => candidate.landing === event || (candidate.effectTick === event.tick && grenadeKind(candidate.kind) === grenadeKind(type) && (event.entityid == null || Number(candidate.entityId) === Number(event.entityid))));
          const source = { ...demoSourceRef.current, smokeVoxelFrames: demoSmokeVoxelFramesRef.current.filter((frame) => frame.tick <= tick) };
          const fallbackSmokeFrames = type === 'smoke' ? source.smokeVoxelFrames.filter((frame) => event.entityid != null && Number(frame.entityId) === Number(event.entityid)) : [];
          const note = segment ? buildSavedThrowNote({ mapName, segment, source, unknownLabel: 'Unknown' }) : {
            mapName,
            position: [x, y, z],
            angles: [0, 0, 0],
            grenadeType: grenadeKind(type),
            thrower: event.user_name || '',
            source: 'demo',
            demoSource: { fileName: source.fileName || 'Demo', round: source.round || null, tick: event.tick, map: mapName },
            replay: { tickRate: source.tickRate || 64, throwTick: 0, effectTick: 0, endTick: 0, snapshots: [], projectiles: [], smokeVoxelFrames: fallbackSmokeFrames, events: [{ ...event, tick: 0 }] },
            createdAt: new Date().toISOString(),
          };
          const anonymous = collabUtilityScene.serializeAnonymous(note, `demo-utility-${event.event_name}-${event.tick}-${event.entityid || event.user_steamid || collabUtilities.length}`);
          // Even incomplete parser output remains manageable in the utility list;
          // missing trajectories stay empty instead of silently becoming an unrelated loose effect.
          if (anonymous) collabUtilities.push(anonymous);
        });
      }
      return { cameraSlots: cameraState.serializeSlots(), camera: getCameraState(), points, paths: [], grenades, collabUtilities, brushStrokes: brushStrokes.map((line) => serializeBrushLine(line)) };
    };
    const getLiveBrushData = () => {
      const data = brushStrokes.map((line) => serializeBrushLine(line));
      if (brushStrokeLine && brushStrokePoints.length >= 2) {
        data.push(serializeBrushLine(brushStrokeLine, brushStrokePoints));
      }
      return data;
    };
    const notifyBrushChange = () => { onBrushChangeRef.current?.(getLiveBrushData()); };
    let brushApplyRemote = false;
    const applyLiveBrushData = (data = []) => {
      if (!Array.isArray(data)) return;
      brushApplyRemote = true;
      const ids = new Set(data.map((item) => item.id));
      brushStrokes.forEach((line) => { if (!ids.has(line.userData.brushStrokeId)) disposeBrushLine(scene, line); });
      for (let index = brushStrokes.length - 1; index >= 0; index -= 1) { if (!ids.has(brushStrokes[index].userData.brushStrokeId)) brushStrokes.splice(index, 1); }
      brushUndoStack.length = 0;
      brushRedoStack.length = 0;
      data.forEach((item) => {
        if (brushStrokeLine?.userData.brushStrokeId === item.id) return;
        const existing = brushStrokes.find((line) => line.userData.brushStrokeId === item.id);
        if (existing) {
          const points = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
          updateBrushLine(existing, points, true);
        } else {
          const points = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
          if (points.length < 2) return;
          const line = createBrushLine(points, { id: item.id, color: item.color, width: item.width, rememberPoints: true });
          scene.add(line);
          brushStrokes.push(line);
        }
      });
      brushApplyRemote = false;
    };
    const restoreWorkspaceState = (saved, includeCurrentCamera = true) => {
      if (!saved) return;
      collabUndoStack.length = 0;
      collabRedoStack.length = 0;
      pointsRef.current.forEach((point) => { point.parent?.remove(point); point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); });
      pointsRef.current.length = 0;
      grenadeEffects.forEach((effect) => { effect.parent?.remove(effect); disposeGrenadeEffect(effect); });
      grenadeEffects.length = 0;
      clearCollabUtilities();
      (saved.points || []).forEach((item) => {
        let point;
        if (item.kind === 'player') {
          point = createCollabPlayer({ position: new THREE.Vector3().fromArray(item.position || [0, 0, 0]), id: item.id, name: item.name || randomPlayerName(), team: item.team || 'T', crouched: Boolean(item.crouched), pitch: item.pitch || 0, weapon: item.weapon || 'ak47' });
          point.rotation.y = item.rotationY || 0;
          updateCollabPlayerAim(point, collisionMeshes, aimRaycaster, collisionVersion);
          if (item.crouched) setCollabPlayerCrouch(point, true);
        } else {
          point = createTacticalPoint(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), item.id, item.rayLength, item.team || 'T', item.type || 'T');
          point.position.fromArray(item.position || [0, 0, 0]);
          point.rotation.y = item.rotationY || 0;
          point.userData.pointId = item.id;
          point.userData.team = item.team || 'T';
          point.userData.type = item.type || 'T';
          point.userData.aimTarget?.position.fromArray(item.aimTarget || [0, 0, -0.05]);
          const aimRay = point.children.find((child) => child.userData.aimRay);
          if (aimRay && point.userData.aimTarget) {
            const direction = point.userData.aimTarget.position.clone().sub(new THREE.Vector3(0, 0.15, 0));
            aimRay.scale.z = Math.max(direction.length(), 0.05);
            aimRay.rotation.x = Math.atan2(direction.y, -direction.z);
          }
        }
        point.userData.pointId = item.id;
        scene.add(point);
        pointsRef.current.push(point);
      });
      (saved.grenades || []).forEach((item, index) => {
        const position = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
        const effect = createGrenadeEffect(position, item.type || 'smoke', navData, nav);
        const range = Math.max(0.35, item.range || 1);
        setGrenadeEffectRange(effect, item.type || 'smoke', range);
        effect.userData.grenadeId = item.id || `restored-grenade-${index}`;
        effect.userData.grenadeOrigin = position.clone();
        scene.add(effect);
        grenadeEffects.push(effect);
      });
      collabUtilityScene.restore(saved.collabUtilities, utilityNotesRef.current);
      if (saved.cameraSlots) {
        cameraState.replaceSlots(saved.cameraSlots);
      }
      brushStrokes.forEach((line) => disposeBrushLine(scene, line));
      brushStrokes.length = 0;
      brushUndoStack.length = 0;
      brushRedoStack.length = 0;
      removeBrushStrokeLine();
      (saved.brushStrokes || []).forEach((item) => {
        const worldPoints = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
        if (worldPoints.length < 2) return;
        const line = createBrushLine(worldPoints, { id: item.id, color: item.color, width: item.width, rememberPoints: true });
        scene.add(line);
        brushStrokes.push(line);
        brushUndoStack.push(line);
      });
      if (includeCurrentCamera && saved.camera) { camera.position.fromArray(saved.camera.position); controls.target.fromArray(saved.camera.target); restoreModelViewRange(saved.camera.viewRange); controls.update(); }
    };
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && (!pointPlacementEnabledRef.current || collabEditingEnabledRef.current)) {
        event.preventDefault();
        if (pointPlacementEnabledRef.current) {
          if (event.shiftKey) redoCollab(); else undoCollab();
        } else if (event.shiftKey) redoBrush(); else undoBrush();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && (!pointPlacementEnabledRef.current || collabEditingEnabledRef.current)) {
        event.preventDefault();
        if (pointPlacementEnabledRef.current) redoCollab(); else redoBrush();
        return;
      }
      const pressedNumber = Number.parseInt(event.key, 10);
      const numberSlot = pressedNumber === 0 ? cameraState.slotCount - 1 : pressedNumber - 1;
      if (numberSlot >= 0 && numberSlot < cameraState.slotCount) {
        if (event.ctrlKey) {
          saveCameraSlot(numberSlot);
        } else {
          restoreCameraSlot(numberSlot);
        }
        event.preventDefault();
        return;
      }
      if (['w', 'a', 's', 'd', 'shift', 'control'].includes(event.key.toLowerCase())) {
        if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase()) && (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current)) demoCameraInterruptRef.current?.();
        pressedKeys.add(event.key.toLowerCase());
        event.preventDefault();
      }
      if (event.key.toLowerCase() === 'e' && !placing && pointPlacementEnabledRef.current && collabEditingEnabledRef.current) {
        placing = true;
      controls.enabled = false;
        placementStartPointer = pointerCurrent.clone();
        placementOrigin = pointerToSurface(pointerCurrent);
        if (placementOrigin) {
           previewPoint = createPlacedObject(placementOrigin, new THREE.Vector3(0, 0, 1), null, 0.05);
           if (!previewPoint.userData.collabPlayer) {
             previewPoint.userData.aimTarget.visible = false;
             previewPoint.traverse((object) => { if (object.material) object.material.opacity = 0.52; });
           }
          scene.add(previewPoint);
        }
      }
      if (event.key.toLowerCase() === 'q' && !grenadeWheelOpen && (!pointPlacementEnabledRef.current || collabEditingEnabledRef.current)) {
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
          pushCollabHistory();
          const direction = pointerToAim(pointerCurrent, placementOrigin.y)?.sub(placementOrigin) || new THREE.Vector3(0, 0, 1);
          const rayLength = Math.max(new THREE.Vector3(direction.x, 0, direction.z).length(), 0.05);
          const point = previewPoint.userData.collabPlayer ? previewPoint : createPlacedObject(placementOrigin, direction, `${Date.now()}-${pointsRef.current.length}`, rayLength);
          point.userData.pointId = `${Date.now()}-${pointsRef.current.length}`;
          if (previewPoint.userData.collabPlayer) applyPlacedPreview(point, direction);
          scene.remove(previewPoint);
          pointsRef.current.push(point);
          scene.add(point);
          previewPoint = null;
          placementOrigin = null;
          placementStartPointer = null;
          notifyCollabEdit();
        }
      }
      if (event.key.toLowerCase() === 'q' && grenadeWheelOpen) {
        grenadeWheelOpen = false;
        activeGrenade = grenadePreview;
        if (activeGrenade) {
          pushCollabHistory();
          activeGrenade.userData.grenadeId = `grenade-${Date.now()}-${grenadeEffects.length}`;
          activeGrenade.userData.grenadeOrigin = grenadeOrigin.clone();
          activeGrenade.userData.grenadeRange = 1;
          grenadeEffects.push(activeGrenade);
          notifyCollabEdit();
        }
        grenadePreview = null;
        grenadeOrigin = null;
        grenadeStartPointer = null;
        grenadeWheelRef.current?.({ open: false, type: grenadeType });
      }
    };
    const onPointerDown = (event) => {
      pointerCurrent = pointerPosition(event);
      if (event.pointerType === 'touch') { cameraState.clearActiveSlot(); return; }
      if ((event.button === 1 || event.button === 2) && (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current)) demoCameraInterruptRef.current?.();
      if (event.button === 1) cameraInput.beginPan(event);
      if (event.button === 0) renderer.domElement.setPointerCapture?.(event.pointerId);
      if (event.button === 1 || event.button === 2) cameraState.clearActiveSlot();
      focusScreen.set(pointerCurrent.x * 0.5 + 0.5, pointerCurrent.y * 0.5 + 0.5);
      if (event.button === 0 && !grenadeWheelOpen && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        raycaster.params.Line.threshold = 0.28;
        const analysisUtilityHit = raycaster.intersectObjects([...deathHeatScene.heatObjects.values()], true).find((candidate) => candidate.object.userData.analysisUtilityId && isInteractiveFloorPoint(candidate.point));
        if (analysisUtilityHit) {
          const marker = analysisUtilityHit.object;
          const projected = marker.getWorldPosition(new THREE.Vector3()).project(camera);
          analysisUtilitySelectRef.current?.(marker.userData.analysisUtilityId, { x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight });
          return;
        }
        const demoGrenadeHit = raycaster.intersectObjects([...demoGrenadeScene.objects.values()], true).find((candidate) => isInteractiveFloorPoint(candidate.point) && (() => {
          let owner = candidate.object;
          while (owner && !owner.userData.demoGrenadeSegmentId) owner = owner.parent;
          return Boolean(owner);
        })());
        let demoGrenadeOwner = demoGrenadeHit?.object;
        while (demoGrenadeOwner && !demoGrenadeOwner.userData.demoGrenadeSegmentId) demoGrenadeOwner = demoGrenadeOwner.parent;
        if (demoGrenadeOwner) {
          const worldPosition = demoGrenadeOwner.getWorldPosition(new THREE.Vector3());
          const projected = worldPosition.project(camera);
          demoGrenadeSelectRef.current?.(demoGrenadeOwner.userData.demoGrenadeSegmentId, { x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight });
          return;
        }
      }
      if (event.button === 0 && !grenadeWheelOpen && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        const objectHit = firstInteractiveFloorHit(raycaster.intersectObjects(grenadeEffects, true))?.object;
        let owner = objectHit;
        while (owner && !owner.userData.grenadeEffect) owner = owner.parent;
        activeGrenade = owner || null;
      }
      if (event.button === 0 && activeGrenade && (event.ctrlKey || event.metaKey) && !grenadeWheelOpen && !placing) {
        pushCollabHistory();
        const index = grenadeEffects.indexOf(activeGrenade);
        if (index >= 0) grenadeEffects.splice(index, 1);
        activeGrenade.removeFromParent();
        disposeGrenadeEffect(activeGrenade);
        activeGrenade = null;
        notifyCollabEdit();
        return;
      }
      if (event.button === 0 && activeGrenade && !grenadeWheelOpen && !placing) {
        grenadeAdjustSnapshot = collabSnapshot();
        grenadeAdjusting = true;
        grenadeAdjustStartPointer = pointerCurrent.clone();
        grenadeAdjustOrigin = activeGrenade.userData.grenadeOrigin.clone();
        grenadeAdjustRange = activeGrenade.userData.grenadeRange || 1;
        controls.enabled = false;
        return;
      }
      if (event.button === 0 && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        const hit = firstInteractiveFloorHit(raycaster.intersectObjects(pointsRef.current, true))?.object;
        if (hit) {
          let pointOwner = hit;
          while (pointOwner?.parent && !pointOwner.userData.pointId && !pointOwner.userData.collabPlayer) pointOwner = pointOwner.parent;
          if (pointOwner?.userData.collabPlayer) pointOwner = pointOwner.userData.pointId ? pointOwner : null;
          pointPointerTarget = pointOwner?.userData.pointId ? pointOwner : null;
          pointPointerStart = pointerCurrent.clone();
          pointPointerTime = performance.now();
          pointPointerMoved = false;
          if (pointPointerTarget) {
            controls.enabled = false;
            pointPointerBaseRotation = pointPointerTarget.rotation.y;
            pointPointerBasePitch = pointPointerTarget.userData.collabPitch || 0;
            pointPointerSnapshot = pointPointerTarget.userData.collabPlayer ? collabSnapshot() : null;
            const aimTarget = pointPointerTarget.userData.aimTarget;
            const targetY = aimTarget?.position.y ?? 0.15;
            const targetZ = aimTarget?.position.z ?? -0.05;
            pointPointerRayLength = Math.max(Math.hypot(targetY - 0.15, targetZ), 0.05);
            pointPointerDragging = !pressedKeys.has('control') && !pressedKeys.has('shift') && (pointPointerTarget.userData.collabPlayer || !hit.userData.aimTarget);
          }
        } else pointSelectRef.current?.(null);
      }
      if (event.button === 0 && brushEnabledRef.current && (!pointPlacementEnabledRef.current || collabEditingEnabledRef.current) && !placing && !grenadeWheelOpen && !grenadeAdjusting && !pointPointerTarget && !activeGrenade) {
        const brushSurface = pointerToSurface(pointerCurrent);
        if (!brushSurface && !brushEraserRef.current && !pressedKeys.has('control')) return;
        brushCollabSnapshot = pointPlacementEnabledRef.current ? collabSnapshot() : null;
        if (brushEraserRef.current || pressedKeys.has('control')) {
          eraserActive = true;
          eraserLastPointer = null;
          eraserChanged = false;
          controls.enabled = false;
          eraseAtPointer(pointerCurrent);
        } else {
          controls.enabled = false;
          startBrushStroke(brushSurface);
        }
      }
    };
    const onPointerMove = (event) => {
      if (cameraInput.continuePan(event)) return;
      pointerCurrent = pointerPosition(event);
      if (event.pointerType === 'touch') return;
      raycaster.setFromCamera(pointerCurrent, camera);
      const demoHit = raycaster.intersectObjects([...demoMarkers.values()], true).find((candidate) => isInteractiveFloorPoint(candidate.point) && !candidate.object.userData.aimRay && !candidate.object.userData.aimTarget)?.object;
      let demoOwner = demoHit;
      while (demoOwner && !demoOwner.userData.playerName) demoOwner = demoOwner.parent;
      hoveredDemoPlayerRef.current = demoOwner?.userData.playerName || null;
      const viewportWidth = renderer.domElement.clientWidth || 1;
      const viewportHeight = renderer.domElement.clientHeight || 1;
      const pointerX = (pointerCurrent.x * 0.5 + 0.5) * viewportWidth;
      const pointerY = (-pointerCurrent.y * 0.5 + 0.5) * viewportHeight;
      let nearbyMarker = null;
      let nearbyDistance = 22;
      deathHeatScene.heatObjects.forEach((marker) => {
        if (!marker.visible || !marker.userData.analysisUtilityId) return;
        const projected = marker.getWorldPosition(new THREE.Vector3()).project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        const screenX = (projected.x * 0.5 + 0.5) * viewportWidth;
        const screenY = (-projected.y * 0.5 + 0.5) * viewportHeight;
        const distance = Math.hypot(screenX - pointerX, screenY - pointerY);
        if (distance <= nearbyDistance) { nearbyDistance = distance; nearbyMarker = { marker, screenX, screenY }; }
      });
      if (nearbyMarker) {
        const anchor = analysisUtilitiesRef.current.find((utility) => utility.id === nearbyMarker.marker.userData.analysisUtilityId);
        const endpoint = nearbyMarker.marker.userData.analysisUtilityEndpoint === 'throw' ? 'throwPosition' : 'landing';
        const anchorPosition = anchor?.[endpoint];
        const visibleIds = new Set([...deathHeatScene.heatObjects.values()].filter((marker) => marker.visible && marker.userData.analysisUtilityId).map((marker) => marker.userData.analysisUtilityId));
        // Group against the endpoint being hovered; throw markers must not borrow a landing cluster.
        const utilities = anchorPosition ? analysisUtilitiesRef.current.filter((utility) => {
          const position = utility[endpoint];
          return position && visibleIds.has(utility.id) && Math.hypot(position.x - anchorPosition.x, position.z - anchorPosition.z) <= 0.9 && Math.abs(position.y - anchorPosition.y) <= 0.8;
        }) : [];
        analysisUtilityHoverRef.current?.({ utilities, x: nearbyMarker.screenX, y: nearbyMarker.screenY });
      } else analysisUtilityHoverRef.current?.(null);
      if (utilityNotesEnabledRef.current) {
        const utilityHit = raycaster.intersectObjects([...utilityNotesScene.markers.values()], true).find((candidate) => isInteractiveFloorPoint(candidate.point) && candidate.object.userData.utilityMarker);
        let utilityOwner = utilityHit?.object;
        while (utilityOwner && !utilityOwner.userData.utilityPositionKey) utilityOwner = utilityOwner.parent;
        if (utilityOwner) {
          const projected = utilityOwner.position.clone().project(camera);
          utilityHoverRef.current?.({ key: utilityOwner.userData.utilityPositionKey, entries: utilityOwner.userData.utilityEntries, x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight });
        } else utilityHoverRef.current?.(null);
      }
      focusScreen.set(pointerCurrent.x * 0.5 + 0.5, pointerCurrent.y * 0.5 + 0.5);
      if (eraserActive) {
        eraseAtPointer(pointerCurrent);
        return;
      }
      if (brushActive && brushPointerDown) {
        const position = pointerToSurface(pointerCurrent);
        if (position) {
          const previous = brushStrokePoints[brushStrokePoints.length - 1];
          if (!previous || previous.distanceTo(position) > 0.06) {
            brushStrokePoints.push(position.clone().add(new THREE.Vector3(0, 0.035, 0)));
            brushLastInBounds = position.clone();
            updateBrushStrokeLine();
            notifyBrushChange();
          }
        } else if (brushLastInBounds) {
          const aim = pointerToAim(pointerCurrent, brushLastInBounds.y);
          if (aim) {
            aim.y += 0.035;
            const previous = brushStrokePoints[brushStrokePoints.length - 1];
            if (!previous || previous.distanceTo(aim) > 0.06) {
              brushStrokePoints.push(aim);
              updateBrushStrokeLine();
              notifyBrushChange();
            }
          }
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
        setGrenadeEffectRange(activeGrenade, activeType, range);
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
          applyPlacedPreview(previewPoint, direction);
        }
      }
      if (pointPointerTarget && !placing && !grenadeAdjusting) {
        const deltaX = pointerCurrent.x - pointPointerStart.x;
        const deltaY = pointerCurrent.y - pointPointerStart.y;
        if (Math.hypot(deltaX, deltaY) < 0.008) return;
        const aimRay = pointPointerTarget.children.find((child) => child.userData.aimRay);
        const aimTarget = pointPointerTarget.userData.aimTarget;
        const isCollabPlayer = pointPointerTarget.userData.collabPlayer;
        if (pointPointerDragging) {
          pointPointerMoved = true;
          const targetPosition = pointerToSurface(pointerCurrent);
          if (targetPosition) {
            pointPointerTarget.position.copy(targetPosition).add(new THREE.Vector3(0, 0.002, 0));
            if (isCollabPlayer) { pointPointerTarget.userData.aimCollisionVersion = -1; updateCollabPlayerAim(pointPointerTarget, collisionMeshes, aimRaycaster, collisionVersion); }
          }
        } else if (isCollabPlayer && pressedKeys.has('control')) {
          pointPointerMoved = true;
          const targetPosition = pointerToAim(pointerCurrent, pointPointerTarget.position.y);
          if (targetPosition) applyPlacedAim(pointPointerTarget, targetPosition);
        } else if (isCollabPlayer && pressedKeys.has('shift')) {
          pointPointerMoved = true;
          const pitch = THREE.MathUtils.clamp(pointPointerBasePitch - deltaY * 1.8, -Math.PI * 0.42, Math.PI * 0.42);
          setCollabPlayerPitch(pointPointerTarget, pitch);
          pointPointerTarget.userData.aimCollisionVersion = -1;
          updateCollabPlayerAim(pointPointerTarget, collisionMeshes, aimRaycaster, collisionVersion);
        } else if (pressedKeys.has('control') && !isCollabPlayer) {
          const pitch = THREE.MathUtils.clamp(pointPointerBasePitch + deltaY * Math.PI, -Math.PI * 0.42, Math.PI * 0.42);
          if (aimRay) {
            aimRay.rotation.x = pitch;
            aimRay.scale.z = pointPointerRayLength;
          }
          if (aimTarget) aimTarget.position.set(0, 0.15 + Math.sin(pitch) * pointPointerRayLength, -Math.cos(pitch) * pointPointerRayLength);
        } else if (!isCollabPlayer) {
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
      if (event.pointerType === 'touch') return;
      if (event.button === 1) {
        const wasWrapped = cameraInput.endPan();
        if (wasWrapped) return;
      }
      if (event.button === 0 && eraserActive) {
        eraserActive = false;
        eraserLastPointer = null;
        if (eraserChanged && brushCollabSnapshot) pushCollabHistory(brushCollabSnapshot);
        brushCollabSnapshot = null;
        eraserChanged = false;
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive) controls.enabled = true;
        return;
      }
      if (event.button === 0 && brushActive && brushPointerDown) {
        brushActive = false;
        brushPointerDown = false;
        if (brushStrokePoints.length >= 2 && brushStrokeLine) {
          brushStrokeLine.userData.worldPoints = brushStrokePoints.map((point) => point.clone());
          brushStrokes.push(brushStrokeLine);
          if (brushCollabSnapshot) pushCollabHistory(brushCollabSnapshot);
          else { brushUndoStack.push(brushStrokeLine); brushRedoStack.length = 0; }
          notifyBrushChange();
        } else removeBrushStrokeLine();
        brushCollabSnapshot = null;
        brushStrokeLine = null;
        brushStrokePoints = [];
        brushLastInBounds = null;
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive) controls.enabled = true;
        return;
      }
      if (event.button === 0 && grenadeAdjusting) {
        grenadeAdjusting = false;
        if (grenadeAdjustSnapshot) pushCollabHistory(grenadeAdjustSnapshot);
        grenadeAdjustSnapshot = null;
        notifyCollabEdit();
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive) controls.enabled = true;
        return;
      }
      if (event.button !== 0 || !pointPointerTarget) return;
      const distance = pointPointerStart.distanceTo(pointerPosition(event));
      const targetId = pointPointerTarget.userData.pointId;
      const isCollabPlayer = pointPointerTarget.userData.collabPlayer;
      const moved = pointPointerMoved;
      if (isCollabPlayer && !moved && distance < 0.03) {
        const now = performance.now();
        if (lastClickId === targetId && now - lastClickTime < 350) {
          if (pointPointerSnapshot) pushCollabHistory(pointPointerSnapshot);
          setCollabPlayerCrouch(pointPointerTarget, !pointPointerTarget.userData.crouched);
          pointPointerTarget.userData.aimCollisionVersion = -1;
          updateCollabPlayerAim(pointPointerTarget, collisionMeshes, aimRaycaster, collisionVersion);
          notifyCollabEdit();
          lastClickTime = 0;
          lastClickId = null;
        } else {
          lastClickTime = now;
          lastClickId = targetId;
        }
      } else if (isCollabPlayer && moved) {
        if (pointPointerSnapshot) pushCollabHistory(pointPointerSnapshot);
        notifyCollabEdit();
      } else if (!isCollabPlayer) {
        if (performance.now() - pointPointerTime < 450 && distance < 0.03) { const projected = pointPointerTarget.position.clone().project(camera); pointSelectRef.current?.(targetId, { x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight }); }
      }
      pointPointerTarget = null;
      pointPointerSnapshot = null;
      pointPointerDragging = false;
      pointPointerMoved = false;
      if (!cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive) controls.enabled = true;
    };
    const cancelPointerInteraction = () => {
      cameraInput.endPan();
      pressedKeys.clear();
      grenadeAdjusting = false;
      pointPointerTarget = null;
      pointPointerSnapshot = null;
      grenadeAdjustSnapshot = null;
      pointPointerDragging = false;
      pointPointerMoved = false;
      placing = false;
      eraserActive = false;
      eraserLastPointer = null;
      eraserChanged = false;
      brushCollabSnapshot = null;
      if (brushActive) removeBrushStrokeLine();
      brushActive = false;
      brushPointerDown = false;
      brushStrokePoints = [];
      brushLastInBounds = null;
      if (!cameraTransition && !utilityFirstPersonRef.current?.player && !utilityProjectileFollowRef.current && !demoDirectorCameraActive) controls.enabled = true;
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
    cameraInput.attach(mount);
    renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', cancelPointerInteraction);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    const floor = new THREE.GridHelper(240, 48, '#354239', '#17231d');
    floor.position.y = -0.32;
    scene.add(floor);
    gridRef.current = floor;
    const nav = navData ? createNavMesh(navData, focusScreen, focusEnabled, viewportSize) : null;
    if (nav) {
      edgesRef.current = nav.edgeLines;
      navGroupRef.current = nav.group;
      nav.group.visible = true;
      nav.mesh.visible = true;
      nav.mesh.material.opacity = 1;
      nav.mesh.material.depthWrite = true;
      scene.add(nav.group);
    }
    let worldModel;
    let disposed = false;
    let lastModelProgressAt = 0;
    const resetToDefault = (normalReset) => {
      clearBrushStrokes();
      camera.up.set(0, 1, 0);
      normalReset();
    };
    modelLoadStateRef.current?.({ mapName, status: 'loading', loaded: 0, total: 0 });
    const loadWorldModel = (loadedModel) => {
      if (disposed) return;
      worldModel = loadedModel;
      const modelBounds = new THREE.Box3().setFromObject(worldModel);
      modelCenter = modelBounds.getCenter(new THREE.Vector3());
      modelCenterYRef.current = modelCenter.y;
      updateFloorFadeState(floorFadeRef.current, mapName, mapFloorRef.current, modelCenterYRef.current, navData);
      worldModel.position.sub(modelCenter);
      modelBasePositionRef.current = worldModel.position.clone();
      floor.position.y = -modelCenter.y - 0.35;
      if (nav) {
        nav.group.position.copy(modelCenter).multiplyScalar(-1);
        const horizontalCenter = new THREE.Vector2(modelCenter.x, modelCenter.z);
        nav.modelBoundary.min.sub(horizontalCenter);
        nav.modelBoundary.max.sub(horizontalCenter);
      }
      const modelSize = modelBounds.getSize(new THREE.Vector3()).length();
      const cameraTarget = new THREE.Vector3();
      if (NAV_TOP_CAMERA_TARGET_MAPS.has(mapName) && nav?.bounds) cameraTarget.y = nav.bounds.max.y - modelCenter.y;
      const resetCamera = () => {
        const distance = Math.max(modelSize * 0.72, 18);
        camera.position.copy(cameraTarget).add(new THREE.Vector3(distance * 0.68, distance * 0.9, distance));
        camera.far = Math.max(modelSize * 4, 200);
        camera.updateProjectionMatrix();
        controls.target.copy(cameraTarget);
        controls.maxDistance = Math.max(modelSize * 2.2, 70);
        controls.update();
      };
      worldModel.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.computeBoundsTree();
        collisionMeshes.push(object);
        object.frustumCulled = true;
        object.renderOrder = 3;
         if (object.material && mapName !== TUTORIAL_MAP_ID) object.material = Array.isArray(object.material) ? object.material.map(() => createGhostMaterial(focusScreen, viewportSize, modelMode, modelRange)) : createGhostMaterial(focusScreen, viewportSize, modelMode, modelRange);
         const materials = Array.isArray(object.material) ? object.material : [object.material];
         materials.forEach((material) => { enableMapSquareFade(material, nav?.modelBoundary, floorFadeRef.current); if (mapName === TUTORIAL_MAP_ID) material.transparent = true; material.opacity = modelOpacity; material.depthWrite = true; });
      });
      scene.add(worldModel);
      if (MAP_ZONE_MODELS_ENABLED && mapName !== TUTORIAL_MAP_ID) {
        new GLTFLoader().load(`${MAP_BASE}/${mapName}/${mapName}.zones.glb`, (gltf) => {
          if (disposed || !worldModel) return;
          const zones = createZoneModel(gltf.scene, mapName);
          if (zones.children.length) {
            zones.position.copy(worldModel.position);
            scene.add(zones);
          }
        }, undefined, () => {});
      }
      collisionVersion += 1;
      modelRef.current = worldModel;
      worldModel.visible = modelVisibilityRef.current;
         worldModel.position.y = modelBasePositionRef.current.y + (modelMode.value === 0 ? -0.12 : 0);
      worldModel.updateMatrixWorld(true);
      resetCamera();
      cameraState.restoreCurrent();
      cameraState.enablePersistence();
      onReady({ reset: () => resetToDefault(resetCamera), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, promoteCollabUtility, clearCollabUtilities, previewCollabUtility, focusCollabUtility, focusCollabPlayer, focusUtilityNote, clearCollabUtilityPreview, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
      modelLoadStateRef.current?.({ mapName, status: 'ready', loaded: 1, total: 1 });
    };
    if (mapName === TUTORIAL_MAP_ID) loadWorldModel(createTutorialMap());
    else new GLTFLoader().load(`${MAP_BASE}/${mapName}/${mapName}.glb`, (gltf) => loadWorldModel(gltf.scene), (event) => {
      if (disposed) return;
      const now = performance.now();
      if (now - lastModelProgressAt < 80 && (!event.total || event.loaded < event.total)) return;
      lastModelProgressAt = now;
      modelLoadStateRef.current?.({ mapName, status: 'loading', loaded: event.loaded || 0, total: event.total || 0 });
    }, (loadError) => {
      if (disposed) return;
      modelLoadStateRef.current?.({ mapName, status: 'error', loaded: 0, total: 0 });
      console.info(`${mapName} visual model unavailable.`, loadError.message);
      if (nav) {
        modelCenter.copy(nav.center);
        nav.group.position.copy(modelCenter).multiplyScalar(-1);
        nav.group.updateMatrixWorld(true);
        floor.position.y = -modelCenter.y - 0.35;
        collisionMeshes.push(nav.mesh, navBoundaryCollider);
        collisionVersion += 1;
        const distance = Math.max(nav.size * 0.8, 18);
        camera.position.set(distance * 0.68, distance * 0.9, distance);
        camera.far = Math.max(nav.size * 4, 200);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.maxDistance = Math.max(nav.size * 2.2, 70);
        controls.update();
        cameraState.restoreCurrent();
        cameraState.enablePersistence();
         const normalReset = () => { camera.position.set(distance * 0.68, distance * 0.9, distance); controls.target.set(0, 0, 0); controls.update(); };
         onReady({ reset: () => resetToDefault(normalReset), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, promoteCollabUtility, clearCollabUtilities, previewCollabUtility, focusCollabUtility, focusCollabPlayer, focusUtilityNote, clearCollabUtilityPreview, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
      }
    });
    controls.target.set(0, 0, 0);
    controls.update();
     const initialReset = () => { camera.position.set(17, 23, 25); controls.target.set(0, 0, 0); controls.update(); };
     onReady({ reset: () => resetToDefault(initialReset), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, promoteCollabUtility, clearCollabUtilities, previewCollabUtility, focusCollabUtility, focusCollabPlayer, focusUtilityNote, clearCollabUtilityPreview, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
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
      cameraState.clearActiveSlot();
      movement.normalize().multiplyScalar(elapsed * (pressedKeys.has('shift') ? 51 : 18));
      camera.position.add(movement);
      controls.target.add(movement);
    };
    const updateAimTargetScreenSizes = () => {
      const viewportHeight = Math.max(1, renderer.domElement.clientHeight);
      [...demoMarkers.values(), ...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => {
        const target = point.userData.aimTarget;
        if (!target?.visible) return;
        const worldPosition = target.getWorldPosition(new THREE.Vector3());
        const viewDepth = Math.max(0.1, -worldPosition.applyMatrix4(camera.matrixWorldInverse).z);
         const worldDiameter = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (4 / viewportHeight);
        const parentScale = target.parent?.getWorldScale(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
        target.scale.set(worldDiameter / Math.max(0.001, parentScale.x * 0.2), worldDiameter / Math.max(0.001, parentScale.y * 0.2), worldDiameter / Math.max(0.001, parentScale.z * 0.2));
      });
    };
    let lastFloorMaterialScan = 0;
    const animate = (now) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (cameraTransition) {
        cameraTransition.elapsed += 16.67;
        const progress = THREE.MathUtils.smoothstep(Math.min(cameraTransition.elapsed / cameraTransition.duration, 1), 0, 1);
        camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, progress);
        controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, progress);
        if (Number.isFinite(cameraTransition.fromFov) && Number.isFinite(cameraTransition.toFov)) {
          camera.fov = THREE.MathUtils.lerp(cameraTransition.fromFov, cameraTransition.toFov, progress);
          camera.updateProjectionMatrix();
        }
        controls.update();
        if (progress >= 1) { cameraTransition = null; controls.enabled = !collabUtilityOrbit && !collabFocusedPlayer; }
      } else if (collabUtilityOrbit) {
        const orbitElapsed = collabUtilityOrbit.lastTime == null ? 0 : Math.min((now - collabUtilityOrbit.lastTime) / 1000, 0.05);
        collabUtilityOrbit.lastTime = now;
        collabUtilityOrbit.angle += collabUtilityOrbit.speed * orbitElapsed;
        camera.position.set(
          collabUtilityOrbit.target.x + Math.cos(collabUtilityOrbit.angle) * collabUtilityOrbit.radius,
          collabUtilityOrbit.target.y + collabUtilityOrbit.height,
          collabUtilityOrbit.target.z + Math.sin(collabUtilityOrbit.angle) * collabUtilityOrbit.radius,
        );
        controls.target.copy(collabUtilityOrbit.target);
        controls.update();
      } else if (collabFocusedPlayer) {
        // Hold the saved first-person view until the pointer leaves the list.
        controls.update();
      } else {
        moveCamera(now);
        controls.update();
      }
      const firstPerson = utilityFirstPersonRef.current;
      const projectileFollow = utilityProjectileFollowRef.current;
      const manualPovPlayer = demoInEyePlayerRef.current;
      if (!firstPerson && !projectileFollow && utilityPlaybackCameraActive) {
        controls.enabled = true;
        // Restore the user's view only after both throw preview and projectile follow finish.
        if (utilityReturnCamera) {
          camera.position.copy(utilityReturnCamera.position);
          controls.target.copy(utilityReturnCamera.target);
          camera.fov = utilityReturnCamera.fov;
          controls.update();
          utilityReturnCamera = null;
        } else camera.fov = 38;
        camera.updateProjectionMatrix();
        utilityPlaybackCameraActive = false;
        utilityProjectileCameraActive = false;
      }
      const povPlayer = firstPerson?.player || manualPovPlayer;
      if (povPlayer) {
        if (firstPerson && !utilityPlaybackCameraActive) {
          utilityReturnCamera = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
        }
        const eye = new THREE.Vector3(povPlayer.position.x - modelCenter.x, povPlayer.position.y - modelCenter.y + 1.62 - (povPlayer.duckAmount || 0) * 0.34, povPlayer.position.z - modelCenter.z);
        const direction = cs2AnglesToSceneDirection(povPlayer.pitch, povPlayer.yaw);
        camera.position.copy(eye);
        controls.target.copy(eye).add(direction.multiplyScalar(8));
        camera.fov = !firstPerson && povPlayer.scoped ? 35 : 68;
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        controls.enabled = false;
        // Utility POV has its own lifecycle and must not trigger Demo director cleanup on exit.
        if (firstPerson) {
          demoDirectorCameraActive = false;
          demoDirectorEventKey = '';
        } else demoDirectorCameraActive = true;
        utilityPlaybackCameraActive = Boolean(firstPerson);
        if (firstPerson) utilityProjectileCameraActive = false;
        const marker = demoMarkers.get(povPlayer.name);
        const equipment = marker?.children.find((child) => child.userData.demoEquipment);
        const weaponKind = firstPerson ? `utility-${grenadeKind(firstPerson.grenadeType)}` : demoEquipmentKind(povPlayer.activeWeapon);
        const equipmentKey = `${firstPerson ? `utility:${firstPerson.replayId}` : `demo:${povPlayer.name}`}:${weaponKind}`;
        if (demoPovEquipment.userData.equipmentKey !== equipmentKey) {
          const held = equipment?.children.find((child) => child.userData.demoEquipmentKind === weaponKind);
          if (held) {
            demoPovEquipment.children.filter((child) => child !== demoPovMuzzleFlash).forEach((child) => demoPovEquipment.remove(child));
            const clone = held.clone(true);
            clone.position.set(0, 0, 0);
            clone.visible = true;
            clone.traverse((child) => { child.visible = true; });
            demoPovEquipment.add(clone);
            demoPovEquipment.userData.equipmentKey = equipmentKey;
          }
        }
        const demoThrow = !firstPerson ? [...demoGrenadesRef.current].reverse().find((event) => event.event_name === 'grenade_thrown' && demoEventPlayerMatches(event, povPlayer) && event.tick <= demoTickRef.current && demoTickRef.current - event.tick < 32) : null;
        const throwKind = firstPerson ? `utility-${grenadeKind(firstPerson.grenadeType)}` : demoThrow ? `utility-${grenadeKind(demoThrow.weapon)}` : null;
        const throwAge = firstPerson ? firstPerson.tick - firstPerson.throwTick : demoThrow ? demoTickRef.current - demoThrow.tick : -1;
        const throwDuration = firstPerson ? Math.max(6, firstPerson.tickRate * 0.14) : 9;
        const weaponSwitched = !firstPerson && throwKind && weaponKind !== throwKind && throwAge > 2;
        const throwing = throwKind && throwAge >= 0 && throwAge < throwDuration && !weaponSwitched;
        if (throwing) {
          if (povThrownUtility.userData.equipmentKey !== throwKind) {
            povThrownUtility.clear();
            const thrown = equipment?.children.find((child) => child.userData.demoEquipmentKind === throwKind)?.clone(true);
            if (thrown) { thrown.position.set(0, 0, 0); thrown.visible = true; thrown.traverse((child) => { child.visible = true; }); povThrownUtility.add(thrown); povThrownUtility.userData.equipmentKey = throwKind; }
          }
          const progress = THREE.MathUtils.clamp(throwAge / throwDuration, 0, 1);
          povThrownUtility.position.set(THREE.MathUtils.lerp(0.48, 0.3, progress), THREE.MathUtils.lerp(-0.34, -0.15, progress) + Math.sin(progress * Math.PI) * 0.08, THREE.MathUtils.lerp(-0.9, -1.55, progress));
          povThrownUtility.rotation.set(progress * Math.PI * 1.5, progress * Math.PI * 0.4, progress * Math.PI * 1.2);
          povThrownUtility.scale.setScalar(1.45);
          povThrownUtility.visible = povThrownUtility.children.length > 0;
        } else povThrownUtility.visible = false;
        const firing = !firstPerson && demoFiresRef.current.some((event) => demoEventPlayerMatches(event, povPlayer) && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 8);
        const reload = !firstPerson ? demoPlayerReload(demoRosterRuntime.reloads, povPlayer, demoTickRef.current) : null;
        const reloadDrop = reload && !['melee', 'c4'].includes(weaponKind) && !weaponKind.startsWith('utility-') ? Math.sin(reload.progress * Math.PI) : 0;
        demoPovEquipment.visible = firstPerson ? firstPerson.tick < firstPerson.throwTick : !throwing;
        demoPovEquipment.position.y = (firing ? -0.43 : -0.48) - reloadDrop * 0.56;
        demoPovEquipment.rotation.x = (firing ? -0.14 : -0.08) + reloadDrop * 0.68;
        demoPovMuzzleFlash.visible = firing && weaponKind !== 'melee' && !weaponKind.startsWith('utility-') && weaponKind !== 'c4';
      } else {
        demoPovEquipment.visible = false;
        povThrownUtility.visible = false;
      }
      if (projectileFollow) {
        const target = new THREE.Vector3(projectileFollow.position.y * 0.0254 - modelCenter.x, projectileFollow.position.z * 0.0254 - modelCenter.y, projectileFollow.position.x * 0.0254 - modelCenter.z);
        const direction = new THREE.Vector3(projectileFollow.direction.y, projectileFollow.direction.z, projectileFollow.direction.x);
        if (direction.lengthSq() > 0.0001) utilityFollowDirection.copy(direction.normalize());
        const desiredPosition = target.clone().addScaledVector(utilityFollowDirection, -2.8);
        desiredPosition.y += 1.1;
        // Cut into the chase view, then smooth only its continued movement to avoid camera lag.
        if (utilityProjectileCameraActive) {
          camera.position.lerp(desiredPosition, 0.28);
          controls.target.lerp(target, 0.42);
          camera.fov = THREE.MathUtils.lerp(camera.fov, 52, 0.25);
        } else {
          camera.position.copy(desiredPosition);
          controls.target.copy(target);
          camera.fov = 52;
        }
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        controls.enabled = false;
        utilityPlaybackCameraActive = true;
        utilityProjectileCameraActive = true;
        demoDirectorCameraActive = false;
        demoDirectorEventKey = '';
      }
      if (!povPlayer && demoCameraModeRef.current !== 'manual' && demoSnapshotRef.current) {
        const tick = demoTickRef.current;
        const eligible = demoHltvEventsRef.current.filter((event) => event.tick <= tick && (demoCameraModeRef.current === 'follow' || event.event_name === `hltv_${demoCameraModeRef.current}`));
        const directorEvent = eligible.at(-1);
        if (directorEvent) {
          const eventKey = `${directorEvent.event_name}-${directorEvent.tick}`;
          const eventChanged = eventKey !== demoDirectorEventKey;
          const inertia = THREE.MathUtils.clamp(Number(directorEvent.inertia) || 0, 0, 1);
          const positionBlend = eventChanged ? 0.1 : THREE.MathUtils.lerp(0.22, 0.06, inertia);
          const targetBlend = eventChanged ? 0.13 : THREE.MathUtils.lerp(0.28, 0.08, inertia);
          let desiredPosition = null;
          let desiredTarget = null;
          let desiredFov = 48;
          if (directorEvent.event_name === 'hltv_fixed') {
            const fixedPosition = new THREE.Vector3(Number(directorEvent.posy) * 0.0254 - modelCenter.x, Number(directorEvent.posz) * 0.0254 - modelCenter.y, Number(directorEvent.posx) * 0.0254 - modelCenter.z);
            const direction = cs2AnglesToSceneDirection(Number(directorEvent.theta) || 0, Number(directorEvent.phi) || 0);
            desiredPosition = fixedPosition;
            desiredTarget = fixedPosition.clone().add(direction.multiplyScalar(8));
            desiredFov = Number(directorEvent.fov) || 55;
          } else {
            const targetUserId = Number(directorEvent.target1);
            const target = demoSnapshotRef.current.players.find((player) => Number(player.userId) === targetUserId) || demoSnapshotRef.current.players.find((player) => (Number(player.userId) & 0xff) === (targetUserId & 0xff));
            if (target) {
              const anchor = new THREE.Vector3(target.position.x - modelCenter.x, target.position.y - modelCenter.y + 1.1, target.position.z - modelCenter.z);
              if (Number(directorEvent.ineye) > 0) {
                desiredPosition = anchor.clone().add(new THREE.Vector3(0, 0.5 - (target.duckAmount || 0) * 0.34, 0));
                desiredTarget = desiredPosition.clone().add(cs2AnglesToSceneDirection(target.pitch, target.yaw).multiplyScalar(8));
                desiredFov = target.scoped ? 35 : 68;
              } else {
                const secondaryUserId = Number(directorEvent.target2);
                const secondary = secondaryUserId !== 65535 ? demoSnapshotRef.current.players.find((player) => Number(player.userId) === secondaryUserId) || demoSnapshotRef.current.players.find((player) => (Number(player.userId) & 0xff) === (secondaryUserId & 0xff)) : null;
                const secondaryAnchor = secondary ? new THREE.Vector3(secondary.position.x - modelCenter.x, secondary.position.y - modelCenter.y + 1.1, secondary.position.z - modelCenter.z) : null;
                desiredTarget = secondaryAnchor ? anchor.clone().lerp(secondaryAnchor, 0.5) : anchor;
                const pairDirection = secondaryAnchor?.clone().sub(anchor);
                const baseYaw = pairDirection?.lengthSq() ? Math.atan2(pairDirection.x, pairDirection.z) : THREE.MathUtils.degToRad(Number(target.yaw) || 0);
                const yaw = baseYaw + THREE.MathUtils.degToRad(Number(directorEvent.theta) || 0);
                const pairDistance = secondaryAnchor ? anchor.distanceTo(secondaryAnchor) : 0;
                const distance = Math.max(2.4, (Number(directorEvent.distance) || 112) * 0.0254, pairDistance * 1.15);
                const height = Math.sin(THREE.MathUtils.degToRad(Number(directorEvent.phi) || 20)) * distance;
                desiredPosition = desiredTarget.clone().add(new THREE.Vector3(-Math.sin(yaw) * distance, Math.max(0.8, height), -Math.cos(yaw) * distance));
                desiredFov = THREE.MathUtils.clamp(48 + pairDistance * 1.3, 48, 72);
              }
            }
          }
          if (desiredPosition && desiredTarget) {
            camera.position.lerp(desiredPosition, positionBlend);
            controls.target.lerp(desiredTarget, targetBlend);
            camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov, eventChanged ? 0.12 : 0.2);
            camera.updateProjectionMatrix();
            camera.lookAt(controls.target);
            controls.enabled = false;
            demoDirectorCameraActive = true;
            demoDirectorEventKey = eventKey;
          }
        } else if (demoDirectorCameraActive) { controls.enabled = true; camera.fov = 38; camera.updateProjectionMatrix(); demoDirectorCameraActive = false; }
      } else if (!povPlayer && demoDirectorCameraActive) {
        controls.enabled = true;
        camera.fov = 38;
        camera.updateProjectionMatrix();
        demoDirectorCameraActive = false;
        demoDirectorEventKey = '';
      }
      if (!povPlayer) demoPovEquipment.visible = false;
      camera.updateMatrixWorld();
      updateDemoPlayers();
      deathHeatScene.updateDeaths();
      deathHeatScene.updateHeat();
      analysisScene.updateUtilities();
      analysisScene.update();
      utilityNotesScene.update();
      collabUtilityScene.update();
      demoGrenadeScene.update();
      c4Scene.update();
      if (frameTween) {
        const progress = THREE.MathUtils.smoothstep(Math.min((performance.now() - frameTween.start) / frameTween.duration, 1), 0, 1);
        frameTween.entries.forEach(({ point, from, to, fromRot, toRot, fromPitch, toPitch }) => {
          point.position.lerpVectors(from, to, progress);
          point.rotation.y = THREE.MathUtils.lerp(fromRot, toRot, progress);
          point.userData.collabPitch = THREE.MathUtils.lerp(fromPitch, toPitch, progress);
          point.userData.aimCollisionVersion = -1;
        });
        if (progress >= 1) frameTween = null;
      }
      pointsRef.current.forEach((point) => { if (point.userData.collabPlayer) updateCollabPlayerAim(point, collisionMeshes, aimRaycaster, collisionVersion); });
      updateAimTargetScreenSizes();
      const interactionLocked = Boolean(cameraTransition || collabFocusedPlayer || utilityFirstPersonRef.current?.player || utilityProjectileFollowRef.current || demoDirectorCameraActive || placing || grenadeAdjusting || pointPointerTarget || cameraInput.active);
      if (!interactionLocked && !controls.enabled) controls.enabled = true;
      const brushResolution = renderer.getDrawingBufferSize(new THREE.Vector2());
      brushStrokes.forEach((line) => { if (line.material) line.material.resolution.copy(brushResolution); });
      if (brushStrokeLine?.material) brushStrokeLine.material.resolution.copy(brushResolution);
      if (now - lastFloorMaterialScan > 250) {
        lastFloorMaterialScan = now;
        scene.traverse((object) => {
          if (!object.material || object === floor) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => enableMaterialFloorFade(material, floorFadeRef.current));
        });
      }
      renderer.render(scene, camera);
    };
    animate(performance.now());
     return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); renderer.domElement.removeEventListener('pointerdown', onPointerDown, true); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('pointercancel', cancelPointerInteraction); renderer.domElement.removeEventListener('contextmenu', onContextMenu); cameraState.dispose(); cameraInput.dispose(); controls.dispose(); [...new Set([...grenadeEffects, grenadePreview, activeGrenade].filter(Boolean))].forEach(disposeGrenadeEffect); demoGrenadeScene.dispose(); [...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); })); pathLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); scene.remove(line); }); pathLines.length = 0; clearBrushStrokes(); clearCollabUtilities(); pointsRef.current = []; gridRef.current = null; modelRef.current = null; modelBasePositionRef.current = null; navFocusRef.current = null; navGroupRef.current = null; demoPlayersRef.current = null; demoMarkers.forEach((marker) => marker.traverse((object) => object.material?.dispose())); demoMovementTrails.forEach((trail) => { trail.geometry.dispose(); trail.material.dispose(); scene.remove(trail); }); collabUtilityScene.dispose(); utilityNotesScene.dispose(); deathHeatScene.dispose(); c4Scene.dispose(); analysisScene.dispose(); if (nav) { nav.geometry.dispose(); nav.edgeGeometry.dispose(); nav.mesh.material.dispose(); nav.edgeLines.material.dispose(); nav.distanceField?.texture?.dispose(); } if (worldModel) scene.remove(worldModel); renderer.dispose(); mount.removeChild(renderer.domElement); };
  }, [mapName]);

  useEffect(() => {
    if (!deletePointId) return;
    const index = pointsRef.current.findIndex((point) => point.userData.pointId === deletePointId);
    if (index < 0) return;
    const target = pointsRef.current[index];
    if (target?.userData.collabPlayer) collabHistoryRef.current.push();
    const [point] = pointsRef.current.splice(index, 1);
    point.parent?.remove(point);
    point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    pointSelectRef.current?.(null);
    onCollabEditRef.current?.();
  }, [deletePointId]);

  useEffect(() => {
    if (!pointUpdate) return;
    const point = pointsRef.current.find((item) => item.userData.pointId === pointUpdate.id);
    if (!point) return;
    if (point.userData.collabPlayer) {
      if (pointUpdate.team) { collabHistoryRef.current.push(); setCollabPlayerTeam(point, pointUpdate.team); onCollabEditRef.current?.(); }
    } else {
      updateTacticalPoint(point, pointUpdate.team || point.userData.team, pointUpdate.type || point.userData.type);
    }
  }, [pointUpdate]);

  useEffect(() => {
    if (edgesRef.current) edgesRef.current.visible = showEdges;
  }, [showEdges]);

  useEffect(() => {
    const updateNavVisibility = (event) => {
      const navMesh = navGroupRef.current?.children.find((child) => child.isMesh);
      if (!navMesh?.material) return;
      navMesh.visible = Boolean(event.detail);
    };
    window.addEventListener('csboard-nav-visibility', updateNavVisibility);
    return () => window.removeEventListener('csboard-nav-visibility', updateNavVisibility);
  }, []);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    const updateModelRange = (event) => {
      if (modelRangeRef.current) modelRangeRef.current.value = THREE.MathUtils.clamp(Number(event.detail), 0, 1);
    };
    window.addEventListener(MODEL_VIEW_RANGE_EVENT, updateModelRange);
    return () => window.removeEventListener(MODEL_VIEW_RANGE_EVENT, updateModelRange);
  }, []);

  useEffect(() => {
    const updateAnalysisHeatData = (event) => { analysisHeatDeathsRef.current = event.detail?.deaths || []; };
    window.addEventListener(ANALYSIS_HEAT_DATA_EVENT, updateAnalysisHeatData);
    return () => window.removeEventListener(ANALYSIS_HEAT_DATA_EVENT, updateAnalysisHeatData);
  }, []);

  useEffect(() => {
    modelVisibilityRef.current = showModel;
    if (modelRef.current) modelRef.current.visible = showModel;
    if (modelRef.current && modelBasePositionRef.current) modelRef.current.position.y = modelBasePositionRef.current.y + (modelViewMode === 0 ? -0.12 : 0);
     if (navFocusRef.current) navFocusRef.current.value = 0;
    if (modelModeRef.current) modelModeRef.current.value = modelViewMode;
      if (navGroupRef.current) navGroupRef.current.visible = true;
     const navMesh = navGroupRef.current?.children.find((child) => child.isMesh);
       if (navMesh?.material) {
        navMesh.material.depthWrite = true;
       navMesh.material.depthTest = true;
       navMesh.renderOrder = 1;
     }
     const navEdges = navGroupRef.current?.children.find((child) => child.isLineSegments);
     if (navEdges?.material) {
       navEdges.material.depthTest = true;
       navEdges.renderOrder = 2;
       }
        if (modelRef.current) modelRef.current.traverse((object) => { if (!object.material) return; const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { material.opacity = modelOpacity; material.depthWrite = true; }); });
    }, [showModel, modelOpacity, modelViewMode]);

  // Demo POV owns its animated HUD crosshair; this simpler one is only for utility replay.
  const utilityCrosshairVisible = Boolean(props.utilityFirstPerson?.player);
  return <div ref={(node) => { mountRef.current = node; }} className="three-board">{error && <div className="board-error">{error}</div>}{utilityCrosshairVisible && <div className="pov-crosshair" aria-hidden="true"><i /><i /><i /><i /></div>}</div>;
}
