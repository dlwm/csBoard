import { useRef } from 'react';
import * as THREE from 'three';
import { analysisUtilityRuntime, demoFrameSourceRuntime, demoPovRuntime, utilityRuntime } from './runtime.js';

// Keeps frequently changing React inputs available to the long-lived Three.js scene.
// Updating refs here avoids rebuilding the scene whenever playback or UI state changes.
export default function useThreeBoardRuntimeRefs(props) {
  const {
    analysisEnabled, analysisHighlightedUtilityId, analysisRows, analysisSelectedPlayers,
    analysisTime, analysisUtilities, brushColor, brushEnabled, brushWidth, collabEditingEnabled, demoC4Events,
    demoCameraMode, demoDeaths, demoFires, demoGrenades, demoGrenadeSegments, demoSource,
    demoHltvEvents, demoHurts, demoInEyePlayer, demoInfernoFrames, demoProjectiles, demoSmokeVoxelFrames, demoSnapshot,
    demoSnapshots, demoTick, demoViewFlags, eraserEnabled, heatDeaths, modelViewMode,
    onAnalysisUtilitySelect, onBrushChange, onCollabEdit,
    onDemoCameraInterrupt, onDemoGrenadeSelect, onGrenadeWheel, onModelLoadState,
    onModelViewRangeChange, onPointSelect, onUtilityHover, pointPlacementEnabled,
    showDemoNames, showModel, trackpadDetection, utilityFirstPerson, utilityNotes,
    utilityNotesEnabled, utilityProjectileFollow, analysisSide,
  } = props;

  const refs = {
    edgesRef: useRef(null),
    modelModeRef: useRef(null),
    modelRangeRef: useRef(null),
    navFocusRef: useRef(null),
    navGroupRef: useRef(null),
    gridRef: useRef(null),
    modelRef: useRef(null),
    modelBasePositionRef: useRef(null),
    modelCenterYRef: useRef(0),
    floorFadeRef: useRef(new THREE.Vector4(0, 0, 0, 0)),
    mapFloorRef: useRef('all'),
    demoSnapshotRef: useRef(demoSnapshot),
    demoSnapshotsRef: useRef(demoSnapshots || []),
    demoTickRef: useRef(demoTick),
    demoFiresRef: useRef(demoFires),
    demoHurtsRef: useRef(demoHurts || []),
    demoGrenadesRef: useRef(demoGrenades),
    demoProjectilesRef: useRef(demoProjectiles),
    demoSmokeVoxelFramesRef: useRef(demoSmokeVoxelFrames || []),
    demoInfernoFramesRef: useRef(demoInfernoFrames || []),
    demoGrenadeSegmentsRef: useRef(demoGrenadeSegments || []),
    demoSourceRef: useRef(demoSource || demoFrameSourceRuntime.current),
    demoGrenadeSelectRef: useRef(onDemoGrenadeSelect),
    demoDeathsRef: useRef(demoDeaths || []),
    demoC4EventsRef: useRef(demoC4Events || []),
    demoHltvEventsRef: useRef(demoHltvEvents || []),
    demoCameraModeRef: useRef(demoCameraMode || 'manual'),
    demoCameraInterruptRef: useRef(demoPovRuntime.interrupt || onDemoCameraInterrupt),
    demoInEyePlayerRef: useRef(demoInEyePlayer || demoPovRuntime.player),
    heatDeathsRef: useRef(heatDeaths || []),
    analysisHeatDeathsRef: useRef([]),
    demoViewFlagsRef: useRef(demoViewFlags || {}),
    showDemoNamesRef: useRef(showDemoNames),
    hoveredDemoPlayerRef: useRef(null),
    utilityNotesRef: useRef(utilityNotes || []),
    utilityNotesEnabledRef: useRef(utilityNotesEnabled),
    utilityHoverRef: useRef(onUtilityHover),
    utilityFirstPersonRef: useRef(utilityFirstPerson),
    utilityProjectileFollowRef: useRef(utilityProjectileFollow),
    analysisRowsRef: useRef(analysisRows || []),
    analysisUtilitiesRef: useRef(analysisUtilities || []),
    analysisHighlightedUtilityIdRef: useRef(analysisHighlightedUtilityId || ''),
    analysisUtilitySelectRef: useRef(onAnalysisUtilitySelect),
    analysisUtilityHoverRef: useRef(analysisUtilityRuntime.onHover),
    analysisSelectedPlayersRef: useRef(analysisSelectedPlayers || []),
    analysisEnabledRef: useRef(analysisEnabled),
    pointPlacementEnabledRef: useRef(pointPlacementEnabled),
    collabEditingEnabledRef: useRef(collabEditingEnabled === true),
    brushEnabledRef: useRef(brushEnabled),
    brushColorRef: useRef(brushColor || '#a5e0ff'),
    brushWidthRef: useRef(brushWidth || 3),
    brushEraserRef: useRef(false),
    onBrushChangeRef: useRef(onBrushChange),
    onCollabEditRef: useRef(onCollabEdit),
    modelLoadStateRef: useRef(onModelLoadState),
    modelViewRangeChangeRef: useRef(onModelViewRangeChange),
    collabHistoryRef: useRef({ push: () => {}, undo: () => {}, redo: () => {} }),
    analysisTimeRef: useRef(analysisTime || 0),
    analysisSideRef: useRef(analysisSide || 'ALL'),
    demoProjectileGroupsRef: useRef(new Map()),
    demoPlayersRef: useRef(null),
    modelVisibilityRef: useRef(showModel),
    pointsRef: useRef([]),
    pointSelectRef: useRef(onPointSelect),
    grenadeWheelRef: useRef(onGrenadeWheel),
    trackpadDetectionRef: useRef(trackpadDetection),
    wheelGestureRef: useRef({ mode: null, lastTime: 0 }),
  };

  refs.demoSnapshotRef.current = demoSnapshot;
  refs.demoSnapshotsRef.current = demoSnapshots || [];
  refs.demoTickRef.current = demoTick;
  refs.demoFiresRef.current = demoFires;
  refs.demoHurtsRef.current = demoHurts || [];
  refs.demoGrenadesRef.current = demoGrenades;
  refs.demoProjectilesRef.current = demoProjectiles;
  refs.demoSmokeVoxelFramesRef.current = demoSmokeVoxelFrames || [];
  refs.demoInfernoFramesRef.current = demoInfernoFrames || [];
  refs.demoGrenadeSegmentsRef.current = demoGrenadeSegments || [];
  refs.demoSourceRef.current = demoSource || demoFrameSourceRuntime.current;
  refs.demoGrenadeSelectRef.current = onDemoGrenadeSelect;
  refs.demoDeathsRef.current = demoDeaths || [];
  refs.demoC4EventsRef.current = demoC4Events || [];
  refs.demoHltvEventsRef.current = demoHltvEvents || [];
  refs.demoCameraModeRef.current = demoCameraMode || 'manual';
  refs.demoCameraInterruptRef.current = demoPovRuntime.interrupt || onDemoCameraInterrupt;
  refs.demoInEyePlayerRef.current = demoInEyePlayer || demoPovRuntime.player;
  refs.heatDeathsRef.current = heatDeaths || [];
  refs.demoViewFlagsRef.current = demoViewFlags || {};
  refs.showDemoNamesRef.current = showDemoNames;
  refs.utilityNotesRef.current = utilityNotes || utilityRuntime.notes;
  refs.utilityNotesEnabledRef.current = utilityNotesEnabled ?? utilityRuntime.enabled;
  refs.utilityHoverRef.current = onUtilityHover || utilityRuntime.onHover;
  refs.utilityFirstPersonRef.current = utilityFirstPerson;
  refs.utilityProjectileFollowRef.current = utilityProjectileFollow;
  refs.analysisRowsRef.current = analysisRows || [];
  refs.analysisUtilitiesRef.current = analysisUtilities || [];
  refs.analysisHighlightedUtilityIdRef.current = analysisHighlightedUtilityId || '';
  refs.analysisUtilitySelectRef.current = onAnalysisUtilitySelect || analysisUtilityRuntime.onSelect;
  refs.analysisUtilityHoverRef.current = analysisUtilityRuntime.onHover;
  refs.analysisSelectedPlayersRef.current = analysisSelectedPlayers || [];
  refs.analysisEnabledRef.current = analysisEnabled;
  refs.pointPlacementEnabledRef.current = pointPlacementEnabled !== false;
  // Keep drawing/placement authorization in render-time sync; onReady can fire
  // before or after an archive/frame switch and must not be the sole source.
  refs.collabEditingEnabledRef.current = collabEditingEnabled === true;
  refs.brushEnabledRef.current = brushEnabled !== false;
  refs.brushColorRef.current = brushColor || refs.brushColorRef.current;
  refs.brushWidthRef.current = brushWidth || refs.brushWidthRef.current;
  refs.brushEraserRef.current = eraserEnabled === true;
  refs.onBrushChangeRef.current = onBrushChange;
  refs.onCollabEditRef.current = onCollabEdit;
  refs.modelLoadStateRef.current = onModelLoadState;
  refs.modelViewRangeChangeRef.current = onModelViewRangeChange;
  refs.analysisTimeRef.current = analysisTime || 0;
  refs.analysisSideRef.current = analysisSide || 'ALL';
  refs.pointSelectRef.current = onPointSelect;
  refs.grenadeWheelRef.current = onGrenadeWheel;
  refs.trackpadDetectionRef.current = trackpadDetection;
  return refs;
}
