import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { getBundledNavData } from './data/navData.js';
import { tutorialNavData, tutorialWorkspaceArchive, TUTORIAL_MAP_ID } from './three/tutorialMap.js';
import { countCachedDemoRounds, deleteCachedDemo, getCachedDemo, getCachedDemoRound, listCachedDemos, putCachedDemo, putCachedDemoRound } from './demoCache.js';
import SideGameHub from './SideGameHub.jsx';
import TutorialGuide, { TutorialOffer } from './TutorialGuide.jsx';
import AnalysisControls from './analysis/AnalysisControls.jsx';
import AnalysisPanel from './analysis/AnalysisPanel.jsx';
import { buildAnalysisDataset, getAnalysisEconomyAvailability } from './analysis/buildAnalysisDataset.js';
import useAnalysisData from './analysis/useAnalysisData.js';
import useAnalysisPlayback from './analysis/useAnalysisPlayback.js';
import { ANALYSIS_AREA_PHASES, ANALYSIS_UTILITY_ICONS, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './analysis/constants.js';
import useScrollEdgeIndicators from './hooks/useScrollEdgeIndicators.js';
import useRadarOverlay from './hooks/useRadarOverlay.js';
import useResponsiveWorkspace from './hooks/useResponsiveWorkspace.js';
import useMapFloorControls from './hooks/useMapFloorControls.js';
import { roundEconomy, roundSideSignature, sidesSwitched } from './demo/economy.js';
import { roundWinnerSide } from './demo/rounds.js';
import DemoParseSettings, { DEMO_SAMPLE_RATES } from './demo/DemoParseSettings.jsx';
import DemoBatchPanel from './demo/DemoBatchPanel.jsx';
import useDemoBatchParser from './demo/useDemoBatchParser.js';
import useDemoViewState from './demo/useDemoViewState.js';
import MobileCameraWheel from './components/MobileCameraWheel.jsx';
import { AnalysisOptionsPortal, CameraHintsPortal, CollabUtilityPortal, ModelControlsPortal, RoomPresencePortal, UtilityNotesActionsPortal } from './components/Portals.jsx';
import { parseGetpos, utilityPositionClusters } from './utility/notes.js';
import useUtilityReplayPlayback from './utility/useUtilityReplayPlayback.js';
import { buildSavedThrowNote } from './utility/savedThrow.js';
import { RawIcon, SideLogo } from './components/CsIcons.jsx';
import { DemoDataWarning, DemoKillFeed, DemoPovHud, DemoRoster } from './demo/DemoHud.jsx';
import { analysisUtilityRuntime, demoFrameSourceRuntime, utilityRuntime } from './three/runtime.js';
import ThreeBoard from './three/ThreeBoard.jsx';
// Ship the Latin display fonts with the app. Windows and offline desktop
// builds must not depend on Google Fonts being reachable at startup.
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { localeForLanguage, localize, normalizeLanguage, translate, translateDemoWorkerStatus } from './i18n.js';
import { ANALYSIS_HEAT_DATA_EVENT, collaborationUrl, IS_DEVELOPMENT_RUNTIME, loadViewPreferences, MAP_LABELS_ZH, MAPS, MODEL_VIEW_RANGE_EVENT, VIEW_PREFERENCES_KEY } from './app/config.js';
import { generateClientName, generatedClientNames } from './app/clientIdentity.js';
import { DEFAULT_UTILITY_NOTES, DEFAULT_WORKSPACE_ARCHIVES, initialLocalRecords } from './app/defaultRecords.js';
import ModelLoadIndicator, { formatBytes } from './components/ModelLoadIndicator.jsx';
import BoardHeader from './components/BoardHeader.jsx';
import { RenamePointModal, SaveAnonymousUtilityModal, SaveArchiveModal, UtilityNoteModal } from './components/WorkspaceModals.jsx';
import ViewTools from './components/ViewTools.jsx';
import { stableHash, stableSerialize } from './utils/stableValue.js';
import { emptyWorkspace, frameWorkspace, normalizeCollabWorkspace, normalizeFrames } from './collaboration/workspace.js';
import { loadUtilityNotes, loadWorkspaceArchives, storeUtilityNotes, storeWorkspaceArchives } from './app/persistentStore.js';
import { registerCsboardTools } from './webmcp/registerCsboardTools.js';
import { getAnalysisModelContext, getFilteredAnalysisData } from './analysis/modelAccess.js';

const UTILITY_NOTES_VERSION = 3;
const DEMO_CACHE_SCHEMA_VERSION = 30;


function App() {
  const initialViewPreferences = useRef(loadViewPreferences()).current;
  const boardRef = useRef(null);
  const [language, setLanguage] = useState(() => normalizeLanguage(localStorage.getItem('csboard-language')));
  const [collabUtilitySearch, setCollabUtilitySearch] = useState('');
  const [collabUtilityPickerOpen, setCollabUtilityPickerOpen] = useState(false);
  const [collabUtilitySelected, setCollabUtilitySelected] = useState('');
  const [, setCollabUtilityRevision] = useState(0);
  const [collabObjectTab, setCollabObjectTab] = useState('players');
  const t = (key, values) => translate(language, key, values);
  const languageRef = useRef(language);
  languageRef.current = language;
  const [mapName, setMapName] = useState(() => MAPS.some((map) => map.id === initialViewPreferences.mapName) ? initialViewPreferences.mapName : 'de_dust2');
  // Resolve NAV in the same render as the map name so a new GLB never mounts with the previous map's geometry.
  const navData = useMemo(() => mapName === TUTORIAL_MAP_ID ? tutorialNavData : getBundledNavData(mapName), [mapName]);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialOfferOpen, setTutorialOfferOpen] = useState(() => {
    const firstVisit = !localStorage.getItem('csboard-tutorial-prompted') && !localStorage.getItem('csboard-tutorial-complete');
    if (IS_DEVELOPMENT_RUNTIME) {
      const visits = Number(localStorage.getItem('csboard-localhost-visits') || 0) + 1;
      try { localStorage.setItem('csboard-localhost-visits', String(visits)); } catch { /* The current visit can still be evaluated. */ }
      return firstVisit || visits % 3 === 0;
    }
    return firstVisit;
  });
  const [showEdges, setShowEdges] = useState(false);
  const [showGrid, setShowGrid] = useState(() => typeof initialViewPreferences.showGrid === 'boolean' ? initialViewPreferences.showGrid : false);
  const [showNav, setShowNav] = useState(() => typeof initialViewPreferences.showNav === 'boolean' ? initialViewPreferences.showNav : true);
  const [showModel, setShowModel] = useState(() => typeof initialViewPreferences.showModel === 'boolean' ? initialViewPreferences.showModel : true);
  const [modelOpacity, setModelOpacity] = useState(() => Number.isFinite(initialViewPreferences.modelOpacity) ? THREE.MathUtils.clamp(initialViewPreferences.modelOpacity, 0, 1) : 0.9);
  const [modelViewMode, setModelViewMode] = useState(() => [1, 2].includes(initialViewPreferences.modelViewMode) ? initialViewPreferences.modelViewMode : 2);
  const [modelViewRange, setModelViewRange] = useState(() => Number.isFinite(initialViewPreferences.modelViewRange) ? THREE.MathUtils.clamp(initialViewPreferences.modelViewRange, 0, 1) : 0.5);
  const [modelLoadState, setModelLoadState] = useState({ mapName: 'de_dust2', status: 'loading', loaded: 0, total: 0 });
  const [trackpadDetection, setTrackpadDetection] = useState(() => typeof initialViewPreferences.trackpadDetection === 'boolean' ? initialViewPreferences.trackpadDetection : true);
  const [demoData, setDemoData] = useState(null);
  const [demoTick, setDemoTick] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoStatus, setDemoStatus] = useState('');
  const [demoParseProgress, setDemoParseProgress] = useState(0);
  const [parseGameState, setParseGameState] = useState('hidden');
  const [parseGameDismissed, setParseGameDismissed] = useState(false);
  const [parseGameManual, setParseGameManual] = useState(false);
  const parseGameDismissedRef = useRef(false);
  parseGameDismissedRef.current = parseGameDismissed;
  const parseGameTimerRef = useRef(null);
  const demoParseProgressRef = useRef({ startedAt: 0, real: 0, completed: 0, total: 0, lastRealAt: 0, msPerPercent: 3000, hasReal: false });
  const [demoKillsCollapsed, setDemoKillsCollapsed] = useState(false);
  const [demoViewFlags, setDemoViewFlags] = useState({ deathVictim: true, deathKiller: true, killerHeat: false, victimHeat: false, targetHeat: false, opponentHeat: false, utilityThrow: true, utilityLanding: true, utilityKinds: [...ANALYSIS_UTILITY_KINDS], analysisMetric: 'kd', heatStyle: 'points', heatRadius: 9, areaPhases: [...ANALYSIS_AREA_PHASES], areaEarlySeconds: 30, economyOwn: [...ECONOMY_CATEGORIES], economyOpponent: [...ECONOMY_CATEGORIES] });
  const [showDemoNames, setShowDemoNames] = useState(false);
  const [demoSnapshots, setDemoSnapshots] = useState([]);
  const [demoThrowSnapshots, setDemoThrowSnapshots] = useState([]);
  const [demoProjectiles, setDemoProjectiles] = useState([]);
  const [demoSmokeVoxelFrames, setDemoSmokeVoxelFrames] = useState([]);
  const [demoInfernoFrames, setDemoInfernoFrames] = useState([]);
  const [demoRound, setDemoRound] = useState(null);
  const [demoRoundMenuOpen, setDemoRoundMenuOpen] = useState(false);
  const [demoCameraMode, setDemoCameraMode] = useState('manual');
  const [demoPovPlayerId, setDemoPovPlayerId] = useState('');
  const [demoRoundLoading, setDemoRoundLoading] = useState(false);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [analysisSide, setAnalysisSide] = useState('ALL');
  const [brushColor, setBrushColor] = useState(() => {
    const saved = localStorage.getItem('csboard-brush-color');
    return ['#a5e0ff', '#ff6b6b', '#7cf29c', '#ffd166', '#ffffff', '#c084fc'].includes(saved) ? saved : '#a5e0ff';
  });
  const [brushWidth, setBrushWidth] = useState(() => {
    const saved = Number(localStorage.getItem('csboard-brush-width'));
    return [2, 3, 5, 8].includes(saved) ? saved : 3;
  });
  const [eraserEnabled, setEraserEnabled] = useState(false);
  const demoWorkerRef = useRef(null);
  const pendingDemoCacheRef = useRef(null);
  const pendingDemoRoundWritesRef = useRef(Promise.resolve());
  const pendingDemoRoundWriteErrorRef = useRef(null);
  const pendingDemoRoundSummariesRef = useRef(new Map());
  const activeDemoCacheIdRef = useRef('');
  const [demoSourceReady, setDemoSourceReady] = useState(false);
  const [cachedDemos, setCachedDemos] = useState([]);
  const [cachedDemosLoading, setCachedDemosLoading] = useState(true);
  const [demoCacheOpen, setDemoCacheOpen] = useState(false);
  const [demoSampleRate, setDemoSampleRate] = useState(() => {
    const saved = Number(localStorage.getItem('csboard-demo-sample-rate'));
    return DEMO_SAMPLE_RATES.includes(saved) ? saved : 8;
  });
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeOptions = [{ label: t('modelOff'), value: -1 }, { label: t('mouseLens'), value: 1 }, { label: t('cameraLens'), value: 2 }];
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedPointScreen, setSelectedPointScreen] = useState(null);
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdateState] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const [cameraSlotState, setCameraSlotState] = useState(Array(10).fill(false));
  const [map2dLayer, setMap2dLayer] = useState(() => Number.isInteger(initialViewPreferences.map2dLayer) && initialViewPreferences.map2dLayer >= 0 ? initialViewPreferences.map2dLayer : 0);
  const [modelFloor, setModelFloor] = useState(() => ['all', 'main', 'lower'].includes(initialViewPreferences.modelFloor) ? initialViewPreferences.modelFloor : 'all');
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);
  const [activePanel, setActivePanel] = useState(() => window.matchMedia?.('(max-width: 820px)').matches ? 'utility' : 'demo');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const {
    clearPlayers: clearAnalysisPlayers,
    demosForPlayers: analysisDemosForPlayers,
    playerName: analysisPlayerName,
    playerQuery: analysisPlayerQuery,
    players: analysisPlayers,
    playersLoading: analysisPlayersLoading,
    togglePlayer: toggleAnalysisPlayer,
    selectedDemoIds: analysisSelectedDemoIds,
    selectedDemos: selectedAnalysisDemos,
    selectedPlayers: analysisSelectedPlayers,
    setPlayerQuery: setAnalysisPlayerQuery,
    setSelectedDemoIds: setAnalysisSelectedDemoIds,
    setStatus: setAnalysisStatus,
    status: analysisStatus,
  } = useAnalysisData({
    active: activePanel === 'analysis',
    cachedDemos,
    cachedDemosLoading,
    mapName,
    language,
    cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION,
  });
  const {
    playing: analysisPlaying,
    setPlaying: setAnalysisPlaying,
    time: analysisTime,
    setTime: setAnalysisTime,
    duration: analysisDuration,
  } = useAnalysisPlayback({
    rows: analysisRows,
    selectedPlayers: analysisSelectedPlayers,
    side: analysisSide,
    economyOwn: demoViewFlags.economyOwn,
    economyOpponent: demoViewFlags.economyOpponent,
  });
  const isMobile = useResponsiveWorkspace({ activePanel, leftSidebarOpen, mapName, navData });
  useEffect(() => setModelLoadState({ mapName, status: 'loading', loaded: 0, total: 0 }), [mapName]);
  const radarOverlay = useRadarOverlay({ activePanel, boardRef, mapName, navData });
  useEffect(() => {
    if (!isMobile || (activePanel !== 'demo' && activePanel !== 'analysis')) return;
    setDemoPlaying(false);
    setAnalysisPlaying(false);
    setActivePanel('utility');
  }, [isMobile, activePanel]);
  const [renameModal, setRenameModal] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const openRenameModal = (id, current) => { setRenameModal({ id, current }); setRenameDraft(current || ''); };
  const confirmRename = () => {
    if (!renameModal) return;
    renameCollabPlayerPoint(renameModal.id, renameDraft.trim());
    setRenameModal(null);
    setRenameDraft('');
  };
  const collabDirtyRef = useRef(false);
  const collabSaveTimerRef = useRef(null);
  const scheduleCollabSave = (delay = 700) => {
    collabDirtyRef.current = true;
    window.clearTimeout(collabSaveTimerRef.current);
    collabSaveTimerRef.current = window.setTimeout(() => {
      collabDirtyRef.current = false;
      try { boardRef.current?.finalizeFrameTween?.(); saveActiveFrame(); } catch (error) { console.error('collab debounced save', error); }
    }, delay);
  };
  const flushCollabSave = () => {
    if (!collabDirtyRef.current) return;
    window.clearTimeout(collabSaveTimerRef.current);
    collabDirtyRef.current = false;
    try { boardRef.current?.finalizeFrameTween?.(); saveActiveFrame(); } catch (error) { console.error('collab flush save', error); }
  };
  useEffect(() => {
    if (activePanel !== 'collab') return;
    return () => flushCollabSave();
  }, [activePanel]);
  const [utilityNotes, setUtilityNotes] = useState(() => {
    const version = Number(localStorage.getItem('csboard-utility-notes-version') || 0);
    const notes = initialLocalRecords('csboard-utility-notes', DEFAULT_UTILITY_NOTES, false);
    return version >= UTILITY_NOTES_VERSION ? notes : notes.filter((note) => !note.replay);
  });
  const utilityNotesRef = useRef(utilityNotes);
  const utilityNotesWriteRef = useRef(Promise.resolve());
  const utilityNotesRevisionRef = useRef(0);
  utilityNotesRef.current = utilityNotes;
  const utilityImportInputRef = useRef(null);
  const [utilityImportNotice, setUtilityImportNotice] = useState('');
  const [utilityModalOpen, setUtilityModalOpen] = useState(false);
  const [utilityDraft, setUtilityDraft] = useState({ getpos: '', name: '', summary: '' });
  const [utilityError, setUtilityError] = useState('');
  const [anonymousUtilitySave, setAnonymousUtilitySave] = useState(null);
  const [anonymousUtilityDraft, setAnonymousUtilityDraft] = useState({ name: '', summary: '' });
  const [anonymousUtilityError, setAnonymousUtilityError] = useState('');
  const [utilityHover, setUtilityHover] = useState(null);
  const [selectedUtilityNote, setSelectedUtilityNote] = useState(null);
  const [utilityEditDraft, setUtilityEditDraft] = useState(null);
  const [utilityCopied, setUtilityCopied] = useState(false);
  const queueUtilityNotesWrite = (notes) => {
    const write = utilityNotesWriteRef.current.catch(() => {}).then(() => storeUtilityNotes(notes, UTILITY_NOTES_VERSION));
    utilityNotesWriteRef.current = write;
    return write;
  };
  const persistUtilityNotes = async (notes) => {
    utilityNotesRevisionRef.current += 1;
    utilityNotesRef.current = notes;
    setUtilityNotes(notes);
    try {
      await queueUtilityNotesWrite(notes);
      localStorage.removeItem('csboard-utility-notes');
      localStorage.removeItem('csboard-utility-notes-version');
      return true;
    } catch (error) {
      console.error('utility notes storage', error);
      setUtilityError(t('utilityStorageFailed'));
      return false;
    }
  };
  const utilityHoverInsideRef = useRef(false);
  const utilityHoverTimerRef = useRef(null);
  const [selectedDemoGrenade, setSelectedDemoGrenade] = useState(null);
  const [selectedDemoGrenadeScreen, setSelectedDemoGrenadeScreen] = useState(null);
  const [selectedAnalysisUtility, setSelectedAnalysisUtility] = useState(null);
  const [selectedAnalysisUtilityScreen, setSelectedAnalysisUtilityScreen] = useState(null);
  const [analysisUtilityHover, setAnalysisUtilityHover] = useState(null);
  const [analysisHighlightedUtilityId, setAnalysisHighlightedUtilityId] = useState('');
  const analysisUtilityHoverInsideRef = useRef(false);
  const analysisUtilityHoverTimerRef = useRef(null);
  const [utilityReplay, setUtilityReplay] = useState(null);
  // Read the legacy key once for migration, but never seed new workspace data
  // into localStorage because recorded effects can exceed its small quota.
  const [archives, setArchives] = useState(() => initialLocalRecords('csboard-workspace-archives', DEFAULT_WORKSPACE_ARCHIVES, false));
  const archivesRef = useRef(archives);
  const archiveWriteRef = useRef(Promise.resolve());
  const archiveRevisionRef = useRef(0);
  archivesRef.current = archives;
  const [activeArchiveId, setActiveArchiveId] = useState(null);
  const [frames, setFrames] = useState([]);
  const [activeFrameId, setActiveFrameId] = useState(null);
  const framesRef = useRef(frames);
  const activeFrameIdRef = useRef(activeFrameId);
  framesRef.current = frames;
  activeFrameIdRef.current = activeFrameId;
  const [roomCode, setRoomCode] = useState('');
  const [roomOwner, setRoomOwner] = useState(false);
  const [roomStatus, setRoomStatus] = useState('');
  const [roomJoinCode, setRoomJoinCode] = useState('');
  const [roomNotice, setRoomNotice] = useState('');
  const queueWorkspaceArchiveWrite = (next) => {
    // Preserve user action order when frame saves happen close together.
    const write = archiveWriteRef.current.catch(() => {}).then(() => storeWorkspaceArchives(next));
    archiveWriteRef.current = write;
    return write;
  };
  const persistWorkspaceArchives = async (next) => {
    // Update the session immediately, then confirm the durable IndexedDB write.
    archiveRevisionRef.current += 1;
    archivesRef.current = next;
    setArchives(next);
    try {
      await queueWorkspaceArchiveWrite(next);
      localStorage.removeItem('csboard-workspace-archives');
      return true;
    } catch (error) {
      console.error('workspace archive storage', error);
      setRoomNotice(t('utilityStorageFailed'));
      return false;
    }
  };
  useEffect(() => {
    let cancelled = false;
    const revisionAtStart = archiveRevisionRef.current;
    loadWorkspaceArchives().then(async (stored) => {
      if (cancelled) return;
      // A save made while IndexedDB was opening is newer than the loaded data.
      if (archiveRevisionRef.current !== revisionAtStart) {
        await queueWorkspaceArchiveWrite(archivesRef.current);
        try { localStorage.removeItem('csboard-workspace-archives'); } catch { /* Migration cleanup is optional. */ }
        return;
      }
      if (Array.isArray(stored)) {
        archivesRef.current = stored;
        setArchives(stored);
        try { localStorage.removeItem('csboard-workspace-archives'); } catch { /* Migration cleanup is optional. */ }
        return;
      }
      // First IndexedDB launch: preserve all legacy archives before cleanup.
      await queueWorkspaceArchiveWrite(archivesRef.current);
      try { localStorage.removeItem('csboard-workspace-archives'); } catch { /* Migration cleanup is optional. */ }
    }).catch((error) => console.error('workspace archive migration', error));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const revisionAtStart = utilityNotesRevisionRef.current;
    loadUtilityNotes().then(async (stored) => {
      if (cancelled) return;
      if (utilityNotesRevisionRef.current !== revisionAtStart) {
        await queueUtilityNotesWrite(utilityNotesRef.current);
      } else if (Array.isArray(stored?.notes)) {
        const notes = Number(stored.version || 0) >= UTILITY_NOTES_VERSION
          ? stored.notes
          : stored.notes.filter((note) => !note.replay);
        utilityNotesRef.current = notes;
        setUtilityNotes(notes);
        if (stored.version !== UTILITY_NOTES_VERSION) await queueUtilityNotesWrite(notes);
      } else {
        await queueUtilityNotesWrite(utilityNotesRef.current);
      }
      // Remove legacy large records only after their IndexedDB copy is durable.
      localStorage.removeItem('csboard-utility-notes');
      localStorage.removeItem('csboard-utility-notes-version');
    }).catch((error) => console.error('utility notes migration', error));
    // Old room snapshots were never read; discard them so they cannot retain quota.
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('csboard-room-')).forEach((key) => localStorage.removeItem(key));
    } catch { /* Stale-room cleanup is optional. */ }
    return () => { cancelled = true; };
  }, []);
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomActivity, setRoomActivity] = useState([]);
  const roomProviderRef = useRef(null);
  const roomDocRef = useRef(null);
  const preRoomSessionRef = useRef(null);
  const roomWorkspaceRef = useRef('');
  const roomOwnerRef = useRef(roomOwner);
  const mapNameRef = useRef(mapName);
  const clientName = useRef((() => { const stored = localStorage.getItem('csboard-client-name'); const value = generatedClientNames.has(stored) ? stored : generateClientName(); if (value !== stored) localStorage.setItem('csboard-client-name', value); return value; })());
  const pendingArchiveRef = useRef(null);
  const roomSeedRef = useRef(null);
  const setPointUpdate = (update) => {
    if (activePanel === 'collab' && update?.team && boardRef.current?.renamePlayerPoint?.setTeam) {
      boardRef.current.renamePlayerPoint.setTeam(update.id, update.team);
      setCollabUtilityRevision((value) => value + 1);
      return;
    }
    setPointUpdateState(update);
  };
  roomOwnerRef.current = roomOwner;
  mapNameRef.current = mapName;
  const hasActiveFrameContext = Boolean(activeFrameId && frames.some((frame) => frame.id === activeFrameId) && (activeArchiveId || roomCode));
  useEffect(() => {
    boardRef.current?.setCollabVisible?.(activePanel === 'collab' && hasActiveFrameContext);
    boardRef.current?.setCollabEditingEnabled?.(activePanel === 'collab' && hasActiveFrameContext);
  }, [activePanel, hasActiveFrameContext]);
  useEffect(() => {
    localStorage.setItem('csboard-language', language);
    document.documentElement.lang = localeForLanguage(language);
  }, [language]);
  useScrollEdgeIndicators();
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify({ mapName, showGrid, showNav, showModel, modelOpacity, modelViewMode, modelViewRange, trackpadDetection, map2dLayer, modelFloor }));
    } catch { /* View preferences remain available for this session. */ }
    window.dispatchEvent(new CustomEvent(MODEL_VIEW_RANGE_EVENT, { detail: modelViewRange }));
  }, [mapName, showGrid, showNav, showModel, modelOpacity, modelViewMode, modelViewRange, trackpadDetection, map2dLayer, modelFloor]);
  useEffect(() => { localStorage.setItem('csboard-demo-sample-rate', String(demoSampleRate)); }, [demoSampleRate]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const progress = demoParseProgressRef.current;
      if (!progress.startedAt || progress.real >= 100) return;
      const now = performance.now();
      if (!progress.hasReal) {
        const target = Math.floor((now - progress.startedAt) / 3000);
        setDemoParseProgress((current) => Math.max(current, Math.min(99, target)));
        return;
      }
      const nextReal = progress.total ? Math.min(100, (progress.completed + 1) / progress.total * 100) : Math.min(100, progress.real + 1);
      const virtualGain = Math.floor((now - progress.lastRealAt) / Math.max(250, progress.msPerPercent));
      const cap = nextReal >= 100 ? 99.9 : Math.max(progress.real, nextReal - 0.1);
      setDemoParseProgress((current) => Math.max(current, Math.min(cap, progress.real + virtualGain)));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
  const refreshCachedDemos = () => {
    setCachedDemosLoading(true);
    return listCachedDemos().then((entries) => setCachedDemos(entries.map((entry) => { const sampleRate = entry.sampleRate || Number(String(entry.id).match(/^(\d+)hz\|/)?.[1]) || 8; return { ...entry, sampleRate, rawMap: entry.map, map: `${entry.map} · ${sampleRate} Hz` }; }))).catch(() => setDemoStatus(t('cacheFailed'))).finally(() => setCachedDemosLoading(false));
  };
  // Batch imports write each Demo to the existing cache without changing the currently viewed match.
  const { batch: demoBatch, counts: demoBatchCounts, running: demoBatchRunning, startBatch: startDemoBatch, clearBatch: clearDemoBatch } = useDemoBatchParser({
    language,
    sampleRate: demoSampleRate,
    cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION,
    onCacheChanged: refreshCachedDemos,
  });
  useEffect(() => {
    if (!demoBatch || demoBatchRunning || parseGameManual) return;
    window.clearTimeout(parseGameTimerRef.current);
    setParseGameState((state) => {
      if (state !== 'visible') return state === 'stopped' ? state : 'hidden';
      parseGameTimerRef.current = window.setTimeout(() => setParseGameState('hidden'), 420);
      return 'closing';
    });
  }, [demoBatch, demoBatchRunning, parseGameManual]);
  useEffect(() => { refreshCachedDemos(); }, []);
  const analysisDatasetSelection = useMemo(() => ({ demos: selectedAnalysisDemos, players: analysisSelectedPlayers }), [selectedAnalysisDemos, analysisSelectedPlayers]);
  const deferredAnalysisDatasetSelection = useDeferredValue(analysisDatasetSelection);
  const combinedAnalysis = useMemo(() => buildAnalysisDataset({
    demos: deferredAnalysisDatasetSelection.demos,
    selectedPlayers: deferredAnalysisDatasetSelection.players,
    getRoundEconomy: roundEconomy,
  }), [deferredAnalysisDatasetSelection]);
  const analysisEconomyAvailability = useMemo(() => getAnalysisEconomyAvailability(combinedAnalysis.rows), [combinedAnalysis.rows]);
  useEffect(() => {
    setAnalysisRows(combinedAnalysis.rows);
    setAnalysisTime(0);
    setAnalysisPlaying(false);
    setSelectedAnalysisUtility(null);
    setSelectedAnalysisUtilityScreen(null);
    setAnalysisUtilityHover(null);
    setAnalysisHighlightedUtilityId('');
    window.dispatchEvent(new CustomEvent(ANALYSIS_HEAT_DATA_EVENT, { detail: { deaths: combinedAnalysis.deaths } }));
  }, [combinedAnalysis, analysisSelectedDemoIds]);
  useEffect(() => {
    if (demoViewFlags.analysisMetric === 'utility' && demoViewFlags.heatStyle === 'points') return;
    setSelectedAnalysisUtility(null);
    setSelectedAnalysisUtilityScreen(null);
    setAnalysisUtilityHover(null);
    setAnalysisHighlightedUtilityId('');
  }, [demoViewFlags.analysisMetric, demoViewFlags.heatStyle]);
  const toggleAnalysisEconomy = (side, economy) => {
    const key = side === 'own' ? 'economyOwn' : 'economyOpponent';
    setAnalysisPlaying(false);
    setAnalysisTime(0);
    setDemoViewFlags((flags) => ({ ...flags, [key]: flags[key].includes(economy) ? flags[key].filter((value) => value !== economy) : [...flags[key], economy] }));
  };
  useEffect(() => {
    const buttons = document.querySelectorAll('.demo-view-options button');
    const directorButton = buttons[2];
    if (!directorButton) return undefined;
    const toggle = (event) => { event.preventDefault(); event.stopPropagation(); setDemoPovPlayerId(''); setDemoCameraMode((mode) => mode === 'follow' ? 'manual' : 'follow'); };
    directorButton.addEventListener('click', toggle, true);
    return () => directorButton.removeEventListener('click', toggle, true);
  }, [demoData, activePanel]);
  useEffect(() => {
    if (!demoRoundMenuOpen) return undefined;
    const list = document.querySelector('.demo-round-list');
    if (!list) return undefined;
    const rounds = demoData?.rounds || [];
    const buttons = [...list.querySelectorAll(':scope > button')];
    rounds.forEach((round, index) => {
      const button = buttons[index];
      if (!button) return;
      const winner = roundWinnerSide(round.winner);
      button.classList.toggle('winner-t', winner === 'T');
      button.classList.toggle('winner-ct', winner === 'CT');
      const previousRound = rounds[index - 1];
      const switched = previousRound ? sidesSwitched(roundSideSignature(demoData.roundData?.find((item) => item.round === previousRound.round)), roundSideSignature(demoData.roundData?.find((item) => item.round === round.round))) : false;
      button.classList.toggle('side-switch', switched);
      const label = button.querySelector('strong');
      if (label) label.textContent = String(round.round);
    });
    const update = () => list.classList.toggle('has-more', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    update();
    list.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { list.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [demoRoundMenuOpen, demoData?.rounds?.length]);
  useEffect(() => {
    if (!demoCacheOpen && !demoRoundMenuOpen && !modeMenuOpen) return undefined;
    const closeOutside = (event) => {
      if (!event.target.closest?.('.demo-cache-picker')) setDemoCacheOpen(false);
      if (!event.target.closest?.('.demo-round-picker')) setDemoRoundMenuOpen(false);
      if (!event.target.closest?.('.mode-picker')) setModeMenuOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      setDemoCacheOpen(false);
      setDemoRoundMenuOpen(false);
      setModeMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeWithEscape); };
  }, [demoCacheOpen, demoRoundMenuOpen, modeMenuOpen]);
  useEffect(() => () => { window.clearTimeout(utilityHoverTimerRef.current); window.clearTimeout(analysisUtilityHoverTimerRef.current); }, []);
  useEffect(() => () => window.clearTimeout(parseGameTimerRef.current), []);
  const applyDemoData = (data, cacheId, _analysisRowsFromCache = [], hasSource = false) => {
    setDemoData(data);
    const firstRound = data.rounds?.[0] || null;
    setDemoRound(firstRound);
    setDemoTick(firstRound?.startTick || 0);
    setDemoPovPlayerId('');
    setDemoSnapshots([]);
    setDemoThrowSnapshots([]);
    setDemoProjectiles([]);
    setDemoSmokeVoxelFrames([]);
    setDemoInfernoFrames([]);
    setDemoRoundLoading(false);
    setDemoPlaying(false);
    activeDemoCacheIdRef.current = cacheId || '';
    setDemoSourceReady(hasSource);
  };
  const openCachedDemo = async (id) => {
    const entry = await getCachedDemo(id);
    if (!entry?.data || entry.data.cacheSchemaVersion !== DEMO_CACHE_SCHEMA_VERSION || await countCachedDemoRounds(id) !== entry.data.rounds?.length) { if (entry) await deleteCachedDemo(id); await refreshCachedDemos(); return; }
    applyDemoData(entry.data, id, entry.analysisRows || [], false);
    setDemoSampleRate(entry.data.demo.sampleRate || 8);
    setMapName(entry.data.demo.map || mapName);
    setDemoStatus(t('cacheReady'));
    setDemoCacheOpen(false);
  };
  const removeCachedDemo = async (id) => {
    await deleteCachedDemo(id);
    await refreshCachedDemos();
  };
  const onReady = (value) => {
    boardRef.current = value;
    value.setCollabEditingEnabled?.(activePanel === 'collab' && hasActiveFrameContext);
    value.setCollabVisible?.(activePanel === 'collab' && hasActiveFrameContext);
    const pending = pendingArchiveRef.current;
    if (pending && pending.mapName === mapName && navData) {
      if (pending.frames && pending.frames.length) {
        const active = pending.frames.find((frame) => frame.id === pending.activeFrameId) || pending.frames[0];
        commitFrameState(pending.frames, active.id, { publish: false });
        value.restoreWorkspaceState?.(pending.workspace || active.workspace, true);
      } else {
        value.restoreWorkspaceState?.(pending.workspace);
      }
      pendingArchiveRef.current = null;
      return;
    }
    const doc = roomDocRef.current;
    if (!doc) return;
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const utilities = doc.getMap('utilities');
    const grenades = doc.getMap('grenades');
    const brushes = doc.getMap('brushes');
    const fallback = room.get('workspace');
    const initialized = room.get('workspaceInitialized') === true;
    value.restoreWorkspaceState?.(normalizeCollabWorkspace({ points: initialized ? [...points.values()] : fallback?.points || [], paths: initialized ? [...paths.values()] : fallback?.paths || [], grenades: initialized ? [...grenades.values()] : fallback?.grenades || [], cameraSlots: room.get('cameraSlots') || fallback?.cameraSlots || [], collabUtilities: initialized ? [...utilities.values()] : fallback?.collabUtilities || [], brushStrokes: initialized ? [...brushes.values()] : fallback?.brushStrokes || [] }), false);
  };
  const onPointSelect = (id, screen) => { setSelectedPoint(id); setSelectedPointScreen(screen); };
  const activeFrameWorkspace = () => boardRef.current?.getWorkspaceState?.() || { points: [], paths: [], grenades: [], collabUtilities: [] };
  const commitFrameState = (nextFrames, nextActiveId, { publish = true, workspaceForRoom = null } = {}) => {
    framesRef.current = nextFrames;
    activeFrameIdRef.current = nextActiveId;
    setFrames(nextFrames);
    setActiveFrameId(nextActiveId);
    if (publish) publishFramesToRoom(nextFrames, nextActiveId, workspaceForRoom);
    return nextFrames;
  };
  const persistActiveArchiveFrames = (nextFrames, nextActiveId) => {
    if (!activeArchiveId || roomCode) return;
    const currentArchives = archivesRef.current;
    const index = currentArchives.findIndex((archive) => archive.id === activeArchiveId);
    if (index < 0) return;
    const next = currentArchives.map((archive, archiveIndex) => archiveIndex === index ? { ...archive, frames: nextFrames, activeFrameId: nextActiveId, savedAt: new Date().toISOString() } : archive);
    persistWorkspaceArchives(next);
  };
  const saveActiveFrame = (workspace, { publish = true } = {}) => {
    if (!framesRef.current.length || !activeFrameIdRef.current) return null;
    window.clearTimeout(collabSaveTimerRef.current);
    collabDirtyRef.current = false;
    boardRef.current?.finalizeFrameTween?.();
    const snapshot = frameWorkspace(workspace ?? activeFrameWorkspace());
    const next = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: snapshot } : frame);
    commitFrameState(next, activeFrameIdRef.current, { publish, workspaceForRoom: snapshot });
    persistActiveArchiveFrames(next, activeFrameIdRef.current);
    return next;
  };
  const switchFrame = (frameId) => {
    if (frameId === activeFrameIdRef.current) return;
    flushCollabSave();
    boardRef.current?.finalizeFrameTween?.();
    const outgoing = frameWorkspace(activeFrameWorkspace());
    const next = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: outgoing } : frame);
    const frame = next.find((item) => item.id === frameId);
    if (!frame) return;
    commitFrameState(next, frameId, { workspaceForRoom: frame.workspace || emptyWorkspace() });
    persistActiveArchiveFrames(next, frameId);
    boardRef.current?.smoothRestoreFrame?.(frame.workspace || emptyWorkspace(), false, null, true);
  };
  const insertFrame = () => {
    flushCollabSave();
    boardRef.current?.finalizeFrameTween?.();
    const outgoing = frameWorkspace(activeFrameWorkspace());
    const saved = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace: outgoing } : frame);
    const id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const workspace = emptyWorkspace();
    const next = [...saved, { id, workspace }];
    commitFrameState(next, id, { workspaceForRoom: workspace });
    persistActiveArchiveFrames(next, id);
    boardRef.current?.restoreWorkspaceState?.(workspace, false);
  };
  const duplicateFrame = () => {
    if (!framesRef.current.length) return;
    flushCollabSave();
    boardRef.current?.finalizeFrameTween?.();
    const workspace = frameWorkspace(activeFrameWorkspace());
    const saved = framesRef.current.map((frame) => frame.id === activeFrameIdRef.current ? { ...frame, workspace } : frame);
    const active = saved.find((frame) => frame.id === activeFrameIdRef.current) || saved[0];
    const index = saved.indexOf(active);
    const id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const copy = { id, workspace };
    const next = [...saved.slice(0, index + 1), copy, ...saved.slice(index + 1)];
    commitFrameState(next, id, { workspaceForRoom: workspace });
    persistActiveArchiveFrames(next, id);
    boardRef.current?.smoothRestoreFrame?.(copy.workspace, false, null, true);
  };
  const deleteFrame = () => {
    if (framesRef.current.length <= 1) return;
    flushCollabSave();
    const index = framesRef.current.findIndex((frame) => frame.id === activeFrameIdRef.current);
    const next = framesRef.current.filter((frame) => frame.id !== activeFrameIdRef.current);
    const nextActive = next[Math.max(0, index - 1)] || next[0];
    commitFrameState(next, nextActive.id, { workspaceForRoom: nextActive.workspace || emptyWorkspace() });
    persistActiveArchiveFrames(next, nextActive.id);
    boardRef.current?.smoothRestoreFrame?.(nextActive.workspace || emptyWorkspace(), false, null, true);
  };
  const activeCollabPlayers = () => {
    const workspace = activeFrameWorkspace();
    const liveTeams = new Map((boardRef.current?.getCollabPlayers?.() || []).map((player) => [player.id, player.team]));
    return (workspace.points || []).filter((point) => point.kind === 'player').map((point) => ({ ...point, team: liveTeams.get(point.id) || point.team }));
  };
  const activeImportedUtilities = () => activeFrameWorkspace().collabUtilities || [];
  const confirmCollabUtilityImport = () => {
    const note = currentUtilityNotes.find((candidate) => candidate.id === collabUtilitySelected);
    if (!note) return;
    // Keep the focused preview view when its temporary object becomes permanent.
    boardRef.current?.clearCollabUtilityPreview?.(false);
    boardRef.current?.addCollabUtility?.(note);
    setCollabUtilityPickerOpen(false);
    setCollabUtilitySelected('');
    setCollabUtilitySearch('');
    setCollabUtilityRevision((value) => value + 1);
  };
  const cancelCollabUtilityImport = () => {
    boardRef.current?.clearCollabUtilityPreview?.();
    setCollabUtilityPickerOpen(false);
    setCollabUtilitySelected('');
    setCollabUtilitySearch('');
  };
  useEffect(() => {
    if (activePanel === 'collab' && collabObjectTab === 'utility' && hasActiveFrameContext) return;
    boardRef.current?.clearCollabUtilityPreview?.();
    setCollabUtilityPickerOpen(false);
    setCollabUtilitySelected('');
  }, [activePanel, collabObjectTab, hasActiveFrameContext]);
  const deleteImportedUtility = (itemId) => {
    boardRef.current?.removeCollabUtility?.(itemId);
    setCollabUtilityRevision((value) => value + 1);
  };
  const openAnonymousUtilitySave = (item) => {
    setAnonymousUtilitySave(item);
    setAnonymousUtilityDraft({ name: '', summary: '' });
    setAnonymousUtilityError('');
  };
  const saveAnonymousUtility = async (event) => {
    event.preventDefault();
    const name = anonymousUtilityDraft.name.trim();
    const summary = anonymousUtilityDraft.summary.trim();
    if (!anonymousUtilitySave?.sourceNote || !name || !summary) return;
    const now = new Date().toISOString();
    const sourceNote = anonymousUtilitySave.sourceNote;
    const note = { ...sourceNote, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mapName, name, summary, source: 'demo', replay: { ...(sourceNote.replay || {}), projectiles: anonymousUtilitySave.projectiles || [], smokeVoxelFrames: anonymousUtilitySave.smokeVoxelFrame ? [anonymousUtilitySave.smokeVoxelFrame] : [], infernoFrames: anonymousUtilitySave.infernoFrame ? [anonymousUtilitySave.infernoFrame] : [] }, createdAt: sourceNote.createdAt || now, updatedAt: now };
    if (!await persistUtilityNotes([...utilityNotesRef.current, note])) { setAnonymousUtilityError(t('utilityStorageFailed')); return; }
    boardRef.current?.promoteCollabUtility?.(anonymousUtilitySave.id, note);
    saveActiveFrame();
    setCollabUtilityRevision((value) => value + 1);
    setAnonymousUtilitySave(null);
    setAnonymousUtilityDraft({ name: '', summary: '' });
    setAnonymousUtilityError('');
  };
  const renameCollabPlayerPoint = (pointId, newName) => {
    const current = activeCollabPlayers();
    const target = current.find((point) => point.id === pointId);
    const name = newName.trim();
    if (!target || !name || target.name === name) return;
    if (current.some((point) => point.id !== pointId && point.name.toLowerCase() === name.toLowerCase())) { setRoomNotice(`${t('nameExists')} ${name}`); return; }
    boardRef.current?.renamePlayerPoint?.(pointId, name);
    saveActiveFrame();
  };
  const handleBrushChange = (data) => {
    if (activePanel === 'collab') scheduleCollabSave();
    const doc = roomDocRef.current;
    if (!doc) return;
    const brushes = doc.getMap('brushes');
    doc.transact(() => {
      const known = new Set(data.map((item) => item.id));
      brushes.forEach((_, id) => { if (!known.has(id)) brushes.delete(id); });
      data.forEach((item) => { if (JSON.stringify(brushes.get(item.id)) !== JSON.stringify(item)) brushes.set(item.id, item); });
    });
  };
  const publishFramesToRoom = (next = framesRef.current, nextActiveId = activeFrameIdRef.current, workspaceForRoom = null) => {
    const doc = roomDocRef.current;
    if (!doc) return;
    const framesMap = doc.getMap('frames');
    const activeMap = doc.getMap('activeFrame');
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const utilities = doc.getMap('utilities');
    const grenades = doc.getMap('grenades');
    const brushes = doc.getMap('brushes');
    const syncMap = (map, entries, keyOf) => {
      const known = new Set(entries.map(keyOf));
      map.forEach((_, id) => { if (!known.has(id)) map.delete(id); });
      entries.forEach((entry) => { const id = keyOf(entry); if (JSON.stringify(map.get(id)) !== JSON.stringify(entry)) map.set(id, entry); });
    };
    doc.transact(() => {
      const known = new Set(next.map((frame) => frame.id));
      framesMap.forEach((_, id) => { if (!known.has(id)) framesMap.delete(id); });
      next.forEach((frame) => { if (JSON.stringify(framesMap.get(frame.id)) !== JSON.stringify(frame)) framesMap.set(frame.id, frame); });
      const frameOrder = next.map((frame) => frame.id);
      if (JSON.stringify(room.get('frameOrder') || []) !== JSON.stringify(frameOrder)) room.set('frameOrder', frameOrder);
      if (activeMap.get('id') !== nextActiveId) activeMap.set('id', nextActiveId);
      if (workspaceForRoom) {
        room.set('workspaceInitialized', true);
        syncMap(points, workspaceForRoom.points || [], (point) => point.id);
        syncMap(paths, [], (path) => path.join(':'));
        syncMap(utilities, workspaceForRoom.collabUtilities || [], (utility) => utility.id);
        syncMap(grenades, workspaceForRoom.grenades || [], (grenade) => grenade.id);
        syncMap(brushes, workspaceForRoom.brushStrokes || [], (brush) => brush.id);
      }
    });
  };
  useEffect(() => {
    if (activePanel !== 'collab') return;
    if (!hasActiveFrameContext) {
      boardRef.current?.clearWorkspaceState?.();
      boardRef.current?.setCollabVisible?.(false);
      return;
    }
    const active = framesRef.current.find((frame) => frame.id === activeFrameIdRef.current) || framesRef.current[0];
    boardRef.current?.smoothRestoreFrame?.(active.workspace || emptyWorkspace(), false);
    boardRef.current?.setCollabVisible?.(true);
  }, [activePanel, hasActiveFrameContext]);
  useEffect(() => {
    const closePointActions = (event) => {
      if (event.target.closest?.('.point-actions') || event.target.closest?.('.three-board')) return;
      setSelectedPoint(null);
      setSelectedPointScreen(null);
    };
    document.addEventListener('pointerdown', closePointActions);
    return () => document.removeEventListener('pointerdown', closePointActions);
  }, []);
  const onCameraSlots = (slots, active) => {
    setCameraSlotState(slots);
    setActiveCameraSlot(active);
    if (roomDocRef.current && roomOwnerRef.current) {
      const savedSlots = boardRef.current?.getWorkspaceState?.().cameraSlots;
      if (savedSlots) roomDocRef.current.getMap('room').set('cameraSlots', savedSlots);
    }
  };
  const [saveArchiveModal, setSaveArchiveModal] = useState(false);
  const [saveArchiveName, setSaveArchiveName] = useState('');
  const [saveArchiveSelected, setSaveArchiveSelected] = useState('');
  const [saveArchiveIncludeDemo, setSaveArchiveIncludeDemo] = useState(false);
  const [saveArchiveMode, setSaveArchiveMode] = useState('select');
  const saveWorkspaceArchive = async (targetId = saveArchiveSelected, targetName = saveArchiveName) => {
    flushCollabSave();
    boardRef.current?.finalizeFrameTween?.();
    const workspace = boardRef.current?.getWorkspaceState?.({ includeDemo: saveArchiveIncludeDemo === true });
    if (!workspace) return;
    const now = Date.now();
    let latestArchives = archivesRef.current;
    // Rewrite older anonymous utilities through the compact schema so their
    // duplicated smoke journals do not keep consuming the storage quota.
    latestArchives = latestArchives.map((item) => ({
      ...item,
      workspace: item.workspace ? normalizeCollabWorkspace(item.workspace) : item.workspace,
      frames: Array.isArray(item.frames) ? item.frames.map((frame) => ({ ...frame, workspace: normalizeCollabWorkspace(frame.workspace) })) : item.frames,
    }));
    const existing = targetId ? latestArchives.find((item) => item.id === targetId) : null;
    if (targetId && !existing) { setRoomNotice(t('noArchives')); return; }
    if (existing && existing.mapName !== mapName) return;
    const currentFrameWorkspace = normalizeCollabWorkspace(workspace);
    const newFrame = { id: `frame-${now}-${Math.random().toString(16).slice(2, 8)}`, workspace: currentFrameWorkspace };
    // Row-level save is an explicit overwrite; the general save dialog still appends frames to an archive.
    const overwriteExisting = Boolean(existing && saveArchiveMode === 'overwrite');
    const savedFrames = existing && !overwriteExisting ? [...normalizeFrames(existing.frames, existing.workspace || emptyWorkspace()), newFrame] : [newFrame];
    const savedActiveFrameId = newFrame.id;
    const archiveWorkspace = { ...workspace, ...currentFrameWorkspace };
    let archive;
    let next;
    if (existing) {
      archive = { ...existing, savedAt: new Date().toISOString(), workspace: archiveWorkspace, mapName, map: mapName, frames: savedFrames, activeFrameId: savedActiveFrameId, demo: demoData ? { fileName: demoData.demo.fileName, round: demoRound?.round, tick: demoTick } : null };
      next = latestArchives.map((item) => item.id === targetId ? archive : item);
    } else {
      if (!targetName.trim()) return;
      archive = { id: `${now}-${Math.random().toString(16).slice(2, 8)}`, savedAt: new Date().toISOString(), name: targetName.trim(), mapName, map: mapName, frames: savedFrames, activeFrameId: savedActiveFrameId, demo: demoData ? { fileName: demoData.demo.fileName, round: demoRound?.round, tick: demoTick } : null, workspace: archiveWorkspace };
      next = [archive, ...latestArchives].slice(0, 30);
    }
    if (!await persistWorkspaceArchives(next)) return;
    if (!roomCode) {
      setActiveArchiveId(archive.id);
      commitFrameState(savedFrames, savedActiveFrameId, { publish: false });
    }
    setSaveArchiveModal(false);
    setSaveArchiveName('');
    setSaveArchiveSelected('');
    setSaveArchiveIncludeDemo(false);
    setSaveArchiveMode('select');
  };
  const openSaveArchiveModal = (includeDemo = false) => { setSaveArchiveMode('select'); setSaveArchiveIncludeDemo(includeDemo); setSaveArchiveSelected(!includeDemo && activeArchiveId ? activeArchiveId : ''); setSaveArchiveName(''); setSaveArchiveModal(true); };
  const openOverwriteArchiveModal = (archiveId) => { setSaveArchiveMode('overwrite'); setSaveArchiveIncludeDemo(false); setSaveArchiveSelected(archiveId); setSaveArchiveName(''); setSaveArchiveModal(true); };
  const openNewArchiveModal = () => { setSaveArchiveMode('new'); setSaveArchiveIncludeDemo(false); setSaveArchiveSelected(''); setSaveArchiveName(''); setSaveArchiveModal(true); };
  const openRoom = () => {
    flushCollabSave();
    const workspace = boardRef.current?.getWorkspaceState?.();
    if (!workspace) return;
    preRoomSessionRef.current = { archiveId: activeArchiveId, frames: framesRef.current, activeFrameId: activeFrameIdRef.current };
    let roomFrames = framesRef.current;
    let roomActiveId = activeFrameIdRef.current;
    if (!roomFrames.length || !roomActiveId) {
      roomActiveId = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      roomFrames = [{ id: roomActiveId, workspace: frameWorkspace(workspace) }];
      commitFrameState(roomFrames, roomActiveId, { publish: false });
    }
    const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    roomSeedRef.current = { workspace: frameWorkspace(workspace), cameraSlots: workspace.cameraSlots || [] };
    setActiveArchiveId(null);
    setRoomCode(code); setRoomOwner(true); setRoomStatus(`${t('room')} ${code} ${t('roomOpened')}`);
  };
  const leaveRoom = () => {
    const room = roomDocRef.current?.getMap('room');
    if (room && roomOwner) room.set('closed', true);
    const previous = preRoomSessionRef.current;
    setRoomStatus(roomOwner ? t('roomDestroyed') : t('roomLeft'));
    setRoomCode(''); setRoomOwner(false);
    setActiveArchiveId(previous?.archiveId || null);
    commitFrameState(previous?.frames || [], previous?.activeFrameId || null, { publish: false });
    preRoomSessionRef.current = null;
  };
  const joinRoom = (value = roomJoinCode) => {
    const code = value.trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(code)) return;
    preRoomSessionRef.current = { archiveId: activeArchiveId, frames: framesRef.current, activeFrameId: activeFrameIdRef.current };
    setActiveArchiveId(null);
    commitFrameState([], null, { publish: false });
    boardRef.current?.clearWorkspaceState?.();
    setRoomCode(code); setRoomOwner(false); setRoomStatus(`${t('joiningRoom')} ${code}...`);
  };
  useEffect(() => {
    if (!roomNotice) return;
    window.alert(roomNotice);
    setRoomNotice('');
  }, [roomNotice]);
  useEffect(() => {
    if (!roomCode) return undefined;
    const doc = new Y.Doc(); const provider = new WebsocketProvider(collaborationUrl(), roomCode, doc);
    roomDocRef.current = doc; roomProviderRef.current = provider;
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const utilities = doc.getMap('utilities');
    const grenades = doc.getMap('grenades');
    const framesMap = doc.getMap('frames');
    const activeFrameMap = doc.getMap('activeFrame');
    const brushes = doc.getMap('brushes');
    const awareness = provider.awareness;
    const knownUsers = new Map();
    let presenceEventId = 0;
    setRoomActivity([]);
    const syncPresence = ({ added = [], removed = [] } = {}) => {
      const states = awareness.getStates();
      const joined = added.filter((clientId) => clientId !== doc.clientID).map((clientId) => states.get(clientId)?.user?.name).filter(Boolean);
      const left = removed.filter((clientId) => clientId !== doc.clientID).map((clientId) => knownUsers.get(clientId)?.name).filter(Boolean);
      const users = [...states.entries()].map(([clientId, state]) => state.user ? { clientId, ...state.user, current: clientId === doc.clientID } : null).filter(Boolean).sort((first, second) => Number(second.owner) - Number(first.owner) || first.name.localeCompare(second.name));
      knownUsers.clear();
      users.forEach((user) => knownUsers.set(user.clientId, user));
      setRoomUsers(users);
      const events = [...joined.map((name) => localize(languageRef.current, { zh: `${name} 已加入房间`, en: `${name} joined the room`, ru: `${name} вошёл в комнату` })), ...left.map((name) => localize(languageRef.current, { zh: `${name} 已退出房间`, en: `${name} left the room`, ru: `${name} вышел из комнаты` }))];
      if (events.length) setRoomActivity((current) => [...current, ...events.map((text) => ({ id: presenceEventId += 1, text }))].slice(-5));
    };
    awareness.on('change', syncPresence);
    awareness.setLocalStateField('user', { name: clientName.current, owner: roomOwnerRef.current });
    syncPresence();
    let applyingRemote = false;
    let synced = false;
    const frameSwitchTransactions = new WeakSet();
    const applySharedWorkspace = () => {
      const fallback = room.get('workspace');
      const initialized = room.get('workspaceInitialized') === true;
      const shared = {
        points: initialized ? [...points.values()] : fallback?.points || [],
        paths: initialized ? [...paths.values()] : fallback?.paths || [],
        grenades: initialized ? [...grenades.values()] : fallback?.grenades || [],
        collabUtilities: initialized ? [...utilities.values()] : fallback?.collabUtilities || [],
        brushStrokes: initialized ? [...brushes.values()] : fallback?.brushStrokes || [],
        cameraSlots: room.get('cameraSlots') || fallback?.cameraSlots || [],
      };
      const normalizedShared = normalizeCollabWorkspace(shared);
      const serialized = JSON.stringify(normalizedShared);
      if (serialized === roomWorkspaceRef.current) return;
      roomWorkspaceRef.current = serialized;
      applyingRemote = true;
      boardRef.current?.restoreWorkspaceState?.(normalizedShared, false);
      applyingRemote = false;
    };
    let appliedRevision = -1;
    const tr = (key, values) => translate(languageRef.current, key, values);
    const apply = (_event, transaction) => {
      if (transaction?.local) return;
      if (room.get('closed')) { setRoomNotice(tr('roomDestroyed')); leaveRoom(); return; }
      const revision = Number(room.get('revision') || 0);
      const map = room.get('mapName');
      if (map && map !== mapNameRef.current && !roomOwnerRef.current) setMapName(map);
      if (revision !== appliedRevision) { appliedRevision = revision; roomWorkspaceRef.current = ''; }
      const remoteActiveId = activeFrameMap.get('id');
      const switchingFrame = remoteActiveId && remoteActiveId !== activeFrameIdRef.current && framesMap.has(remoteActiveId);
      if (switchingFrame && transaction) frameSwitchTransactions.add(transaction);
      if (!switchingFrame && !frameSwitchTransactions.has(transaction)) applySharedWorkspace();
      setRoomStatus(`${tr('joinedRoom')} ${roomCode}`);
    };
    provider.on('status', ({ status }) => { setRoomStatus(status === 'connected' ? `${tr('room')} ${roomCode} ${tr('connected')} · ${clientName.current}` : `${tr('room')} ${status === 'disconnected' ? tr('disconnected') : tr('connecting')}...`); });
    provider.on('sync', (isSynced) => {
      synced = isSynced;
      if (!isSynced) return;
      if (roomOwnerRef.current && room.get('workspaceInitialized') !== true) {
        const seedState = roomSeedRef.current;
        const seed = seedState?.workspace || frameWorkspace(activeFrameWorkspace());
        const cameraSlots = seedState?.cameraSlots || boardRef.current?.getWorkspaceState?.().cameraSlots || [];
        doc.transact(() => { room.set('mapName', mapNameRef.current); room.set('cameraSlots', cameraSlots); room.set('closed', false); room.set('workspaceInitialized', true); });
        publishFramesToRoom(framesRef.current, activeFrameIdRef.current, seed);
        roomSeedRef.current = null;
      }
      apply();
    });
    room.observe(apply); points.observe(apply); paths.observe(apply); utilities.observe(apply); grenades.observe(apply); apply();
    const applyFrames = (_event, transaction) => {
      if (transaction?.local) return;
      const order = room.get('frameOrder') || [];
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      const remote = normalizeFrames([...framesMap.values()]).sort((left, right) => (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER));
      if (!remote.length) return;
      const desiredId = framesMap.has(activeFrameMap.get('id')) ? activeFrameMap.get('id') : remote[0].id;
      const changedFrame = desiredId !== activeFrameIdRef.current;
      if (changedFrame && transaction) frameSwitchTransactions.add(transaction);
      commitFrameState(remote, desiredId, { publish: false });
      if (changedFrame) {
        const selected = remote.find((frame) => frame.id === desiredId);
        applyingRemote = true;
        boardRef.current?.smoothRestoreFrame?.(selected?.workspace || emptyWorkspace(), false, null, true);
        applyingRemote = false;
      }
    };
    const applyBrushes = () => {
      if (!synced) return;
      boardRef.current?.applyLiveBrushData?.([...brushes.values()]);
    };
    framesMap.observe(applyFrames); activeFrameMap.observe(applyFrames); applyFrames();
    brushes.observe(applyBrushes); applyBrushes();
    return () => { room.unobserve(apply); points.unobserve(apply); paths.unobserve(apply); utilities.unobserve(apply); grenades.unobserve(apply); framesMap.unobserve(applyFrames); activeFrameMap.unobserve(applyFrames); brushes.unobserve(applyBrushes); awareness.off('change', syncPresence); provider.destroy(); doc.destroy(); setRoomUsers([]); roomDocRef.current = null; roomProviderRef.current = null; };
  }, [roomCode]);
  useEffect(() => {
    if (!roomCode || !roomOwner || !roomDocRef.current) return;
    const room = roomDocRef.current.getMap('room');
    if (room.get('mapName') !== mapName) room.set('mapName', mapName);
  }, [mapName, roomCode, roomOwner]);
  useEffect(() => {
    if (!activeArchiveId || roomCode) return;
    const selected = archives.find((archive) => archive.id === activeArchiveId);
    if (selected?.mapName === mapName) return;
    setActiveArchiveId(null);
    commitFrameState([], null, { publish: false });
    boardRef.current?.clearWorkspaceState?.();
  }, [mapName]);
  const deleteWorkspaceArchive = async (id) => {
    const next = archivesRef.current.filter((archive) => archive.id !== id);
    if (!await persistWorkspaceArchives(next)) return;
    if (activeArchiveId === id) {
      setActiveArchiveId(null);
      if (!roomCode) {
        window.clearTimeout(collabSaveTimerRef.current);
        collabDirtyRef.current = false;
        commitFrameState([], null, { publish: false });
        boardRef.current?.clearWorkspaceState?.();
      }
    }
  };
  const switchPanel = (panel) => {
    setDemoPlaying(false);    setAnalysisPlaying(false);
    setSelectedDemoGrenade(null);
    setSelectedDemoGrenadeScreen(null);
    setUtilityReplay(null);
    if (panel === 'analysis') setAnalysisTime(0);
    if (activePanel === 'collab' && panel !== 'collab') { cancelCollabUtilityImport(); setAnonymousUtilitySave(null); flushCollabSave(); }
    if (activePanel === 'utility' && panel !== 'utility') boardRef.current?.clearCollabUtilityPreview?.();
    boardRef.current?.setCollabVisible?.(panel === 'collab');
    if (activePanel === 'collab' && panel !== 'collab') boardRef.current?.clearWorkspaceState?.();
    if (panel !== 'collab' && roomCode) { const wasOwner = roomOwner; leaveRoom(); window.alert(wasOwner ? t('roomDestroyed') : t('roomExited')); }
    if (panel !== 'utility') { setUtilityModalOpen(false); setUtilityHover(null); setSelectedUtilityNote(null); setUtilityEditDraft(null); setUtilityError(''); }
    if (mapName === TUTORIAL_MAP_ID && panel !== 'utility' && panel !== 'collab') setMapName('de_dust2');
    setActivePanel(panel);
  };
  const addUtilityNote = async (event) => {
    event.preventDefault();
    const parsed = parseGetpos(utilityDraft.getpos);
    if (!parsed) { setUtilityError(t('invalidGetpos')); return; }
    const next = [...utilityNotesRef.current, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mapName, position: parsed.position, angles: parsed.angles, name: utilityDraft.name.trim(), summary: utilityDraft.summary.trim(), createdAt: new Date().toISOString() }];
    if (!await persistUtilityNotes(next)) return;
    setUtilityDraft({ getpos: '', name: '', summary: '' });
    setUtilityError('');
    setUtilityModalOpen(false);
  };
  const exportUtilityNotes = () => {
    const blob = new Blob([JSON.stringify({ version: UTILITY_NOTES_VERSION, exportedAt: new Date().toISOString(), notes: utilityNotes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `csboard-utility-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importUtilityNotes = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = Array.isArray(parsed) ? parsed : parsed?.notes;
      if (!Array.isArray(imported)) throw new Error('invalid notes');
      const next = [...utilityNotesRef.current];
      const exact = new Set(next.map(stableSerialize));
      const ids = new Set(next.map((note) => note.id).filter(Boolean));
      let added = 0;
      let skipped = 0;
      imported.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
        const rawKey = stableSerialize(raw);
        if (exact.has(rawKey)) { skipped += 1; return; }
        const contentHash = stableHash(rawKey);
        const requestedId = String(raw.id || `import-${contentHash}`);
        const id = ids.has(requestedId) ? `${requestedId}-import-${contentHash}` : requestedId;
        const note = { ...raw, id };
        const noteKey = stableSerialize(note);
        if (exact.has(noteKey)) { skipped += 1; return; }
        next.push(note);
        exact.add(noteKey);
        ids.add(id);
        added += 1;
      });
      if (!await persistUtilityNotes(next)) throw new Error('utility storage failed');
      setUtilityImportNotice(t('utilityImportDone', { added, skipped }));
    } catch {
      setUtilityImportNotice(t('utilityImportFailed'));
    }
  };
  const restoreWorkspaceArchive = (archive) => {
    if (roomCode && !roomOwner) return;
    flushCollabSave();
    const storedArchive = archivesRef.current.find((item) => item.id === archive.id) || archive;
    const restoredFrames = normalizeFrames(storedArchive.frames, storedArchive.workspace || emptyWorkspace());
    if (!restoredFrames.length) return;
    const active = restoredFrames.find((frame) => frame.id === storedArchive.activeFrameId) || restoredFrames[0];
    const canonicalArchive = { ...storedArchive, frames: restoredFrames, activeFrameId: active.id, workspace: { ...(storedArchive.workspace || {}), ...normalizeCollabWorkspace(storedArchive.workspace || active.workspace) } };
    const restoreWorkspace = { ...frameWorkspace(active.workspace || canonicalArchive.workspace), cameraSlots: canonicalArchive.workspace?.cameraSlots || [], camera: canonicalArchive.workspace?.camera || null };
    if (JSON.stringify(storedArchive.frames || []) !== JSON.stringify(restoredFrames) || JSON.stringify(storedArchive.workspace || {}) !== JSON.stringify(canonicalArchive.workspace)) {
      const migrated = archivesRef.current.map((item) => item.id === canonicalArchive.id ? canonicalArchive : item);
      persistWorkspaceArchives(migrated);
    }
    if (!roomCode) setActiveArchiveId(canonicalArchive.id);
    commitFrameState(restoredFrames, active.id, { publish: false });
    pendingArchiveRef.current = { ...canonicalArchive, workspace: restoreWorkspace };
    if (canonicalArchive.mapName !== mapName) setMapName(canonicalArchive.mapName);
    else if (boardRef.current) {
      boardRef.current.restoreWorkspaceState?.(restoreWorkspace, true);
      pendingArchiveRef.current = null;
    }
    setRoomStatus(`${t('restoreArchive')}: ${canonicalArchive.name || canonicalArchive.mapName.toUpperCase()}`);
    if (canonicalArchive.demo && demoData?.demo.fileName === canonicalArchive.demo.fileName) { const round = demoData.rounds.find((item) => item.round === canonicalArchive.demo.round); if (round) setDemoRound(round); setDemoTick(canonicalArchive.demo.tick); }
    if (roomDocRef.current && roomOwner) {
      const room = roomDocRef.current.getMap('room');
      roomDocRef.current.transact(() => { room.set('mapName', canonicalArchive.mapName); room.set('cameraSlots', canonicalArchive.workspace?.cameraSlots || []); room.set('workspaceInitialized', true); room.set('revision', Number(room.get('revision') || 0) + 1); });
      publishFramesToRoom(restoredFrames, active.id, frameWorkspace(restoreWorkspace));
    }
  };
  const openTutorialWorkspace = () => {
    let archive = archivesRef.current.find((item) => item.id === tutorialWorkspaceArchive.id);
    if (!archive) {
      archive = tutorialWorkspaceArchive;
      const next = [...archivesRef.current, archive];
      persistWorkspaceArchives(next);
    }
    switchPanel('collab');
    restoreWorkspaceArchive(archive);
  };
  const moveTutorial = (nextStep) => {
    setTutorialStep(nextStep);
    if (nextStep === 3 && activeArchiveId !== tutorialWorkspaceArchive.id) openTutorialWorkspace();
  };
  const rememberTutorialOffer = () => {
    setTutorialOfferOpen(false);
    try { localStorage.setItem('csboard-tutorial-prompted', '1'); } catch { /* Keep the dismissal state for this session. */ }
  };
  const beginTutorial = () => {
    rememberTutorialOffer();
    setTutorialStep(0);
    setTutorialOpen(true);
    openTutorialWorkspace();
  };
  const finishTutorial = () => {
    setTutorialOpen(false);
    try { localStorage.setItem('csboard-tutorial-prompted', '1'); localStorage.setItem('csboard-tutorial-complete', '1'); } catch { /* Keep the completion state for this session. */ }
  };
  const selectedMode = showModel ? modelViewMode : -1;
  const hasLeftSidebar = activePanel === 'utility' || (activePanel === 'collab' && hasActiveFrameContext);
  const hasRightSidebar = ['analysis', 'utility', 'collab'].includes(activePanel);
  const modelControlsTarget = isMobile ? '' : activePanel === 'demo' ? '.demo-options' : activePanel === 'collab' && hasActiveFrameContext ? '.collab-frame-strip' : '.workspace-bottom-bar';
  const currentUtilityNotes = utilityNotes.filter((note) => note.mapName === mapName);
  const collabUtilityOptions = [...currentUtilityNotes]
    .sort((left, right) => left.grenadeType?.localeCompare?.(right.grenadeType || 'custom') || 0)
    .filter((note) => `${note.name} ${note.summary || ''} ${note.thrower || ''}`.toLowerCase().includes(collabUtilitySearch.trim().toLowerCase()));
  const currentUtilityGroups = useMemo(() => {
    const locations = new Map();
    utilityPositionClusters(currentUtilityNotes).forEach((cluster) => cluster.entries.forEach((note) => {
      const positionKey = cluster.key;
      const location = cluster.place || positionKey;
      if (!locations.has(location)) locations.set(location, new Map());
      const kind = note.grenadeType || 'custom';
      const categories = locations.get(location);
      if (!categories.has(kind)) categories.set(kind, []);
      categories.get(kind).push({ ...note, positionKey, positionEntries: cluster.entries });
    }));
    return [...locations.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([location, categories]) => ({ location, categories: [...categories.entries()].sort(([left], [right]) => left.localeCompare(right)) }));
  }, [currentUtilityNotes]);
  utilityRuntime.notes = currentUtilityNotes;
  utilityRuntime.enabled = activePanel === 'utility';
  utilityRuntime.onHover = (hover) => {
    window.clearTimeout(utilityHoverTimerRef.current);
    if (hover) { setUtilityHover(hover); return; }
    utilityHoverTimerRef.current = window.setTimeout(() => { if (!utilityHoverInsideRef.current) { setUtilityHover(null); setSelectedUtilityNote(null); } }, 180);
  };
  const { c4Countdown, c4Terminal, currentDefuser, defuseProgress, demoC4Events, demoDeaths, demoGrenadeSegments, demoHltvEvents, demoKills, demoPovFiring, demoPovHurt, demoPovPlayer, demoReloads, demoRoundEconomies, demoScore, demoSideSwitchRounds, demoSnapshot, demoTeams, interruptDemoCamera, roundClock, roundResult, roundWinner, timelineEvents } = useDemoViewState({ activePanel, demoData, demoPovPlayerId, demoProjectiles, demoRound, demoSnapshots, demoThrowSnapshots, demoTick, language, setDemoCameraMode, setDemoPovPlayerId, t });
  demoFrameSourceRuntime.current = { fileName: demoData?.demo.fileName || 'Demo', round: demoRound?.round || null, tickRate: demoData?.demo.tickRate || 64 };
  const onDemoGrenadeSelect = (id, screen) => { setSelectedDemoGrenade(demoGrenadeSegments.find((segment) => segment.id === id) || null); setSelectedDemoGrenadeScreen(screen); setDemoPlaying(false); };
  const onAnalysisUtilitySelect = (id, screen) => { setSelectedAnalysisUtility(combinedAnalysis.utilities.find((utility) => utility.id === id) || null); setSelectedAnalysisUtilityScreen(screen); setAnalysisHighlightedUtilityId(''); setAnalysisPlaying(false); };
  const onAnalysisUtilityHover = (hover) => {
    window.clearTimeout(analysisUtilityHoverTimerRef.current);
    if (hover?.utilities?.length) { setAnalysisUtilityHover(hover); return; }
    analysisUtilityHoverTimerRef.current = window.setTimeout(() => { if (!analysisUtilityHoverInsideRef.current) { setAnalysisUtilityHover(null); setAnalysisHighlightedUtilityId(''); } }, 160);
  };
  analysisUtilityRuntime.onSelect = onAnalysisUtilitySelect;
  analysisUtilityRuntime.onHover = onAnalysisUtilityHover;
  const saveGrenadeSegment = async (segment, source = {}) => {
    const note = buildSavedThrowNote({ mapName, segment, source, unknownLabel: t('unknown') });
    if (!note) return;
    if (!await persistUtilityNotes([...utilityNotesRef.current, note])) return;
    setSelectedDemoGrenade(null);
    setSelectedDemoGrenadeScreen(null);
    setSelectedAnalysisUtility(null);
    setSelectedAnalysisUtilityScreen(null);
  };
  const saveDemoGrenade = () => saveGrenadeSegment(selectedDemoGrenade, { fileName: demoData?.demo.fileName, round: demoRound?.round, tickRate: demoData?.demo.tickRate || 64, smokeVoxelFrames: demoSmokeVoxelFrames, infernoFrames: demoInfernoFrames });
  const saveAnalysisUtility = () => saveGrenadeSegment(selectedAnalysisUtility?.segment, selectedAnalysisUtility?.source);
  const playUtilityReplay = (note, firstPerson = false) => {
    if (!note.replay) return;
    // Older smoke notes stopped before their expansion reached the standard size.
    const tickRate = note.replay.tickRate || 64;
    const replayEndTick = note.grenadeType === 'smoke'
      ? Math.max(note.replay.endTick || 0, (note.replay.effectTick || 0) + tickRate)
      : note.replay.endTick;
    const replayNote = replayEndTick === note.replay.endTick ? note : { ...note, replay: { ...note.replay, endTick: replayEndTick } };
    setUtilityReplay({ note: replayNote, tick: 0, playing: true, firstPerson, delayUntil: firstPerson ? Date.now() + 1000 : 0 });
    setUtilityHover(null);
    setSelectedUtilityNote(null);
  };
  const copyUtilityCommand = async (note) => {
    const position = (note.position || [0, 0, 0]).map((value) => Number(value).toFixed(3)).join(' ');
    const angles = (note.angles || [0, 0, 0]).map((value) => Number(value).toFixed(3)).join(' ');
    const command = `setpos ${position};setang ${angles}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(command);
      else window.prompt(t('getposCommand'), command);
    } catch { window.prompt(t('getposCommand'), command); }
    setUtilityCopied(true);
    window.setTimeout(() => setUtilityCopied(false), 1200);
  };
  const deleteUtilityNote = (note) => {
    const next = utilityNotesRef.current.filter((item) => item.id !== note.id);
    persistUtilityNotes(next);
    setSelectedUtilityNote(null);
    setUtilityEditDraft(null);
    setUtilityHover(null);
    if (utilityReplay?.note.id === note.id) setUtilityReplay(null);
  };
  const saveUtilityEdit = (event) => {
    event.preventDefault();
    const name = utilityEditDraft?.name.trim();
    const summary = utilityEditDraft?.summary.trim();
    if (!selectedUtilityNote || !name || !summary) return;
    const updated = { ...selectedUtilityNote, name, summary, updatedAt: new Date().toISOString() };
    persistUtilityNotes(utilityNotesRef.current.map((note) => note.id === updated.id ? updated : note));
    setSelectedUtilityNote(updated);
    setUtilityHover((hover) => hover ? { ...hover, entries: hover.entries.map((note) => note.id === updated.id ? updated : note) } : hover);
    setUtilityReplay((replay) => replay?.note.id === updated.id ? { ...replay, note: updated } : replay);
    setUtilityEditDraft(null);
  };
  const { firstPerson: utilityFirstPerson, projectileFollow: utilityProjectileFollow, segments: utilityReplaySegments, snapshot: utilityReplaySnapshot } = useUtilityReplayPlayback(utilityReplay, setUtilityReplay);
  useEffect(() => {
    const worker = new Worker(new URL('./demoWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = async (event) => {
       const currentLanguage = languageRef.current;
       if (event.data.type === 'status') setDemoStatus(translateDemoWorkerStatus(currentLanguage, event.data.message));
       if (event.data.type === 'progress' && event.data.phase === 'ticks') {
         const now = performance.now();
         const real = THREE.MathUtils.clamp(Number(event.data.percent) || 0, 0, 100);
         const progress = demoParseProgressRef.current;
         const startedAt = progress.startedAt || now;
         demoParseProgressRef.current = { startedAt, real, completed: Number(event.data.completed) || 0, total: Number(event.data.total) || 0, lastRealAt: now, msPerPercent: real > 0 ? Math.max(250, (now - startedAt) / real) : 3000, hasReal: true };
         setDemoParseProgress((current) => Math.max(current, real));
         if (event.data.stage) setDemoStatus(currentLanguage === 'ru' ? `Обработка Demo… ${event.data.stage.percent}%` : event.data.stage[currentLanguage] || event.data.stage.en || event.data.stage.zh);
       }
        if (event.data.type === 'diagnostic') console.info('Demo parser diagnostic:', event.data.phase, event.data.data);
        if (event.data.type === 'sourceReady') { setDemoSourceReady(true); setDemoStatus(translate(currentLanguage, 'cacheReady')); }
         if (event.data.type === 'round') {
           const roundData = event.data.data;
          const representative = roundData.snapshots?.find((snapshot) => snapshot.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData.snapshots?.[0];
          pendingDemoRoundSummariesRef.current.set(roundData.round, { round: roundData.round, snapshots: representative ? [representative] : [] });
          const cacheId = pendingDemoCacheRef.current?.id;
           if (cacheId) {
             pendingDemoRoundWritesRef.current = pendingDemoRoundWritesRef.current.then(() => putCachedDemoRound(cacheId, roundData)).catch((error) => {
               pendingDemoRoundWriteErrorRef.current = error;
             });
           }
        }
        if (event.data.type === 'loaded') {
          window.clearTimeout(parseGameTimerRef.current);
          setParseGameState((state) => state === 'visible' ? 'closing' : 'hidden');
          window.setTimeout(() => setParseGameState('hidden'), 420);
          demoParseProgressRef.current = { ...demoParseProgressRef.current, real: 100, completed: demoParseProgressRef.current.total, lastRealAt: performance.now(), hasReal: true };
          setDemoParseProgress(100);
          const cacheId = pendingDemoCacheRef.current?.id;
           const summaries = pendingDemoRoundSummariesRef.current;
           await pendingDemoRoundWritesRef.current;
           if (pendingDemoRoundWriteErrorRef.current) {
             if (cacheId) await deleteCachedDemo(cacheId).catch(() => {});
             const message = pendingDemoRoundWriteErrorRef.current?.message || String(pendingDemoRoundWriteErrorRef.current);
             pendingDemoRoundWriteErrorRef.current = null;
             pendingDemoCacheRef.current = null;
             setDemoStatus(`${translate(currentLanguage, 'parseFailed')}: ${message}`);
             setParseGameState('stopped');
             return;
           }
           const { analysisRows: parsedAnalysisRows = [], ...workerData } = event.data.data;
           const data = { ...workerData, roundData: workerData.rounds.map((round) => summaries.get(round.round)).filter(Boolean) };
           pendingDemoRoundWritesRef.current = Promise.resolve();
           const pending = pendingDemoCacheRef.current;
           const analysisRows = parsedAnalysisRows;
          applyDemoData(data, pending?.id, analysisRows, true);
          if (pending) {
            const entry = { id: pending.id, fileName: data.demo.fileName, map: data.demo.map, rounds: data.rounds.length, sampleRate: data.demo.sampleRate || 8, sourceBytes: pending.sourceBytes, dataBytes: event.data.estimatedBytes || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data, analysisRows, analysisBytes: event.data.data.analysisBytes || 0 };
            const writeCache = () => putCachedDemo(entry).then(refreshCachedDemos).catch(() => setDemoStatus(translate(currentLanguage, 'cacheFailed')));
            if ('requestIdleCallback' in window) window.requestIdleCallback(writeCache, { timeout: 3000 });
            else window.setTimeout(writeCache, 500);
          }
          pendingDemoCacheRef.current = null;
       }
       if (event.data.type === 'analysis') {
         const rows = event.data.rows || [];
          setAnalysisStatus(translate(currentLanguage, 'analysisReady'));
         const cacheId = activeDemoCacheIdRef.current;
         if (cacheId) getCachedDemo(cacheId).then((entry) => entry && putCachedDemo({ ...entry, analysisRows: rows, analysisBytes: event.data.estimatedBytes || 0, updatedAt: new Date().toISOString() })).then(refreshCachedDemos).catch(() => {});
       }
       if (event.data.type === 'error') { window.clearTimeout(parseGameTimerRef.current); demoParseProgressRef.current.startedAt = 0; setParseGameState((state) => state === 'visible' ? 'stopped' : 'hidden'); setDemoStatus(`${translate(currentLanguage, 'parseFailed')}: ${event.data.message}`); console.error('Demo parse failed:', event.data.message, event.data.diagnostic); }
     };
    worker.onerror = (event) => {
      window.clearTimeout(parseGameTimerRef.current);
      setParseGameState('stopped');
      setDemoStatus(`${translate(languageRef.current, 'parseFailed')}: ${event.message || 'Demo Worker stopped'}`);
    };
    worker.onmessageerror = () => {
      window.clearTimeout(parseGameTimerRef.current);
      setParseGameState('stopped');
      setDemoStatus(`${translate(languageRef.current, 'parseFailed')}: Worker message could not be read`);
    };
    demoWorkerRef.current = worker;
    return () => worker.terminate();
  }, []);
  const loadDemo = (event) => {
    const files = [...(event.target.files || [])];
    // Clear the native input immediately so the same set can be selected again after this batch.
    event.target.value = '';
    if (files.length === 0 || demoBatchRunning) return;
    window.clearTimeout(parseGameTimerRef.current);
    setParseGameState('hidden');
    setParseGameManual(false);
    setParseGameDismissed(false);
    parseGameDismissedRef.current = false;
    setDemoStatus('');
    // Avoid flashing the overlay for cache hits, but offer the waiting games
    // once a real batch has occupied the foreground for a few seconds.
    parseGameTimerRef.current = window.setTimeout(() => {
      if (!parseGameDismissedRef.current) setParseGameState('visible');
    }, 3000);
    startDemoBatch(files);
  };
  useEffect(() => {
    if (!demoRound || !demoData) return;
    let cancelled = false;
    setDemoPovPlayerId('');
    setDemoTick(demoRound.startTick);
    setDemoRoundLoading(true);
    setDemoPlaying(false);
    setDemoSmokeVoxelFrames([]);
    setDemoInfernoFrames([]);
    getCachedDemoRound(activeDemoCacheIdRef.current, demoRound.round).then((cached) => {
      if (cancelled) return;
      setDemoSnapshots(cached?.snapshots || []);
      setDemoThrowSnapshots(cached?.throwSnapshots || []);
      setDemoProjectiles(cached?.projectiles || []);
      setDemoSmokeVoxelFrames(cached?.smokeVoxelFrames || []);
      setDemoInfernoFrames(cached?.infernoFrames || []);
      setDemoRoundLoading(false);
    }).catch(() => { if (!cancelled) setDemoRoundLoading(false); });
    return () => { cancelled = true; };
  }, [demoRound, demoData]);
  useEffect(() => { if (demoPovPlayerId && !demoPovPlayer) setDemoPovPlayerId(''); }, [demoPovPlayerId, demoPovPlayer]);
  useEffect(() => {
    if (!demoPlaying || !demoData || !demoRound) return undefined;
    const timer = window.setInterval(() => setDemoTick((tick) => {
      const next = Math.min(demoRound.endTick, tick + 64 / 30);
      if (next >= demoRound.endTick) setDemoPlaying(false);
      return next;
    }), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [demoPlaying, demoData, demoRound]);
  useEffect(() => {
     const onDemoKeyDown = (event) => {
       if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
         event.preventDefault();
         event.stopImmediatePropagation();
         const direction = event.code === 'ArrowLeft' ? -1 : 1;
          if (activePanel === 'analysis' && analysisSelectedPlayers.length && analysisRows.length) {
           setAnalysisPlaying(false);
           setAnalysisTime((time) => THREE.MathUtils.clamp(time + direction * 16, 0, analysisDuration));
         } else if (activePanel === 'demo' && demoData && demoRound && !demoRoundLoading) {
           setDemoPlaying(false);
           setDemoTick((tick) => THREE.MathUtils.clamp(tick + direction * 16, demoRound.startTick, demoRound.endTick));
         } else if (activePanel === 'collab' && hasActiveFrameContext && frames.length) {
           const currentIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));
           const nextFrame = frames[THREE.MathUtils.clamp(currentIndex + direction, 0, frames.length - 1)];
           if (nextFrame && nextFrame.id !== activeFrameId) switchFrame(nextFrame.id);
         }
         return;
       }
        if (!demoData && activePanel !== 'analysis') return;
         if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); if (event.repeat) return; if (activePanel === 'analysis') { if (analysisSelectedPlayers.length && analysisRows.length) setAnalysisPlaying((playing) => !playing); } else if (!demoRoundLoading && demoRound) setDemoPlaying((playing) => !playing); return; }
         if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target?.tagName)) return;
     };
    window.addEventListener('keydown', onDemoKeyDown, true);
    return () => window.removeEventListener('keydown', onDemoKeyDown, true);
  }, [activeFrameId, activePanel, analysisDuration, analysisRows.length, analysisSelectedPlayers.length, demoData, demoRound, demoRoundLoading, demoViewFlags.analysisMetric, frames, hasActiveFrameContext]);
  const webMcpRuntimeRef = useRef(null);
  webMcpRuntimeRef.current = {
    activePanel, analysisSelectedPlayers, analysisSelectedDemos: selectedAnalysisDemos, analysisPlayersLoading, analysisRows,
    analysisSide, analysisStatus, combinedAnalysis, demoData, demoRound, demoRoundLoading, demoTick,
    demoViewFlags, language,
    hasActiveFrameContext, mapName, modelLoadState, roomCode, utilityNoteCount: currentUtilityNotes.length,
    resetCamera: () => {
      if (!boardRef.current?.reset) return false;
      boardRef.current.reset();
      return true;
    },
    capture3DView: (request) => boardRef.current?.capture3DView?.(request),
    selectMap: setMapName,
    selectPanel: switchPanel,
    selectRound: setDemoRound,
    setDemoPlaying,
    setDemoTick,
  };
  useEffect(() => registerCsboardTools({
    maps: MAPS,
    getAnalysisContext: () => {
      const state = webMcpRuntimeRef.current;
      return getAnalysisModelContext({
        activePanel: state.activePanel, mapName: state.mapName, language: state.language,
        playersLoading: state.analysisPlayersLoading, status: state.analysisStatus,
        selectedPlayers: state.analysisSelectedPlayers, selectedDemos: state.analysisSelectedDemos,
        side: state.analysisSide, flags: state.demoViewFlags, rows: state.analysisRows,
        deaths: state.combinedAnalysis.deaths, utilities: state.combinedAnalysis.utilities,
      });
    },
    getFilteredAnalysisData: (request) => {
      const state = webMcpRuntimeRef.current;
      return getFilteredAnalysisData({
        mapName: state.mapName, selectedPlayers: state.analysisSelectedPlayers,
        selectedDemos: state.analysisSelectedDemos, playersLoading: state.analysisPlayersLoading,
        side: state.analysisSide, flags: state.demoViewFlags, rows: state.analysisRows,
        deaths: state.combinedAnalysis.deaths, utilities: state.combinedAnalysis.utilities,
      }, request);
    },
    getContext: () => {
      const state = webMcpRuntimeRef.current;
      return {
        map: state.mapName,
        panel: state.activePanel,
        model: state.modelLoadState,
        demo: state.demoData ? {
          fileName: state.demoData.demo.fileName,
          round: state.demoRound?.round || null,
          tick: state.demoTick,
          loadingRound: state.demoRoundLoading,
          availableRounds: state.demoData.rounds.map((round) => round.round),
        } : null,
        analysis: { selectedPlayers: state.analysisSelectedPlayers },
        collaborationRoomActive: Boolean(state.roomCode),
        utilityNoteCount: state.utilityNoteCount,
      };
    },
    capture3DView: async (request = {}) => {
      const state = webMcpRuntimeRef.current;
      const capture = await state.capture3DView(request);
      if (!capture) throw new Error('The 3D board is not ready yet.');
      const metadata = {
        schemaVersion: 1,
        image: { mimeType: capture.mimeType, bytes: capture.bytes, width: capture.width, height: capture.height, fit: capture.fit },
        camera: capture.camera,
        map: state.mapName,
        panel: state.activePanel,
        model: state.modelLoadState,
        demo: state.demoData ? { fileName: state.demoData.demo.fileName, round: state.demoRound?.round || null, tick: state.demoTick } : null,
        analysis: state.activePanel === 'analysis' ? {
          selectedPlayers: state.analysisSelectedPlayers,
          selectedDemos: state.analysisSelectedDemos.map((demo) => demo.data?.demo?.fileName || demo.fileName || demo.id),
          side: state.analysisSide,
          type: state.demoViewFlags.analysisMetric,
          display: state.demoViewFlags.heatStyle,
        } : null,
      };
      const content = [{ type: 'image', data: capture.data, mimeType: capture.mimeType }];
      if (request.includeContext !== false) content.push({ type: 'text', text: JSON.stringify(metadata) });
      return { content, ...(request.includeContext === false ? {} : { metadata }) };
    },
    selectMap: (map) => {
      const state = webMcpRuntimeRef.current;
      if (!MAPS.some((candidate) => candidate.id === map)) throw new Error(`Unsupported map: ${map}`);
      if (map !== state.mapName && state.activePanel === 'collab' && state.hasActiveFrameContext) {
        throw new Error('Switch maps through the visible UI while editing a collaboration frame.');
      }
      state.setDemoPlaying(false);
      state.selectMap(map);
      return { map };
    },
    selectPanel: (panel) => {
      const state = webMcpRuntimeRef.current;
      if (!['demo', 'analysis', 'utility', 'collab'].includes(panel)) throw new Error(`Unsupported panel: ${panel}`);
      if (state.activePanel === 'collab' && panel !== 'collab' && state.roomCode) throw new Error('Leave the active collaboration room through the visible UI first.');
      state.selectPanel(panel);
      return { panel };
    },
    selectDemoRound: (roundNumber) => {
      const state = webMcpRuntimeRef.current;
      if (!state.demoData) throw new Error('No parsed Demo is currently open.');
      const round = state.demoData.rounds.find((candidate) => candidate.round === Number(roundNumber));
      if (!round) throw new Error(`Round ${roundNumber} is not available in the current Demo.`);
      state.selectRound(round);
      return { round: round.round, startTick: round.startTick, endTick: round.endTick };
    },
    seekDemoTick: (requestedTick) => {
      const state = webMcpRuntimeRef.current;
      if (!state.demoData || !state.demoRound) throw new Error('Select a Demo round before seeking.');
      if (state.demoRoundLoading) throw new Error('The selected Demo round is still loading.');
      const tick = THREE.MathUtils.clamp(Number(requestedTick), state.demoRound.startTick, state.demoRound.endTick);
      state.setDemoPlaying(false);
      state.setDemoTick(tick);
      return { tick, clamped: tick !== Number(requestedTick) };
    },
    resetCamera: () => {
      if (!webMcpRuntimeRef.current.resetCamera()) throw new Error('The 3D board is not ready yet.');
      return { reset: true };
    },
  }), []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('csboard-nav-visibility', { detail: showNav }));
  }, [mapName, navData, showNav]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('csboard-map-floor', { detail: { mapName, floor: modelFloor } }));
  }, [mapName, navData, modelFloor]);
  useLayoutEffect(() => {
    const allowed = activePanel === 'utility' || activePanel === 'collab';
    document.querySelectorAll('.map-select option').forEach((option) => {
      const map = MAPS.find((item) => item.id === option.value);
      if (!map) return;
      option.textContent = language === 'zh' ? MAP_LABELS_ZH[map.id] || map.label : map.label;
      if (map.id === TUTORIAL_MAP_ID) {
        option.disabled = !allowed;
        option.hidden = !allowed;
      }
    });
    document.querySelectorAll('.demo-options').forEach((options) => {
      const buttons = options.querySelectorAll(':scope > button');
      if (buttons[0]) buttons[0].textContent = t('grid').toUpperCase();
      if (buttons[1]) buttons[1].textContent = `${t('trackpad').toUpperCase()} ${trackpadDetection ? t('on') : t('off')}`;
    });
  }, [activePanel, demoData, language, trackpadDetection]);
  const { currentLayerUrl, cycleFloor: cycleMapFloor, floorOptions, layers: currentMapLayers, selectFloor: selectMapFloor } = useMapFloorControls({ map2dLayer, mapName, modelFloor, setMap2dLayer, setModelFloor, t });
  return <main className={`board-shell${isMobile ? ' is-mobile' : ''}${!hasLeftSidebar || !leftSidebarOpen ? ' left-sidebar-collapsed' : ''}${hasRightSidebar && !rightSidebarOpen ? ' right-sidebar-collapsed' : ''}`} data-panel={activePanel} data-analysis-metric={demoViewFlags.analysisMetric}>
    {tutorialOfferOpen && <TutorialOffer language={language} devMode={IS_DEVELOPMENT_RUNTIME} onAccept={beginTutorial} onDecline={rememberTutorialOffer} />}
    <BoardHeader activePanel={activePanel} language={language} mapName={mapName} parseGameState={parseGameState} setLanguage={setLanguage} setMapName={setMapName} setParseGameManual={setParseGameManual} setParseGameState={setParseGameState} switchPanel={switchPanel} t={t} />
    <section className="board-stage">
         <DemoBatchPanel batch={demoBatch} counts={demoBatchCounts} development={IS_DEVELOPMENT_RUNTIME} language={language} onClose={clearDemoBatch} />
         {mapName === TUTORIAL_MAP_ID && <TutorialGuide language={language} open={tutorialOpen} step={tutorialStep} onOpen={() => { setTutorialStep(0); setTutorialOpen(true); }} onStep={moveTutorial} onFinish={finishTutorial} onExit={() => { finishTutorial(); setMapName('de_dust2'); }} />}
         {parseGameState !== 'hidden' && <div className={`parse-game-layer ${parseGameState}`}><SideGameHub language={language} stopped={!parseGameManual && parseGameState === 'stopped'} manual={parseGameManual} onClose={() => { setParseGameDismissed(true); setParseGameManual(false); setParseGameState('hidden'); }} /></div>}
        <ThreeBoard key={mapName} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelOpacity={modelOpacity} modelViewMode={modelViewMode} onModelViewRangeChange={setModelViewRange} trackpadDetection={trackpadDetection} showDemoNames={showDemoNames} demoSnapshot={activePanel === 'demo' ? demoSnapshot : utilityReplaySnapshot} demoSnapshots={activePanel === 'demo' ? demoSnapshots : []} demoTick={activePanel === 'demo' ? demoTick : utilityReplay?.tick || 0} demoFires={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'weapon_fire') || [] : []} demoHurts={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_hurt') || [] : []} demoGrenades={activePanel === 'demo' ? demoData?.events?.filter((event) => ['grenade_thrown', 'smokegrenade_detonate', 'smokegrenade_expired', 'inferno_startburn', 'inferno_expire', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate'].includes(event.event_name)) || [] : utilityReplay?.note.replay.events || []} demoProjectiles={activePanel === 'demo' ? demoProjectiles : utilityReplay?.note.replay.projectiles || []} demoSmokeVoxelFrames={activePanel === 'demo' ? demoSmokeVoxelFrames : utilityReplay?.note.replay.smokeVoxelFrames || []} demoInfernoFrames={activePanel === 'demo' ? demoInfernoFrames : utilityReplay?.note.replay.infernoFrames || []} demoGrenadeSegments={activePanel === 'demo' ? demoGrenadeSegments : utilityReplaySegments} onDemoGrenadeSelect={activePanel === 'demo' ? onDemoGrenadeSelect : null} demoDeaths={activePanel === 'demo' ? demoDeaths : []} demoC4Events={activePanel === 'demo' ? demoC4Events : []} demoHltvEvents={activePanel === 'demo' ? demoHltvEvents : []} demoCameraMode={activePanel === 'demo' ? demoCameraMode : 'manual'} onDemoCameraInterrupt={() => setDemoCameraMode('manual')} utilityFirstPerson={activePanel === 'utility' ? utilityFirstPerson : null} utilityProjectileFollow={activePanel === 'utility' ? utilityProjectileFollow : null} heatDeaths={activePanel === 'analysis' ? demoData?.events?.filter((event) => event.event_name === 'player_death') || [] : []} demoViewFlags={demoViewFlags} analysisRows={analysisRows} analysisUtilities={combinedAnalysis.utilities} analysisHighlightedUtilityId={analysisHighlightedUtilityId} analysisSelectedPlayers={analysisSelectedPlayers} analysisSide={analysisSide} analysisEnabled={activePanel === 'analysis'} analysisRounds={demoData?.rounds || []} analysisTime={analysisTime} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={onPointSelect} onGrenadeWheel={setGrenadeWheel} onCameraSlots={onCameraSlots} onReady={onReady} onModelLoadState={setModelLoadState} pointPlacementEnabled={activePanel === 'collab'} collabEditingEnabled={activePanel === 'collab' && hasActiveFrameContext} brushEnabled={true} brushColor={brushColor} brushWidth={brushWidth} eraserEnabled={eraserEnabled} onBrushChange={handleBrushChange} onCollabEdit={() => scheduleCollabSave()} />
         {isMobile && <MobileCameraWheel slots={cameraSlotState} active={activeCameraSlot} language={language} onRestore={(slot) => boardRef.current?.restoreCameraSlot?.(slot)} onSave={(slot) => boardRef.current?.saveCameraSlot?.(slot)} onReset={() => boardRef.current?.reset?.()} />}
         <div className="stage-vignette" />
          {activePanel === 'demo' && <DemoPovHud player={demoPovPlayer} firing={demoPovFiring} hurt={demoPovHurt} />}
          {activePanel === 'demo' && demoSnapshot && <div className="demo-combat-hud"><div className={`demo-score${roundWinner ? ` winner-${roundWinner.toLowerCase()}` : ''}`}><span><SideLogo side="T" /></span><strong>{demoScore.T}</strong><i>ROUND {demoRound?.round || '-'}{roundResult ? <b className="round-result">{roundResult}</b> : c4Countdown != null ? <b className={c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? 'c4-paused' : ''}>C4 {c4Countdown.toFixed(4)}s</b> : <b className="round-clock">{roundClock}</b>}{defuseProgress != null && <span className={`score-defuse${currentDefuser.hasDefuser ? ' has-kit' : ''}`} style={{ '--defuse-progress': `${defuseProgress * 360}deg` }}><i>{currentDefuser.hasDefuser ? 'KIT' : '10s'}</i></span>}</i><strong>{demoScore.CT}</strong><span><SideLogo side="CT" /></span></div>{demoKills.length > 0 && <DemoKillFeed kills={demoKills} round={demoRound} translate={t} collapsed={demoKillsCollapsed} onToggle={() => setDemoKillsCollapsed((collapsed) => !collapsed)} />}</div>}
      {demoData?.demo.map && demoData.demo.map !== mapName && <ModelControlsPortal selector=".demo-source-controls"><button type="button" className="demo-map-mismatch" onClick={() => setMapName(demoData.demo.map)}><span>{localize(language, { zh: '地图不匹配', en: 'MAP MISMATCH', ru: 'КАРТА НЕ СОВПАДАЕТ' })}</span><b>{mapName.toUpperCase()} → {demoData.demo.map.toUpperCase()}</b></button></ModelControlsPortal>}
       {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>{t('smoke')}</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>{t('fire')}</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>{t('flash')}</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>{t('grenade')}</div><span className="wheel-key">Q</span></div>}
      {saveArchiveModal && <SaveArchiveModal archives={archives} draftName={saveArchiveName} language={language} mapName={mapName} mode={saveArchiveMode} onClose={() => setSaveArchiveModal(false)} onDraftNameChange={setSaveArchiveName} onSave={saveWorkspaceArchive} onSelectedChange={setSaveArchiveSelected} selected={saveArchiveSelected} t={t} />}
      {renameModal && <RenamePointModal draft={renameDraft} onClose={() => setRenameModal(null)} onConfirm={confirmRename} onDraftChange={setRenameDraft} t={t} />}
            <ViewTools activeCameraSlot={activeCameraSlot} boardRef={boardRef} brushColor={brushColor} brushWidth={brushWidth} cameraSlotState={cameraSlotState} currentLayerUrl={currentLayerUrl} currentMapLayers={currentMapLayers} cycleMapFloor={cycleMapFloor} eraserEnabled={eraserEnabled} floorOptions={floorOptions} language={language} map2dLayer={map2dLayer} modelFloor={modelFloor} radarOverlay={radarOverlay} selectMapFloor={selectMapFloor} setBrushColor={setBrushColor} setBrushWidth={setBrushWidth} setEraserEnabled={setEraserEnabled} t={t} />
           <div className="key-hints">{activePanel === 'demo' || activePanel === 'analysis' ? <><div className="key-group"><b>{t('hintCatEdit')}</b><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintBrushDrag')}</span><span><kbd>CTRL+LMB</kbd>{t('hintErase')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span></div><div className="key-group"><b>{t('hintCatPlayback')}</b><span><kbd>SPACE</kbd>{t('hintPlayPause')}</span><span><kbd>← →</kbd>{t('hintStep')}</span></div><div className="key-group"><b>{t('hintCatCamera')}</b><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>MMB</kbd>{t('hintRotate')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></> : activePanel === 'utility' ? <><div className="key-group"><b>{t('hintCatEdit')}</b><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintBrushDrag')}</span><span><kbd>CTRL+LMB</kbd>{t('hintErase')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span></div><div className="key-group"><b>{t('hintCatCamera')}</b><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></> : <><div className="key-group"><span><kbd>E</kbd>{t('hintPlacePoint')}</span><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintMovePlayer')}</span><span><kbd>CTRL+LMB</kbd>{t('hintYaw')}</span><span><kbd>SHIFT+LMB</kbd>{t('hintPitch')}</span><span><kbd>DBL</kbd>{t('hintCrouch')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>MMB</kbd>{t('hintRotate')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></>}</div>
          <div className="aspect-frame" aria-hidden="true"><i /></div>
           {activePanel === 'demo' && demoSnapshot && <><DemoRoster side="T" players={demoTeams.T} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} povPlayerId={demoPovPlayerId} noGrenadesLabel={t('noGrenades')} /><DemoRoster side="CT" players={demoTeams.CT} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} povPlayerId={demoPovPlayerId} noGrenadesLabel={t('noGrenades')} /></>}
          {selectedPoint && selectedPointScreen && <div className="point-actions" style={{ left: selectedPointScreen.x, top: selectedPointScreen.y }}><span>{activePanel === 'collab' ? t('collabPlayer') : t('tacticalPoint')}</span><div className="point-choice"><b>{t('team')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div>{activePanel === 'collab' ? null : <div className="point-choice"><b>{t('type')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'X' })}>X</button></div>}<button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); setSelectedPointScreen(null); }}>{t('delete')}</button></div>}
          {activePanel === 'demo' && selectedDemoGrenade && selectedDemoGrenadeScreen && <div className="demo-grenade-actions" style={{ left: selectedDemoGrenadeScreen.x, top: selectedDemoGrenadeScreen.y }}><div><strong>{selectedDemoGrenade.kind.toUpperCase()}</strong><span>{selectedDemoGrenade.throwEvent.user_name || t('unknown')} · T{selectedDemoGrenade.throwTick}</span></div><button type="button" onClick={saveDemoGrenade}>{t('saveUtility')}</button><button type="button" className="close" aria-label={t('cancel')} onClick={() => { setSelectedDemoGrenade(null); setSelectedDemoGrenadeScreen(null); }}>×</button></div>}
          {activePanel === 'analysis' && demoViewFlags.analysisMetric === 'utility' && demoViewFlags.heatStyle === 'points' && analysisUtilityHover && !selectedAnalysisUtility && <div className="utility-hover-card analysis-utility-hover-card" style={{ left: analysisUtilityHover.x, top: analysisUtilityHover.y }} onPointerEnter={() => { analysisUtilityHoverInsideRef.current = true; window.clearTimeout(analysisUtilityHoverTimerRef.current); }} onPointerLeave={() => { analysisUtilityHoverInsideRef.current = false; window.clearTimeout(analysisUtilityHoverTimerRef.current); setAnalysisUtilityHover(null); setAnalysisHighlightedUtilityId(''); }}><header><strong>{localize(language, { zh: '附近道具', en: 'NEARBY UTILITIES', ru: 'ГРАНАТЫ РЯДОМ' })}</strong><span>{analysisUtilityHover.utilities.length}</span></header><div className="utility-hover-list">{analysisUtilityHover.utilities.map((utility) => <button type="button" key={utility.id} className="replayable" onPointerEnter={() => setAnalysisHighlightedUtilityId(utility.id)} onPointerLeave={() => setAnalysisHighlightedUtilityId('')} onFocus={() => setAnalysisHighlightedUtilityId(utility.id)} onBlur={() => setAnalysisHighlightedUtilityId('')} onClick={() => { setSelectedAnalysisUtility(utility); setSelectedAnalysisUtilityScreen({ x: analysisUtilityHover.x, y: analysisUtilityHover.y }); setAnalysisUtilityHover(null); setAnalysisHighlightedUtilityId(''); setAnalysisPlaying(false); }}><strong><RawIcon name={ANALYSIS_UTILITY_ICONS[utility.kind]} />{utility.kind.toUpperCase()}</strong><span>{utility.segment.throwEvent.user_name || t('unknown')} · R{utility.source.round} · T{utility.segment.throwTick}</span><p>{utility.source.fileName}</p></button>)}</div></div>}
          {activePanel === 'analysis' && demoViewFlags.analysisMetric === 'utility' && demoViewFlags.heatStyle === 'points' && selectedAnalysisUtility && selectedAnalysisUtilityScreen && <div className="demo-grenade-actions analysis-grenade-actions" style={{ left: selectedAnalysisUtilityScreen.x, top: selectedAnalysisUtilityScreen.y }}><div><strong>{selectedAnalysisUtility.kind.toUpperCase()}</strong><span>{selectedAnalysisUtility.segment.throwEvent.user_name || t('unknown')} · {selectedAnalysisUtility.source.fileName} · R{selectedAnalysisUtility.source.round}</span></div><button type="button" onClick={saveAnalysisUtility}>{t('saveUtility')}</button><button type="button" className="close" aria-label={t('cancel')} onClick={() => { setSelectedAnalysisUtility(null); setSelectedAnalysisUtilityScreen(null); }}>×</button></div>}
        <div className="board-tools"><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> {t('grid')}</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}><i /> {t('trackpad')} {trackpadDetection ? t('on') : t('off')}</button><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)} className={showModel ? 'selected' : ''}><i /> {modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) setShowModel(false); else { setShowModel(true); setModelViewMode(option.value); } setModeMenuOpen(false); }} /> <span>{option.label}</span></label>)}</div>}</div></div>
          {activePanel === 'utility' && <aside className="utility-notes-panel"><div className="utility-notes-heading"><div><span>UTILITY NOTES</span><h2>{t('utilityNotes')}</h2></div><button type="button" onClick={() => { setUtilityDraft({ getpos: '', name: '', summary: '' }); setUtilityError(''); setUtilityModalOpen(true); }}>{t('addUtilityNote')}</button></div><p>{t('utilityIntro')}</p><div className="utility-notes-meta"><label className="map-select"><span>{t('map').toUpperCase()}</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><span>{t('utilityCount', { count: currentUtilityNotes.length })}</span></div><div className="utility-model-options"><label className="model-opacity"><span>{t('model').toUpperCase()}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="utility-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div></div>{currentUtilityNotes.length === 0 && <div className="utility-empty">{t('utilityEmpty')}</div>}<small>{t('localOnly')}</small></aside>}
          {activePanel === 'utility' && <aside className="utility-location-panel"><header><strong>{t('utilityLocations')}</strong><span>{currentUtilityGroups.length}</span></header>{currentUtilityGroups.length === 0 ? <div className="utility-location-empty">{t('utilityEmpty')}</div> : <div className="utility-location-groups" onPointerLeave={() => boardRef.current?.clearCollabUtilityPreview?.()} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) boardRef.current?.clearCollabUtilityPreview?.(); }}>{currentUtilityGroups.map(({ location, categories }) => <section key={location}><div className="utility-location-heading"><strong>{location}</strong><span>{categories.reduce((sum, [, entries]) => sum + entries.length, 0)}</span></div>{categories.map(([kind, entries]) => <div className="utility-category" key={kind}><span>{kind === 'smoke' ? 'SMOKE' : kind === 'flash' ? 'FLASH' : kind === 'fire' ? 'FIRE' : kind === 'he' ? 'HE' : kind === 'decoy' ? 'DECOY' : 'CUSTOM'}</span>{entries.map((note) => <button type="button" key={note.id} className={note.replay ? 'replayable' : ''} onPointerEnter={() => boardRef.current?.focusUtilityNote?.(note)} onFocus={() => boardRef.current?.focusUtilityNote?.(note)} onClick={() => { setUtilityHover({ key: note.positionKey, entries: note.positionEntries, x: 330, y: Math.max(150, window.innerHeight / 2 - 36) }); setSelectedUtilityNote(note); setUtilityCopied(false); }}><b>{note.name}</b><small>{note.thrower || t('customUtility')}</small></button>)}</div>)}</section>)}</div>}</aside>}
           {activePanel === 'utility' && utilityHover && <div className="utility-hover-card" style={{ left: utilityHover.x, top: utilityHover.y }} onPointerEnter={() => { utilityHoverInsideRef.current = true; window.clearTimeout(utilityHoverTimerRef.current); }} onPointerLeave={() => { utilityHoverInsideRef.current = false; utilityHoverTimerRef.current = window.setTimeout(() => { setUtilityHover(null); setSelectedUtilityNote(null); setUtilityEditDraft(null); }, 180); }}><header><strong>{selectedUtilityNote ? t('utilityDetails') : 'LOCATION'}</strong><span>{selectedUtilityNote ? <button type="button" onClick={() => { setSelectedUtilityNote(null); setUtilityEditDraft(null); }}>←</button> : utilityHover.entries.length}</span></header>{selectedUtilityNote ? <div className="utility-detail">{utilityEditDraft ? <form className="utility-edit-form" onSubmit={saveUtilityEdit}><label><span>{t('utilityTitle')}</span><input required value={utilityEditDraft.name} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('utilityDescription')}</span><textarea required value={utilityEditDraft.summary} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label><div><button type="button" onClick={() => setUtilityEditDraft(null)}>{t('cancel')}</button><button type="submit">{t('saveUtilityEdit')}</button></div></form> : <><strong>{selectedUtilityNote.name}</strong><p>{selectedUtilityNote.summary}</p></>}<dl><div><dt>{t('map')}</dt><dd>{selectedUtilityNote.mapName}</dd></div>{selectedUtilityNote.startPlace && <div><dt>{t('startPlace')}</dt><dd>{selectedUtilityNote.startPlace}</dd></div>}{selectedUtilityNote.throwPlace && <div><dt>{t('throwPlace')}</dt><dd>{selectedUtilityNote.throwPlace}</dd></div>}<div><dt>{t('position')}</dt><dd>{selectedUtilityNote.position.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('angles')}</dt><dd>{selectedUtilityNote.angles.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('exportedBy')}</dt><dd>{selectedUtilityNote.thrower || t('customUtility')}</dd></div>{selectedUtilityNote.demoSource && <div><dt>{t('sourceDemo')}</dt><dd>{selectedUtilityNote.demoSource.fileName} · R{selectedUtilityNote.demoSource.round || '-'} · T{selectedUtilityNote.demoSource.tick}</dd></div>}<div><dt>{t('exportedAt')}</dt><dd>{new Date(selectedUtilityNote.createdAt).toLocaleString(localeForLanguage(language))}</dd></div></dl><div className="utility-detail-actions"><button type="button" onClick={() => setUtilityEditDraft({ name: selectedUtilityNote.name, summary: selectedUtilityNote.summary || '' })}>{t('editUtility')}</button><button type="button" onClick={() => copyUtilityCommand(selectedUtilityNote)}>{utilityCopied ? t('copied') : t('getposCommand')}</button><button type="button" className="utility-delete" onClick={() => deleteUtilityNote(selectedUtilityNote)}>{t('delete')}</button>{selectedUtilityNote.replay && <><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote)}>{t('replayUtility')}</button><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote, true)}>{t('replayUtilityFirstPerson')}</button></>}</div></div> : <div className="utility-hover-list">{utilityHover.entries.map((note) => <button type="button" key={note.id} className={`utility-list-entry${note.replay ? ' replayable' : ''}`} onClick={() => { setSelectedUtilityNote(note); setUtilityEditDraft(null); setUtilityCopied(false); }}><strong>{note.name}</strong><span>{t('angles')}: {(note.angles || [0, 0, 0]).map((value) => Number(value).toFixed(2)).join(' / ')}</span><p>{note.summary}</p></button>)}</div>}</div>}
          {activePanel === 'utility' && utilityReplay && <div className="utility-replay-bar"><strong>{utilityReplay.note.name}</strong><span>{(utilityReplay.tick / utilityReplay.note.replay.tickRate).toFixed(1)}s / {(utilityReplay.note.replay.endTick / utilityReplay.note.replay.tickRate).toFixed(1)}s</span><button type="button" onClick={() => setUtilityReplay((current) => ({ ...current, tick: current.playing ? current.tick : current.tick >= current.note.replay.endTick ? 0 : current.tick, playing: !current.playing }))}>{utilityReplay.playing ? t('pause') : t('play')}</button><button type="button" onClick={() => setUtilityReplay(null)}>×</button></div>}
         {utilityModalOpen && <UtilityNoteModal draft={utilityDraft} error={utilityError} onClose={() => setUtilityModalOpen(false)} onDraftChange={setUtilityDraft} onSubmit={addUtilityNote} t={t} />}
         {anonymousUtilitySave && <SaveAnonymousUtilityModal draft={anonymousUtilityDraft} error={anonymousUtilityError} kind={anonymousUtilitySave.kind} onClose={() => setAnonymousUtilitySave(null)} onDraftChange={setAnonymousUtilityDraft} onSubmit={saveAnonymousUtility} t={t} />}
          <div className={`demo-panel ${activePanel === 'demo' ? '' : 'panel-hidden'}${demoData ? ' has-demo' : ''}`}>
           {activePanel === 'demo' && <DemoDataWarning warnings={demoData?.warnings} translate={t} />}
           <div className="demo-toolbar"><div className="demo-source-controls"><label className={`demo-upload${demoBatchRunning ? ' disabled' : ''}`}><span>{t('multiDemo')}</span><input type="file" accept=".dem" multiple disabled={demoBatchRunning} onChange={loadDemo} /><b>{t('chooseDemo')}</b></label>{demoStatus && !demoData ? <span className="demo-status">{demoStatus}</span> : <div className="demo-cache-picker"><button type="button" onClick={() => setDemoCacheOpen((open) => !open)}>{t('parsedDemos')} · {cachedDemos.length}</button>{demoCacheOpen && <div className="demo-cache-list"><header><strong>{t('parsedDemos')}</strong><button type="button" onClick={() => setDemoCacheOpen(false)}>×</button></header>{cachedDemos.length === 0 ? <div className="demo-cache-empty">{t('noCachedDemos')}</div> : cachedDemos.map((entry) => <article key={entry.id}><button type="button" className="demo-cache-open" onClick={() => openCachedDemo(entry.id)}><strong>{entry.fileName}</strong><span>{entry.map} · {entry.rounds} {t('round')}</span><small>{formatBytes((entry.dataBytes || 0) + (entry.analysisBytes || 0))} / {formatBytes(entry.sourceBytes)} · {new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))}</small></button><button type="button" className="demo-cache-delete" aria-label={t('deleteCachedDemo')} title={t('deleteCachedDemo')} onClick={() => removeCachedDemo(entry.id)}>×</button></article>)}</div>}</div>}{demoData && <span className="demo-name">{demoData.demo.map} / {demoData.demo.fileName}</span>}</div><div className="demo-playback-controls">{demoData && <div className={`demo-round-picker${demoRoundMenuOpen ? ' open' : ''}`}><button type="button" onClick={() => setDemoRoundMenuOpen((open) => !open)}>{demoRound ? `${t('round')} ${demoRound.round} · ${demoRoundEconomies.get(demoRound.round)?.T.label}/${demoRoundEconomies.get(demoRound.round)?.CT.label}` : t('selectRound')}</button>{demoRoundMenuOpen && <div className="demo-round-list">{demoData.rounds.map((round) => { const economy = demoRoundEconomies.get(round.round); return <button type="button" key={round.round} className={demoRound?.round === round.round ? 'active' : ''} style={{ '--economy-split': `${economy?.split ?? 50}%` }} onClick={() => { setDemoRound(round); setDemoRoundMenuOpen(false); }}><span className="economy-t">T {economy?.T.label}</span><strong>R{round.round}</strong><span className="economy-ct">CT {economy?.CT.label}</span><i /></button>; })}</div>}</div>}{demoData && demoRound && <div className="demo-scrub"><span className="demo-time">{((demoTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span><div className="timeline-track"><input className="demo-timeline" disabled={demoRoundLoading} style={{ '--timeline-progress': `${demoRound.endTick > demoRound.startTick ? ((demoTick - demoRound.startTick) / (demoRound.endTick - demoRound.startTick)) * 100 : 0}%` }} type="range" min={demoRound.startTick} max={demoRound.endTick} step="1" value={demoTick} onPointerUp={(event) => event.currentTarget.blur()} onChange={(event) => { setDemoPlaying(false); setDemoTick(Number(event.target.value)); }} />{timelineEvents.map((event, index) => <button type="button" className={`timeline-event event-${event.event_name}`} title={event.title} aria-label={event.title} style={{ left: `${((event.tick - demoRound.startTick) / Math.max(1, demoRound.endTick - demoRound.startTick)) * 100}%` }} key={`${event.event_name}-${event.tick}-${index}`} onClick={() => { setDemoPlaying(false); setDemoTick(event.tick); }}>{event.label}</button>)}</div><span className="demo-duration">/ {((demoRound.endTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span></div>}{demoRound && <button type="button" className="demo-play" disabled={demoRoundLoading} onClick={() => setDemoPlaying((playing) => !playing)}>{demoRoundLoading ? t('loading') : demoPlaying ? t('pause') : t('play')}</button>}<button type="button" className="demo-save-frame" onClick={() => openSaveArchiveModal(true)}>{t('saveFrame')}</button></div></div>
              <DemoParseSettings value={demoSampleRate} onChange={setDemoSampleRate} language={language} />
             {demoStatus && !demoData && <div className="demo-loading-wrap"><div className="demo-loading" role="progressbar" aria-label="Demo parsing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(demoParseProgress)}><i style={{ width: `${demoParseProgress}%` }} /><span>{Math.floor(demoParseProgress)}%</span></div><p className="demo-parsing-hint">{t('demoForegroundParsingHint')}</p></div>}
            <div className="demo-controls-row">{activePanel === 'demo' && demoData && <div className="demo-view-options"><span>{t('view')}</span><button type="button" className={showDemoNames ? 'selected' : ''} onClick={() => setShowDemoNames((value) => !value)}>{t('showNames')}</button>{[['manual','cameraManual'],['follow','cameraFollow'],['fixed','cameraFixed'],['chase','cameraChase']].map(([mode,key]) => <button type="button" key={mode} className={demoCameraMode === mode ? 'selected' : ''} onClick={() => setDemoCameraMode(mode)}>{t(key)}</button>)}</div>}<div className="demo-options"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}>GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}>TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><label className="model-opacity"><span>MODEL</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="demo-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}>EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET</button></div></div>
          </div>
          {activePanel === 'analysis' && <AnalysisPanel language={language} translate={t} mapName={mapName} status={analysisStatus} players={analysisPlayers} playersLoading={analysisPlayersLoading} selectedPlayers={analysisSelectedPlayers} playerQuery={analysisPlayerQuery} onPlayerQueryChange={setAnalysisPlayerQuery} onPlayerToggle={toggleAnalysisPlayer} onPlayersClear={clearAnalysisPlayers} demos={analysisDemosForPlayers} selectedDemoIds={analysisSelectedDemoIds} onToggleDemo={(id) => setAnalysisSelectedDemoIds((selected) => selected.includes(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id])} side={analysisSide} onSideChange={(value) => { setAnalysisSide(value); setAnalysisTime(0); setAnalysisPlaying(false); }} rowsAvailable={analysisRows.length > 0} playing={analysisPlaying} onTogglePlay={() => setAnalysisPlaying((playing) => !playing)} time={analysisTime} duration={analysisDuration} onTimeChange={(value) => { setAnalysisPlaying(false); setAnalysisTime(value); }} />}
          {activePanel === 'collab' && <aside className="collab-panel"><div className="collab-heading"><div><span>COLLABORATION</span><h2>{t('collab')}</h2></div><div className="collab-actions"><button type="button" onClick={() => openSaveArchiveModal()}>{t('saveFrame')}</button>{roomCode ? <button type="button" onClick={leaveRoom}>{t('leaveRoom')}</button> : <button type="button" onClick={() => { const code = window.prompt(t('roomPrompt'), roomJoinCode); if (code != null) { setRoomJoinCode(code); joinRoom(code); } }}>{t('joinRoom')}</button>}<button type="button" disabled={Boolean(roomCode)} onClick={openRoom}>{t('openRoom')}</button></div></div><p className="collab-note">{t('currentMap')}: {mapName} · {t('name')}: {clientName.current}<br />{t('collabHint')}</p>{roomStatus && <div className="analysis-status">{roomStatus}</div>}{roomCode && <div className="room-open"><strong>{t('room')} {roomCode}</strong><span>{roomOwner ? t('owner') : t('member')}</span></div>}<div className="archive-list">{archives.filter((archive) => archive.mapName === mapName).length === 0 ? <div className="archive-empty">{t('noArchives')}</div> : archives.filter((archive) => archive.mapName === mapName).map((archive) => <div className="archive-item" key={archive.id}><button type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t('guestNoArchive') : t('restoreArchive')} onClick={() => restoreWorkspaceArchive(archive)}><strong>{archive.name || archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</span><small>{archive.frames && archive.frames.length ? `${archive.frames.length} ${t('frames')}${archive.demo ? ` · ${t('manualEdit')}` : ''}` : archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t('manualEdit')}</small></button><button type="button" className="archive-save" aria-label={t('overwriteArchive')} title={t('overwriteArchive')} onClick={() => openOverwriteArchiveModal(archive.id)}>{t('save')}</button><button type="button" className="archive-delete" aria-label={t('deleteArchive')} title={t('deleteArchive')} onClick={() => deleteWorkspaceArchive(archive.id)}>×</button></div>)}<button type="button" className="archive-new-save" onClick={openNewArchiveModal}>＋ {t('saveNewArchive')}</button></div></aside>}
           {activePanel === 'collab' && hasActiveFrameContext && <aside className="collab-objects"><div className="collab-objects-tabs"><button type="button" className={collabObjectTab === 'players' ? 'active' : ''} onClick={() => setCollabObjectTab('players')}>{t('collabPlayers')}</button><button type="button" className={collabObjectTab === 'utility' ? 'active' : ''} onClick={() => setCollabObjectTab('utility')}>{t('addUtility')}</button></div>{collabObjectTab === 'players' ? <div className="collab-players">{activeCollabPlayers().length === 0 ? <div className="archive-empty">{t('noCollabPlayers')}</div> : <div className="collab-player-list" onPointerLeave={() => boardRef.current?.clearCollabUtilityPreview?.()}>{activeCollabPlayers().map((player) => <div className="collab-player-item" key={player.name} onPointerEnter={() => boardRef.current?.focusCollabPlayer?.(player.id)}><span className="collab-player-name">{player.name}</span><button type="button" className="collab-player-rename" onClick={() => openRenameModal(player.id, player.name)}>{t('rename')}</button><div className="collab-player-team" aria-label={t('team')}>{['T', 'CT'].map((team) => <button type="button" key={team} className={(player.team || 'T') === team ? 'active' : ''} aria-pressed={(player.team || 'T') === team} onClick={() => setPointUpdate({ id: player.id, team })}>{team}</button>)}</div></div>)}</div>}</div> : <div className="collab-utility"><label className="collab-utility-search"><span>{t('addUtility')}</span><input type="text" value={collabUtilitySearch} placeholder={t('searchUtility')} onChange={(event) => setCollabUtilitySearch(event.target.value)} /><select value={''} onChange={(event) => { const id = event.target.value; if (!id) return; const note = currentUtilityNotes.find((candidate) => candidate.id === id); if (note) boardRef.current?.addCollabUtility?.(note); setCollabUtilitySearch(''); event.target.value = ''; }}>{[...currentUtilityNotes].sort((left, right) => left.grenadeType?.localeCompare?.(right.grenadeType || 'custom') || 0).filter((note) => `${note.name} ${note.summary || ''} ${note.thrower || ''}`.toLowerCase().includes(collabUtilitySearch.trim().toLowerCase())).map((note) => <option key={note.id} value={note.id}>{note.name} · {note.grenadeType || 'custom'}{note.thrower ? ` · ${note.thrower}` : ''}</option>)}</select></label></div>}</aside>}
           {activePanel === 'collab' && hasActiveFrameContext && collabObjectTab === 'utility' && <CollabUtilityPortal><div className="collab-utility-manager"><header><strong>{t('importedUtilities')}</strong><button type="button" onClick={() => { boardRef.current?.clearCollabUtilityPreview?.(); setCollabUtilityPickerOpen(true); setCollabUtilitySelected(''); }}>{t('addUtility')}</button></header>{collabUtilityPickerOpen ? <div className="collab-utility-picker"><label className="collab-utility-search"><span>{t('selectUtility')}</span><input type="text" value={collabUtilitySearch} placeholder={t('searchUtility')} onChange={(event) => { setCollabUtilitySearch(event.target.value); setCollabUtilitySelected(''); boardRef.current?.clearCollabUtilityPreview?.(); }} /></label><div className="collab-utility-options" onPointerLeave={() => boardRef.current?.clearCollabUtilityPreview?.()}>{collabUtilityOptions.length === 0 ? <div className="archive-empty">{t('utilityEmpty')}</div> : collabUtilityOptions.map((note) => <button type="button" key={note.id} className={collabUtilitySelected === note.id ? 'selected' : ''} onPointerEnter={() => boardRef.current?.previewCollabUtility?.(note)} onFocus={() => boardRef.current?.previewCollabUtility?.(note)} onClick={() => setCollabUtilitySelected(note.id)}><span><b>{note.name}</b><em>{note.grenadeType || 'custom'}</em></span><small>{note.summary || note.thrower || t('customUtility')}</small></button>)}</div><div className="collab-utility-picker-actions"><button type="button" onClick={cancelCollabUtilityImport}>{t('cancel')}</button><button type="button" disabled={!collabUtilitySelected} onClick={confirmCollabUtilityImport}>{t('confirmAdd')}</button></div></div> : activeImportedUtilities().length === 0 ? <div className="archive-empty">{t('noImportedUtilities')}</div> : <div className="collab-imported-list" onPointerLeave={() => boardRef.current?.clearCollabUtilityPreview?.()}>{activeImportedUtilities().map((item) => <div className={`collab-imported-item${item.anonymous ? ' anonymous' : ''}`} key={item.id} onPointerEnter={() => { if (item.anonymous) boardRef.current?.focusCollabUtility?.(item.id); }}><div><strong>{item.anonymous ? t('anonymousUtility') : item.noteName || t('unknown')}</strong><span>{item.kind || 'custom'}</span></div><div className="collab-imported-actions">{item.anonymous && <button type="button" className="save" onClick={() => openAnonymousUtilitySave(item)}>{t('save')}</button>}<button type="button" onClick={() => deleteImportedUtility(item.id)}>{t('delete')}</button></div></div>)}</div>}</div></CollabUtilityPortal>}
             {activePanel === 'utility' && <UtilityNotesActionsPortal><div className="utility-io-actions"><button type="button" onClick={() => { setUtilityImportNotice(''); utilityImportInputRef.current?.click(); }}>{t('importNotes')}</button><button type="button" onClick={exportUtilityNotes}>{t('exportNotes')}</button><input ref={utilityImportInputRef} type="file" accept="application/json,.json" onChange={importUtilityNotes} />{utilityImportNotice && <span>{utilityImportNotice}</span>}</div></UtilityNotesActionsPortal>}
             {activePanel === 'collab' && roomCode && <RoomPresencePortal><div className="room-presence"><header><span>{t('currentUsers')}</span><b>{roomUsers.length}</b></header><div className="room-user-list">{roomUsers.map((user) => <div key={user.clientId}><i className={user.owner ? 'owner' : ''} /><strong>{user.name}</strong><span>{user.current ? t('you') : user.owner ? t('owner') : t('member')}</span></div>)}</div>{roomActivity.length > 0 && <div className="room-activity" aria-live="polite">{roomActivity.map((event) => <span key={event.id}>{event.text}</span>)}</div>}</div></RoomPresencePortal>}
            <CameraHintsPortal><span><kbd>1-0</kbd>{t('hintCameraRestore')}</span><span><kbd>CTRL+1-0</kbd>{t('hintCameraSave')}</span></CameraHintsPortal>
            {activePanel === 'collab' && hasActiveFrameContext && <div className="collab-frame-strip"><div className="collab-frame-timeline">{frames.map((frame, index) => <button type="button" key={frame.id} aria-label={`${t('frame')} ${index + 1}`} className={`collab-frame-dot${frame.id === activeFrameId ? ' active' : ''}`} onClick={() => switchFrame(frame.id)}><i /><small>{index + 1}</small></button>)}</div><div className="collab-frame-actions"><button type="button" title="Ctrl+Z" onClick={() => boardRef.current?.undoCollab?.()}>{t('hintUndo')}</button><button type="button" title="Ctrl+Y" onClick={() => boardRef.current?.redoCollab?.()}>{t('hintRedo')}</button><button type="button" onClick={insertFrame}>{t('insertFrame')}</button><button type="button" onClick={duplicateFrame}>{t('duplicateFrame')}</button><button type="button" onClick={deleteFrame} disabled={frames.length <= 1}>{t('deleteFrame')}</button></div></div>}
        {activePanel === 'analysis' && <AnalysisOptionsPortal><AnalysisControls language={language} translate={t} flags={demoViewFlags} setFlags={setDemoViewFlags} playerName={analysisPlayerName} economyAvailability={analysisEconomyAvailability} onToggleEconomy={toggleAnalysisEconomy} onStopPlayback={() => setAnalysisPlaying(false)} IconComponent={RawIcon} /></AnalysisOptionsPortal>}
        <div className="workspace-bottom-bar">
          {activePanel === 'analysis' && analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-bottom-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}
        </div>
        {navData && <ModelControlsPortal selector={modelControlsTarget}><div className="model-visual-controls nav-visual-controls"><button type="button" className={`nav-visibility-toggle${showNav ? ' selected' : ''}`} aria-pressed={showNav} onClick={() => setShowNav((visible) => !visible)}>{t('navGround')} {showNav ? t('on') : t('off')}</button></div></ModelControlsPortal>}
        <ModelControlsPortal selector={modelControlsTarget}><div className="model-visual-controls"><ModelLoadIndicator state={modelLoadState} language={language} /><label className="model-opacity"><span>{t('model').toUpperCase()}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><label className="model-opacity"><span>{t('viewRange')}</span><input type="range" min="0" max="1" step="0.01" value={modelViewRange} onChange={(event) => setModelViewRange(Number(event.target.value))} /><b>{Math.round(modelViewRange * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="workspace-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div></div></ModelControlsPortal>
        {hasLeftSidebar && <button type="button" className="sidebar-toggle sidebar-toggle-left" aria-label={leftSidebarOpen ? localize(language, { zh: '收起左栏', en: 'Collapse left sidebar', ru: 'Свернуть левую панель' }) : localize(language, { zh: '展开左栏', en: 'Expand left sidebar', ru: 'Развернуть левую панель' })} onClick={() => setLeftSidebarOpen((open) => !open)}>{leftSidebarOpen ? '‹' : '›'}</button>}
        {hasRightSidebar && <button type="button" className="sidebar-toggle sidebar-toggle-right" aria-label={rightSidebarOpen ? localize(language, { zh: '收起右栏', en: 'Collapse right sidebar', ru: 'Свернуть правую панель' }) : localize(language, { zh: '展开右栏', en: 'Expand right sidebar', ru: 'Развернуть правую панель' })} onClick={() => setRightSidebarOpen((open) => !open)}>{rightSidebarOpen ? '›' : '‹'}</button>}
     </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
