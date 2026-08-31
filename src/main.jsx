import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import fallbackNavData from './data/de_dust2.json';
import { createNavMesh } from './three/navMesh.js';
import { parseNavBuffer, fetchAndParseNav } from './navParser.js';
import { createGhostMaterial } from './three/materials.js';
import { createTacticalPoint, updateTacticalPoint } from './three/tacticalPoint.js';
import { createCollabPlayer, randomPlayerName, renameCollabPlayer, setCollabPlayerCrouch, setCollabPlayerPitch, setCollabPlayerTeam, updateCollabPlayerAim } from './three/collabPlayer.js';
import { createFireNavEffect, createGrenadeEffect, disposeGrenadeEffect, grenadeTypeFromPointer } from './three/grenadeEffects.js';
import { countCachedDemoRounds, deleteCachedDemo, demoCacheId, getCachedDemo, getCachedDemoRound, listCachedDemos, putCachedDemo, putCachedDemoRound } from './demoCache.js';
import SideGameHub from './SideGameHub.jsx';
import './styles.css';
import { csIconUrl } from './assets/cs-icon-urls.js';
import { map2dLayers } from './assets/map-2d-urls.js';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const OSS_BASE = String(import.meta.env.VITE_OSS_BASE_URL || '').replace(/\/$/, '');
const USE_LOCAL_MAPS = import.meta.env.DEV || import.meta.env.VITE_USE_LOCAL_MAPS === 'true';
const MAP_BASE = USE_LOCAL_MAPS || !OSS_BASE ? '/maps' : `${OSS_BASE}/maps`;
const BACKEND_BASE = String(import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');
const collaborationUrl = () => {
  const url = new URL(BACKEND_BASE || location.origin, location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/rooms';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

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

const CLIENT_ADJECTIVES = ['Bright', 'Calm', 'Clever', 'Cool', 'Fresh', 'Gentle', 'Happy', 'Jolly', 'Kind', 'Lucky', 'Quick', 'Sunny'];
const CLIENT_FRUITS = ['Apple', 'Berry', 'Cherry', 'Grape', 'Kiwi', 'Lemon', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Plum'];
const generatedClientNames = new Set(CLIENT_ADJECTIVES.flatMap((adjective) => CLIENT_FRUITS.map((fruit) => `${adjective} ${fruit}`)));
const generateClientName = () => `${CLIENT_ADJECTIVES[Math.floor(Math.random() * CLIENT_ADJECTIVES.length)]} ${CLIENT_FRUITS[Math.floor(Math.random() * CLIENT_FRUITS.length)]}`;

const messages = {
  zh: {
    rounds: '回合浏览', analysis: '数据分析', collab: '协作面板', utilityNotes: '道具速记', loaded: '参考数据已加载', recentKills: '最近击杀', expand: '展开', collapse: '收起', cameraPositions: '摄像机位置', view: '视图', showNames: '显示名称', selectRound: '请选择回合', round: '回合', multiDemo: 'Demo 文件', chooseDemo: '选择文件', multiPartHint: '支持多选分片', noFileChosen: '尚未选择文件', play: '播放', pause: '暂停', loading: '加载中', allRounds: '全部回合', tRounds: 'T 回合', ctRounds: 'CT 回合', analysisHint: '选择选手后，所有回合会从冻结结束同时开始叠加播放。', heatmap: '热力图', killerPosition: '击杀时所在', victimPosition: '被击杀时所在', targetPosition: '击杀目标所在', opponentPosition: '被击杀时对方所在', saveFrame: '保存当前帧', leaveRoom: '离开房间', joinRoom: '加入房间', openRoom: '开放房间', roomPrompt: '输入 6 位房间号', currentMap: '当前地图', name: '名称', collabHint: '保存地图、镜头、编辑点位和当前 Demo 帧。Demo 文件本身不会写入浏览器存储。', owner: '房主', member: '成员',     noArchives: '暂无本地存档', guestNoArchive: '房间成员不能切换存档', restoreArchive: '恢复存档', deleteArchive: '删除存档', manualEdit: '手动地图编辑', addUtility: '添加道具', searchUtility: '搜索道具速记…', collabPlayer: '人物点位', frame: '帧', copy: '副本', nameExists: '名称已存在', insertFrame: '插帧', duplicateFrame: '复制帧', deleteFrame: '删除帧', frameName: '帧名', saveToArchive: '保存到存档', newArchive: '新建存档', archiveName: '存档名',     collabPlayers: '人物列表', noCollabPlayers: '暂无人物', frames: '帧列表', noFrames: '暂无帧', eraser: '橡皮擦', rename: '重命名', renameFrame: '重命名帧', room: '房间', roomOpened: '已公开', roomDestroyed: '房间已销毁', roomLeft: '已离开房间', roomExited: '已从房间退出', joiningRoom: '正在加入房间', joinedRoom: '已加入房间', connected: '已连接', connecting: '连接中', disconnected: '连接断开', analysisReady: '全场移动数据已就绪', analysisLoading: '正在读取全场移动数据…', parseFailed: '解析失败', combiningParts: '正在组合 {count} 个 Demo 分片…', readingDemo: '正在读取 Demo 文件…', smoke: '烟', fire: '火', flash: '闪', grenade: '雷', decoy: '诱', c4Planted: 'C4 安装', c4Exploded: 'C4 爆炸', roundEnd: '回合结束', world: '世界', unknown: '未知', language: 'EN', tacticalPoint: '战术点', team: '阵营', type: '类型', delete: '删除', map: '地图', reset: '重置', players: '选手', side: '阵营', model: '模型', c4Paused: '已拆除', noGrenades: '-', addUtilityNote: '添加速记', utilityIntro: '在 CS2 控制台输入 getpos，将输出粘贴到这里。相同位置可保存多个不同角度。', utilityEmpty: '当前地图暂无道具速记', getposOutput: 'getpos 输出', utilityName: '道具名称', throwSummary: '投掷简述', getposPlaceholder: 'setpos 123 456 78;setang -12 90 0', utilityNamePlaceholder: '例如：A 大过点烟', throwSummaryPlaceholder: '例如：贴墙站立，静步投掷', cancel: '取消', add: '添加', invalidGetpos: '无法识别 getpos，请包含 setpos 与 setang 数据', position: '位置', angles: '角度', localOnly: '数据仅保存在当前浏览器', utilityCount: '{count} 条速记',
    utilityIntro: '手动添加仍只需粘贴 getpos；从 Demo 保存的复杂投掷会与同一起点的手动记录归在一起。',
    importNotes: '导入', exportNotes: '导出', utilityImportDone: '已导入 {added} 条，跳过 {skipped} 条重复数据', utilityImportFailed: '导入失败：文件格式不正确',
    importedUtilities: '已引入道具', noImportedUtilities: '暂无引入道具', selectUtility: '选择道具', confirmAdd: '确认添加',
    saveUtility: '保存道具', clickToReplay: '点击重播投掷', utilityStorageFailed: '保存失败，浏览器本地空间不足',
    parsedDemos: '已解析 Demo', noCachedDemos: '暂无已解析 Demo', openCachedDemo: '打开', deleteCachedDemo: '删除缓存', cacheFailed: 'Demo 缓存失败', cacheReady: '已从缓存打开', analysisNeedsSource: '该缓存尚无分析数据，请重新选择原 Demo 后打开分析面板',
    utilityDetails: '道具详情', replayUtility: '播放', replayUtilityFirstPerson: '第一人称播放', getposCommand: 'GETPOS', copied: '已复制', exportedBy: '来源选手', exportedAt: '保存时间', sourceDemo: '来源 Demo', customUtility: '手动添加',
    utilityLocations: '点位列表', startPlace: '起始区域', throwPlace: '出手区域',
    cameraManual: '手动镜头', cameraFollow: '导播', cameraFixed: '固定镜头', cameraChase: '追踪镜头',
    directorCamera: '导播',
    editUtility: '编辑', saveUtilityEdit: '保存', utilityTitle: '标题', utilityDescription: '描述', currentUsers: '当前用户', you: '你',
    hintBrushDrag: '左键拖动画笔', hintPlayPause: '播放/暂停', hintStep: '步进', hintMove: '移动镜头', hintPlacePoint: 'E 放置点位', hintGrenadeWheel: 'Q 道具轮盘', hintDeleteUtility: '删除已放置道具', hintEditPoint: '左键编辑点位', hintZoom: '滚轮缩放', hintCameras: '数字键镜头', hintCameraRestore: '恢复镜头', hintCameraSave: '保存镜头', hintUndo: '撤销', hintRedo: '重做', hintErase: '按住擦除', hintRotate: '旋转', hintCatEdit: '编辑', hintCatPlayback: '回放', hintCatCamera: '视角', hintCatPlace: '造点', hintCatAdjust: '人物调整', hintCatHistory: '撤销重做', hintMovePlayer: '拖动移动', hintYaw: '水平转向', hintPitch: '调整倾角', hintCrouch: '双击蹲/站',
  },
  en: {
    rounds: 'Round Replay', analysis: 'Analysis', collab: 'Collaboration', utilityNotes: 'Utility Notes', loaded: 'Reference Data Loaded', recentKills: 'Recent Kills', expand: 'Expand', collapse: 'Collapse', cameraPositions: 'Camera Positions', view: 'View', showNames: 'Show Names', selectRound: 'Select a round', round: 'Round', multiDemo: 'Demo Files', chooseDemo: 'Choose Files', multiPartHint: 'Multi-part selection supported', noFileChosen: 'No files selected', play: 'Play', pause: 'Pause', loading: 'Load', allRounds: 'All Rounds', tRounds: 'T Rounds', ctRounds: 'CT Rounds', analysisHint: 'Selected players are overlaid from freeze end across all rounds.', heatmap: 'Heatmap', killerPosition: 'Killer Position', victimPosition: 'Victim Position', targetPosition: 'Target Position', opponentPosition: 'Opponent Position', saveFrame: 'Save Frame', leaveRoom: 'Leave Room', joinRoom: 'Join Room', openRoom: 'Open Room', roomPrompt: 'Enter 6-digit room code', currentMap: 'Current map', name: 'Name', collabHint: 'Saves the map, camera presets, tactical edits and current Demo frame. The Demo file is not stored.', owner: 'Owner', member: 'Member',     noArchives: 'No local archives', guestNoArchive: 'Room members cannot switch archives', restoreArchive: 'Restore archive', deleteArchive: 'Delete archive', manualEdit: 'Manual map edit', addUtility: 'Add Utility', searchUtility: 'Search utility notes…', collabPlayer: 'Player Marker', frame: 'Frame', copy: 'Copy', nameExists: 'Name already exists', insertFrame: 'Insert Frame', duplicateFrame: 'Duplicate Frame', deleteFrame: 'Delete Frame', frameName: 'Frame Name', saveToArchive: 'Save to Archive', newArchive: 'New Archive', archiveName: 'Archive Name',     collabPlayers: 'Players', noCollabPlayers: 'No players yet', frames: 'Frames', noFrames: 'No frames yet', eraser: 'Eraser', rename: 'Rename', renameFrame: 'Rename Frame', room: 'Room', roomOpened: 'opened', roomDestroyed: 'Room destroyed', roomLeft: 'Left room', roomExited: 'Disconnected from room', joiningRoom: 'Joining room', joinedRoom: 'Joined room', connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', analysisReady: 'Full-match movement data ready', analysisLoading: 'Reading full-match movement data...', parseFailed: 'Parse failed', combiningParts: 'Combining {count} Demo parts...', readingDemo: 'Reading Demo file...', smoke: 'SMK', fire: 'FIRE', flash: 'FL', grenade: 'HE', decoy: 'DEC', c4Planted: 'C4 planted', c4Exploded: 'C4 exploded', roundEnd: 'Round ended', world: 'WORLD', unknown: 'UNKNOWN', language: '中文', tacticalPoint: 'Tactical Point', team: 'Team', type: 'Type', delete: 'Delete', map: 'Map', reset: 'Reset', players: 'Players', side: 'Side', model: 'Model', c4Paused: 'DEFUSED', noGrenades: '-', addUtilityNote: 'Add Note', utilityIntro: 'Run getpos in the CS2 console and paste its output here. One position can store multiple angles.', utilityEmpty: 'No utility notes for this map', getposOutput: 'getpos output', utilityName: 'Utility name', throwSummary: 'Throw summary', getposPlaceholder: 'setpos 123 456 78;setang -12 90 0', utilityNamePlaceholder: 'Example: A Long cross smoke', throwSummaryPlaceholder: 'Example: Hug the wall, standing throw', cancel: 'Cancel', add: 'Add', invalidGetpos: 'Could not parse getpos. Include setpos and setang values.', position: 'Position', angles: 'Angles', localOnly: 'Stored only in this browser', utilityCount: '{count} notes',
    utilityIntro: 'Manual entry still accepts getpos only. Complex Demo throws are grouped with manual notes at the same start position.',
    importNotes: 'Import', exportNotes: 'Export', utilityImportDone: 'Imported {added}; skipped {skipped} duplicates', utilityImportFailed: 'Import failed: invalid file format',
    importedUtilities: 'Imported Utilities', noImportedUtilities: 'No imported utilities', selectUtility: 'Select Utility', confirmAdd: 'Add Selected',
    saveUtility: 'Save Utility', clickToReplay: 'Click to replay throw', utilityStorageFailed: 'Could not save: browser storage is full',
    parsedDemos: 'Parsed Demos', noCachedDemos: 'No parsed Demos', openCachedDemo: 'Open', deleteCachedDemo: 'Delete cache', cacheFailed: 'Demo cache failed', cacheReady: 'Opened from cache', analysisNeedsSource: 'This cache has no analysis data. Select the source Demo and open Analysis.',
    utilityDetails: 'Utility Details', replayUtility: 'Play', replayUtilityFirstPerson: 'First-person', getposCommand: 'GETPOS', copied: 'Copied', exportedBy: 'Player', exportedAt: 'Saved', sourceDemo: 'Source Demo', customUtility: 'Manual entry',
    utilityLocations: 'Locations', startPlace: 'Start place', throwPlace: 'Throw place',
    cameraManual: 'Manual', cameraFollow: 'Director', cameraFixed: 'Fixed camera', cameraChase: 'Chase camera',
    directorCamera: 'Director',
    editUtility: 'Edit', saveUtilityEdit: 'Save', utilityTitle: 'Title', utilityDescription: 'Description', currentUsers: 'Current Users', you: 'You',
    hintBrushDrag: 'LMB drag to draw', hintPlayPause: 'Play/Pause', hintStep: 'Step', hintMove: 'Move camera', hintPlacePoint: 'E place point', hintGrenadeWheel: 'Q utility wheel', hintDeleteUtility: 'Delete placed utility', hintEditPoint: 'LMB edit point', hintZoom: 'Scroll zoom', hintCameras: 'Number keys cameras', hintCameraRestore: 'Restore camera', hintCameraSave: 'Save camera', hintUndo: 'Undo', hintRedo: 'Redo', hintErase: 'hold to erase', hintRotate: 'Rotate', hintCatEdit: 'EDIT', hintCatPlayback: 'PLAYBACK', hintCatCamera: 'CAMERA', hintCatPlace: 'PLACE', hintCatAdjust: 'ADJUST', hintCatHistory: 'HISTORY', hintMovePlayer: 'Drag to move', hintYaw: 'Horizontal yaw', hintPitch: 'Adjust pitch', hintCrouch: 'Double-click crouch/stand',
  },
};

const UTILITY_NOTES_VERSION = 3;
const DEMO_CACHE_SCHEMA_VERSION = 23;

const translate = (language, key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), messages[language][key] || key);
const formatBytes = (bytes = 0) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
function ModelLoadIndicator({ state, language }) {
  if (!state || state.status === 'ready') return null;
  const percent = state.total > 0 ? Math.min(100, Math.round(state.loaded / state.total * 100)) : null;
  const failed = state.status === 'error';
  const label = failed
    ? (language === 'zh' ? '模型加载失败' : 'MODEL UNAVAILABLE')
    : percent === 100
      ? (language === 'zh' ? '正在处理模型' : 'PROCESSING MODEL')
      : (language === 'zh' ? '正在下载模型' : 'DOWNLOADING MODEL');
  return <div className={`model-load-indicator${failed ? ' failed' : ''}`} role={failed ? 'status' : 'progressbar'} aria-label={label} aria-valuemin={failed ? undefined : 0} aria-valuemax={failed ? undefined : 100} aria-valuenow={failed || percent == null ? undefined : percent}>
    <span>{label}</span>
    {!failed && <i className={percent == null ? 'indeterminate' : ''}><b style={percent == null ? undefined : { width: `${percent}%` }} /></i>}
    <strong>{failed ? '!' : percent == null ? formatBytes(state.loaded) : `${percent}%`}</strong>
  </div>;
}
const stableSerialize = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
const stableHash = (value) => {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
function CollabUtilityPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    setTarget(document.querySelector('.collab-objects .collab-utility'));
  }, []);
  return target ? createPortal(children, target) : null;
}

function UtilityNotesActionsPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.querySelector('.utility-notes-heading')); }, []);
  return target ? createPortal(children, target) : null;
}
function AnalysisOptionsPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.querySelector('.analysis-panel')); }, []);
  return target ? createPortal(children, target) : null;
}
function RoomPresencePortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.querySelector('.room-open')); }, []);
  return target ? createPortal(children, target) : null;
}
function CameraHintsPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.querySelector('.key-hints .key-group:last-child')); }, []);
  return target ? createPortal(children, target) : null;
}
function ModelControlsPortal({ selector, children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => setTarget(selector ? document.querySelector(selector) : null), [selector]);
  return target ? createPortal(children, target) : null;
}
const lerpAngleDegrees = (from, to, amount) => from + (THREE.MathUtils.euclideanModulo(to - from + 180, 360) - 180) * amount;
const cs2AnglesToSceneDirection = (pitchDegrees = 0, yawDegrees = 0) => {
  const pitch = THREE.MathUtils.degToRad(pitchDegrees);
  const yaw = THREE.MathUtils.degToRad(yawDegrees);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
};

function interpolateDemoSnapshot(snapshots, tick) {
  if (!snapshots?.length) return null;
  let before = snapshots[0];
  let after = snapshots[snapshots.length - 1];
  for (let index = 1; index < snapshots.length; index += 1) {
    if (snapshots[index].tick >= tick) { after = snapshots[index]; before = snapshots[index - 1]; break; }
  }
  const amount = before.tick === after.tick ? 0 : THREE.MathUtils.clamp((tick - before.tick) / (after.tick - before.tick), 0, 1);
  const afterByName = new Map(after.players.map((player) => [player.name, player]));
  return { tick, timeSeconds: tick / 64, players: before.players.map((player) => {
    const next = afterByName.get(player.name);
    if (!next) return player;
    const discrete = amount >= 1 ? next : player;
    const flashPlayer = amount >= 1 ? next : player;
    const flashSnapshot = amount >= 1 ? after : before;
    const currentFlashDuration = Number(flashPlayer.flashDuration) || 0;
    let flashStartTick = flashSnapshot.tick;
    let flashInitialDuration = currentFlashDuration;
    if (currentFlashDuration > 0) for (let index = snapshots.indexOf(flashSnapshot) - 1; index >= 0; index -= 1) {
      const previous = snapshots[index].players.find((candidate) => candidate.name === player.name);
      if (!previous || Number(previous.flashDuration) <= 0 || Math.abs(Number(previous.flashDuration) - currentFlashDuration) > 0.05) break;
      flashStartTick = snapshots[index].tick;
      flashInitialDuration = Math.max(flashInitialDuration, Number(previous.flashDuration) || 0);
    }
    const flashRemaining = currentFlashDuration > 0 ? Math.max(0, flashInitialDuration - (tick - flashStartTick) / 64) : 0;
    return { ...discrete, health: amount < 0.5 ? player.health : next.health, flashDuration: flashRemaining, flashInitialDuration, flashMaxAlpha: THREE.MathUtils.lerp(Number(player.flashMaxAlpha) || 0, Number(next.flashMaxAlpha) || 0, amount), position: { x: THREE.MathUtils.lerp(player.position.x, next.position.x, amount), y: THREE.MathUtils.lerp(player.position.y, next.position.y, amount), z: THREE.MathUtils.lerp(player.position.z, next.position.z, amount) }, yaw: lerpAngleDegrees(player.yaw, next.yaw, amount), pitch: THREE.MathUtils.lerp(player.pitch, next.pitch, amount), duckAmount: THREE.MathUtils.lerp(player.duckAmount || 0, next.duckAmount || 0, amount) };
  }) };
}

function playerGrenades(inventory, language) {
  const counts = new Map();
  (inventory || []).forEach((item) => {
    const rawName = typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item;
    const name = String(rawName).toLowerCase().replace(/^weapon_/, '').replace(/[_-]/g, ' ');
    const label = name.includes('smoke') ? translate(language, 'smoke') : name.includes('flash') ? translate(language, 'flash') : name.includes('molotov') || name.includes('incendiary') || name.includes('incgrenade') ? translate(language, 'fire') : name.includes('high explosive') || name.includes('he grenade') || name.includes('hegrenade') ? translate(language, 'grenade') : name.includes('decoy') ? translate(language, 'decoy') : null;
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts].map(([label, count]) => `${label}${count > 1 ? count : ''}`).join(' ') || translate(language, 'noGrenades');
}

const grenadeIconKey = (weapon = '') => {
  const name = String(weapon).toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9]/g, '');
  if (name.includes('smoke')) return 'smoke';
  if (name.includes('flash')) return 'flash';
  if (name.includes('incgrenade') || name.includes('incendiary')) return 'incgrenade';
  if (name.includes('molotov')) return 'molotov';
  if (name.includes('hegrenade') || name.includes('highexplosive')) return 'grenade';
  if (name.includes('decoy')) return 'decoy';
  return null;
};

function playerGrenadeIcons(inventory, language) {
  const counts = new Map();
  (inventory || []).forEach((item) => {
    const rawName = typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item;
    const key = grenadeIconKey(rawName);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (!counts.size) return translate(language, 'noGrenades');
  return <span className="roster-grenades">{[...counts].map(([key, count]) => <span className="roster-grenade" key={key}><RawIcon name={key} /><i>{count > 1 ? count : ''}</i></span>)}</span>;
}

function RawIcon({ name, className }) {
  const src = csIconUrl[name];
  if (!src) return null;
  return <span className={className || ''} aria-hidden="true"><img className="cs-icon-image" src={src} alt="" /></span>;
}

function MaskIcon({ name, className }) {
  const src = csIconUrl[name];
  if (!src) return null;
  return <span className={`cs-icon-mask${className ? ` ${className}` : ''}`} style={{ '--cs-icon-url': `url("${src}")` }} aria-hidden="true" />;
}

const KNIFE_WEAPON_KEYS = new Set([
  'knife', 'knifet', 'knifegg', 'bayonet', 'classicknife', 'flipknife', 'gutknife', 'karambit', 'm9bayonet', 'huntsmanknife', 'falchionknife', 'bowieknife', 'butterflyknife', 'shadowdaggers', 'paracordknife', 'survivalknife', 'ursusknife', 'navajaknife', 'nomadknife', 'stilettoknife', 'talonknife', 'skeletonknife', 'kukriknife',
  'knifeflip', 'knifegut', 'knifekarambit', 'knifem9bayonet', 'knifetactical', 'knifefalchion', 'knifesurvivalbowie', 'knifebutterfly', 'knifepush', 'knifecord', 'knifecanis', 'knifeursus', 'knifegypsyjack', 'knifeoutdoor', 'knifestiletto', 'knifewidowmaker', 'knifeskeleton', 'knifekukri',
]);

const csWeaponKey = (weapon = '', { event = false, side = '' } = {}) => {
  const raw = String(weapon).toLowerCase().replace(/^weapon_/, '');
  const compact = raw.replace(/[^a-z0-9]/g, '');
  const grenade = grenadeIconKey(raw);
  if (grenade) return grenade;
  if (KNIFE_WEAPON_KEYS.has(compact) || compact.includes('knife') || compact.includes('bayonet') || compact.includes('dagger')) return side === 'T' && csIconUrl.knife_t ? 'knife_t' : 'knife_ct';
  if (compact === 'glock') return 'glock18';
  if (compact === 'cz75a') return 'cz75';
  if (compact === 'sg556') return 'sg553';
  if (compact === 'm4a1silencer' || compact === 'm4a1silenceroff' || compact === 'm4a1s') return 'm4a1';
  if (compact === 'm4a1') return 'm4a4';
  if (compact === 'uspsilencer' || compact === 'uspsilenceroff' || compact === 'usps') return 'usp';
  return compact;
};

function RosterWeaponIcon({ weapon, side }) {
  const key = csWeaponKey(weapon, { side });
  if (csIconUrl[key]) return <MaskIcon name={key} className={`roster-weapon-icon${grenadeIconKey(weapon) ? ' roster-grenade' : ''}`} />;
  return null;
}

function MapIcon({ map }) {
  const src = csIconUrl[`map_icon_${map}`];
  if (!src) return null;
  return <img className="map-icon" src={src} alt="" aria-hidden="true" />;
}

function SideLogo({ side }) {
  const src = csIconUrl[side === 'CT' ? 'ct_logo' : 't_logo'];
  if (!src) return <span>{side === 'CT' ? 'CT' : 'T'}</span>;
  return <span className={`side-logo side-${side.toLowerCase()}`} aria-hidden="true"><img src={src} alt="" /></span>;
}

function RosterIcon({ type }) {
  const paths = {
    armor: <><path d="M4 4l4-2 4 2v4c0 3-1.7 5.2-4 6-2.3-.8-4-3-4-6V4z" /><path d="M6 7h4M8 4v8" /></>,
    helmet: <><path d="M3 8a5 5 0 0110 0v2H8l-2 3H3V8z" /><path d="M8 10v3h4" /></>,
    armorHelmet: <><path d="M2 7l4-2 4 2v3c0 2.4-1.6 4.2-4 5-2.4-.8-4-2.6-4-5V7z" /><path d="M7 5a3.5 3.5 0 017 0v2h-4l-2 2M4 9h4M6 7v6" /></>,
    defuser: <><rect x="3" y="5" width="10" height="8" rx="1" /><path d="M6 5V3h4v2M6 8h4M8 8v3" /></>,
    c4: <><rect x="3" y="4" width="10" height="9" rx="1" /><path d="M6 4V2m4 2V2M5 7h6M5 10h2m2 0h2" /></>,
  };
  const map = { armor: 'armor', helmet: 'helmet', armorHelmet: 'armor_helmet', defuser: 'defuser', c4: 'c4' };
  if (csIconUrl[map[type]]) return <MaskIcon name={map[type]} className={`roster-icon icon-${type}`} />;
  return <svg className={`roster-icon icon-${type}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const weaponIconPaths = {
  ak47: 'M1 7h4l2-2h9l2 1h7l5-2v3l-5 1h-8l-2 2-2 5h-3l1-5H7l-3 3H1z',
  m4a1: 'M1 7h5l2-2h10l2 1h8v2h-9l-2 2-1 4h-3l1-4H8l-3 3H2z',
  m4a1_silencer: 'M1 7h5l2-2h10l2 1h5v-1h6v3h-12l-2 2-1 4h-3l1-4H8l-3 3H2z',
  galilar: 'M1 7h6l2-2h10l2 2h9v2H19l-2 2-2 4h-3l1-5H8l-4 3H1z',
  famas: 'M1 8l5-2 2-2h11l4 3h7v2h-9l-2 3h-5l-1 3h-3l1-5H6l-3 2H1z',
  aug: 'M1 8h5l2-3h6V3h6v2l4 2h7v2h-9l-2 3h-4l-2 3h-3l1-5H6l-4 2z',
  sg556: 'M1 8h5l2-3h5V3h6v2l4 2h8v2H20l-2 3h-4l-1 3h-3l1-5H6l-4 2z',
  awp: 'M1 8h7l2-2h3V4h7v2h3l2 1h6v2h-8l-2 2-2 4h-3l1-5H9l-5 3H1z',
  ssg08: 'M1 8h8l2-2h2V4h6v2h3l2 1h7v2h-9l-2 2-1 4h-3l1-5H9l-5 3H1z',
  scar20: 'M1 8h6l2-2h3V4h7v2h3l3 1h6v2h-9l-2 2-1 4h-3l1-5H8l-4 3H1z',
  g3sg1: 'M1 8h6l2-2h3V4h7v2h3l3 1h6v2H20l-1 3-2 3h-3l1-5H8l-4 3H1z',
  glock: 'M3 5h18l2 2v3h-9l-1 6H8l1-6H3z',
  usp_silencer: 'M2 6h15V4h13v4H17v2h-5l-1 6H7l1-6H2z',
  hkp2000: 'M3 5h18l2 2v3h-9l-1 6H8l1-6H3zM6 4h12',
  p250: 'M3 6h17l2 2v2h-8l-2 6H8l1-6H3zM7 4h11',
  fiveseven: 'M2 5h20l2 2v3h-9l-2 6H8l1-6H2zM5 4h14',
  tec9: 'M2 6h19l3 2v2h-8v5h-4l-1-5H8l-2 3H3zM8 4h9',
  cz75a: 'M2 6h18l3 2v2h-8l-1 6h-4l-1-6H2zM6 4h15l2 1',
  elite: 'M1 5h13l2 2v2H9l-1 6H4l1-6H1zM16 5h13l2 2v2h-7l-1 6h-4l1-6h-4z',
  deagle: 'M2 5h21l3 3v2H15l-2 6H8l1-6H2zM5 3h15',
  revolver: 'M2 6h12l3-2h7l3 3v3h-9l-3 6h-4l1-6H2z',
  mp9: 'M2 5h17l4 3h7v2h-9v5h-4l-1-5H9l-2 4H4l1-4H2z',
  mac10: 'M2 5h18l3 3h7v2h-9l-1 5h-4l-1-5H8l-2 4H3l1-4H2z',
  mp7: 'M2 6h20l3 2h6v2H20v5h-4l-1-5H8l-2 4H3l1-4H2z',
  mp5sd: 'M2 6h18l2 1h3V5h6v4H21l-1 6h-4l-1-5H8l-2 4H3l1-4H2z',
  ump45: 'M2 6h19l3 2h7v2H20l-1 5h-4l-1-5H8l-3 4H2l2-4H2z',
  p90: 'M2 6h21l5 2v3H17l-2 4h-4l1-5H8l-2 3H3zM8 4h13',
  bizon: 'M2 6h20l3 2h6v2H20l-2 3H8l-2 2H3l2-5H2zM9 11h10v3H9z',
  nova: 'M1 7h24l6 1v2H16l-5 4H7l3-4H1zM12 5h13',
  xm1014: 'M1 7h23l7 1v2H18l-4 4h-4l2-4H1zM8 5h17M18 11h8',
  mag7: 'M2 6h19l4 2h6v2H18l-2 5h-4l1-5H7l-2 3H2z',
  sawedoff: 'M2 7h19l5 1v2H16l-4 4H8l2-4H2z',
  m249: 'M1 6h21l3 2h6v2H21l-1 4h-4l-1-4H8l-3 3H2zM18 10h7v5h-7z',
  negev: 'M1 6h20l4 2h7v2H20l-1 4h-4l-1-4H8l-3 3H2zM15 10h8v5h-8z',
  taser: 'M5 3h18l4 4-4 3h-7l-2 6H9l2-6H5zM18 5l-3 4h4l-2 4',
};

function KillIcon({ type, weapon, side, event = false }) {
  const weaponKey = csWeaponKey(weapon, { side, event });
  const kind = type === 'weapon' ? weaponIconPaths[weaponKey] ? weaponKey : demoWeaponKind(weapon) : type;
  const paths = {
    pistol: <><path d="M2 6h9v3H8l-1 5H4l1-5H2z" /><path d="M11 7h3" /></>,
    rifle: <><path d="M1 7h10l3-2v4l-3-1H7l-2 3H2l2-3H1z" /></>,
    sniper: <><path d="M1 8h13M4 8l-2 3m8-3l3 2M6 6h4v2" /><circle cx="8" cy="5" r="2" /></>,
    smg: <><path d="M2 6h10v4H8l-1 3H4l1-3H2zM10 10v3" /></>,
    shotgun: <><path d="M1 7h12l2 1-2 1H7l-3 3H2l2-3H1z" /></>,
    machinegun: <><path d="M1 6h11v5H8l-1 3H4l1-3H1zM11 11l3 3m-3-3l-1 3" /></>,
    melee: <><path d="M3 13l3-3m-1-1l6-7 2 2-7 6z" /></>,
    utility: <><circle cx="8" cy="9" r="5" /><path d="M7 4V2h3m-1 0v2" /></>,
    c4: <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M5 6h6M5 9h2m2 0h2" /></>,
    headshot: <><circle cx="8" cy="7" r="4" /><path d="M5 12h6M8 2v10M3 7h10" /></>,
    smoke: <><path d="M3 12c-2-2 1-3 0-5s2-4 4-2c1-3 5-2 5 1 3 1 2 5 0 6z" /></>,
    blind: <><path d="M1 8s3-4 7-4 7 4 7 4-3 4-7 4-7-4-7-4z" /><path d="M4 3L2 1m10 2l2-2M8 2V0" /><circle cx="8" cy="8" r="2" /></>,
    wallbang: <><path d="M2 2v12M6 2v12M10 2v12M14 2v12M0 6h16M0 10h16" /><path d="M1 8h14" /></>,
    noscope: <><circle cx="8" cy="8" r="5" /><path d="M8 1v14M1 8h14M3 3l10 10" /></>,
    airborne: <><path d="M2 12c3-1 4-4 5-8l2 3 3-1-1 3 3 2" /><path d="M1 14h14" /></>,
  };
  const indicatorMap = { headshot: 'icon_headshot', smoke: 'smoke_kill', blind: 'blind_kill', wallbang: 'penetrate', noscope: 'noscope', airborne: 'inairkill' };
  if (csIconUrl[indicatorMap[kind]]) return <MaskIcon name={indicatorMap[kind]} className={`kill-icon kill-icon-${kind}`} />;
  if (type === 'weapon' && csIconUrl[weaponKey]) return <MaskIcon name={weaponKey} className={`kill-icon kill-icon-weapon kill-icon-${weaponKey}`} />;
  if (type === 'weapon' && weaponIconPaths[weaponKey]) return <svg className={`kill-icon kill-icon-weapon kill-icon-${weaponKey}`} viewBox="0 0 32 16" aria-hidden="true" fill="currentColor"><path d={weaponIconPaths[weaponKey]} /></svg>;
  return <svg className={`kill-icon kill-icon-${kind}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{paths[kind] || paths.rifle}</svg>;
}

function DemoKillFeed({ kills, round, language, collapsed, onToggle }) {
  const t = (key) => translate(language, key);
  return <div className={`demo-kills${collapsed ? ' collapsed' : ''}`}><div className="demo-kills-heading"><span>{t('recentKills')}</span><button type="button" onClick={onToggle}>{collapsed ? t('expand') : t('collapse')}</button></div>{kills.map((kill, index) => <div className="demo-kill" key={`${kill.tick}-${kill.user_steamid}`} style={{ '--kill-opacity': Math.max(0.16, 1 - Math.max(0, index - 2) * 0.25) }}>
    <small>{((kill.tick - round.startTick) / 64).toFixed(1)}s</small>
    <b>{kill.attacker_name || t('world')}{kill.assister_name && <span className={kill.assistedflash ? 'flash-assist' : ''}> + {kill.assister_name}{kill.assistedflash && <KillIcon type="blind" />}</span>}</b>
    <i title={String(kill.weapon || 'kill').replace(/^weapon_/, '')}><KillIcon type="weapon" weapon={kill.weapon} side={Number(kill.attacker_team_num) === 2 ? 'T' : 'CT'} event />{kill.headshot && <KillIcon type="headshot" />}{kill.thrusmoke && <KillIcon type="smoke" />}{kill.attackerblind && <KillIcon type="blind" />}{Number(kill.penetrated) > 0 && <KillIcon type="wallbang" />}{kill.noscope && <KillIcon type="noscope" />}{kill.attackerinair && <KillIcon type="airborne" />}</i>
    <strong>{kill.user_name || t('unknown')}</strong>
  </div>)}</div>;
}

const demoEventPlayerMatches = (event, player) => {
  const eventSteamid = String(event.user_steamid ?? event.player_steamid ?? event.steamid ?? '');
  return eventSteamid && String(player.steamid || '') === eventSteamid || (event.user_name ?? event.player_name ?? event.name) === player.name;
};

function recentPlayerBalanceChange(snapshots, player, tick, tickRate) {
  const cutoff = tick - tickRate * 1.5;
  let previous = null;
  let delta = 0;
  let lastChangeTick = null;
  snapshots.forEach((snapshot) => {
    if (snapshot.tick > tick) return;
    const match = snapshot.players.find((candidate) => String(candidate.steamid || candidate.name) === String(player.steamid || player.name));
    const balance = Number(match?.balance);
    if (!Number.isFinite(balance)) return;
    if (previous != null && balance !== previous && snapshot.tick >= cutoff) { delta += balance - previous; lastChangeTick = snapshot.tick; }
    previous = balance;
  });
  return lastChangeTick == null ? null : { delta, tick: lastChangeTick };
}

const reloadDurationSeconds = (weapon = '') => {
  const kind = demoWeaponKind(weapon);
  if (kind === 'pistol') return 2.2;
  if (kind === 'sniper') return 3.2;
  if (kind === 'shotgun') return 3.4;
  if (kind === 'machinegun') return 4.2;
  return 2.8;
};

function buildDemoReloads(snapshots, events, tickRate) {
  const reloads = new Map();
  const players = new Map(snapshots.flatMap((snapshot) => snapshot.players.map((player) => [String(player.steamid || player.name), player])));
  players.forEach((player, playerId) => {
    const records = snapshots.map((snapshot) => ({ tick: snapshot.tick, player: snapshot.players.find((candidate) => String(candidate.steamid || candidate.name) === playerId) })).filter((record) => record.player);
    const ammoJumps = records.filter((record, index) => { const previous = records[index - 1]; return previous && record.player.activeWeapon === previous.player.activeWeapon && Number(record.player.activeWeaponAmmo) > Number(previous.player.activeWeaponAmmo); });
    const reloadEvents = events.filter((event) => event.event_name === 'weapon_reload' && demoEventPlayerMatches(event, player));
    const truncateAtWeaponSwitch = (interval) => {
      const weapon = interval.weapon;
      const switchRecord = records.find((record) => record.tick >= interval.startTick && record.tick <= interval.endTick && record.player.activeWeapon && record.player.activeWeapon !== weapon);
      if (switchRecord) return { ...interval, endTick: Math.max(interval.startTick, switchRecord.tick) };
      return interval;
    };
    const intervals = reloadEvents.map((event) => {
      const completion = ammoJumps.find((record) => record.tick >= event.tick && record.tick <= event.tick + tickRate * 5);
      const weapon = completion?.player.activeWeapon || event.weapon || player.activeWeapon;
      return truncateAtWeaponSwitch({ startTick: event.tick, endTick: completion?.tick ?? event.tick + Math.round(reloadDurationSeconds(weapon) * tickRate), weapon });
    });
    ammoJumps.forEach((completion) => {
      if (intervals.some((reload) => completion.tick >= reload.startTick && completion.tick <= reload.endTick + tickRate * 0.2)) return;
      const durationTicks = Math.round(reloadDurationSeconds(completion.player.activeWeapon) * tickRate);
      intervals.push(truncateAtWeaponSwitch({ startTick: completion.tick - durationTicks, endTick: completion.tick, weapon: completion.player.activeWeapon }));
    });
    reloads.set(playerId, intervals.filter((interval) => interval.endTick > interval.startTick).sort((left, right) => left.startTick - right.startTick));
  });
  return reloads;
}

function demoPlayerReload(reloads, player, tick) {
  const interval = reloads.get(String(player.steamid || player.name))?.find((reload) => tick >= reload.startTick && tick <= reload.endTick);
  return interval ? { ...interval, progress: THREE.MathUtils.clamp((tick - interval.startTick) / Math.max(1, interval.endTick - interval.startTick), 0, 1) } : null;
}

function DemoRoster({ side, players, events, tick, round, tickRate, language, povPlayerId, onPlayerPov }) {
  const snapshots = demoRosterRuntime.snapshots;
  const selectedPovId = povPlayerId ?? demoPovRuntime.playerId;
  const selectPov = onPlayerPov || demoPovRuntime.toggle;
  return <div className={`team-roster team-roster-${side.toLowerCase()}`}><span>{side} SIDE</span>{players.map((player) => {
    const recentHurt = [...events].reverse().find((event) => event.event_name === 'player_hurt' && event.tick <= tick && tick - event.tick <= tickRate * 1.6 && demoEventPlayerMatches(event, player));
    const hurtAge = recentHurt ? (tick - recentHurt.tick) / tickRate : Infinity;
    const hurtStartHealth = Math.min(100, Math.max(Number(player.health) || 0, Number(recentHurt?.health ?? player.health) + Number(recentHurt?.dmg_health || 0)));
    const delayedHealth = hurtAge <= 1 ? hurtStartHealth : THREE.MathUtils.lerp(hurtStartHealth, Number(player.health) || 0, THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((hurtAge - 1) / 0.6, 0, 1), 0, 1));
    const recentPurchases = events.filter((event) => event.event_name === 'item_purchase' && event.tick <= tick && tick - event.tick <= tickRate * 1.5 && demoEventPlayerMatches(event, player));
    const openingSpend = tick <= round.startTick + tickRate * 1.5 ? events.filter((event) => event.event_name === 'item_purchase' && event.tick >= (round.freezeStartTick ?? round.startTick) && event.tick <= round.startTick && demoEventPlayerMatches(event, player)).reduce((sum, event) => sum + (event.was_sold ? -1 : 1) * Math.abs(Number(event.cost) || 0), 0) : 0;
    const purchaseDelta = recentPurchases.reduce((sum, event) => sum + (event.was_sold ? 1 : -1) * Math.abs(Number(event.cost) || 0), 0) || (openingSpend ? -openingSpend : 0);
    const balanceChange = recentPlayerBalanceChange(snapshots, player, tick, tickRate);
    const moneyDelta = balanceChange?.delta || purchaseDelta;
    const moneyKey = balanceChange ? `balance-${balanceChange.tick}-${balanceChange.delta}` : recentPurchases.map((event) => event.tick).join('-') || (openingSpend ? `opening-${round.round}` : 'none');
    const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
    const flashStrength = Number(player.flashMaxAlpha) > 0 ? Number(player.flashMaxAlpha) / 255 : flashDuration > 0 ? 1 : 0;
    const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
    const flashOpacity = Math.min(0.3, flashStrength * 0.3) * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1);
    const health = Math.max(0, Number(player.health) || 0);
    const reload = demoPlayerReload(demoRosterRuntime.reloads, player, tick);
    const playerId = String(player.steamid || player.name);
    return <div className={`roster-player${health > 0 ? '' : ' dead'}${player.hasC4 ? ' has-c4' : ''}${selectedPovId === playerId ? ' pov-selected' : ''}`} key={playerId} role="button" tabIndex={health > 0 ? 0 : -1} onClick={(event) => { event.currentTarget.blur(); if (health > 0) selectPov?.(player); }} onKeyDown={(event) => { if (health > 0 && event.key === 'Enter') { event.preventDefault(); selectPov?.(player); } }}>
      <div className="roster-health-track"><i style={{ width: `${delayedHealth}%` }} /><span style={{ width: `${health}%` }} /></div>
      <strong>{player.name}</strong><b>{health} HP</b>
      <div className="roster-equipment"><span className="roster-armor">{player.armor > 0 && <><RosterIcon type={player.hasHelmet ? 'armorHelmet' : 'armor'} /><i>{player.armor}</i></>}</span>{player.hasDefuser && <RosterIcon type="defuser" />}</div>
      <div className="roster-money"><span>${Math.max(0, Number(player.balance) || 0)}</span>{moneyDelta !== 0 && <i key={moneyKey} className={moneyDelta > 0 ? 'gain' : 'spend'}>{moneyDelta > 0 ? '+' : ''}{moneyDelta}$</i>}</div>
       <small>{playerGrenadeIcons(player.inventory, language)}</small><em><RosterWeaponIcon weapon={player.activeWeapon} side={player.side} />{player.activeWeaponAmmo != null && <span className="roster-ammo">{player.activeWeaponAmmo}</span>}</em>
      {reload && <span className="roster-reload" style={{ '--reload-progress': `${reload.progress * 100}%` }}><i />RELOAD</span>}
      {flashOpacity > 0 && <span className="roster-flash" style={{ opacity: flashOpacity }} />}
    </div>;
  })}</div>;
}

function DemoPovHud({ player, firing, hurt }) {
  if (!player) return null;
  const weapon = String(player.activeWeapon || '-').replace(/^weapon_/, '').toUpperCase();
  const weaponKind = demoWeaponKind(player.activeWeapon);
  const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
  const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
  const flashStrength = Number(player.flashMaxAlpha) > 0 ? THREE.MathUtils.clamp(Number(player.flashMaxAlpha) / 255, 0, 1) : flashDuration > 0 ? 1 : 0;
  const flashOpacity = flashStrength * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1);
  return <div className={`demo-pov-hud pov-kind-${weaponKind}${firing ? ' firing' : ''}${player.scoped ? ' scoped' : ''}`}>
    <div className="demo-pov-crosshair" aria-hidden="true"><i /><i /></div>
    <div className="demo-pov-weapon"><small>POV · {player.name}</small><div><KillIcon type="weapon" weapon={player.activeWeapon} side={player.side} /><strong>{weapon}</strong>{player.activeWeaponAmmo != null && <b>{player.activeWeaponAmmo}</b>}</div></div>
    {hurt && <div className="demo-pov-hurt" />}
    {flashOpacity > 0 && <div className="demo-pov-flash" style={{ opacity: flashOpacity }} />}
  </div>;
}

const DEMO_SAMPLE_RATES = [1, 2, 4, 8, 16, 32];

function DemoParseSettings({ value, onChange, language }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const index = Math.max(0, DEMO_SAMPLE_RATES.indexOf(value));
  const slow = value >= 16;
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeWithEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeWithEscape); };
  }, [open]);
  return <div ref={rootRef} className={`demo-parse-settings${open ? ' open' : ''}${slow ? ' slow' : ''}`}>
    <button type="button" className="demo-parse-settings-toggle" aria-label={language === 'zh' ? '解析采样设置' : 'Parse sampling settings'} title={language === 'zh' ? '解析采样设置' : 'Parse sampling settings'} onClick={() => setOpen((current) => !current)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.7 1.5h2.6l.4 1.7c.4.1.8.3 1.2.5l1.5-.9 1.8 1.8-.9 1.5c.2.4.4.8.5 1.2l1.7.4v2.6l-1.7.4c-.1.4-.3.8-.5 1.2l.9 1.5-1.8 1.8-1.5-.9c-.4.2-.8.4-1.2.5l-.4 1.7H6.7l-.4-1.7c-.4-.1-.8-.3-1.2-.5l-1.5.9-1.8-1.8.9-1.5c-.2-.4-.4-.8-.5-1.2l-1.7-.4V7.7l1.7-.4c.1-.4.3-.8.5-1.2l-.9-1.5 1.8-1.8 1.5.9c.4-.2.8-.4 1.2-.5z" /><circle cx="8" cy="9" r="2.2" /></svg></button>
    {open && <div className="demo-parse-settings-popover"><header><span>{language === 'zh' ? '主回放每秒采样' : 'Replay samples / second'}</span><strong>{value}/s</strong></header><input type="range" min="0" max={DEMO_SAMPLE_RATES.length - 1} step="1" value={index} onChange={(event) => onChange(DEMO_SAMPLE_RATES[Number(event.target.value)])} /><div className="demo-sample-ticks">{DEMO_SAMPLE_RATES.map((rate) => <button type="button" className={rate === value ? 'active' : ''} data-slow={rate >= 16 || undefined} key={rate} onClick={() => onChange(rate)}>{rate}</button>)}</div><p className={slow ? 'warning' : ''}>{slow ? language === 'zh' ? '高采样率可能需要较长解析时间并占用更多内存。' : 'High sampling rates may take much longer and use more memory.' : language === 'zh' ? `每 ${64 / value} tick 记录一次主回放。` : `One replay sample every ${64 / value} ticks.`}</p></div>}
  </div>;
}

function MobileCameraWheel({ slots, active, onRestore, onSave, onReset, language }) {
  const [gesture, setGesture] = useState(null);
  const [saving, setSaving] = useState(null);
  const items = [{ id: 'reset', label: 'R', reset: true }, ...slots.map((saved, index) => ({ id: index, label: index === 9 ? '0' : index + 1, saved }))];
  const count = items.length;
  const wrap = (value) => ((value % count) + count) % count;
  const [position, setPosition] = useState(active == null ? 0 : Number(active) + 1);
  useEffect(() => { if (active != null) setPosition(Number(active) + 1); }, [active]);
  const activate = (index) => {
    const item = items[wrap(index)];
    setPosition(wrap(index));
    if (item.reset) onReset();
    else if (item.saved) onRestore(item.id);
  };
  const finish = (event) => {
    const start = gesture;
    setGesture(null);
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const centeredIndex = wrap(Math.round(wrap(start.position - deltaX / 38)));
    const tappedIndex = Number(event.target.closest?.('[data-camera-index]')?.dataset.cameraIndex);
    const targetIndex = Math.abs(deltaX) > 8 ? centeredIndex : Number.isFinite(tappedIndex) ? tappedIndex : centeredIndex;
    const centeredItem = items[centeredIndex];
    if (-deltaY > 34 && Math.abs(deltaY) > Math.abs(deltaX) && !centeredItem.reset) {
      setPosition(centeredIndex);
      onSave(centeredItem.id);
      setSaving(centeredItem.id);
      window.setTimeout(() => setSaving((current) => current === centeredItem.id ? null : current), 520);
    } else activate(targetIndex);
  };
  return <div className="mobile-camera-wheel" aria-label={language === 'zh' ? '机位轮盘' : 'Camera wheel'}>
    <span>{language === 'zh' ? '左右转动 · 上滑保存' : 'Rotate · Swipe up to save'}</span>
    <div className={`mobile-camera-arc${gesture ? ' dragging' : ''}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setGesture({ x: event.clientX, y: event.clientY, position }); }} onPointerMove={(event) => { if (!gesture) return; setPosition(wrap(gesture.position - (event.clientX - gesture.x) / 38)); }} onPointerUp={finish} onPointerCancel={() => { setGesture(null); setPosition(wrap(Math.round(position))); }}>
      {items.map((item, index) => {
        let distance = index - position;
        if (distance > count / 2) distance -= count;
        if (distance < -count / 2) distance += count;
        const angle = distance * 19;
        const visible = Math.abs(distance) <= 4.6;
        return <button type="button" key={item.id} data-camera-index={index} tabIndex={Math.abs(distance) < 0.5 ? 0 : -1} className={`${item.reset ? 'reset ' : ''}${Math.abs(distance) < 0.5 ? 'active ' : ''}${item.saved ? 'saved ' : ''}${saving === item.id ? 'saving' : ''}`} style={{ '--camera-angle': `${angle}deg`, '--camera-counter-angle': `${-angle}deg`, opacity: visible ? Math.max(0.18, 1 - Math.abs(distance) * 0.16) : 0, pointerEvents: visible ? 'auto' : 'none' }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); activate(index); }}><b>{item.reset ? 'RESET' : item.label}</b><i /></button>;
      })}
    </div>
  </div>;
}

function parseGetpos(value) {
  const text = String(value || '').replace(/[,\n]+/g, ' ');
  const setpos = text.match(/setpos(?:_exact)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  const setang = text.match(/setang(?:_exact)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  if (setpos && setang) return { position: setpos.slice(1, 4).map(Number), angles: setang.slice(1, 4).map(Number) };
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  return values.length >= 6 ? { position: values.slice(0, 3), angles: values.slice(3, 6) } : null;
}

const utilityPositionKey = (position) => position.map((value) => Math.round(value * 10) / 10).join(':');
const utilityRuntime = { notes: [], enabled: false, onHover: null };
const demoRosterRuntime = { snapshots: [], reloads: new Map() };
const demoPovRuntime = { player: null, playerId: '', toggle: null, interrupt: null };
const utilityPositionClusters = (notes) => {
  const clusters = [];
  notes.forEach((note) => {
    const [x, y, z] = note.position || [];
    const cluster = clusters.find((item) => {
      const [anchorX, anchorY, anchorZ] = item.anchor;
      const samePlace = !note.startPlace || !item.place || note.startPlace === item.place;
      return samePlace && Math.hypot(x - anchorX, y - anchorY) <= 16 && Math.abs(z - anchorZ) <= 8;
    });
    if (cluster) cluster.entries.push(note);
    else clusters.push({ key: utilityPositionKey(note.position), anchor: note.position, place: note.startPlace || '', entries: [note] });
  });
  return clusters;
};

const grenadeKind = (value = '') => {
  const name = String(value).toLowerCase();
  if (name.includes('smoke')) return 'smoke';
  if (name.includes('flash')) return 'flash';
  if (name === 'fire' || name.includes('molotov') || name.includes('incgrenade') || name.includes('incendiary') || name.includes('inferno')) return 'fire';
  if (name.includes('decoy')) return 'decoy';
  return 'he';
};

const grenadeLandingEvent = (kind) => ({ smoke: 'smokegrenade_detonate', flash: 'flashbang_detonate', fire: 'inferno_startburn', decoy: 'decoy_started', he: 'hegrenade_detonate' })[kind];

const meleeNames = ['knife', 'bayonet', 'karambit', 'butterfly', 'flip', 'gut', 'falchion', 'survival_bowie', 'bowie', 'tactical', 'huntsman', 'push', 'dagger', 'gypsy_jackknife', 'navaja', 'ursus', 'widowmaker', 'talon', 'stiletto', 'outdoor', 'nomad', 'skeleton', 'survival', 'cord', 'paracord', 'css', 'classic', 'kukri', 'melee'];
const pistolNames = ['glock', 'hkp2000', 'p2000', 'usp', 'p250', 'deagle', 'elite', 'beretta', 'fiveseven', 'tec9', 'cz75', 'revolver'];
const sniperNames = ['awp', 'ssg08', 'scar20', 'g3sg1'];
const smgNames = ['mp9', 'mac10', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon'];
const shotgunNames = ['nova', 'xm1014', 'mag7', 'sawedoff'];
const machineGunNames = ['negev', 'm249'];
const rifleNames = ['ak47', 'm4a4', 'm4a1', 'aug', 'sg556', 'sg553', 'famas', 'galilar'];
const utilityWeaponNames = ['smoke', 'flash', 'hegrenade', 'molotov', 'incgrenade', 'decoy', 'grenade'];
const demoWeaponKind = (value = '') => {
  const name = String(value).toLowerCase().replace(/^weapon_/, '').replace(/[- ]/g, '_');
  if (name.includes('c4')) return 'c4';
  if (utilityWeaponNames.some((weapon) => name.includes(weapon))) return 'utility';
  if (meleeNames.some((weapon) => name.includes(weapon))) return 'melee';
  if (pistolNames.some((weapon) => name.includes(weapon))) return 'pistol';
  if (sniperNames.some((weapon) => name.includes(weapon))) return 'sniper';
  if (smgNames.some((weapon) => name.includes(weapon))) return 'smg';
  if (shotgunNames.some((weapon) => name.includes(weapon))) return 'shotgun';
  if (machineGunNames.some((weapon) => name.includes(weapon))) return 'machinegun';
  if (rifleNames.some((weapon) => name.includes(weapon))) return 'rifle';
  return name ? 'rifle' : 'none';
};
const demoEquipmentKind = (value = '') => demoWeaponKind(value) === 'utility' ? `utility-${grenadeKind(value)}` : demoWeaponKind(value);

const roundReasonLabel = (reason, language) => ({
  bomb_defused: language === 'zh' ? '炸弹已拆除' : 'Bomb defused',
  time_ran_out: language === 'zh' ? '时间耗尽' : 'Time expired',
  t_killed: language === 'zh' ? 'T 方全灭' : 'T eliminated',
  ct_killed: language === 'zh' ? 'CT 方全灭' : 'CT eliminated',
  bomb_exploded: language === 'zh' ? '炸弹爆炸' : 'Bomb exploded',
  target_saved: language === 'zh' ? '目标保全' : 'Target saved',
})[reason] || String(reason || '').replaceAll('_', ' ');

const roundWinnerSide = (winner) => {
  const normalized = String(winner ?? '').toUpperCase();
  if (normalized === '2' || normalized === 'T' || normalized.includes('TERRORIST')) return 'T';
  if (normalized === '3' || normalized === 'CT' || normalized.includes('COUNTER')) return 'CT';
  return normalized || null;
};

function classifyTeamEconomy(players, roundNumber) {
  const valid = players.filter((player) => [player.currentEquipValue, player.roundStartEquipValue, player.cashSpentThisRound, player.balance].some(Number.isFinite));
  if (valid.length < 4) return { label: 'UNKNOWN', value: 0 };
  const values = valid.map((player) => Number.isFinite(player.currentEquipValue) ? player.currentEquipValue : Number(player.roundStartEquipValue) || 0);
  const totalEquip = values.reduce((sum, value) => sum + value, 0);
  const totalSpend = valid.reduce((sum, player) => sum + (Number(player.cashSpentThisRound) || 0), 0);
  const totalBalance = valid.reduce((sum, player) => sum + (Number(player.balance) || 0), 0);
  const averageEquip = totalEquip / valid.length;
  const averageSpend = totalSpend / valid.length;
  const averageBalance = totalBalance / valid.length;
  const commitment = totalSpend / Math.max(1, totalSpend + totalBalance);
  const pistolRound = roundNumber === 1 || roundNumber === 13;
  if (pistolRound && averageEquip < 1800) return { label: 'PISTOL', value: totalEquip };
  if (averageEquip >= 4000 && values.filter((value) => value >= 3000).length >= 4) return { label: 'FULL', value: totalEquip };
  if (averageEquip < 1500 && averageSpend <= 800 && values.filter((value) => value >= 2500).length <= 1) return { label: 'ECO', value: totalEquip };
  if (averageBalance >= 1500 && commitment < 0.65) return { label: 'HALF', value: totalEquip };
  return { label: 'FORCE', value: totalEquip };
}

function roundEconomy(round, roundData) {
  const snapshot = roundData?.snapshots?.find((item) => item.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData?.snapshots?.[0];
  const t = classifyTeamEconomy(snapshot?.players.filter((player) => player.team === 2) || [], Number(round.round));
  const ct = classifyTeamEconomy(snapshot?.players.filter((player) => player.team === 3) || [], Number(round.round));
  return { T: t, CT: ct, split: t.value + ct.value > 0 ? t.value / (t.value + ct.value) * 100 : 50 };
}

function roundSideSignature(roundData) {
  const snapshot = roundData?.snapshots?.find((item) => item.players.filter((player) => player.team === 2 || player.team === 3).length >= 8) || roundData?.snapshots?.[0];
  return new Map((snapshot?.players || []).filter((player) => player.steamid && (player.team === 2 || player.team === 3)).map((player) => [String(player.steamid), player.team]));
}

function sidesSwitched(previous, current) {
  let compared = 0;
  let switched = 0;
  current.forEach((team, steamid) => {
    const previousTeam = previous.get(steamid);
    if (!previousTeam) return;
    compared += 1;
    if (previousTeam !== team) switched += 1;
  });
  return compared >= 6 && switched / compared >= 0.75;
}

function DemoRoundOption({ round, economy, active, sideSwitch, onSelect }) {
  const winner = roundWinnerSide(round.winner);
  return <button type="button" className={`${active ? 'active ' : ''}${winner ? `winner-${winner.toLowerCase()} ` : ''}${sideSwitch ? 'side-switch' : ''}`.trim()} style={{ '--economy-split': `${economy?.split ?? 50}%` }} onClick={onSelect}><span className="economy-t">T {economy?.T.label}</span><strong>{round.round}</strong><span className="economy-ct">CT {economy?.CT.label}</span><i /></button>;
}

function groupDemoProjectiles(projectiles = []) {
  const byEntity = new Map();
  projectiles.forEach((projectile) => {
    if (!byEntity.has(projectile.entity_id)) byEntity.set(projectile.entity_id, []);
    byEntity.get(projectile.entity_id).push(projectile);
  });
  const groups = new Map();
  byEntity.forEach((unsorted, entityId) => {
    const records = [...unsorted].sort((left, right) => left.tick - right.tick);
    let segment = [];
    records.forEach((record, index) => {
      if (index > 0 && (record.tick - records[index - 1].tick > 2 || record.grenade_type !== records[index - 1].grenade_type)) {
        groups.set(`${entityId}-${segment[0].tick}`, segment);
        segment = [];
      }
      segment.push(record);
    });
    if (segment.length) groups.set(`${entityId}-${segment[0].tick}`, segment);
  });
  return groups;
}

function buildDemoGrenadeSegments(projectiles = [], events = [], snapshots = [], round, tickRate = 64) {
  if (!round) return [];
  const grenadeEvents = events.filter((event) => event.tick >= round.startTick && event.tick <= round.endTick);
  const throws = grenadeEvents.filter((event) => event.event_name === 'grenade_thrown');
  const landings = grenadeEvents.filter((event) => ['smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started'].includes(event.event_name));
  const usedThrows = new Set();
  const usedLandings = new Set();
  const segments = [];
  [...groupDemoProjectiles(projectiles)].sort((left, right) => left[1][0].tick - right[1][0].tick).forEach(([groupKey, records]) => {
    const first = records[0];
    const last = records.at(-1);
    const kind = grenadeKind(first.grenade_type);
    const landingName = grenadeLandingEvent(kind);
    const landing = landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.entityid === first.entity_id && event.tick >= first.tick && event.tick <= last.tick + tickRate)
      || landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.tick >= first.tick && event.tick <= last.tick + tickRate * 2);
    const projectileSteamid = String(first.thrower_steamid || first.steamid || '');
    const projectileName = first.thrower_name || first.name || '';
    const throwEvent = [...throws].reverse().find((event) => !usedThrows.has(event) && grenadeKind(event.weapon) === kind && event.tick <= first.tick && first.tick - event.tick <= tickRate * 2 && (projectileSteamid ? String(event.user_steamid || '') === projectileSteamid : projectileName ? event.user_name === projectileName : true));
    if (!throwEvent) return;
    usedThrows.add(throwEvent);
    if (landing) usedLandings.add(landing);
    const effectTick = landing?.tick ?? last.tick;
    segments.push({ id: `grenade-${groupKey}`, groupKey, entityId: first.entity_id, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, effectTick + 20), projectiles: records, snapshots });
  });
  throws.forEach((throwEvent) => {
    if (usedThrows.has(throwEvent) || throwEvent.user_X == null) return;
    const kind = grenadeKind(throwEvent.weapon);
    const landingName = grenadeLandingEvent(kind);
    const landing = landings.find((event) => !usedLandings.has(event) && event.event_name === landingName && event.tick > throwEvent.tick && event.tick - throwEvent.tick < tickRate * 10 && (event.user_steamid == null || throwEvent.user_steamid == null || event.user_steamid === throwEvent.user_steamid));
    if (!landing) return;
    usedLandings.add(landing);
    segments.push({ id: `grenade-fallback-${throwEvent.tick}-${throwEvent.user_steamid || 'unknown'}`, groupKey: null, entityId: landing.entityid, kind, throwEvent, landing, throwTick: throwEvent.tick, effectTick: landing.tick, startTick: Math.max(round.startTick, throwEvent.tick - tickRate * 2), endTick: Math.min(round.endTick, landing.tick + 20), projectiles: [], snapshots });
  });
  return segments;
}

function utilityReplayStart(segment, throwerId, throwerName, tickRate) {
  const rows = segment.snapshots.map((snapshot) => {
    const player = snapshot.players.find((item) => String(item.steamid || '') === throwerId || item.name === throwerName);
    return player ? { tick: snapshot.tick, player } : null;
  }).filter(Boolean).sort((left, right) => left.tick - right.tick);
  const preparation = rows.filter((row) => row.tick <= segment.throwTick && row.tick >= segment.throwTick - tickRate * 2);
  const motion = preparation.map((row, index) => {
    const previous = preparation[index - 1];
    if (!previous || row.tick <= previous.tick || !row.player.raw || !previous.player.raw) return { ...row, horizontalSpeed: null };
    const elapsed = (row.tick - previous.tick) / tickRate;
    return { ...row, horizontalSpeed: Math.hypot(row.player.raw.x - previous.player.raw.x, row.player.raw.y - previous.player.raw.y) / elapsed };
  });
  let zeroIndex = -1;
  for (let index = motion.length - 1; index >= 0; index -= 1) {
    if (motion[index].horizontalSpeed != null && motion[index].horizontalSpeed <= 5) { zeroIndex = index; break; }
  }
  const movementRows = motion.slice(zeroIndex >= 0 ? zeroIndex + 1 : 0);
  const speeds = movementRows.map((row) => row.horizontalSpeed).filter(Number.isFinite);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
  const distance = movementRows.reduce((sum, row, index) => {
    const previous = movementRows[index - 1];
    return previous?.player.raw && row.player.raw ? sum + Math.hypot(row.player.raw.x - previous.player.raw.x, row.player.raw.y - previous.player.raw.y) : sum;
  }, 0);
  const hasRunup = peakSpeed >= 20 && distance >= 4;
  if (hasRunup) return { startTick: motion[Math.max(0, zeroIndex)]?.tick ?? segment.startTick, hasRunup, peakSpeed, distance };

  const actionRows = preparation.filter((row) => row.tick >= segment.throwTick - Math.round(tickRate * 0.5));
  let actionStartTick = segment.throwTick;
  const nearestAttackIndex = actionRows.findLastIndex((row) => row.player.fire || row.player.secondaryFire);
  if (nearestAttackIndex >= 0) {
    let attackStartIndex = nearestAttackIndex;
    while (attackStartIndex > 0 && actionRows[attackStartIndex - 1].tick >= actionRows[attackStartIndex].tick - 1 && (actionRows[attackStartIndex - 1].player.fire || actionRows[attackStartIndex - 1].player.secondaryFire)) attackStartIndex -= 1;
    actionStartTick = Math.min(actionStartTick, actionRows[attackStartIndex].tick);
  }
  for (let index = 0; index < actionRows.length; index += 1) {
    const current = actionRows[index].player;
    const previous = actionRows[index - 1]?.player;
    const startedJump = current.isAirborne && !previous?.isAirborne;
    const startedMovement = (current.movement || []).some((key) => !(previous?.movement || []).includes(key));
    const startedCrouch = Number(current.duckAmount) >= 0.15 && Number(previous?.duckAmount || 0) < 0.15;
    if (startedJump || startedMovement || startedCrouch) actionStartTick = Math.min(actionStartTick, actionRows[index].tick);
  }
  return { startTick: actionStartTick, hasRunup: false, peakSpeed, distance };
}

function ThreeBoard({ mapName, navData, showEdges, showGrid, showModel, modelOpacity, modelViewMode, trackpadDetection, showDemoNames, demoSnapshot, demoSnapshots, demoTick, demoFires, demoHurts, demoGrenades, demoProjectiles, demoGrenadeSegments, onDemoGrenadeSelect, demoDeaths, demoC4Events, demoHltvEvents, demoCameraMode, demoInEyePlayer, onDemoCameraInterrupt, utilityNotes, utilityNotesEnabled, onUtilityHover, utilityFirstPerson, heatDeaths, demoViewFlags, analysisRows, analysisSelectedPlayers, analysisSide, analysisEnabled, analysisRounds, analysisTime, deletePointId, pointUpdate, onPointSelect, onGrenadeWheel, onCameraSlots, onReady, onModelLoadState, pointPlacementEnabled, brushEnabled, brushColor, brushWidth, eraserEnabled, onBrushChange, onCollabEdit }) {
  const mountRef = useRef(null);
  const edgesRef = useRef(null);
  const modelModeRef = useRef(null);
  const navFocusRef = useRef(null);
  const navGroupRef = useRef(null);
  const gridRef = useRef(null);
  const modelRef = useRef(null);
  const modelBasePositionRef = useRef(null);
  const demoSnapshotRef = useRef(demoSnapshot);
  const demoSnapshotsRef = useRef(demoSnapshots || []);
  const demoTickRef = useRef(demoTick);
  const demoFiresRef = useRef(demoFires);
  const demoHurtsRef = useRef(demoHurts || []);
  const demoGrenadesRef = useRef(demoGrenades);
  const demoProjectilesRef = useRef(demoProjectiles);
  const demoGrenadeSegmentsRef = useRef(demoGrenadeSegments || []);
  const demoGrenadeSelectRef = useRef(onDemoGrenadeSelect);
  const demoDeathsRef = useRef(demoDeaths || []);
  const demoC4EventsRef = useRef(demoC4Events || []);
  const demoHltvEventsRef = useRef(demoHltvEvents || []);
  const demoCameraModeRef = useRef(demoCameraMode || 'manual');
  const demoCameraInterruptRef = useRef(demoPovRuntime.interrupt || onDemoCameraInterrupt);
  const demoInEyePlayerRef = useRef(demoInEyePlayer || demoPovRuntime.player);
  const heatDeathsRef = useRef(heatDeaths || []);
  const demoViewFlagsRef = useRef(demoViewFlags || {});
  const showDemoNamesRef = useRef(showDemoNames);
  const hoveredDemoPlayerRef = useRef(null);
  const utilityNotesRef = useRef(utilityNotes || []);
  const utilityNotesEnabledRef = useRef(utilityNotesEnabled);
  const utilityHoverRef = useRef(onUtilityHover);
  const utilityFirstPersonRef = useRef(utilityFirstPerson);
  const analysisRowsRef = useRef(analysisRows || []);
  const analysisSelectedPlayersRef = useRef(analysisSelectedPlayers || []);
  const analysisEnabledRef = useRef(analysisEnabled);
  const pointPlacementEnabledRef = useRef(pointPlacementEnabled);
  const collabEditingEnabledRef = useRef(false);
  const brushEnabledRef = useRef(brushEnabled);
  const brushColorRef = useRef(brushColor || '#a5e0ff');
  const brushWidthRef = useRef(brushWidth || 3);
  const brushEraserRef = useRef(false);
  const onBrushChangeRef = useRef(onBrushChange);
  onBrushChangeRef.current = onBrushChange;
  const onCollabEditRef = useRef(onCollabEdit);
  onCollabEditRef.current = onCollabEdit;
  const modelLoadStateRef = useRef(onModelLoadState);
  modelLoadStateRef.current = onModelLoadState;
  const collabHistoryRef = useRef({ push: () => {}, undo: () => {}, redo: () => {} });
  const analysisRoundsRef = useRef(analysisRounds || []);
  const analysisTimeRef = useRef(analysisTime || 0);
  const analysisSideRef = useRef(analysisSide || 'ALL');
  const demoProjectileGroupsRef = useRef(new Map());
  const demoGrenadeObjectsRef = useRef(new Map());
  const demoPlayersRef = useRef(null);
  const modelVisibilityRef = useRef(showModel);
  const pointsRef = useRef([]);
  const pointSelectRef = useRef(onPointSelect);
  pointSelectRef.current = onPointSelect;
  const grenadeWheelRef = useRef(onGrenadeWheel);
  grenadeWheelRef.current = onGrenadeWheel;
  const [error, setError] = useState('');
  const trackpadDetectionRef = useRef(trackpadDetection);
  const wheelGestureRef = useRef({ mode: null, lastTime: 0 });
  trackpadDetectionRef.current = trackpadDetection;
  demoSnapshotRef.current = demoSnapshot;
  demoSnapshotsRef.current = demoSnapshots || [];
  demoTickRef.current = demoTick;
  demoFiresRef.current = demoFires;
  demoHurtsRef.current = demoHurts || [];
  demoGrenadesRef.current = demoGrenades;
  demoProjectilesRef.current = demoProjectiles;
  demoGrenadeSegmentsRef.current = demoGrenadeSegments || [];
  demoGrenadeSelectRef.current = onDemoGrenadeSelect;
  demoDeathsRef.current = demoDeaths || [];
  demoC4EventsRef.current = demoC4Events || [];
  demoHltvEventsRef.current = demoHltvEvents || [];
  demoCameraModeRef.current = demoCameraMode || 'manual';
  demoCameraInterruptRef.current = demoPovRuntime.interrupt || onDemoCameraInterrupt;
  demoInEyePlayerRef.current = demoInEyePlayer || demoPovRuntime.player;
  heatDeathsRef.current = heatDeaths || [];
  demoViewFlagsRef.current = demoViewFlags || {};
  showDemoNamesRef.current = showDemoNames;
  utilityNotesRef.current = utilityNotes || utilityRuntime.notes;
  utilityNotesEnabledRef.current = utilityNotesEnabled ?? utilityRuntime.enabled;
  utilityHoverRef.current = onUtilityHover || utilityRuntime.onHover;
  utilityFirstPersonRef.current = utilityFirstPerson;
  analysisRowsRef.current = analysisRows || [];
  analysisSelectedPlayersRef.current = analysisSelectedPlayers || [];
  analysisEnabledRef.current = analysisEnabled;
  pointPlacementEnabledRef.current = pointPlacementEnabled !== false;
  brushEnabledRef.current = brushEnabled !== false;
  brushColorRef.current = brushColor || brushColorRef.current;
  brushWidthRef.current = brushWidth || brushWidthRef.current;
  brushEraserRef.current = eraserEnabled === true;
  analysisRoundsRef.current = analysisRounds || [];
  analysisTimeRef.current = analysisTime || 0;
  analysisSideRef.current = analysisSide || 'ALL';
  useEffect(() => {
    demoProjectileGroupsRef.current = groupDemoProjectiles(demoProjectiles);
  }, [demoProjectiles]);

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
    const demoFlashedHeadColor = new THREE.Color('#e4e7e5');
    const demoDeathMarkers = new Map();
    const demoHeatObjects = new Map();
    const c4Group = new THREE.Group();
    const analysisGroup = new THREE.Group();
    const analysisPaths = new Map();
    const utilityNotesGroup = new THREE.Group();
    const utilityMarkers = new Map();
    const collabUtilitiesGroup = new THREE.Group();
    const collabUtilities = [];
    let frameTween = null;
    let utilitySignature = '';
    let analysisSignature = '';
    const collisionMeshes = [];
    const aimRaycaster = new THREE.Raycaster();
    aimRaycaster.firstHitOnly = true;
    let collisionVersion = 0;
    scene.add(analysisGroup);
    scene.add(utilityNotesGroup);
    scene.add(demoPlayers);
    scene.add(c4Group);
    scene.add(collabUtilitiesGroup);
    demoPlayersRef.current = demoPlayers;
    let modelCenter = new THREE.Vector3();
    const radarSourceBounds = Object.values(navData?.areas || {}).flatMap((area) => area.corners || []).reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.y * 0.0254),
      maxX: Math.max(bounds.maxX, point.y * 0.0254),
      minZ: Math.min(bounds.minZ, point.x * 0.0254),
      maxZ: Math.max(bounds.maxZ, point.x * 0.0254),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const navTopViewResolution = 256;
    const navTopViewMask = new Uint8Array(navTopViewResolution * navTopViewResolution);
    const navTopViewWidth = radarSourceBounds.maxX - radarSourceBounds.minX;
    const navTopViewDepth = radarSourceBounds.maxZ - radarSourceBounds.minZ;
    const navTopViewAreas = Object.values(navData?.areas || {}).map((area) => (area.corners || []).map((point) => ({ x: point.y * 0.0254, z: point.x * 0.0254 }))).filter((points) => points.length >= 3);
    const pointInNavPolygon = (x, z, points) => {
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const currentPoint = points[index];
        const previousPoint = points[previous];
        if ((currentPoint.z > z) !== (previousPoint.z > z) && x < ((previousPoint.x - currentPoint.x) * (z - currentPoint.z)) / (previousPoint.z - currentPoint.z) + currentPoint.x) inside = !inside;
      }
      return inside;
    };
    if (Number.isFinite(navTopViewWidth) && navTopViewWidth > 0 && navTopViewDepth > 0) navTopViewAreas.forEach((points) => {
      const minX = Math.max(0, Math.floor((Math.min(...points.map((point) => point.x)) - radarSourceBounds.minX) / navTopViewWidth * navTopViewResolution));
      const maxX = Math.min(navTopViewResolution - 1, Math.ceil((Math.max(...points.map((point) => point.x)) - radarSourceBounds.minX) / navTopViewWidth * navTopViewResolution));
      const minZ = Math.max(0, Math.floor((Math.min(...points.map((point) => point.z)) - radarSourceBounds.minZ) / navTopViewDepth * navTopViewResolution));
      const maxZ = Math.min(navTopViewResolution - 1, Math.ceil((Math.max(...points.map((point) => point.z)) - radarSourceBounds.minZ) / navTopViewDepth * navTopViewResolution));
      for (let zIndex = minZ; zIndex <= maxZ; zIndex += 1) for (let xIndex = minX; xIndex <= maxX; xIndex += 1) {
        const x = radarSourceBounds.minX + (xIndex + 0.5) / navTopViewResolution * navTopViewWidth;
        const z = radarSourceBounds.minZ + (zIndex + 0.5) / navTopViewResolution * navTopViewDepth;
        if (pointInNavPolygon(x, z, points)) navTopViewMask[zIndex * navTopViewResolution + xIndex] = 1;
      }
    });
    const isInNavTopView = (x, z) => {
      const xIndex = Math.floor((x - radarSourceBounds.minX) / navTopViewWidth * navTopViewResolution);
      const zIndex = Math.floor((z - radarSourceBounds.minZ) / navTopViewDepth * navTopViewResolution);
      return xIndex >= 0 && xIndex < navTopViewResolution && zIndex >= 0 && zIndex < navTopViewResolution && navTopViewMask[zIndex * navTopViewResolution + xIndex] === 1;
    };
    const navBoundaryCollider = new THREE.Object3D();
    navBoundaryCollider.raycast = (activeRaycaster, intersections) => {
      if (!Number.isFinite(radarSourceBounds.minX)) return;
      const origin = activeRaycaster.ray.origin;
      const direction = activeRaycaster.ray.direction;
      const isValidAt = (distance) => isInNavTopView(origin.x + direction.x * distance + modelCenter.x, origin.z + direction.z * distance + modelCenter.z);
      let distance = null;
      if (!isValidAt(activeRaycaster.near)) distance = activeRaycaster.near;
      else {
        const horizontalSpeed = Math.hypot(direction.x, direction.z);
        if (horizontalSpeed > 1e-6) {
          const cellSize = Math.min(navTopViewWidth, navTopViewDepth) / navTopViewResolution;
          const step = Math.max(0.02, cellSize * 0.45 / horizontalSpeed);
          let previous = activeRaycaster.near;
          for (let candidate = previous + step; candidate <= activeRaycaster.far + step; candidate += step) {
            const current = Math.min(candidate, activeRaycaster.far);
            if (!isValidAt(current)) {
              let valid = previous;
              let invalid = current;
              for (let iteration = 0; iteration < 7; iteration += 1) { const middle = (valid + invalid) / 2; if (isValidAt(middle)) valid = middle; else invalid = middle; }
              distance = invalid;
              break;
            }
            if (current === activeRaycaster.far) break;
            previous = current;
          }
        }
      }
      if (distance == null) return;
      intersections.push({ distance, point: activeRaycaster.ray.at(distance, new THREE.Vector3()), object: navBoundaryCollider });
    };
    const updateDemoPlayers = () => {
      const snapshot = demoSnapshotRef.current;
      if (!snapshot) { demoPlayers.visible = false; return; }
      demoPlayers.visible = true;
      const activeNames = new Set();
      snapshot.players.forEach((player) => {
        if (!player.name) return;
        const displaySide = player.team === 2 ? 'T' : 'CT';
        activeNames.add(player.name);
        let marker = demoMarkers.get(player.name);
        if (!marker) {
          const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
          marker = createTacticalPoint(new THREE.Vector3(), direction, `demo-${player.name}`, 5.25, displaySide, 'T');
          marker.scale.setScalar(1.35);
           marker.userData.playerName = player.name;
           marker.userData.demoPitch = player.pitch || 0;
           marker.userData.demoYaw = player.yaw || 0;
             const bodyMaterial = new THREE.MeshStandardMaterial({ color: displaySide === 'CT' ? '#5da9ff' : '#ffb347', roughness: 0.72, metalness: 0.04, transparent: true, opacity: 0.82 });
             const headMaterial = bodyMaterial.clone();
             marker.userData.demoBodyMaterial = bodyMaterial;
             marker.userData.demoHeadMaterial = headMaterial;
           const standingBody = new THREE.Group();
           standingBody.userData.demoStandingBody = true;
           const standingTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.82, 16), bodyMaterial);
           standingTorso.position.y = 0.52;
            const standingHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), headMaterial);
           standingHead.position.y = 1.1;
           standingBody.add(standingTorso, standingHead);
           const crouchedBody = new THREE.Group();
           crouchedBody.userData.demoCrouchedBody = true;
           const crouchedTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.38, 0.58, 16), bodyMaterial);
           crouchedTorso.position.y = 0.36;
            const crouchedHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), headMaterial);
            crouchedHead.position.y = 0.78;
            crouchedBody.add(crouchedTorso, crouchedHead);
            const equipment = new THREE.Group();
            equipment.userData.demoEquipment = true;
            equipment.position.set(0, 0.72, -0.4);
            const equipmentMaterial = new THREE.MeshStandardMaterial({ color: '#38423d', roughness: 0.82, metalness: 0.24 });
             const utilityMaterial = new THREE.MeshStandardMaterial({ color: '#65706a', roughness: 0.64, metalness: 0.36 });
             const utilitySmoke = new THREE.Group();
             utilitySmoke.userData.demoEquipmentKind = 'utility-smoke';
             utilitySmoke.position.set(0.18, 0, -0.06);
             const smokeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 12), utilityMaterial);
             const smokeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 10), equipmentMaterial);
             smokeCap.position.y = 0.18;
             utilitySmoke.add(smokeBody, smokeCap);
             const makeThinGrenade = (kind, color) => {
               const group = new THREE.Group();
               group.userData.demoEquipmentKind = `utility-${kind}`;
               group.position.set(0.18, 0, -0.06);
               const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.42 });
               const body = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.34, 10), material);
               const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), equipmentMaterial);
               cap.position.y = 0.19;
               group.add(body, cap);
               return group;
             };
             const utilityFlash = makeThinGrenade('flash', '#c9cec8');
             const utilityDecoy = makeThinGrenade('decoy', '#64716a');
             const utilityHe = new THREE.Group();
             utilityHe.userData.demoEquipmentKind = 'utility-he';
             utilityHe.position.set(0.18, 0, -0.06);
             const heBody = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), new THREE.MeshStandardMaterial({ color: '#4f6253', roughness: 0.72, metalness: 0.18 }));
             const heFuse = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 8), equipmentMaterial);
             heFuse.position.y = 0.14;
             utilityHe.add(heBody, heFuse);
             const utilityFire = new THREE.Group();
             utilityFire.userData.demoEquipmentKind = 'utility-fire';
             utilityFire.position.set(0.18, 0, -0.06);
             utilityFire.rotation.z = -0.12;
             const bottleMaterial = new THREE.MeshStandardMaterial({ color: '#7f4b32', roughness: 0.4, metalness: 0.08, transparent: true, opacity: 0.88 });
             const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.3, 12), bottleMaterial);
             const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.06, 0.13, 10), bottleMaterial);
             bottleNeck.position.y = 0.205;
             const bottleMouth = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.035, 10), equipmentMaterial);
             bottleMouth.position.y = 0.285;
             const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.025), new THREE.MeshStandardMaterial({ color: '#d0b28a', roughness: 0.96 }));
             cloth.position.set(0.045, 0.22, 0);
             cloth.rotation.z = -0.42;
             utilityFire.add(bottleBody, bottleNeck, bottleMouth, cloth);
            const rifle = new THREE.Group();
            rifle.userData.demoEquipmentKind = 'rifle';
            const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.62), equipmentMaterial);
            rifleBody.position.z = -0.19;
            const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.2), equipmentMaterial);
            rifleStock.position.set(0, 0, 0.2);
            const rifleBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), equipmentMaterial);
            rifleBarrel.position.z = -0.7;
            const rifleMagazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.13), equipmentMaterial);
            rifleMagazine.position.set(0, -0.17, -0.18);
            rifle.add(rifleBody, rifleStock, rifleBarrel, rifleMagazine);
            const pistol = new THREE.Group();
            pistol.userData.demoEquipmentKind = 'pistol';
            pistol.position.set(0.14, 0, 0);
            const pistolSlide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.38), equipmentMaterial);
            pistolSlide.position.z = -0.18;
            const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.27, 0.14), equipmentMaterial);
            pistolGrip.position.set(0, -0.16, -0.02);
            pistolGrip.rotation.x = -0.2;
            pistol.add(pistolSlide, pistolGrip);
            const sniper = new THREE.Group();
            sniper.userData.demoEquipmentKind = 'sniper';
            const sniperBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.72), equipmentMaterial);
            sniperBody.position.z = -0.24;
            const sniperBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8), equipmentMaterial);
            sniperBarrel.rotation.x = Math.PI / 2;
            sniperBarrel.position.z = -0.98;
            const sniperScope = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 10), equipmentMaterial);
            sniperScope.rotation.x = Math.PI / 2;
            sniperScope.position.set(0, 0.14, -0.25);
            const sniperStock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.3), equipmentMaterial);
            sniperStock.position.z = 0.27;
            sniper.add(sniperBody, sniperBarrel, sniperScope, sniperStock);
            const smg = new THREE.Group();
            smg.userData.demoEquipmentKind = 'smg';
            smg.position.x = 0.08;
            const smgBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.46), equipmentMaterial);
            smgBody.position.z = -0.16;
            const smgBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), equipmentMaterial);
            smgBarrel.position.z = -0.53;
            const smgGrip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.11), equipmentMaterial);
            smgGrip.position.set(0, -0.2, -0.14);
            const smgForegrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.09), equipmentMaterial);
            smgForegrip.position.set(0, -0.15, -0.4);
            smg.add(smgBody, smgBarrel, smgGrip, smgForegrip);
            const shotgun = new THREE.Group();
            shotgun.userData.demoEquipmentKind = 'shotgun';
            const shotgunStock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.35), equipmentMaterial);
            shotgunStock.position.z = 0.2;
            const shotgunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.95, 8), equipmentMaterial);
            shotgunBarrel.rotation.x = Math.PI / 2;
            shotgunBarrel.position.set(0, 0.06, -0.58);
            const shotgunTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), equipmentMaterial);
            shotgunTube.rotation.x = Math.PI / 2;
            shotgunTube.position.set(0, -0.07, -0.48);
            const shotgunPump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), equipmentMaterial);
            shotgunPump.position.z = -0.38;
            shotgun.add(shotgunStock, shotgunBarrel, shotgunTube, shotgunPump);
            const machinegun = new THREE.Group();
            machinegun.userData.demoEquipmentKind = 'machinegun';
            const machineBody = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.62), equipmentMaterial);
            machineBody.position.z = -0.2;
            const machineBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8), equipmentMaterial);
            machineBarrel.rotation.x = Math.PI / 2;
            machineBarrel.position.z = -0.86;
            const machineBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.32), equipmentMaterial);
            machineBox.position.set(0.16, -0.24, -0.13);
            const machineStock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.3), equipmentMaterial);
            machineStock.position.z = 0.28;
            machinegun.add(machineBody, machineBarrel, machineBox, machineStock);
            const melee = new THREE.Group();
            melee.userData.demoEquipmentKind = 'melee';
            melee.position.set(0.16, 0.05, -0.05);
            melee.rotation.z = -0.12;
            const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), equipmentMaterial);
            knifeHandle.position.y = -0.12;
            const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.14), new THREE.MeshStandardMaterial({ color: '#c6d0ca', roughness: 0.38, metalness: 0.75 }));
            knifeBlade.position.set(0, 0.27, -0.03);
            melee.add(knifeHandle, knifeBlade);
            const heldC4 = new THREE.Group();
            heldC4.userData.demoEquipmentKind = 'c4';
            const heldC4Body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: '#4b3831', roughness: 0.75, metalness: 0.15 }));
            const heldC4Display = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.025), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
            heldC4Display.position.set(0, 0.02, -0.09);
            heldC4.add(heldC4Body, heldC4Display);
            const defuseHands = new THREE.Group();
            defuseHands.userData.demoDefuseHands = true;
            const handMaterial = new THREE.MeshStandardMaterial({ color: '#d6a078', roughness: 0.8 });
            const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), handMaterial);
            leftHand.userData.demoDefuseHand = -1;
            const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), handMaterial);
            rightHand.userData.demoDefuseHand = 1;
            defuseHands.add(leftHand, rightHand);
            const defuseKit = new THREE.Group();
            defuseKit.userData.demoDefuseKit = true;
            const toolMaterial = new THREE.MeshStandardMaterial({ color: '#68c7b5', roughness: 0.48, metalness: 0.65 });
            const toolPivot = new THREE.Group();
            toolPivot.userData.demoDefuseToolPivot = true;
            const toolLeft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.46), toolMaterial);
            toolLeft.position.x = -0.055;
            toolLeft.rotation.z = -0.14;
            const toolRight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.46), toolMaterial);
            toolRight.position.x = 0.055;
            toolRight.rotation.z = 0.14;
            const toolJoint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), equipmentMaterial);
            toolJoint.position.z = -0.08;
            toolPivot.add(toolLeft, toolRight, toolJoint);
            defuseKit.add(toolPivot);
             equipment.add(utilitySmoke, utilityFlash, utilityDecoy, utilityHe, utilityFire, rifle, pistol, sniper, smg, shotgun, machinegun, melee, heldC4, defuseHands, defuseKit);
            marker.add(standingBody, crouchedBody, equipment);
           demoPlayers.add(marker);
           demoMarkers.set(player.name, marker);
           const canvas = document.createElement('canvas');
           canvas.width = 512; canvas.height = 96;
           const context = canvas.getContext('2d');
           context.font = 'bold 34px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
           context.fillStyle = '#f2f7ee'; context.strokeStyle = '#08100b'; context.lineWidth = 8;
           context.strokeText(player.name, 256, 48); context.fillText(player.name, 256, 48);
            const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false }));
            label.scale.set(6.3, 1.17, 1); label.position.set(0, 2.8, 0); label.renderOrder = 30;
            label.userData.demoNameLabel = true;
            label.raycast = () => {};
            marker.add(label);
        }
        marker.position.set(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z);
         updateTacticalPoint(marker, displaySide, 'T');
          const recentHurt = [...demoHurtsRef.current].reverse().find((event) => demoEventPlayerMatches(event, player) && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 10);
          const hitGroup = recentHurt?.hitgroup ?? recentHurt?.hit_group;
          const headshotHurt = Number(hitGroup) === 1 || String(hitGroup || '').toLowerCase() === 'head';
          const sideColor = displaySide === 'CT' ? '#5da9ff' : '#ffb347';
          const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
          const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
          const flashStrength = Number(player.flashMaxAlpha) > 0 ? THREE.MathUtils.clamp(Number(player.flashMaxAlpha) / 255, 0, 1) : flashDuration > 0 ? 1 : 0;
          const headFlash = flashStrength * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1) * 0.82;
          marker.userData.demoBodyMaterial?.color.set(recentHurt ? '#ff352f' : sideColor);
          marker.userData.demoHeadMaterial?.color.set(recentHurt && headshotHurt ? '#ff352f' : sideColor).lerp(demoFlashedHeadColor, recentHurt && headshotHurt ? 0 : headFlash);
        const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
        marker.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : marker.rotation.y;
         marker.userData.demoPitch = player.pitch || 0;
         marker.userData.demoYaw = player.yaw || 0;
         const duckAmount = THREE.MathUtils.clamp(player.duckAmount || 0, 0, 1);
          const standingBody = marker.children.find((child) => child.userData.demoStandingBody);
          const crouchedBody = marker.children.find((child) => child.userData.demoCrouchedBody);
           const hiddenInEye = (utilityFirstPersonRef.current?.player || demoInEyePlayerRef.current)?.name === player.name;
          marker.children.forEach((child) => { if (child.userData.tacticalPoint || child.userData.symbol) child.visible = !hiddenInEye; });
          if (standingBody) standingBody.visible = !hiddenInEye && duckAmount < 0.5;
           if (crouchedBody) crouchedBody.visible = !hiddenInEye && duckAmount >= 0.5;
          const equipment = marker.children.find((child) => child.userData.demoEquipment);
           if (equipment) {
              equipment.visible = !hiddenInEye;
             const defusing = Boolean(player.defusing);
             const weaponKind = demoEquipmentKind(player.activeWeapon);
             const reload = demoPlayerReload(demoRosterRuntime.reloads, player, demoTickRef.current);
             const reloadDrop = reload && !['melee', 'c4'].includes(weaponKind) && !weaponKind.startsWith('utility-') ? Math.sin(reload.progress * Math.PI) : 0;
             equipment.position.y = 0.72 - duckAmount * 0.28 - reloadDrop * 0.36;
             equipment.rotation.x = reloadDrop * 0.72;
             equipment.children.forEach((child) => { child.visible = child.userData.demoEquipmentKind === weaponKind && !defusing; });
            const defuseHands = equipment.children.find((child) => child.userData.demoDefuseHands);
            const defuseKit = equipment.children.find((child) => child.userData.demoDefuseKit);
            if (defuseHands) {
              defuseHands.visible = defusing && !player.hasDefuser;
              const phase = demoTickRef.current * 0.24;
              defuseHands.children.forEach((hand) => hand.position.set(hand.userData.demoDefuseHand * (0.15 + Math.sin(phase) * 0.035), Math.sin(phase + hand.userData.demoDefuseHand * Math.PI * 0.5) * 0.06, -0.08 - Math.cos(phase) * 0.04));
            }
            if (defuseKit) {
              defuseKit.visible = defusing && player.hasDefuser;
              const pivot = defuseKit.children.find((child) => child.userData.demoDefuseToolPivot);
              if (pivot) { pivot.position.x = Math.sin(demoTickRef.current * 0.22) * 0.16; pivot.rotation.y = Math.sin(demoTickRef.current * 0.18) * 0.32; }
            }
          }
         const nameLabel = marker.children.find((child) => child.userData.demoNameLabel);
          if (nameLabel) {
            nameLabel.visible = !hiddenInEye && Boolean(showDemoNamesRef.current || hoveredDemoPlayerRef.current === player.name);
            const labelWorldPosition = marker.localToWorld(nameLabel.position.clone());
            const viewDepth = Math.max(0.1, -labelWorldPosition.applyMatrix4(camera.matrixWorldInverse).z);
            const viewportHeight = Math.max(1, renderer.domElement.clientHeight);
            const worldHeight = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (36 / viewportHeight);
            const parentScale = marker.getWorldScale(new THREE.Vector3());
            const localHeight = worldHeight / Math.max(0.001, parentScale.y);
            nameLabel.scale.set(localHeight * (512 / 96), localHeight, 1);
          }
          const aimRay = marker.children.find((child) => child.userData.aimRay);
           if (aimRay) {
             aimRay.visible = !hiddenInEye;
             aimRay.material.color.set(player.scoped ? '#ff352f' : displaySide === 'CT' ? '#5da9ff' : '#ffb347');
            const pitch = THREE.MathUtils.degToRad(player.pitch || 0);
            const origin = new THREE.Vector3(0, 0.93 - duckAmount * 0.339, -0.42);
            aimRay.position.copy(origin);
            aimRay.rotation.set(-pitch, 0, 0);
            const collisionKey = `${snapshot.tick}:${collisionVersion}`;
            if (marker.userData.aimCollisionKey !== collisionKey) {
              marker.userData.aimCollisionKey = collisionKey;
              const lineOrigin = new THREE.Vector3(0, 0.15, 0).applyEuler(aimRay.rotation).add(origin);
              const worldOrigin = marker.localToWorld(lineOrigin.clone());
              const worldDirection = new THREE.Vector3(0, 0, -1).applyEuler(aimRay.rotation).applyQuaternion(marker.quaternion).normalize();
              aimRaycaster.set(worldOrigin, worldDirection);
              aimRaycaster.near = 0.05;
              aimRaycaster.far = 72;
              const worldLength = Math.max(0.05, (aimRaycaster.intersectObjects(collisionMeshes, false)[0]?.distance ?? 72) - 0.03);
              const worldScale = marker.getWorldScale(new THREE.Vector3()).z || 1;
              marker.userData.aimCollisionLength = worldLength / worldScale;
            }
            const length = marker.userData.aimCollisionLength ?? 72;
            aimRay.scale.z = length;
            marker.userData.aimTarget.visible = !hiddenInEye;
            marker.userData.aimTarget?.position.copy(new THREE.Vector3(0, 0.15, -length).applyEuler(aimRay.rotation).add(origin));
         }
         if (!marker.userData.muzzleFlash) {
          marker.userData.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true }));
          marker.userData.muzzleFlash.position.set(0, 0.28, -0.42);
          marker.add(marker.userData.muzzleFlash);
        }
        const firing = demoFiresRef.current.some((event) => event.user_name === player.name && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 8);
          marker.userData.muzzleFlash.visible = firing && !hiddenInEye;
         marker.userData.muzzleFlash.scale.setScalar(firing ? 1 + Math.sin(performance.now() * 0.04) * 0.35 : 0.01);
         let movementTrail = demoMovementTrails.get(player.name);
         if (!movementTrail) {
           const geometry = new THREE.BufferGeometry();
           geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
           geometry.setAttribute('puffSize', new THREE.Float32BufferAttribute(new Float32Array(12), 1));
           geometry.setAttribute('puffOpacity', new THREE.Float32BufferAttribute(new Float32Array(12), 1));
           geometry.setDrawRange(0, 0);
           const material = new THREE.ShaderMaterial({
             transparent: true,
             depthTest: true,
             depthWrite: false,
             uniforms: { color: { value: new THREE.Color('#eef1eb') } },
             vertexShader: `attribute float puffSize; attribute float puffOpacity; varying float vOpacity; void main(){ vec4 viewPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewPosition; gl_PointSize = puffSize * (300.0 / max(1.0, -viewPosition.z)); vOpacity = puffOpacity; }`,
             fragmentShader: `uniform vec3 color; varying float vOpacity; void main(){ vec2 p = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.18, 0.42, length(p - vec2(-0.12, 0.02))); float b = 1.0 - smoothstep(0.14, 0.34, length(p - vec2(0.16, 0.08))); float c = 1.0 - smoothstep(0.12, 0.3, length(p - vec2(0.02, -0.14))); float alpha = max(a, max(b, c)) * vOpacity; if(alpha < 0.02) discard; gl_FragColor = vec4(color, alpha); }`,
           });
           movementTrail = new THREE.Points(geometry, material);
           movementTrail.frustumCulled = false;
           movementTrail.renderOrder = 5;
           scene.add(movementTrail);
           demoMovementTrails.set(player.name, movementTrail);
         }
         const awpScoped = player.scoped && String(player.activeWeapon || '').toLowerCase().includes('awp');
         const recentPlayerPositions = demoSnapshotsRef.current.filter((record) => record.tick <= snapshot.tick && record.tick >= snapshot.tick - 24).map((record) => record.players.find((candidate) => candidate.name === player.name)).filter(Boolean);
         const oldestPosition = recentPlayerPositions[0]?.position;
         const newestPosition = recentPlayerPositions.at(-1)?.position;
         const moving = oldestPosition && newestPosition ? Math.hypot(newestPosition.x - oldestPosition.x, newestPosition.z - oldestPosition.z) > 0.08 : Number(player.velocity) > 5 || Math.hypot(Number(player.velocityX) || 0, Number(player.velocityY) || 0) > 5;
         if (movementTrail.userData.lastTick != null && snapshot.tick < movementTrail.userData.lastTick) movementTrail.userData.movingUntilTick = snapshot.tick;
         movementTrail.userData.lastTick = snapshot.tick;
         if (moving) movementTrail.userData.movingUntilTick = snapshot.tick + 24;
         const movementActive = snapshot.tick <= (movementTrail.userData.movingUntilTick ?? -1);
          const showMovementTrail = !hiddenInEye && player.health > 0 && movementActive && !player.walking && duckAmount < 0.5 && !awpScoped;
         if (showMovementTrail) {
           const sourceRecords = demoSnapshotsRef.current.filter((record) => record.tick <= snapshot.tick && record.tick >= snapshot.tick - 88).map((record) => ({ tick: record.tick, player: record.players.find((candidate) => candidate.name === player.name) })).filter((record) => record.player);
           const samplePosition = (targetTick) => {
             let before = sourceRecords[0];
             let after = sourceRecords.at(-1);
             for (let index = 1; index < sourceRecords.length; index += 1) if (sourceRecords[index].tick >= targetTick) { before = sourceRecords[index - 1]; after = sourceRecords[index]; break; }
             if (!before || !after) return null;
             const amount = before.tick === after.tick ? 0 : THREE.MathUtils.clamp((targetTick - before.tick) / (after.tick - before.tick), 0, 1);
             return { tick: targetTick, position: { x: THREE.MathUtils.lerp(before.player.position.x, after.player.position.x, amount), y: THREE.MathUtils.lerp(before.player.position.y, after.player.position.y, amount), z: THREE.MathUtils.lerp(before.player.position.z, after.player.position.z, amount) } };
           };
           const records = Array.from({ length: 12 }, (_, index) => samplePosition(snapshot.tick - 8 - index * 6)).filter(Boolean).reverse();
           const positions = movementTrail.geometry.attributes.position;
           const sizes = movementTrail.geometry.attributes.puffSize;
           const opacities = movementTrail.geometry.attributes.puffOpacity;
           const playerSeed = [...player.name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
           records.forEach((record, index) => {
             const age = THREE.MathUtils.clamp((snapshot.tick - record.tick) / 64, 0, 1);
             const seed = playerSeed + index * 97;
             const drift = Math.sin(seed * 1.73 + demoTickRef.current * 0.025) * 0.055 * age;
             const sizeVariation = 0.78 + (Math.sin(seed * 2.41) * 0.5 + 0.5) * 0.55;
             positions.setXYZ(index, record.position.x - modelCenter.x + drift, record.position.y - modelCenter.y + 0.16 + age * 0.24, record.position.z - modelCenter.z + Math.cos(seed * 1.21) * 0.065 * age);
             sizes.setX(index, THREE.MathUtils.lerp(1.8, 3.8, age) * sizeVariation);
             opacities.setX(index, 0.58 * Math.pow(1 - age, 1.25));
           });
           positions.needsUpdate = true;
           sizes.needsUpdate = true;
           opacities.needsUpdate = true;
           movementTrail.geometry.setDrawRange(0, records.length);
         }
         movementTrail.visible = showMovementTrail && movementTrail.geometry.drawRange.count > 0;
         marker.visible = player.health > 0;
       });
       demoMarkers.forEach((marker, name) => { if (!activeNames.has(name)) marker.visible = false; });
       demoMovementTrails.forEach((trail, name) => { if (!activeNames.has(name)) trail.visible = false; });
    };
    const updateDemoDeaths = () => {
      const active = new Set();
      if (analysisEnabledRef.current) {
        demoDeathMarkers.forEach((marker) => { marker.visible = false; });
        return;
      }
      const flags = demoViewFlagsRef.current;
      demoDeathsRef.current.forEach((event) => {
        const locations = [];
        if (flags.deathVictim) locations.push(['victim', event.user_X, event.user_Y, event.user_Z, event.user_team_num === 2 ? '#ffb347' : event.user_team_num === 3 ? '#5da9ff' : '#ff5d5d']);
        locations.forEach(([kind, x, y, z, color]) => {
          if (x == null || y == null || z == null) return;
          const key = `${kind}-${event.tick}-${event.user_steamid || event.user_name || 'death'}`;
          active.add(key);
          let marker = demoDeathMarkers.get(key);
          if (!marker) {
            const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false });
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 20), material);
            ring.rotation.x = -Math.PI / 2;
            const cross = new THREE.Group();
            cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.09), material), new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.09), material));
            cross.children[0].rotation.y = Math.PI / 4;
            cross.children[1].rotation.y = -Math.PI / 4;
            marker = new THREE.Group();
            marker.add(ring, cross);
            marker.renderOrder = 20;
            scene.add(marker);
            demoDeathMarkers.set(key, marker);
          }
          marker.position.set(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y + 0.32, x * 0.0254 - modelCenter.z);
          marker.visible = true;
        });
      });
      demoDeathMarkers.forEach((marker, key) => {
        if (!active.has(key)) marker.visible = false;
      });
    };
    const updateDeathHeat = () => {
      const flags = demoViewFlagsRef.current;
      const selectedPlayers = new Set(analysisSelectedPlayersRef.current);
      const analysisMode = analysisEnabledRef.current;
      const cells = new Map();
      const add = (kind, x, y, z, color) => {
        if (x == null || y == null || z == null) return;
        const worldX = y * 0.0254 - modelCenter.x;
        const worldZ = x * 0.0254 - modelCenter.z;
        const cell = `${kind}-${Math.round(worldX / 1.2)}-${Math.round(worldZ / 1.2)}`;
        const value = cells.get(cell) || { kind, x: worldX, z: worldZ, y: z * 0.0254 - modelCenter.y, count: 0, color };
        value.count += 1;
        cells.set(cell, value);
      };
      heatDeathsRef.current.forEach((event) => {
        const selectedAttacker = !analysisMode || selectedPlayers.has(event.attacker_name);
        const selectedVictim = !analysisMode || selectedPlayers.has(event.user_name);
        if (flags.killerHeat && selectedAttacker) add('killerHeat', event.attacker_X, event.attacker_Y, event.attacker_Z, '#ffb347');
        if (flags.targetHeat && selectedAttacker) add('targetHeat', event.user_X, event.user_Y, event.user_Z, '#ff6b6b');
        if (flags.victimHeat && selectedVictim) add('victimHeat', event.user_X, event.user_Y, event.user_Z, '#5da9ff');
        if (flags.opponentHeat && selectedVictim) add('opponentHeat', event.attacker_X, event.attacker_Y, event.attacker_Z, '#c58cff');
      });
      const active = new Set(cells.keys());
      cells.forEach((cell, key) => {
        let heat = demoHeatObjects.get(key);
        if (!heat) {
          heat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), new THREE.MeshBasicMaterial({ color: cell.color, transparent: true, opacity: 0.25, depthTest: true, depthWrite: false }));
          heat.renderOrder = 4;
          scene.add(heat);
          demoHeatObjects.set(key, heat);
        }
        const origin = new THREE.Vector3(cell.x, cell.y + 0.04, cell.z);
        if (nav?.mesh) {
          raycaster.set(new THREE.Vector3(cell.x, cell.y + 50, cell.z), new THREE.Vector3(0, -1, 0));
          const hit = raycaster.intersectObject(nav.mesh, true)[0];
          if (hit) origin.y = hit.point.y + 0.025;
        }
        heat.position.copy(origin);
        heat.scale.setScalar(0.85 + Math.min(cell.count, 8) * 0.14);
        heat.material.opacity = Math.min(0.78, 0.24 + cell.count * 0.09);
      });
      demoHeatObjects.forEach((heat, key) => { if (!active.has(key)) { scene.remove(heat); heat.geometry.dispose(); heat.material.dispose(); demoHeatObjects.delete(key); } });
    };
    const updateAnalysis = () => {
      if (!analysisEnabledRef.current || !analysisRowsRef.current.length) {
        if (analysisGroup.visible) {
          analysisPaths.forEach((item) => { item.line.geometry.dispose(); item.line.material.dispose(); item.marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); analysisGroup.remove(item.line, item.marker); });
          analysisPaths.clear();
          analysisSignature = '';
        }
        analysisGroup.visible = false;
        return;
      }
      analysisGroup.visible = true;
      const selected = analysisSelectedPlayersRef.current;
      const signature = `${selected.join('|')}:${analysisSideRef.current}:${analysisRowsRef.current.length}:${analysisRoundsRef.current.length}`;
      if (signature !== analysisSignature) {
        analysisPaths.forEach((item) => { item.line.geometry.dispose(); item.line.material.dispose(); item.marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); analysisGroup.remove(item.line, item.marker); });
        analysisPaths.clear();
        const rowsByRound = analysisRoundsRef.current.map(() => []);
        analysisRowsRef.current.forEach((snapshot) => {
          const roundIndex = analysisRoundsRef.current.findIndex((round) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick);
          if (roundIndex >= 0) rowsByRound[roundIndex].push(snapshot);
        });
        selected.forEach((name) => analysisRoundsRef.current.forEach((round, roundIndex) => {
           const records = (rowsByRound[roundIndex] || []).flatMap((snapshot) => snapshot.players.filter((player) => player.name === name).map((player) => ({ time: snapshot.tick - round.startTick, health: player.health, team: player.team, yaw: player.yaw || 0, pitch: THREE.MathUtils.degToRad(player.pitch || 0), crouched: (player.duckAmount || 0) > 0.45, weapon: player.activeWeapon || '', position: new THREE.Vector3(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.08, player.position.z - modelCenter.z) }))).sort((left, right) => left.time - right.time);
          const roundSide = records[0]?.team === 2 ? 'T' : records[0] ? 'CT' : null;
          if (analysisSideRef.current !== 'ALL' && roundSide !== analysisSideRef.current) return;
          const deathIndex = records.findIndex((record) => record.health != null && record.health <= 0);
          const visibleRecords = deathIndex >= 0 ? records.slice(0, deathIndex + 1) : records;
          if (visibleRecords.length < 2) return;
          const geometry = new THREE.BufferGeometry().setFromPoints(visibleRecords.map((record) => record.position));
          geometry.setDrawRange(0, 0);
          geometry.computeBoundingSphere();
          const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: '#c9f76b', dashSize: 0.28, gapSize: 0.16, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false }));
          line.renderOrder = 5;
          line.computeLineDistances();
          const marker = createCollabPlayer({ position: new THREE.Vector3(), id: `analysis-${name}-${roundIndex}`, name, team: records[0].team === 2 ? 'T' : 'CT', crouched: records[0].crouched, pitch: records[0].pitch, weapon: records[0].weapon });
          marker.geometry = { dispose() {} };
          marker.material = { dispose() {} };
          marker.renderOrder = 5;
          analysisGroup.add(line, marker);
          analysisPaths.set(`${name}-${roundIndex}`, { line, marker, records: visibleRecords });
        }));
        analysisSignature = signature;
      }
      analysisPaths.forEach(({ line, marker, records }) => {
        let visibleCount = 0;
        let current = records[0];
        records.forEach((record, index) => { if (record.time <= analysisTimeRef.current) { visibleCount = index + 1; current = record; } });
        line.geometry.setDrawRange(0, Math.max(0, visibleCount));
        const next = records[visibleCount] || current;
        if (next !== current && next.time > current.time) {
          const amount = THREE.MathUtils.clamp((analysisTimeRef.current - current.time) / (next.time - current.time), 0, 1);
          marker.position.copy(current.position).lerp(next.position, amount);
          const yaw = lerpAngleDegrees(current.yaw || 0, next.yaw || 0, amount);
          marker.rotation.y = Math.atan2(-Math.sin(THREE.MathUtils.degToRad(yaw)), -Math.cos(THREE.MathUtils.degToRad(yaw)));
          setCollabPlayerPitch(marker, THREE.MathUtils.lerp(current.pitch || 0, next.pitch || 0, amount));
          setCollabPlayerCrouch(marker, amount < 0.5 ? current.crouched : next.crouched);
        } else {
          marker.position.copy(current.position);
          marker.rotation.y = Math.atan2(-Math.sin(THREE.MathUtils.degToRad(current.yaw || 0)), -Math.cos(THREE.MathUtils.degToRad(current.yaw || 0)));
          setCollabPlayerPitch(marker, current.pitch || 0);
          setCollabPlayerCrouch(marker, current.crouched);
        }
        marker.visible = visibleCount > 0;
      });
    };
    const updateUtilityNotes = () => {
      utilityNotesGroup.visible = Boolean(utilityNotesEnabledRef.current);
      if (!utilityNotesGroup.visible) {
        if (utilityMarkers.size) {
          utilityMarkers.forEach((marker) => marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }));
          utilityNotesGroup.clear();
          utilityMarkers.clear();
          utilitySignature = '';
        }
        return;
      }
      const notes = utilityNotesRef.current;
      const signature = `${collisionVersion}:${JSON.stringify(notes.map((note) => [note.id, note.position, note.angles]))}`;
      if (signature === utilitySignature) return;
      utilityMarkers.forEach((marker) => marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }));
      utilityNotesGroup.clear();
      utilityMarkers.clear();
      utilityPositionClusters(notes).forEach(({ entries, key }) => {
        const [sourceX, sourceY, sourceZ] = entries[0].position;
        const marker = new THREE.Group();
        marker.position.set(sourceY * 0.0254 - modelCenter.x, sourceZ * 0.0254 - modelCenter.y + 0.05, sourceX * 0.0254 - modelCenter.z);
        marker.userData.utilityPositionKey = key;
        marker.userData.utilityEntries = entries;
        const material = new THREE.MeshStandardMaterial({ color: '#c58cff', emissive: '#30134e', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.12, depthTest: true, depthWrite: true });
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 20), material);
        pin.position.y = 0.34;
        pin.rotation.x = Math.PI;
        pin.renderOrder = 4;
        pin.userData.utilityMarker = true;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#dfb8ff', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }));
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.06;
        halo.renderOrder = 5;
        halo.userData.utilityMarker = true;
        marker.add(pin, halo);
        utilityNotesGroup.add(marker);
        utilityMarkers.set(key, marker);
      });
      utilitySignature = signature;
    };
    const updateDemoGrenades = () => {
      const active = new Set();
      const projectileGroups = demoProjectileGroupsRef.current;
      projectileGroups.forEach((records, groupKey) => {
        const entityId = records[0].entity_id;
        const first = records[0];
        const last = records[records.length - 1];
        const detonation = demoGrenadesRef.current.find((event) => event.entityid === entityId && event.tick >= first.tick && event.tick <= last.tick + 64 && (event.event_name.endsWith('_detonate') || event.event_name === 'inferno_startburn'));
        const fadeStartTick = detonation?.tick ?? last.tick;
        const fadeTicks = 64;
        if (demoTickRef.current < first.tick || demoTickRef.current > fadeStartTick + fadeTicks) return;
        const key = `projectile-${groupKey}`;
        active.add(key);
        let trajectory = demoGrenadeObjectsRef.current.get(key);
        const pathRecords = records.filter((record) => record.tick <= fadeStartTick);
        const points = pathRecords.map((record) => new THREE.Vector3(record.y * 0.0254 - modelCenter.x, record.z * 0.0254 - modelCenter.y, record.x * 0.0254 - modelCenter.z));
        if (!trajectory) {
          const color = first.grenade_type?.includes('Smoke') ? '#b9c7d6' : first.grenade_type?.includes('Flash') ? '#fff3a6' : first.grenade_type?.includes('Molotov') ? '#ff7a45' : first.grenade_type?.includes('Decoy') ? '#c8d0d4' : '#ffb36b';
          trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.length > 1 ? points : [points[0], points[0]]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
          trajectory.userData.demoTrajectory = { firstTick: first.tick, lastTick: fadeStartTick, fadeTicks, pointCount: points.length };
          trajectory.userData.demoGrenadeSegmentId = demoGrenadeSegmentsRef.current.find((segment) => segment.groupKey === groupKey)?.id;
          scene.add(trajectory);
          demoGrenadeObjectsRef.current.set(key, trajectory);
        }
        const trajectoryData = trajectory.userData.demoTrajectory;
        if (demoTickRef.current <= trajectoryData.lastTick) {
          const progress = THREE.MathUtils.clamp((demoTickRef.current - trajectoryData.firstTick) / Math.max(1, trajectoryData.lastTick - trajectoryData.firstTick), 0, 1);
          trajectory.geometry.setDrawRange(0, Math.max(2, Math.ceil(progress * trajectoryData.pointCount)));
          trajectory.material.opacity = 0.9;
        } else {
          const fade = THREE.MathUtils.clamp((demoTickRef.current - trajectoryData.lastTick) / trajectoryData.fadeTicks, 0, 1);
          const start = Math.floor(fade * trajectoryData.pointCount * 0.85);
          trajectory.geometry.setDrawRange(start, Math.max(0, trajectoryData.pointCount - start));
          trajectory.material.opacity = 0.9 * (1 - fade);
        }
      });
       const durations = { smokegrenade_detonate: 1152, inferno_startburn: 448, flashbang_detonate: 20, hegrenade_detonate: 20 };
      const grenadeEvents = demoGrenadesRef.current;
       demoGrenadeSegmentsRef.current.filter((segment) => !segment.groupKey).forEach((segment) => {
         const event = segment.throwEvent;
         const landing = segment.landing;
         if (!landing || demoTickRef.current < event.tick || demoTickRef.current > landing.tick) return;
        const key = `trajectory-${event.tick}-${event.user_steamid}-${event.weapon}`;
        active.add(key);
        let trajectory = demoGrenadeObjectsRef.current.get(key);
        if (!trajectory) {
          const start = new THREE.Vector3(event.user_Y * 0.0254 - modelCenter.x, event.user_Z * 0.0254 - modelCenter.y + 0.2, event.user_X * 0.0254 - modelCenter.z);
          const end = new THREE.Vector3(landing.y * 0.0254 - modelCenter.x, landing.z * 0.0254 - modelCenter.y, landing.x * 0.0254 - modelCenter.z);
          const control = start.clone().lerp(end, 0.5);
          control.y += Math.max(0.8, start.distanceTo(end) * 0.22);
          const curve = new THREE.QuadraticBezierCurve3(start, control, end);
          const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(2));
          const color = event.weapon?.includes('smoke') ? '#b9c7d6' : event.weapon?.includes('flash') ? '#fff3a6' : event.weapon?.includes('molotov') || event.weapon?.includes('inc') ? '#ff7a45' : '#ffb36b';
           trajectory = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
           trajectory.userData.demoTrajectory = { curve, landingTick: landing.tick, throwTick: event.tick };
           trajectory.userData.demoGrenadeSegmentId = segment.id;
          scene.add(trajectory);
          demoGrenadeObjectsRef.current.set(key, trajectory);
        }
        const trajectoryData = trajectory.userData.demoTrajectory;
        const progress = THREE.MathUtils.clamp((demoTickRef.current - trajectoryData.throwTick) / (trajectoryData.landingTick - trajectoryData.throwTick), 0, 1);
        trajectory.geometry.setFromPoints(trajectoryData.curve.getPoints(Math.max(2, Math.ceil(progress * 20))));
      });
       grenadeEvents.filter((event) => event.event_name !== 'grenade_thrown' && event.event_name !== 'decoy_detonate').forEach((event) => {
         const decoyEnd = event.event_name === 'decoy_started' ? grenadeEvents.find((candidate) => candidate.event_name === 'decoy_detonate' && candidate.tick > event.tick && candidate.tick - event.tick <= 1280 && (candidate.entityid == null || event.entityid == null || candidate.entityid === event.entityid)) : null;
         const duration = event.event_name === 'decoy_started' ? (decoyEnd?.tick - event.tick || 960) : durations[event.event_name] || 20;
        if (demoTickRef.current < event.tick || demoTickRef.current > event.tick + duration || event.x == null) return;
        const key = `${event.event_name}-${event.tick}-${event.entityid || event.user_steamid}`;
        active.add(key);
        let effect = demoGrenadeObjectsRef.current.get(key);
        if (!effect) {
          const position = new THREE.Vector3(event.y * 0.0254 - modelCenter.x, event.z * 0.0254 - modelCenter.y, event.x * 0.0254 - modelCenter.z);
            const type = event.event_name === 'smokegrenade_detonate' ? 'smoke' : event.event_name === 'inferno_startburn' ? 'fire' : event.event_name === 'flashbang_detonate' ? 'flash' : event.event_name === 'decoy_started' ? 'decoy' : 'explosion';
           effect = createGrenadeEffect(position, type, navData, nav);
           effect.userData.demoGrenadeSegmentId = demoGrenadeSegmentsRef.current.find((segment) => {
             const landing = segment.landing;
             if (!landing || landing.tick !== event.tick || landing.event_name !== event.event_name) return false;
             if (landing.user_steamid != null && event.user_steamid != null) return String(landing.user_steamid) === String(event.user_steamid);
             return true;
           })?.id;
          scene.add(effect);
          demoGrenadeObjectsRef.current.set(key, effect);
        }
         if (event.event_name === 'decoy_started') {
          const blink = effect.children.find((child) => child.userData.decoyBlink);
          if (blink?.material?.color) blink.material.color.set(performance.now() % 1000 < 250 ? '#ffffff' : '#7f8b91');
        }
      });
      demoGrenadeObjectsRef.current.forEach((effect, key) => {
        if (!active.has(key)) { scene.remove(effect); disposeGrenadeEffect(effect); demoGrenadeObjectsRef.current.delete(key); }
      });
    };
    const c4Block = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.28), new THREE.MeshBasicMaterial({ color: '#ff3b30', depthTest: true, depthWrite: false }));
    const c4WaveMaterial = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
    const c4Wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.9, 48), c4WaveMaterial);
    c4Wave.rotation.x = -Math.PI / 2;
    const c4Trajectory = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff5a4f', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false }));
    const c4DefuseProgress = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, index) => { const angle = -Math.PI / 2 + index / 64 * Math.PI * 2; return new THREE.Vector3(Math.cos(angle) * 0.62, 0.09, Math.sin(angle) * 0.62); })), new THREE.LineBasicMaterial({ color: '#72d4ff', transparent: true, opacity: 0.95, depthTest: true, depthWrite: false }));
    c4DefuseProgress.geometry.setDrawRange(0, 0);
    c4DefuseProgress.visible = false;
    c4Trajectory.visible = false;
    scene.add(c4Trajectory);
    c4Group.add(c4Block, c4Wave, c4DefuseProgress);
    c4Group.traverse((object) => { object.renderOrder = 4; if (object.material) { object.material.depthTest = true; object.material.depthWrite = false; } });
    c4Trajectory.renderOrder = 4;
    c4Group.visible = false;
    const c4GroundRaycaster = new THREE.Raycaster();
    const c4EventPosition = (event) => {
      const x = event?.x ?? event?.user_X;
      const y = event?.y ?? event?.user_Y;
      const z = event?.z ?? event?.user_Z;
      if (x == null || y == null || z == null) return null;
      const position = new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
      if (nav?.mesh) {
        nav.mesh.updateWorldMatrix(true, false);
        c4GroundRaycaster.set(position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, -1, 0));
        c4GroundRaycaster.far = 2.4;
        const hits = c4GroundRaycaster.intersectObject(nav.mesh, true);
        const hit = hits.find((candidate) => Math.abs(candidate.point.y - position.y) <= 1.25);
        if (hit) position.y = hit.point.y;
      }
      return position;
    };
    const updateC4 = () => {
      const events = demoC4EventsRef.current;
      const tick = demoTickRef.current;
      const planted = [...events].reverse().find((event) => event.event_name === 'bomb_planted' && event.tick <= tick && !events.some((end) => ['bomb_exploded', 'bomb_defused', 'round_end'].includes(end.event_name) && end.tick >= event.tick && end.tick <= tick));
      const dropped = !planted ? [...events].reverse().find((event) => event.event_name === 'bomb_dropped' && event.tick <= tick && !events.some((end) => ['bomb_pickup', 'bomb_planted'].includes(end.event_name) && end.tick >= event.tick && end.tick <= tick)) : null;
      const event = planted || dropped;
      let position = c4EventPosition(event);
      c4Trajectory.visible = false;
      if (dropped) {
        const next = events.find((candidate) => ['bomb_pickup', 'bomb_planted'].includes(candidate.event_name) && candidate.tick > dropped.tick);
        const end = c4EventPosition(next);
        const start = c4EventPosition(dropped);
        if (start && end) {
          const control = start.clone().lerp(end, 0.5);
          control.y += Math.max(0.35, start.distanceTo(end) * 0.18);
          const curve = new THREE.QuadraticBezierCurve3(start, control, end);
          const flightTicks = Math.min(32, Math.max(8, next.tick - dropped.tick));
          const flight = THREE.MathUtils.clamp((tick - dropped.tick) / flightTicks, 0, 1);
          position = curve.getPoint(flight);
          c4Trajectory.geometry.setFromPoints(curve.getPoints(24));
          c4Trajectory.visible = flight < 1;
          c4Trajectory.geometry.setDrawRange(0, Math.max(2, Math.ceil(flight * 25)));
          c4Wave.visible = flight >= 1;
        } else c4Wave.visible = true;
      } else c4Wave.visible = true;
      if (!event || !position) { c4Group.visible = false; c4Trajectory.visible = false; return; }
      c4Group.visible = true;
      c4Group.position.copy(position).add(new THREE.Vector3(0, 0.12, 0));
      const defuseStartEvent = planted ? [...events].reverse().find((candidate) => candidate.event_name === 'bomb_begindefuse' && candidate.tick >= planted.tick && candidate.tick <= tick && !events.some((end) => ['bomb_abortdefuse', 'bomb_defused'].includes(end.event_name) && end.tick >= candidate.tick && end.tick <= tick)) : null;
      const currentRecordIndex = demoSnapshotsRef.current.findLastIndex((record) => record.tick <= tick);
      const currentDefuser = currentRecordIndex >= 0 ? demoSnapshotsRef.current[currentRecordIndex].players.find((player) => player.defusing) : null;
      let sampledDefuseStart = null;
      if (!defuseStartEvent && currentDefuser) {
        sampledDefuseStart = { tick: demoSnapshotsRef.current[currentRecordIndex].tick, hasKit: currentDefuser.hasDefuser };
        for (let index = currentRecordIndex - 1; index >= 0; index -= 1) {
          const record = demoSnapshotsRef.current[index];
          const samePlayer = record.players.find((player) => player.name === currentDefuser.name && player.defusing);
          if (!samePlayer) break;
          sampledDefuseStart = { tick: record.tick, hasKit: samePlayer.hasDefuser };
        }
      }
      const defuseStart = defuseStartEvent || sampledDefuseStart;
      if (defuseStart) {
        const hasKit = Boolean(defuseStart.hasKit ?? defuseStart.haskit ?? defuseStart.has_kit ?? defuseStart.has_defuser);
        const defuseProgress = THREE.MathUtils.clamp((tick - defuseStart.tick) / ((hasKit ? 5 : 10) * 64), 0, 1);
        c4DefuseProgress.geometry.setDrawRange(0, Math.max(2, Math.ceil(defuseProgress * 65)));
        c4DefuseProgress.material.color.set(hasKit ? '#72d4ff' : '#ffd166');
        c4DefuseProgress.visible = true;
      } else c4DefuseProgress.visible = false;
      const progress = ((tick - event.tick) % 64) / 64;
      const range = planted ? 2 : 1;
      c4Wave.scale.setScalar((0.35 + progress * 1.65) * range);
      c4Wave.material.color.set(planted ? '#ff3b30' : '#ffd166');
      c4Wave.material.opacity = 0.75 * (1 - progress);
    };
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
    let utilityFirstPersonActive = false;
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
    const onWheel = (event) => {
      if (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current) demoCameraInterruptRef.current?.();
      updateCameraSlotState(null);
      event.preventDefault();
      const deltaX = event.deltaX * (event.deltaMode === 1 ? 16 : 1);
      const deltaY = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      const gesture = wheelGestureRef.current;
      const now = performance.now();
      if (now - gesture.lastTime > 120) gesture.mode = null;
      gesture.lastTime = now;
      if (!gesture.mode) {
        if (!trackpadDetectionRef.current) gesture.mode = 'wheel';
        else if (event.ctrlKey) gesture.mode = 'pinch';
        else if (event.deltaMode === 0 && (Math.abs(deltaX) > 0 || magnitude < 40 || !Number.isInteger(magnitude))) gesture.mode = 'trackpad';
        else gesture.mode = 'wheel';
      }
      const isTrackpad = gesture.mode === 'trackpad';
      const isTrackpadPinch = gesture.mode === 'pinch';
      if (event.shiftKey && isTrackpad) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
         const pan = right.multiplyScalar(deltaX).add(up.multiplyScalar(-deltaY)).multiplyScalar(offset.length() * 0.0015);
        camera.position.add(pan);
        controls.target.add(pan);
      } else if (event.ctrlKey || !isTrackpad) {
        const zoomSensitivity = isTrackpadPinch ? 0.0045 : 0.0015;
        const distance = THREE.MathUtils.clamp(offset.length() * Math.exp(deltaY * zoomSensitivity), controls.minDistance, controls.maxDistance);
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
      const geometry = new LineGeometry().setPositions(brushStrokePoints.flatMap((p) => [p.x, p.y, p.z]));
      const material = new LineMaterial({ color: brushColorRef.current, linewidth: brushWidthRef.current, transparent: true, opacity: 0.9, resolution: new THREE.Vector2(1, 1) });
      const line = new Line2(geometry, material);
      line.userData.brushStrokeId = `brush-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      line.userData.brushColor = brushColorRef.current;
      line.userData.brushWidth = brushWidthRef.current;
      line.renderOrder = 7;
      scene.add(line);
      return line;
    };
    const updateBrushStrokeLine = () => {
      if (!brushStrokeLine) return;
      brushStrokeLine.geometry.dispose();
      brushStrokeLine.geometry = new LineGeometry().setPositions(brushStrokePoints.flatMap((p) => [p.x, p.y, p.z]));
    };
    const removeBrushStrokeLine = () => {
      if (!brushStrokeLine) return;
      scene.remove(brushStrokeLine);
      brushStrokeLine.geometry.dispose();
      brushStrokeLine.material.dispose();
      brushStrokeLine = null;
    };
    const clearBrushStrokes = () => {
      brushStrokes.forEach((line) => { scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
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
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
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
      const hit = raycaster.intersectObjects(targets, true)[0];
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
    const noteWorldPosition = (note) => {
      const [x, y, z] = note?.position || [0, 0, 0];
      return new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
    };
    const createCollabUtility = (note, itemId, kind, originPosition, savedEffectPosition = null) => {
      const group = new THREE.Group();
      const rawKind = kind || note?.grenadeType || 'smoke';
      const normalizedKind = grenadeKind(rawKind);
      const effectKind = normalizedKind === 'he' ? 'explosion' : normalizedKind;
      const projectiles = (note?.replay?.projectiles || []).filter((record) => record.x != null && record.y != null && record.z != null);
      const landing = [...(note?.replay?.events || [])].reverse().find((event) => event.event_name !== 'grenade_thrown' && event.x != null && event.y != null && event.z != null);
      const endpoint = landing || projectiles.at(-1);
      const effectPosition = savedEffectPosition ? new THREE.Vector3().fromArray(savedEffectPosition) : endpoint ? new THREE.Vector3(endpoint.y * 0.0254 - modelCenter.x, endpoint.z * 0.0254 - modelCenter.y, endpoint.x * 0.0254 - modelCenter.z) : originPosition.clone();
      const effect = createGrenadeEffect(effectPosition, effectKind, navData, nav);
      effect.position.sub(originPosition);
      effect.userData.collabUtilityEffect = true;
      group.add(effect);
      let trajectory = null;
      if (projectiles.length >= 2) {
        const points = projectiles.map((record) => new THREE.Vector3(record.y * 0.0254 - modelCenter.x, record.z * 0.0254 - modelCenter.y, record.x * 0.0254 - modelCenter.z).sub(originPosition));
        trajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#c58cff', transparent: true, opacity: 0.9 }));
        trajectory.userData.collabUtilityTrajectory = true;
        group.add(trajectory);
      }
      group.userData.collabUtility = true;
      group.userData.collabUtilityId = itemId;
      group.userData.noteId = note?.id;
      group.userData.noteName = note?.name || '';
      group.userData.noteSummary = note?.summary || '';
      group.userData.utilityKind = effectKind;
      group.userData.collabUtilityEffect = effect;
      group.userData.utilityEffectPosition = effectPosition.toArray();
      group.userData.utilityProjectiles = projectiles.map((record) => ({ ...record }));
      return group;
    };
    const disposeCollabUtility = (group) => {
      group.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
      group.removeFromParent();
    };
    const addCollabUtility = (note, itemId) => {
      if (!note || !collabEditingEnabledRef.current) return;
      pushCollabHistory();
      const origin = noteWorldPosition(note);
      const group = createCollabUtility(note, itemId || `collab-util-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, undefined, origin);
      group.position.copy(origin);
      collabUtilitiesGroup.add(group);
      collabUtilities.push(group);
      notifyCollabEdit();
      return group;
    };
    const removeCollabUtility = (itemId) => {
      if (!itemId || !collabEditingEnabledRef.current) return;
      const index = collabUtilities.findIndex((group) => group.userData.collabUtilityId === itemId);
      if (index < 0) return;
      pushCollabHistory();
      const [group] = collabUtilities.splice(index, 1);
      disposeCollabUtility(group);
      notifyCollabEdit();
    };
    const clearCollabUtilities = () => {
      collabUtilities.forEach((group) => disposeCollabUtility(group));
      collabUtilities.length = 0;
    };
    const getCollabPlayers = () => pointsRef.current.filter((point) => point.userData.collabPlayer && point.userData.pointId).map((point) => ({ id: point.userData.pointId, name: point.userData.playerName, team: point.userData.team, position: point.position.toArray(), rotationY: point.rotation.y, pitch: point.userData.collabPitch || 0 }));
    const renamePlayerPoint = (pointId, name) => {
      const point = pointsRef.current.find((item) => item.userData.pointId === pointId && item.userData.collabPlayer);
      if (point) { pushCollabHistory(); renameCollabPlayer(point, name); notifyCollabEdit(); }
    };
    const setCollabVisible = (visible) => {
      collabUtilitiesGroup.visible = visible !== false;
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
    const smoothRestoreFrame = (saved, includeCurrentCamera = true, cameraOverride = null) => {
      finalizeFrameTween();
      let previousByName = new Map();
      try { previousByName = new Map(getCollabPlayers().map((player) => [player.name, { position: new THREE.Vector3().fromArray(player.position), rotationY: player.rotationY, pitch: player.pitch }])); } catch (error) { console.error('smoothRestoreFrame getCollabPlayers', error); }
      const savedCamera = saved?.camera && saved.camera.position && saved.camera.target ? { position: new THREE.Vector3().fromArray(saved.camera.position), target: new THREE.Vector3().fromArray(saved.camera.target) } : null;
      const overrideCamera = cameraOverride?.position && cameraOverride?.target ? { position: new THREE.Vector3().fromArray(cameraOverride.position), target: new THREE.Vector3().fromArray(cameraOverride.target) } : null;
      const targetCamera = overrideCamera || (includeCurrentCamera ? savedCamera : null);
      restoreWorkspaceState(saved, false);
      const tweenEntries = [];
      pointsRef.current.forEach((point) => {
        if (!point.userData.collabPlayer || !point.userData.playerName) return;
        const from = previousByName.get(point.userData.playerName);
        if (!from) return;
        tweenEntries.push({ point, from: from.position, to: point.position.clone(), fromRot: from.rotationY, toRot: point.rotation.y, fromPitch: from.pitch, toPitch: point.userData.collabPitch || 0 });
      });
      frameTween = { start: performance.now(), duration: 420, entries: tweenEntries };
      if (targetCamera) {
        cameraTransition = { elapsed: 0, duration: 500, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: targetCamera.position.clone(), toTarget: targetCamera.target.clone() };
        controls.enabled = false;
      }
    };
    const cameraStorageKey = `csboard-camera-slots-${mapName}`;
    let storedCameraSlots = [];
    try { storedCameraSlots = JSON.parse(localStorage.getItem(cameraStorageKey) || '[]'); } catch { storedCameraSlots = []; }
    const cameraSlots = Array.from({ length: 10 }, (_, index) => {
      const saved = storedCameraSlots[index];
      return saved ? { position: new THREE.Vector3(...saved.position), target: new THREE.Vector3(...saved.target) } : null;
    });
    const updateCameraSlotState = (active) => onCameraSlots?.(cameraSlots.map(Boolean), active);
    const saveCameraSlot = (slot) => {
      cameraSlots[slot] = { position: camera.position.clone(), target: controls.target.clone() };
      localStorage.setItem(cameraStorageKey, JSON.stringify(cameraSlots.map((saved) => saved ? { position: saved.position.toArray(), target: saved.target.toArray() } : null)));
      updateCameraSlotState(slot);
    };
    const restoreCameraSlot = (slot) => {
      const saved = cameraSlots[slot];
      if (!saved) return;
      cameraTransition = { elapsed: 0, duration: 450, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: saved.position.clone(), toTarget: saved.target.clone() };
      controls.enabled = false;
      updateCameraSlotState(slot);
    };
    updateCameraSlotState(null);
    const getCameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray() });
    const getRadarCameraState = () => {
      const demoRadarPlayers = (demoSnapshotRef.current?.players || []).filter((player) => player.health > 0).map((player) => {
        const yaw = THREE.MathUtils.degToRad(player.yaw || 0);
        const position = [player.position.x - modelCenter.x, player.position.y - modelCenter.y, player.position.z - modelCenter.z];
        return { id: String(player.steamid || player.name), name: player.name, team: player.team === 2 ? 'T' : 'CT', position, target: [position[0] + Math.sin(yaw), position[1], position[2] + Math.cos(yaw)], source: 'demo' };
      });
      const collabRadarPlayers = pointsRef.current.filter((point) => point.userData.collabPlayer).map((point) => ({ id: point.userData.pointId, name: point.userData.playerName, team: point.userData.team || 'T', position: point.position.toArray(), target: [point.position.x - Math.sin(point.rotation.y), point.position.y, point.position.z - Math.cos(point.rotation.y)], source: 'collab' }));
      return {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        players: [...demoRadarPlayers, ...collabRadarPlayers],
        bounds: {
          minX: radarSourceBounds.minX - modelCenter.x,
          maxX: radarSourceBounds.maxX - modelCenter.x,
          minZ: radarSourceBounds.minZ - modelCenter.z,
          maxZ: radarSourceBounds.maxZ - modelCenter.z,
        },
      };
    };
    const collabSnapshot = () => {
      const workspace = getWorkspaceState();
      return { points: workspace.points.filter((p) => p.kind === 'player'), paths: [], grenades: grenadeEffects.map((effect, index) => ({ id: effect.userData.grenadeId || `grenade-${index}`, type: effect.userData.grenadeEffect, position: effect.position.toArray(), range: effect.userData.grenadeRange || effect.scale.x || 1 })), collabUtilities: collabUtilities.map((group) => ({ id: group.userData.collabUtilityId, noteId: group.userData.noteId, noteName: group.userData.noteName, noteSummary: group.userData.noteSummary, kind: group.userData.utilityKind, position: group.position.toArray(), effectPosition: group.userData.utilityEffectPosition, projectiles: group.userData.utilityProjectiles || [] })), brushStrokes: workspace.brushStrokes };
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
      (snap.collabUtilities || []).forEach((item) => {
        const origin = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
        const note = (utilityNotesRef.current || []).find((candidate) => candidate.id === item.noteId);
        const sourceNote = { ...(note || { name: item.noteName, summary: item.noteSummary, grenadeType: item.kind }), replay: { ...(note?.replay || {}), projectiles: item.projectiles || note?.replay?.projectiles || [] } };
        const group = createCollabUtility(sourceNote, item.id, item.kind, origin, item.effectPosition);
        group.position.copy(origin);
        collabUtilitiesGroup.add(group);
        collabUtilities.push(group);
      });
      (snap.grenades || []).forEach((item, index) => {
        const position = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
        const effect = createGrenadeEffect(position, item.type || 'smoke', navData, nav);
        const range = Math.max(0.35, item.range || 1);
        effect.scale.set(range, item.type === 'smoke' ? 1 / Math.pow(range, 0.65) : 1, range);
        effect.userData.grenadeId = item.id || `restored-grenade-${index}`;
        effect.userData.grenadeOrigin = position.clone();
        effect.userData.grenadeRange = range;
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
      if (includeDemo) {
        (demoSnapshotRef.current?.players || []).filter((player) => player.health > 0).forEach((player) => {
          const pitch = THREE.MathUtils.degToRad(player.pitch || 0);
          const rayLength = 5.25;
          const aimTarget = new THREE.Vector3(0, 0, -rayLength).applyEuler(new THREE.Euler(-pitch, 0, 0)).add(new THREE.Vector3(0, 0.15, 0));
          points.push({ id: `demo-${demoSnapshotRef.current.tick}-${player.steamid || player.name}`, position: [player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z], rotationY: Math.atan2(-Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), -Math.cos(THREE.MathUtils.degToRad(player.yaw || 0))), team: player.team === 3 ? 'CT' : 'T', type: 'T', rayLength, aimTarget: aimTarget.toArray(), source: 'demo', playerName: player.name });
        });
        const durations = { smokegrenade_detonate: 1152, inferno_startburn: 448, flashbang_detonate: 20, hegrenade_detonate: 20 };
        demoGrenadesRef.current.filter((event) => event.event_name !== 'grenade_thrown' && event.event_name !== 'decoy_detonate').forEach((event) => {
          const decoyEnd = event.event_name === 'decoy_started' ? demoGrenadesRef.current.find((candidate) => candidate.event_name === 'decoy_detonate' && candidate.tick > event.tick && candidate.tick - event.tick <= 1280) : null;
          const duration = event.event_name === 'decoy_started' ? decoyEnd?.tick - event.tick || 960 : durations[event.event_name];
          const tick = demoSnapshotRef.current?.tick || 0;
          const x = event.x ?? event.user_X; const y = event.y ?? event.user_Y; const z = event.z ?? event.user_Z;
          if (!duration || tick < event.tick || tick > event.tick + duration || x == null || y == null || z == null) return;
          const type = event.event_name === 'smokegrenade_detonate' ? 'smoke' : event.event_name === 'inferno_startburn' ? 'fire' : event.event_name === 'flashbang_detonate' ? 'flash' : event.event_name === 'decoy_started' ? 'decoy' : 'explosion';
          grenades.push({ id: `demo-grenade-${event.event_name}-${event.tick}-${event.entityid || event.user_steamid || grenades.length}`, type, position: [y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z], range: 1, source: 'demo' });
        });
      }
      return { cameraSlots: cameraSlots.map((saved) => saved ? { position: saved.position.toArray(), target: saved.target.toArray() } : null), camera: { position: camera.position.toArray(), target: controls.target.toArray() }, points, paths: [], grenades, collabUtilities: collabUtilities.map((group) => ({ id: group.userData.collabUtilityId, noteId: group.userData.noteId, noteName: group.userData.noteName, noteSummary: group.userData.noteSummary, kind: group.userData.utilityKind, position: group.position.toArray(), effectPosition: group.userData.utilityEffectPosition, projectiles: group.userData.utilityProjectiles || [] })), brushStrokes: brushStrokes.map((line) => ({ id: line.userData.brushStrokeId, color: line.userData.brushColor, width: line.userData.brushWidth, points: (line.userData.worldPoints || []).map((point) => point.toArray()) })) };
    };
    const getLiveBrushData = () => {
      const data = brushStrokes.map((line) => ({ id: line.userData.brushStrokeId, color: line.userData.brushColor, width: line.userData.brushWidth, points: (line.userData.worldPoints || []).map((point) => point.toArray()) }));
      if (brushStrokeLine && brushStrokePoints.length >= 2) {
        data.push({ id: brushStrokeLine.userData.brushStrokeId, color: brushStrokeLine.userData.brushColor, width: brushStrokeLine.userData.brushWidth, points: brushStrokePoints.map((point) => point.toArray()) });
      }
      return data;
    };
    const notifyBrushChange = () => { onBrushChangeRef.current?.(getLiveBrushData()); };
    let brushApplyRemote = false;
    const applyLiveBrushData = (data = []) => {
      if (!Array.isArray(data)) return;
      brushApplyRemote = true;
      const ids = new Set(data.map((item) => item.id));
      brushStrokes.forEach((line) => { if (!ids.has(line.userData.brushStrokeId)) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); } });
      for (let index = brushStrokes.length - 1; index >= 0; index -= 1) { if (!ids.has(brushStrokes[index].userData.brushStrokeId)) brushStrokes.splice(index, 1); }
      brushUndoStack.length = 0;
      brushRedoStack.length = 0;
      data.forEach((item) => {
        if (brushStrokeLine?.userData.brushStrokeId === item.id) return;
        const existing = brushStrokes.find((line) => line.userData.brushStrokeId === item.id);
        if (existing) {
          const points = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
          existing.geometry.dispose();
          existing.geometry = new LineGeometry().setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
          existing.userData.worldPoints = points;
        } else {
          const points = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
          if (points.length < 2) return;
          const geometry = new LineGeometry().setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
          const material = new LineMaterial({ color: item.color || '#a5e0ff', linewidth: item.width || 3, transparent: true, opacity: 0.9, resolution: new THREE.Vector2(1, 1) });
          const line = new Line2(geometry, material);
          line.userData.brushStrokeId = item.id;
          line.userData.brushColor = item.color || '#a5e0ff';
          line.userData.brushWidth = item.width || 3;
          line.userData.worldPoints = points;
          line.renderOrder = 7;
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
        effect.scale.set(range, item.type === 'smoke' ? 1 / Math.pow(range, 0.65) : 1, range);
        effect.userData.grenadeId = item.id || `restored-grenade-${index}`;
        effect.userData.grenadeOrigin = position.clone();
        effect.userData.grenadeRange = range;
        scene.add(effect);
        grenadeEffects.push(effect);
      });
      (saved.collabUtilities || []).forEach((item) => {
        const note = (utilityNotesRef.current || []).find((candidate) => candidate.id === item.noteId);
        const origin = new THREE.Vector3().fromArray(item.position || [0, 0, 0]);
        const sourceNote = { ...(note || { name: item.noteName, summary: item.noteSummary, grenadeType: item.kind }), replay: { ...(note?.replay || {}), projectiles: item.projectiles || note?.replay?.projectiles || [] } };
        const group = createCollabUtility(sourceNote, item.id, item.kind, origin, item.effectPosition);
        group.position.copy(origin);
        collabUtilitiesGroup.add(group);
        collabUtilities.push(group);
      });
      if (saved.cameraSlots) {
        saved.cameraSlots.forEach((slot, index) => { cameraSlots[index] = slot ? { position: new THREE.Vector3(...slot.position), target: new THREE.Vector3(...slot.target) } : null; });
        localStorage.setItem(cameraStorageKey, JSON.stringify(cameraSlots.map((slot) => slot ? { position: slot.position.toArray(), target: slot.target.toArray() } : null)));
        updateCameraSlotState(null);
      }
      brushStrokes.forEach((line) => { scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
      brushStrokes.length = 0;
      brushUndoStack.length = 0;
      brushRedoStack.length = 0;
      removeBrushStrokeLine();
      (saved.brushStrokes || []).forEach((item) => {
        const worldPoints = (item.points || []).map((point) => new THREE.Vector3().fromArray(point));
        if (worldPoints.length < 2) return;
        const geometry = new LineGeometry().setPositions(worldPoints.flatMap((p) => [p.x, p.y, p.z]));
        const material = new LineMaterial({ color: item.color || '#a5e0ff', linewidth: item.width || 3, transparent: true, opacity: 0.9, resolution: new THREE.Vector2(1, 1) });
        const line = new Line2(geometry, material);
        line.userData.brushStrokeId = item.id;
        line.userData.brushColor = item.color || '#a5e0ff';
        line.userData.brushWidth = item.width || 3;
        line.userData.worldPoints = worldPoints;
        line.renderOrder = 7;
        scene.add(line);
        brushStrokes.push(line);
        brushUndoStack.push(line);
      });
      if (includeCurrentCamera && saved.camera) { camera.position.fromArray(saved.camera.position); controls.target.fromArray(saved.camera.target); controls.update(); }
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
      const numberSlot = pressedNumber === 0 ? cameraSlots.length - 1 : pressedNumber - 1;
      if (numberSlot >= 0 && numberSlot < cameraSlots.length) {
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
      if (event.pointerType === 'touch') { updateCameraSlotState(null); return; }
      if ((event.button === 1 || event.button === 2) && (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current)) demoCameraInterruptRef.current?.();
      if (event.button === 0) renderer.domElement.setPointerCapture?.(event.pointerId);
      if (event.button === 1 || event.button === 2) updateCameraSlotState(null);
      focusScreen.set(pointerCurrent.x * 0.5 + 0.5, pointerCurrent.y * 0.5 + 0.5);
      if (event.button === 0 && !grenadeWheelOpen && !placing) {
        raycaster.setFromCamera(pointerCurrent, camera);
        raycaster.params.Line.threshold = 0.28;
        const demoGrenadeHit = raycaster.intersectObjects([...demoGrenadeObjectsRef.current.values()], true).find((candidate) => {
          let owner = candidate.object;
          while (owner && !owner.userData.demoGrenadeSegmentId) owner = owner.parent;
          return Boolean(owner);
        });
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
        const objectHit = raycaster.intersectObjects(grenadeEffects, true)[0]?.object;
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
        const hit = raycaster.intersectObjects(pointsRef.current, true)[0]?.object;
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
        brushCollabSnapshot = pointPlacementEnabledRef.current ? collabSnapshot() : null;
        if (brushEraserRef.current || pressedKeys.has('control')) {
          eraserActive = true;
          eraserLastPointer = null;
          eraserChanged = false;
          controls.enabled = false;
          eraseAtPointer(pointerCurrent);
        } else {
          startBrushStroke(pointerToSurface(pointerCurrent));
        }
      }
    };
    const onPointerMove = (event) => {
      pointerCurrent = pointerPosition(event);
      if (event.pointerType === 'touch') return;
      raycaster.setFromCamera(pointerCurrent, camera);
      const demoHit = raycaster.intersectObjects([...demoMarkers.values()], true).find((candidate) => !candidate.object.userData.aimRay && !candidate.object.userData.aimTarget)?.object;
      let demoOwner = demoHit;
      while (demoOwner && !demoOwner.userData.playerName) demoOwner = demoOwner.parent;
      hoveredDemoPlayerRef.current = demoOwner?.userData.playerName || null;
      if (utilityNotesEnabledRef.current) {
        const utilityHit = raycaster.intersectObjects([...utilityMarkers.values()], true).find((candidate) => candidate.object.userData.utilityMarker);
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
      if (event.button === 0 && eraserActive) {
        eraserActive = false;
        eraserLastPointer = null;
        if (eraserChanged && brushCollabSnapshot) pushCollabHistory(brushCollabSnapshot);
        brushCollabSnapshot = null;
        eraserChanged = false;
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
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
        return;
      }
      if (event.button === 0 && grenadeAdjusting) {
        grenadeAdjusting = false;
        if (grenadeAdjustSnapshot) pushCollabHistory(grenadeAdjustSnapshot);
        grenadeAdjustSnapshot = null;
        notifyCollabEdit();
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
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
      if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
    };
    const cancelPointerInteraction = () => {
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
      if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
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
    new GLTFLoader().load(`${MAP_BASE}/${mapName}/${mapName}.glb`, (gltf) => {
      if (disposed) return;
      worldModel = gltf.scene;
      const modelBounds = new THREE.Box3().setFromObject(worldModel);
      modelCenter = modelBounds.getCenter(new THREE.Vector3());
      worldModel.position.sub(modelCenter);
      modelBasePositionRef.current = worldModel.position.clone();
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
        object.geometry.computeBoundsTree();
        collisionMeshes.push(object);
        object.frustumCulled = true;
        object.renderOrder = 3;
         if (object.material) object.material = Array.isArray(object.material) ? object.material.map(() => createGhostMaterial(focusScreen, viewportSize, modelMode, nav?.distanceField)) : createGhostMaterial(focusScreen, viewportSize, modelMode, nav?.distanceField);
         const materials = Array.isArray(object.material) ? object.material : [object.material];
         materials.forEach((material) => { material.opacity = modelOpacity; material.depthWrite = true; });
      });
      scene.add(worldModel);
      collisionVersion += 1;
      modelRef.current = worldModel;
      worldModel.visible = modelVisibilityRef.current;
         worldModel.position.y = modelBasePositionRef.current.y + (modelMode.value === 0 ? -0.12 : 0);
      resetCamera();
      onReady({ reset: () => resetToDefault(resetCamera), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, clearCollabUtilities, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
      modelLoadStateRef.current?.({ mapName, status: 'ready', loaded: 1, total: 1 });
    }, (event) => {
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
         const normalReset = () => { camera.position.set(distance * 0.68, distance * 0.9, distance); controls.target.set(0, 0, 0); controls.update(); };
         onReady({ reset: () => resetToDefault(normalReset), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, clearCollabUtilities, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
      }
    });
    controls.target.set(0, 0, 0);
    controls.update();
     const initialReset = () => { camera.position.set(17, 23, 25); controls.target.set(0, 0, 0); controls.update(); };
     onReady({ reset: () => resetToDefault(initialReset), saveCameraSlot, restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }), clearBrushStrokes, addCollabUtility, removeCollabUtility, clearCollabUtilities, getCollabPlayers, renamePlayerPoint, smoothRestoreFrame, applyLiveBrushData, getCameraState, getRadarCameraState, finalizeFrameTween, setCollabVisible, setCollabEditingEnabled, undoCollab, redoCollab, canUndoCollab: () => collabUndoStack.length > 0, canRedoCollab: () => collabRedoStack.length > 0 });
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
      updateCameraSlotState(null);
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
    const animate = (now) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (cameraTransition) {
        cameraTransition.elapsed += 16.67;
        const progress = THREE.MathUtils.smoothstep(Math.min(cameraTransition.elapsed / cameraTransition.duration, 1), 0, 1);
        camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, progress);
        controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, progress);
        controls.update();
        if (progress >= 1) { cameraTransition = null; controls.enabled = true; }
      } else {
        moveCamera(now);
        controls.update();
      }
      const firstPerson = utilityFirstPersonRef.current;
      const manualPovPlayer = demoInEyePlayerRef.current;
      const povPlayer = firstPerson?.player || manualPovPlayer;
      if (povPlayer) {
        const eye = new THREE.Vector3(povPlayer.position.x - modelCenter.x, povPlayer.position.y - modelCenter.y + 1.62 - (povPlayer.duckAmount || 0) * 0.34, povPlayer.position.z - modelCenter.z);
        const direction = cs2AnglesToSceneDirection(povPlayer.pitch, povPlayer.yaw);
        camera.position.copy(eye);
        controls.target.copy(eye).add(direction.multiplyScalar(8));
        camera.fov = !firstPerson && povPlayer.scoped ? 35 : 68;
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        controls.enabled = false;
        demoDirectorCameraActive = true;
        utilityFirstPersonActive = Boolean(firstPerson);
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
        if (utilityFirstPersonActive) { controls.enabled = true; camera.fov = 38; camera.updateProjectionMatrix(); utilityFirstPersonActive = false; }
        demoPovEquipment.visible = false;
        povThrownUtility.visible = false;
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
      updateDemoDeaths();
      updateDeathHeat();
      updateAnalysis();
      updateUtilityNotes();
      updateDemoGrenades();
      updateC4();
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
      const interactionLocked = Boolean(cameraTransition || utilityFirstPersonRef.current?.player || demoDirectorCameraActive || placing || grenadeAdjusting || pointPointerTarget);
      if (!interactionLocked && !controls.enabled) controls.enabled = true;
      const brushResolution = renderer.getDrawingBufferSize(new THREE.Vector2());
      brushStrokes.forEach((line) => { if (line.material) line.material.resolution.copy(brushResolution); });
      if (brushStrokeLine?.material) brushStrokeLine.material.resolution.copy(brushResolution);
      renderer.render(scene, camera);
    };
    animate(performance.now());
     return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); renderer.domElement.removeEventListener('wheel', onWheel); renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('contextmenu', onContextMenu); controls.dispose(); [...new Set([...grenadeEffects, grenadePreview, activeGrenade].filter(Boolean))].forEach(disposeGrenadeEffect); demoGrenadeObjectsRef.current.forEach((effect) => { scene.remove(effect); disposeGrenadeEffect(effect); }); demoGrenadeObjectsRef.current.clear(); [...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); })); pathLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); scene.remove(line); }); pathLines.length = 0; clearBrushStrokes(); clearCollabUtilities(); pointsRef.current = []; gridRef.current = null; modelRef.current = null; modelBasePositionRef.current = null; navFocusRef.current = null; navGroupRef.current = null; demoPlayersRef.current = null; demoMarkers.forEach((marker) => marker.traverse((object) => object.material?.dispose())); demoMovementTrails.forEach((trail) => { trail.geometry.dispose(); trail.material.dispose(); scene.remove(trail); }); demoDeathMarkers.forEach((marker) => { marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); scene.remove(marker); }); analysisPaths.forEach((item) => { item.line.geometry.dispose(); item.line.material.dispose(); item.marker.geometry.dispose(); item.marker.material.dispose(); }); analysisGroup.removeFromParent(); if (nav) { nav.geometry.dispose(); nav.edgeGeometry.dispose(); nav.mesh.material.dispose(); nav.edgeLines.material.dispose(); nav.distanceField?.texture?.dispose(); } if (worldModel) scene.remove(worldModel); renderer.dispose(); mount.removeChild(renderer.domElement); };
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
    onPointSelect?.(null);
    onCollabEdit?.();
  }, [deletePointId, onPointSelect]);

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
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

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

  const firstPersonVisible = Boolean(utilityFirstPerson?.player || demoInEyePlayer || demoPovRuntime.player);
  return <div ref={(node) => { mountRef.current = node; }} className="three-board">{error && <div className="board-error">{error}</div>}{firstPersonVisible && <div className="pov-crosshair" aria-hidden="true"><i /><i /><i /><i /></div>}</div>;
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('csboard-language') || 'zh');
  const [collabUtilitySearch, setCollabUtilitySearch] = useState('');
  const [collabUtilityPickerOpen, setCollabUtilityPickerOpen] = useState(false);
  const [collabUtilitySelected, setCollabUtilitySelected] = useState('');
  const [, setCollabUtilityRevision] = useState(0);
  const [collabObjectTab, setCollabObjectTab] = useState('players');
  const t = (key, values) => translate(language, key, values);
  const languageRef = useRef(language);
  languageRef.current = language;
  const [mapName, setMapName] = useState('de_dust2');
  const [navData, setNavData] = useState(fallbackNavData);
  const [showEdges, setShowEdges] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showModel, setShowModel] = useState(true);
  const [modelOpacity, setModelOpacity] = useState(0.72);
  const [modelViewMode, setModelViewMode] = useState(0);
  const [modelLoadState, setModelLoadState] = useState({ mapName: 'de_dust2', status: 'loading', loaded: 0, total: 0 });
  const [trackpadDetection, setTrackpadDetection] = useState(true);
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
  const [demoViewFlags, setDemoViewFlags] = useState({ deathVictim: true, deathKiller: true, killerHeat: false, victimHeat: false, targetHeat: false, opponentHeat: false });
  const [showDemoNames, setShowDemoNames] = useState(false);
  const [demoSnapshots, setDemoSnapshots] = useState([]);
  const [demoThrowSnapshots, setDemoThrowSnapshots] = useState([]);
  const [demoProjectiles, setDemoProjectiles] = useState([]);
  const [demoRound, setDemoRound] = useState(null);
  const [demoRoundMenuOpen, setDemoRoundMenuOpen] = useState(false);
  const [demoCameraMode, setDemoCameraMode] = useState('manual');
  const [demoPovPlayerId, setDemoPovPlayerId] = useState('');
  const [demoRoundLoading, setDemoRoundLoading] = useState(false);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [analysisPlayers, setAnalysisPlayers] = useState([]);
  const [analysisSelectedPlayers, setAnalysisSelectedPlayers] = useState([]);
  const [analysisLoadedFor, setAnalysisLoadedFor] = useState('');
  const [analysisPlaying, setAnalysisPlaying] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisTime, setAnalysisTime] = useState(0);
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
  const [demoCacheOpen, setDemoCacheOpen] = useState(false);
  const [demoSampleRate, setDemoSampleRate] = useState(() => {
    const saved = Number(localStorage.getItem('csboard-demo-sample-rate'));
    return DEMO_SAMPLE_RATES.includes(saved) ? saved : 8;
  });
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modelModeLabels = ['REACHABLE SURFACE', 'MOUSE LENS', 'CAMERA LENS'];
  const modeOptions = [{ label: 'MODEL OFF', value: -1 }, ...modelModeLabels.map((label, value) => ({ label, value }))];
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedPointScreen, setSelectedPointScreen] = useState(null);
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdate] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const [cameraSlotState, setCameraSlotState] = useState(Array(10).fill(false));
  const [map2dLayer, setMap2dLayer] = useState(0);
  const [radarScene, setRadarScene] = useState(null);
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);
  const [activePanel, setActivePanel] = useState(() => window.matchMedia?.('(max-width: 820px)').matches ? 'utility' : 'demo');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia?.('(max-width: 820px)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 820px)');
    if (!query) return;
    const onChange = () => setIsMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  useEffect(() => setModelLoadState({ mapName, status: 'loading', loaded: 0, total: 0 }), [mapName]);
  useEffect(() => {
    if (isMobile) return undefined;
    const target = document.querySelector('.three-board');
    if (!target || !window.ResizeObserver) return undefined;
    let frame;
    const stage = target.closest('.board-stage');
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const mapBarHeight = Math.round(THREE.MathUtils.clamp(height * 0.34, 185, 250));
      stage?.style.setProperty('--map-bar-height', `${mapBarHeight}px`);
      stage?.style.setProperty('--map-bar-width', `${Math.round(mapBarHeight * 1.2)}px`);
      stage?.style.setProperty('--status-bar-height', `${Math.round(THREE.MathUtils.clamp(height * 0.56, 250, 360))}px`);
      stage?.style.setProperty('--frame-window-width', `${Math.round(THREE.MathUtils.clamp(width * 0.44, 180, 520))}px`);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const mapBar = stage?.querySelector('.view-tools');
        const leftStatus = stage?.querySelector('.team-roster-t');
        const overlapsStatus = Boolean(mapBar && leftStatus && mapBar.getBoundingClientRect().bottom > leftStatus.getBoundingClientRect().top);
        stage?.toggleAttribute('data-map-status-overlap', overlapsStatus);
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(target);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); stage?.removeAttribute('data-map-status-overlap'); stage?.style.removeProperty('--map-bar-height'); stage?.style.removeProperty('--map-bar-width'); stage?.style.removeProperty('--status-bar-height'); stage?.style.removeProperty('--frame-window-width'); };
  }, [activePanel, isMobile, leftSidebarOpen, mapName, navData]);
  useEffect(() => setMap2dLayer(0), [mapName]);
  useEffect(() => {
    const update = () => setRadarScene(boardRef.current?.getRadarCameraState?.() || null);
    update();
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [mapName, navData]);
  const radarOverlay = useMemo(() => {
    const bounds = radarScene?.bounds;
    if (!bounds || !Object.values(bounds).every(Number.isFinite)) return null;
    const width = Math.max(bounds.maxZ - bounds.minZ, 0.001);
    const height = Math.max(bounds.maxX - bounds.minX, 0.001);
    const project = (position, clamp = true) => {
      const rawX = 4 + (position[2] - bounds.minZ) / width * 92;
      const rawY = 96 - (position[0] - bounds.minX) / height * 92;
      return { x: clamp ? THREE.MathUtils.clamp(rawX, 3, 97) : rawX, y: clamp ? THREE.MathUtils.clamp(rawY, 3, 97) : rawY };
    };
    const camera = project(radarScene.position);
    const cameraTarget = project(radarScene.target, false);
    const cameraAngle = Math.atan2(cameraTarget.y - camera.y, cameraTarget.x - camera.x) * 180 / Math.PI;
    const players = (radarScene.players || []).filter((player) => player.source === (activePanel === 'collab' ? 'collab' : 'demo')).map((player) => {
      const position = project(player.position);
      const target = project(player.target, false);
      return { ...player, ...position, angle: Math.atan2(target.y - position.y, target.x - position.x) * 180 / Math.PI };
    });
    return { camera: { ...camera, angle: cameraAngle }, players };
  }, [radarScene, activePanel]);
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
  const [utilityNotes, setUtilityNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('csboard-utility-notes') || '[]'); } catch { return []; } });
  const utilityImportInputRef = useRef(null);
  const [utilityImportNotice, setUtilityImportNotice] = useState('');
  const [utilityModalOpen, setUtilityModalOpen] = useState(false);
  const [utilityDraft, setUtilityDraft] = useState({ getpos: '', name: '', summary: '' });
  const [utilityError, setUtilityError] = useState('');
  const [utilityHover, setUtilityHover] = useState(null);
  const [selectedUtilityNote, setSelectedUtilityNote] = useState(null);
  const [utilityEditDraft, setUtilityEditDraft] = useState(null);
  const [utilityCopied, setUtilityCopied] = useState(false);
  const utilityHoverInsideRef = useRef(false);
  const utilityHoverTimerRef = useRef(null);
  const [selectedDemoGrenade, setSelectedDemoGrenade] = useState(null);
  const [selectedDemoGrenadeScreen, setSelectedDemoGrenadeScreen] = useState(null);
  const [utilityReplay, setUtilityReplay] = useState(null);
  const [archives, setArchives] = useState(() => { try { return JSON.parse(localStorage.getItem('csboard-workspace-archives') || '[]'); } catch { return []; } });
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
  const boardRef = useRef(null);
  roomOwnerRef.current = roomOwner;
  mapNameRef.current = mapName;
  const hasActiveFrameContext = Boolean(activeFrameId && frames.some((frame) => frame.id === activeFrameId) && (activeArchiveId || roomCode));
  useEffect(() => {
    boardRef.current?.setCollabVisible?.(activePanel === 'collab' && hasActiveFrameContext);
    boardRef.current?.setCollabEditingEnabled?.(activePanel === 'collab' && hasActiveFrameContext);
  }, [activePanel, hasActiveFrameContext]);
  useEffect(() => {
    localStorage.setItem('csboard-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
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
  useEffect(() => {
    const version = Number(localStorage.getItem('csboard-utility-notes-version') || 0);
    if (version >= UTILITY_NOTES_VERSION) return;
    setUtilityNotes((notes) => {
      const valid = notes.filter((note) => !note.replay);
      localStorage.setItem('csboard-utility-notes', JSON.stringify(valid));
      return valid;
    });
    localStorage.setItem('csboard-utility-notes-version', String(UTILITY_NOTES_VERSION));
  }, []);
  const refreshCachedDemos = () => listCachedDemos().then((entries) => setCachedDemos(entries.map((entry) => { const sampleRate = entry.sampleRate || Number(String(entry.id).match(/^(\d+)hz\|/)?.[1]) || 8; return { ...entry, sampleRate, map: `${entry.map} · ${sampleRate} Hz` }; }))).catch(() => setDemoStatus(t('cacheFailed')));
  useEffect(() => { refreshCachedDemos(); }, []);
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
  useEffect(() => () => window.clearTimeout(utilityHoverTimerRef.current), []);
  useEffect(() => () => window.clearTimeout(parseGameTimerRef.current), []);
  const applyDemoData = (data, cacheId, analysisRowsFromCache = [], hasSource = false) => {
    setDemoData(data);
    const firstRound = data.rounds?.[0] || null;
    setDemoRound(firstRound);
    setDemoTick(firstRound?.startTick || 0);
    setDemoPovPlayerId('');
    setDemoSnapshots([]);
    setDemoThrowSnapshots([]);
    setDemoProjectiles([]);
    setDemoRoundLoading(false);
    setDemoPlaying(false);
    setAnalysisRows(analysisRowsFromCache);
    const players = [...new Set(analysisRowsFromCache.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))].sort();
    setAnalysisPlayers(players);
    setAnalysisSelectedPlayers([]);
    setAnalysisLoadedFor(analysisRowsFromCache.length ? data.demo.fileName : '');
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
  const emptyWorkspace = () => ({ points: [], paths: [], grenades: [], collabUtilities: [], brushStrokes: [] });
  const normalizeCollabWorkspace = (workspace) => {
    const frame = frameWorkspace(workspace);
    const legacyPathPointIds = new Set((frame.paths || []).flatMap((path) => Array.isArray(path) ? path : path.pointIds || []));
    const usedNames = new Set();
    const stableHexName = (value) => {
      let hash = 0;
      for (const character of String(value || 'player')) hash = ((hash * 31) + character.charCodeAt(0)) & 0xfff;
      for (let offset = 0; offset < 0x1000; offset += 1) {
        const candidate = ((hash + offset) & 0xfff).toString(16).toUpperCase().padStart(3, '0');
        if (!usedNames.has(candidate.toLowerCase())) return candidate;
      }
      return 'FFF';
    };
    const points = (frame.points || []).filter((point) => !legacyPathPointIds.has(point.id)).map((point, index) => {
      let name = String(point.name || point.playerName || '').trim();
      if (!name || usedNames.has(name.toLowerCase())) name = stableHexName(point.id || index);
      usedNames.add(name.toLowerCase());
      let pitch = Number(point.pitch);
      if (!Number.isFinite(pitch)) {
        const [x = 0, y = 0.15, z = -1] = point.aimTarget || [];
        pitch = -Math.atan2(y - 0.15, Math.max(0.001, Math.hypot(x, z)));
      }
      return { ...point, kind: 'player', name, weapon: point.weapon || 'ak47', crouched: Boolean(point.crouched), pitch };
    });
    const collabUtilities = (frame.collabUtilities || []).map((item, index) => ({ ...item, id: item.id || `imported-${item.noteId || index}` }));
    return { ...frame, points, paths: [], collabUtilities };
  };
  const normalizeFrames = (input, fallbackWorkspace = null) => {
    const source = Array.isArray(input) ? input : [];
    const ids = new Set();
    const normalized = source.filter((frame) => frame && typeof frame === 'object').map((frame) => {
      let id = typeof frame.id === 'string' && frame.id ? frame.id : '';
      if (!id || ids.has(id)) id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      ids.add(id);
      return { id, workspace: normalizeCollabWorkspace(frame.workspace || emptyWorkspace()) };
    });
    if (!normalized.length && fallbackWorkspace) normalized.push({ id: `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, workspace: normalizeCollabWorkspace(fallbackWorkspace) });
    return normalized;
  };
  const frameWorkspace = (workspace) => {
    const { camera: _camera, cameraSlots: _cameraSlots, ...frame } = workspace || emptyWorkspace();
    return frame;
  };
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
    const index = archives.findIndex((archive) => archive.id === activeArchiveId);
    if (index < 0) return;
    const next = archives.map((archive, archiveIndex) => archiveIndex === index ? { ...archive, frames: nextFrames, activeFrameId: nextActiveId, savedAt: new Date().toISOString() } : archive);
    try { localStorage.setItem('csboard-workspace-archives', JSON.stringify(next)); } catch { setRoomNotice(t('utilityStorageFailed')); return; }
    setArchives(next);
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
    boardRef.current?.smoothRestoreFrame?.(frame.workspace || emptyWorkspace(), false);
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
    boardRef.current?.smoothRestoreFrame?.(copy.workspace, false);
  };
  const deleteFrame = () => {
    if (framesRef.current.length <= 1) return;
    flushCollabSave();
    const index = framesRef.current.findIndex((frame) => frame.id === activeFrameIdRef.current);
    const next = framesRef.current.filter((frame) => frame.id !== activeFrameIdRef.current);
    const nextActive = next[Math.max(0, index - 1)] || next[0];
    commitFrameState(next, nextActive.id, { workspaceForRoom: nextActive.workspace || emptyWorkspace() });
    persistActiveArchiveFrames(next, nextActive.id);
    boardRef.current?.smoothRestoreFrame?.(nextActive.workspace || emptyWorkspace(), false);
  };
  const activeCollabPlayers = () => {
    const workspace = activeFrameWorkspace();
    return (workspace.points || []).filter((point) => point.kind === 'player');
  };
  const activeImportedUtilities = () => activeFrameWorkspace().collabUtilities || [];
  const confirmCollabUtilityImport = () => {
    const note = currentUtilityNotes.find((candidate) => candidate.id === collabUtilitySelected);
    if (!note) return;
    boardRef.current?.addCollabUtility?.(note);
    setCollabUtilityPickerOpen(false);
    setCollabUtilitySelected('');
    setCollabUtilitySearch('');
    setCollabUtilityRevision((value) => value + 1);
  };
  const deleteImportedUtility = (itemId) => {
    boardRef.current?.removeCollabUtility?.(itemId);
    setCollabUtilityRevision((value) => value + 1);
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
  const saveWorkspaceArchive = (targetId = saveArchiveSelected, targetName = saveArchiveName) => {
    flushCollabSave();
    boardRef.current?.finalizeFrameTween?.();
    const workspace = boardRef.current?.getWorkspaceState?.({ includeDemo: saveArchiveIncludeDemo === true });
    if (!workspace) return;
    const now = Date.now();
    let latestArchives = archives;
    try { latestArchives = JSON.parse(localStorage.getItem('csboard-workspace-archives') || '[]'); } catch { latestArchives = archives; }
    const existing = targetId ? latestArchives.find((item) => item.id === targetId) : null;
    if (targetId && !existing) { setRoomNotice(t('noArchives')); return; }
    if (existing && existing.mapName !== mapName) return;
    const currentFrameWorkspace = normalizeCollabWorkspace(workspace);
    const newFrame = { id: `frame-${now}-${Math.random().toString(16).slice(2, 8)}`, workspace: currentFrameWorkspace };
    const savedFrames = existing ? [...normalizeFrames(existing.frames, existing.workspace || emptyWorkspace()), newFrame] : [newFrame];
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
    try { localStorage.setItem('csboard-workspace-archives', JSON.stringify(next)); } catch { setRoomNotice(t('utilityStorageFailed')); return; }
    setArchives(next);
    if (!roomCode) {
      setActiveArchiveId(archive.id);
      commitFrameState(savedFrames, savedActiveFrameId, { publish: false });
    }
    setSaveArchiveModal(false);
    setSaveArchiveName('');
    setSaveArchiveSelected('');
    setSaveArchiveIncludeDemo(false);
  };
  const openSaveArchiveModal = (includeDemo = false) => { setSaveArchiveIncludeDemo(includeDemo); setSaveArchiveSelected(!includeDemo && activeArchiveId ? activeArchiveId : ''); setSaveArchiveName(''); setSaveArchiveModal(true); };
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
    localStorage.setItem(`csboard-room-${code}`, JSON.stringify({ mapName, workspace, owner: clientName.current }));
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
      const events = [...joined.map((name) => languageRef.current === 'zh' ? `${name} 已加入房间` : `${name} joined the room`), ...left.map((name) => languageRef.current === 'zh' ? `${name} 已退出房间` : `${name} left the room`)];
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
        boardRef.current?.smoothRestoreFrame?.(selected?.workspace || emptyWorkspace(), false);
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
  const deleteWorkspaceArchive = (id) => {
    const next = archives.filter((archive) => archive.id !== id);
    try { localStorage.setItem('csboard-workspace-archives', JSON.stringify(next)); } catch { setRoomNotice(t('utilityStorageFailed')); return; }
    setArchives(next);
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
    if (activePanel === 'collab' && panel !== 'collab') flushCollabSave();
    boardRef.current?.setCollabVisible?.(panel === 'collab');
    if (activePanel === 'collab' && panel !== 'collab') boardRef.current?.clearWorkspaceState?.();
    if (panel !== 'collab' && roomCode) { const wasOwner = roomOwner; leaveRoom(); window.alert(wasOwner ? t('roomDestroyed') : t('roomExited')); }
    if (panel !== 'utility') { setUtilityModalOpen(false); setUtilityHover(null); setSelectedUtilityNote(null); setUtilityEditDraft(null); setUtilityError(''); }
    setActivePanel(panel);
  };
  const addUtilityNote = (event) => {
    event.preventDefault();
    const parsed = parseGetpos(utilityDraft.getpos);
    if (!parsed) { setUtilityError(t('invalidGetpos')); return; }
    const next = [...utilityNotes, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mapName, position: parsed.position, angles: parsed.angles, name: utilityDraft.name.trim(), summary: utilityDraft.summary.trim(), createdAt: new Date().toISOString() }];
    setUtilityNotes(next);
    localStorage.setItem('csboard-utility-notes', JSON.stringify(next));
    setUtilityDraft({ getpos: '', name: '', summary: '' });
    setUtilityError('');
    setUtilityModalOpen(false);
  };
  const persistUtilityNotes = (notes) => {
    setUtilityNotes(notes);
    try { localStorage.setItem('csboard-utility-notes', JSON.stringify(notes)); } catch { setUtilityError(t('utilityStorageFailed')); }
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
      const next = [...utilityNotes];
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
      persistUtilityNotes(next);
      setUtilityImportNotice(t('utilityImportDone', { added, skipped }));
    } catch {
      setUtilityImportNotice(t('utilityImportFailed'));
    }
  };
  const restoreWorkspaceArchive = (archive) => {
    if (roomCode && !roomOwner) return;
    flushCollabSave();
    let storedArchive = archive;
    try { storedArchive = JSON.parse(localStorage.getItem('csboard-workspace-archives') || '[]').find((item) => item.id === archive.id) || archive; } catch { storedArchive = archive; }
    const restoredFrames = normalizeFrames(storedArchive.frames, storedArchive.workspace || emptyWorkspace());
    if (!restoredFrames.length) return;
    const active = restoredFrames.find((frame) => frame.id === storedArchive.activeFrameId) || restoredFrames[0];
    const canonicalArchive = { ...storedArchive, frames: restoredFrames, activeFrameId: active.id, workspace: { ...(storedArchive.workspace || {}), ...normalizeCollabWorkspace(storedArchive.workspace || active.workspace) } };
    const restoreWorkspace = { ...frameWorkspace(active.workspace || canonicalArchive.workspace), cameraSlots: canonicalArchive.workspace?.cameraSlots || [], camera: canonicalArchive.workspace?.camera || null };
    if (JSON.stringify(storedArchive.frames || []) !== JSON.stringify(restoredFrames) || JSON.stringify(storedArchive.workspace || {}) !== JSON.stringify(canonicalArchive.workspace)) {
      let storedArchives = archives;
      try { storedArchives = JSON.parse(localStorage.getItem('csboard-workspace-archives') || '[]'); } catch { storedArchives = archives; }
      const migrated = storedArchives.map((item) => item.id === canonicalArchive.id ? canonicalArchive : item);
      try { localStorage.setItem('csboard-workspace-archives', JSON.stringify(migrated)); setArchives(migrated); } catch { setRoomNotice(t('utilityStorageFailed')); }
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
  const selectedMode = showModel ? modelViewMode : -1;
  const hasLeftSidebar = activePanel === 'utility' || (activePanel === 'collab' && hasActiveFrameContext);
  const hasRightSidebar = ['analysis', 'utility', 'collab'].includes(activePanel);
  const modelControlsTarget = isMobile ? '' : activePanel === 'demo' ? '.demo-options' : activePanel === 'collab' && hasActiveFrameContext ? '.collab-frame-strip' : '.workspace-bottom-bar';
  const currentUtilityNotes = utilityNotes.filter((note) => note.mapName === mapName);
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
  const demoSnapshot = demoRound && (demoTick < demoRound.startTick || demoTick > demoRound.endTick) ? null : interpolateDemoSnapshot(demoSnapshots, demoTick);
  demoRosterRuntime.snapshots = demoSnapshots;
  const demoReloads = useMemo(() => buildDemoReloads(demoSnapshots, demoData?.events || [], demoData?.demo.tickRate || 64), [demoSnapshots, demoData?.events, demoData?.demo.tickRate]);
  demoRosterRuntime.reloads = demoReloads;
  const demoGrenadeSegments = useMemo(() => buildDemoGrenadeSegments(demoProjectiles, demoData?.events || [], demoThrowSnapshots, demoRound, demoData?.demo.tickRate || 64), [demoProjectiles, demoData?.events, demoThrowSnapshots, demoRound, demoData?.demo.tickRate]);
  const onDemoGrenadeSelect = (id, screen) => { setSelectedDemoGrenade(demoGrenadeSegments.find((segment) => segment.id === id) || null); setSelectedDemoGrenadeScreen(screen); setDemoPlaying(false); };
  const saveDemoGrenade = () => {
    if (!selectedDemoGrenade) return;
    const segment = selectedDemoGrenade;
    const throwerId = String(segment.throwEvent.user_steamid || '');
    const throwerName = segment.throwEvent.user_name || t('unknown');
    const tickRate = demoData?.demo.tickRate || 64;
    const replayStart = utilityReplayStart(segment, throwerId, throwerName, tickRate);
    const replayStartTick = replayStart.startTick;
    const replaySnapshots = segment.snapshots.filter((snapshot) => snapshot.tick >= replayStartTick && snapshot.tick <= segment.effectTick).map((snapshot) => ({ tick: snapshot.tick - replayStartTick, players: snapshot.players.filter((player) => String(player.steamid || '') === throwerId || player.name === throwerName).map((player) => ({ name: player.name, steamid: player.steamid, team: player.team, health: player.health, pitch: player.pitch, yaw: player.yaw, duckAmount: player.duckAmount, isAirborne: player.isAirborne, movement: player.movement, walking: player.walking, fire: player.fire, secondaryFire: player.secondaryFire, activeWeapon: player.activeWeapon, hasDefuser: player.hasDefuser, defusing: player.defusing, placeName: player.placeName, raw: player.raw, position: player.position })) }));
    const throwSnapshot = [...replaySnapshots].reverse().find((snapshot) => snapshot.tick <= segment.throwTick - replayStartTick)?.players[0] || replaySnapshots[0]?.players[0];
    const startSnapshot = replaySnapshots.find((snapshot) => snapshot.players[0])?.players[0] || throwSnapshot;
    const startPlace = startSnapshot?.placeName || '';
    const throwPlace = throwSnapshot?.placeName || startPlace;
    const position = startSnapshot?.raw ? [startSnapshot.raw.x, startSnapshot.raw.y, startSnapshot.raw.z] : [segment.throwEvent.user_X, segment.throwEvent.user_Y, segment.throwEvent.user_Z];
    if (position.some((value) => !Number.isFinite(Number(value)))) return;
    const angles = [Number(throwSnapshot?.pitch || 0), Number(throwSnapshot?.yaw || 0), 0];
    const preparation = replaySnapshots.filter((snapshot) => snapshot.tick <= segment.throwTick - replayStartTick).flatMap((snapshot) => snapshot.players);
    const nearestAttackIndex = preparation.findLastIndex((player) => player.fire || player.secondaryFire);
    const attackRows = [];
    for (let index = nearestAttackIndex; index >= 0 && (preparation[index].fire || preparation[index].secondaryFire); index -= 1) attackRows.unshift(preparation[index]);
    const throwStrength = segment.throwEvent.throw_strength == null ? NaN : Number(segment.throwEvent.throw_strength);
    const attack = Number.isFinite(throwStrength) ? throwStrength >= 0.75 ? 'primary' : throwStrength <= 0.25 ? 'secondary' : 'both' : attackRows.some((player) => player.fire && player.secondaryFire) ? 'both' : attackRows.at(-1)?.secondaryFire ? 'secondary' : 'primary';
    const movement = [...new Set(preparation.slice(-32).flatMap((player) => player.movement || []))];
    const behavior = { attack, throwStrength: Number.isFinite(throwStrength) ? throwStrength : null, jumped: typeof segment.throwEvent.jump_throw === 'boolean' ? segment.throwEvent.jump_throw : preparation.slice(-32).some((player) => player.isAirborne), crouched: preparation.slice(-8).some((player) => Number(player.duckAmount) >= 0.8), walking: preparation.slice(-8).some((player) => player.walking), movement, hasRunup: replayStart.hasRunup, runupPeakSpeed: replayStart.peakSpeed, runupDistance: replayStart.distance };
    const behaviorText = [attack, replayStart.hasRunup ? 'runup' : null, behavior.jumped ? 'jump' : null, behavior.crouched ? 'crouch' : null, behavior.walking ? 'walk' : null, movement.length ? movement.join('+') : 'stationary'].filter(Boolean).join(' · ');
    const replay = {
      tickRate,
      throwTick: segment.throwTick - replayStartTick,
      effectTick: segment.effectTick - replayStartTick,
      endTick: segment.endTick - replayStartTick,
      snapshots: replaySnapshots,
      projectiles: segment.projectiles.map((record) => ({ tick: record.tick - replayStartTick, entity_id: record.entity_id, grenade_type: record.grenade_type, initialVelocity: record.initial_velocity ?? null, x: record.x, y: record.y, z: record.z })),
      events: [{ event_name: 'grenade_thrown', tick: segment.throwTick - replayStartTick, weapon: segment.throwEvent.weapon, user_name: throwerName, user_steamid: segment.throwEvent.user_steamid, user_X: segment.throwEvent.user_X, user_Y: segment.throwEvent.user_Y, user_Z: segment.throwEvent.user_Z }, ...(segment.landing ? [{ event_name: segment.landing.event_name, tick: segment.effectTick - replayStartTick, entityid: segment.landing.entityid, user_steamid: segment.landing.user_steamid, x: segment.landing.x, y: segment.landing.y, z: segment.landing.z }] : [])],
    };
    const note = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mapName, position: position.map(Number), angles, name: `${throwerName} · ${segment.kind.toUpperCase()}`, summary: behaviorText, source: 'demo', grenadeType: segment.kind, thrower: throwerName, startPlace, throwPlace, demoSource: { fileName: demoData?.demo.fileName || 'Demo', round: demoRound?.round || null, tick: segment.throwTick, map: mapName }, behavior, replay, createdAt: new Date().toISOString() };
    persistUtilityNotes([...utilityNotes, note]);
    setSelectedDemoGrenade(null);
    setSelectedDemoGrenadeScreen(null);
  };
  const playUtilityReplay = (note, firstPerson = false) => {
    if (!note.replay) return;
    setUtilityReplay({ note, tick: 0, playing: true, firstPerson, delayUntil: firstPerson ? Date.now() + 1000 : 0 });
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
    const next = utilityNotes.filter((item) => item.id !== note.id);
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
    persistUtilityNotes(utilityNotes.map((note) => note.id === updated.id ? updated : note));
    setSelectedUtilityNote(updated);
    setUtilityHover((hover) => hover ? { ...hover, entries: hover.entries.map((note) => note.id === updated.id ? updated : note) } : hover);
    setUtilityReplay((replay) => replay?.note.id === updated.id ? { ...replay, note: updated } : replay);
    setUtilityEditDraft(null);
  };
  useEffect(() => {
    if (!utilityReplay?.playing) return undefined;
    const timer = window.setInterval(() => setUtilityReplay((current) => {
      if (!current?.playing) return current;
      if (current.delayUntil && Date.now() < current.delayUntil) return current;
      const nextTick = Math.min(current.note.replay.endTick, current.tick + current.note.replay.tickRate / 30);
      return { ...current, tick: nextTick, playing: nextTick < current.note.replay.endTick, delayUntil: 0 };
    }), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [utilityReplay?.playing]);
  const utilityReplaySnapshot = utilityReplay && utilityReplay.tick <= utilityReplay.note.replay.throwTick + 64 ? interpolateDemoSnapshot(utilityReplay.note.replay.snapshots, utilityReplay.tick) : null;
  const utilityFirstPerson = useMemo(() => {
    if (!utilityReplay?.firstPerson) return null;
    const cameraSnapshot = utilityReplaySnapshot || interpolateDemoSnapshot(utilityReplay.note.replay.snapshots, Math.min(utilityReplay.tick, utilityReplay.note.replay.throwTick + 64));
    const player = cameraSnapshot?.players[0];
    if (!player) return null;
    return { player, grenadeType: utilityReplay.note.grenadeType || 'he', replayId: utilityReplay.note.id, tick: utilityReplay.tick, throwTick: utilityReplay.note.replay.throwTick, tickRate: utilityReplay.note.replay.tickRate || 64 };
  }, [utilityReplay, utilityReplaySnapshot]);
  const utilityReplaySegments = useMemo(() => utilityReplay ? buildDemoGrenadeSegments(utilityReplay.note.replay.projectiles, utilityReplay.note.replay.events, utilityReplay.note.replay.snapshots, { startTick: 0, endTick: utilityReplay.note.replay.endTick }, utilityReplay.note.replay.tickRate) : [], [utilityReplay?.note]);
  const demoTeams = { T: demoSnapshot?.players.filter((player) => player.team === 2) || [], CT: demoSnapshot?.players.filter((player) => player.team === 3) || [] };
  const demoPovPlayer = demoSnapshot?.players.find((player) => String(player.steamid || player.name) === demoPovPlayerId && player.health > 0) || null;
  const demoPovFiring = Boolean(demoPovPlayer && demoData?.events?.some((event) => event.event_name === 'weapon_fire' && demoEventPlayerMatches(event, demoPovPlayer) && event.tick <= demoTick && demoTick - event.tick < 8));
  const demoPovHurt = Boolean(demoPovPlayer && demoData?.events?.some((event) => event.event_name === 'player_hurt' && demoEventPlayerMatches(event, demoPovPlayer) && event.tick <= demoTick && demoTick - event.tick < 10));
  const toggleDemoPov = (player) => { const id = String(player.steamid || player.name); setDemoCameraMode('manual'); setDemoPovPlayerId((current) => current === id ? '' : id); };
  const interruptDemoCamera = () => { setDemoCameraMode('manual'); setDemoPovPlayerId(''); };
  demoPovRuntime.player = demoPovPlayer;
  demoPovRuntime.playerId = demoPovPlayerId;
  demoPovRuntime.toggle = toggleDemoPov;
  demoPovRuntime.interrupt = interruptDemoCamera;
  const demoRoundEconomies = useMemo(() => new Map((demoData?.rounds || []).map((round) => [round.round, roundEconomy(round, demoData.roundData?.find((item) => item.round === round.round))])), [demoData]);
  const demoSideSwitchRounds = useMemo(() => {
    const switches = new Set();
    const rounds = demoData?.rounds || [];
    for (let index = 1; index < rounds.length; index += 1) {
      const previous = roundSideSignature(demoData.roundData?.find((item) => item.round === rounds[index - 1].round));
      const current = roundSideSignature(demoData.roundData?.find((item) => item.round === rounds[index].round));
      if (sidesSwitched(previous, current)) switches.add(rounds[index].round);
    }
    return switches;
  }, [demoData]);
  const demoScore = { T: demoTeams.T[0]?.score || 0, CT: demoTeams.CT[0]?.score || 0 };
  const demoKillLifetime = (demoData?.demo.tickRate || 64) * 5;
  const demoKills = activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= Math.max(demoRound.startTick, demoTick - demoKillLifetime) && event.tick <= demoTick).reverse() || [] : [];
  const demoDeaths = demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick) || [];
  const demoC4Events = demoData?.events?.filter((event) => demoRound && ['bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick) || [];
  const demoHltvEvents = demoData?.events?.filter((event) => demoRound && ['hltv_fixed', 'hltv_chase'].includes(event.event_name) && event.tick >= (demoRound.freezeStartTick ?? demoRound.startTick) && event.tick <= demoRound.endTick) || [];
  const timelineEvents = demoData?.events?.filter((event) => demoRound && ['player_death', 'bomb_planted', 'bomb_exploded', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick).map((event) => ({ ...event, label: event.event_name === 'player_death' ? '×' : event.event_name === 'bomb_planted' ? '↓' : event.event_name === 'bomb_exploded' ? '💥' : '□', title: event.event_name === 'player_death' ? `${event.attacker_name || 'WORLD'} 击杀 ${event.user_name || 'UNKNOWN'}` : event.event_name === 'bomb_planted' ? 'C4 安装' : event.event_name === 'bomb_exploded' ? 'C4 爆炸' : '回合结束' })) || [];
  const c4TimerTicks = useMemo(() => {
    const events = demoData?.events || [];
    const durations = events.filter((event) => event.event_name === 'bomb_planted').map((plant) => {
      const nextPlant = events.find((event) => event.event_name === 'bomb_planted' && event.tick > plant.tick);
      const explosion = events.find((event) => event.event_name === 'bomb_exploded' && event.tick > plant.tick && (!nextPlant || event.tick < nextPlant.tick));
      return explosion ? explosion.tick - plant.tick : null;
    }).filter((duration) => duration > 0).sort((left, right) => left - right);
    return durations.length ? durations[Math.floor(durations.length / 2)] : 40 * 64;
  }, [demoData?.events]);
  const c4Plant = [...demoC4Events].reverse().find((event) => event.event_name === 'bomb_planted' && event.tick <= demoTick);
  const c4Terminal = c4Plant && demoC4Events.find((event) => ['bomb_exploded', 'bomb_defused'].includes(event.event_name) && event.tick >= c4Plant.tick);
  const c4DisplayTick = c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? c4Terminal.tick : demoTick;
  const c4EndTick = c4Terminal?.event_name === 'bomb_exploded' ? c4Terminal.tick : c4Plant ? c4Plant.tick + c4TimerTicks : null;
  const c4Countdown = c4Plant && (!c4Terminal || c4Terminal.event_name === 'bomb_defused' || demoTick <= c4Terminal.tick) ? Math.max(0, (c4EndTick - c4DisplayTick) / (demoData?.demo.tickRate || 64)) : null;
  const roundEndEvent = demoC4Events.find((event) => event.event_name === 'round_end' && event.tick <= demoTick);
  const roundCountdown = demoRound ? Math.max(0, 115 - (demoTick - demoRound.startTick) / (demoData?.demo.tickRate || 64)) : 0;
  const roundCountdownSeconds = Math.ceil(roundCountdown);
  const roundClock = `${Math.floor(roundCountdownSeconds / 60)}:${String(roundCountdownSeconds % 60).padStart(2, '0')}`;
  const roundWinner = roundEndEvent ? roundWinnerSide(roundEndEvent.winner ?? demoRound?.winner) : null;
  const roundResult = roundEndEvent ? `${roundWinner || '-'} · ${roundReasonLabel(roundEndEvent.reason || demoRound?.reason, language)}` : '';
  const currentDefuser = demoSnapshot?.players.find((player) => player.defusing);
  const currentSnapshotIndex = currentDefuser ? demoSnapshots.findLastIndex((snapshot) => snapshot.tick <= demoTick) : -1;
  const defuseStartEvent = currentDefuser ? [...demoC4Events].reverse().find((event) => event.event_name === 'bomb_begindefuse' && event.tick <= demoTick && (demoEventPlayerMatches(event, currentDefuser) || !event.user_steamid && !event.user_name)) : null;
  let defuseStartTick = defuseStartEvent?.tick ?? (currentSnapshotIndex >= 0 ? demoSnapshots[currentSnapshotIndex].tick : null);
  if (currentDefuser && !defuseStartEvent) for (let index = currentSnapshotIndex - 1; index >= 0; index -= 1) {
    if (!demoSnapshots[index].players.some((player) => player.name === currentDefuser.name && player.defusing)) break;
    defuseStartTick = demoSnapshots[index].tick;
  }
  const defuseDurationTicks = (currentDefuser?.hasDefuser ? 5 : 10) * (demoData?.demo.tickRate || 64);
  const defuseProgress = currentDefuser && defuseStartTick != null ? THREE.MathUtils.clamp((demoTick - defuseStartTick) / defuseDurationTicks, 0, 1) : null;
  const deferredAnalysisSelectedPlayers = useDeferredValue(analysisSelectedPlayers);
  const analysisDuration = useMemo(() => deferredAnalysisSelectedPlayers.length && analysisRows.length ? Math.max(0, ...deferredAnalysisSelectedPlayers.flatMap((name) => demoData?.rounds?.map((round) => {
    const records = analysisRows.filter((snapshot) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick).flatMap((snapshot) => snapshot.players.filter((player) => player.name === name).map((player) => ({ ...player, tick: snapshot.tick }))).sort((left, right) => left.tick - right.tick);
    const roundSide = records[0]?.team === 2 ? 'T' : records[0] ? 'CT' : null;
    if (analysisSide !== 'ALL' && roundSide !== analysisSide) return 0;
    const last = records.find((player) => player.health != null && player.health <= 0) || records.at(-1);
    return last ? Math.min(last.tick - round.startTick, round.endTick - round.startTick) : 0;
  }) || [])) : 0, [deferredAnalysisSelectedPlayers, analysisRows, analysisSide, demoData?.rounds]);
  useEffect(() => {
    const worker = new Worker(new URL('./demoWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = async (event) => {
       const currentLanguage = languageRef.current;
       if (event.data.type === 'status') setDemoStatus(currentLanguage === 'zh' ? event.data.message : event.data.message.replace(/正在一次性解析 (\d+) 个回合位置…/, 'Parsing $1 rounds...').replace(/Demo 已读取，(\d+) 个回合已全部就绪/, 'Demo loaded, $1 rounds ready').replace('正在加载 Demo 解析器…', 'Loading Demo parser...').replace('正在读取 Demo Header…', 'Reading Demo header...').replace('正在读取回合事件…', 'Reading round events...').replace('正在读取道具与投掷物轨迹…', 'Reading utility trajectories...').replace('正在读取全场移动数据…', 'Reading full-match movement data...').replace('全场移动数据已就绪', 'Full-match movement data ready'));
       if (event.data.type === 'progress' && event.data.phase === 'ticks') {
         const now = performance.now();
         const real = THREE.MathUtils.clamp(Number(event.data.percent) || 0, 0, 100);
         const progress = demoParseProgressRef.current;
         const startedAt = progress.startedAt || now;
         demoParseProgressRef.current = { startedAt, real, completed: Number(event.data.completed) || 0, total: Number(event.data.total) || 0, lastRealAt: now, msPerPercent: real > 0 ? Math.max(250, (now - startedAt) / real) : 3000, hasReal: true };
         setDemoParseProgress((current) => Math.max(current, real));
         if (event.data.stage) setDemoStatus(event.data.stage[currentLanguage] || event.data.stage.zh);
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
         const players = [...new Set(rows.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))].sort();
         setAnalysisRows(rows); setAnalysisPlayers(players); setAnalysisSelectedPlayers((selected) => selected.filter((name) => players.includes(name))); setAnalysisStatus(translate(currentLanguage, 'analysisReady'));
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
  useEffect(() => {
    if (activePanel !== 'analysis' || !demoData || analysisLoadedFor === demoData.demo.fileName) return;
    if (!demoSourceReady) { setAnalysisStatus(t('analysisNeedsSource')); return; }
    setAnalysisStatus(t('analysisLoading'));
    setAnalysisLoadedFor(demoData.demo.fileName);
    demoWorkerRef.current?.postMessage({ type: 'analysis', rounds: demoData.rounds });
  }, [activePanel, demoData, analysisLoadedFor, demoSourceReady]);
  const loadDemo = async (event) => {
    const files = [...(event.target.files || [])].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    if (files.length === 0) return;
    const sourceBytes = files.reduce((sum, file) => sum + file.size, 0);
    const cacheId = demoCacheId(files, demoSampleRate);
    const cached = await getCachedDemo(cacheId).catch(() => null);
    if (cached?.data?.cacheSchemaVersion === DEMO_CACHE_SCHEMA_VERSION && await countCachedDemoRounds(cacheId) === cached.data.rounds?.length) {
      window.clearTimeout(parseGameTimerRef.current);
       setParseGameState('hidden');
       setParseGameManual(false);
      applyDemoData(cached.data, cacheId, cached.analysisRows || [], false);
      setMapName(cached.data.demo.map || mapName);
      setDemoStatus(t('cacheReady'));
      const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
      demoWorkerRef.current?.postMessage({ type: 'source', buffers }, buffers);
      event.target.value = '';
      return;
    }
     setDemoData(null);
     setDemoSnapshots([]);
     setDemoThrowSnapshots([]);
     setDemoProjectiles([]);
     setAnalysisRows([]);
     setAnalysisPlayers([]);
     setAnalysisSelectedPlayers([]);
     setAnalysisLoadedFor('');
     setAnalysisPlaying(false);
     setAnalysisTime(0);
     setDemoStatus(files.length > 1 ? t('combiningParts', { count: files.length }) : t('readingDemo'));
       window.clearTimeout(parseGameTimerRef.current);
       setParseGameState('hidden');
       setParseGameManual(false);
       setParseGameDismissed(false);
      parseGameTimerRef.current = window.setTimeout(() => { if (!parseGameDismissedRef.current) setParseGameState('visible'); }, 3000);
       pendingDemoRoundWritesRef.current = Promise.resolve();
       pendingDemoRoundWriteErrorRef.current = null;
       pendingDemoRoundSummariesRef.current = new Map();
      setDemoParseProgress(0);
      demoParseProgressRef.current = { startedAt: performance.now(), real: 0, completed: 0, total: 0, lastRealAt: 0, msPerPercent: 3000, hasReal: false };
     pendingDemoCacheRef.current = { id: cacheId, sourceBytes };
     const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
      demoWorkerRef.current?.postMessage({ type: 'load', fileName: files.map((file) => file.name).join(' + '), sampleRate: demoSampleRate, buffers }, buffers);
  };
  useEffect(() => {
    if (!demoRound || !demoData) return;
    let cancelled = false;
    setDemoPovPlayerId('');
    setDemoTick(demoRound.startTick);
    setDemoRoundLoading(true);
    setDemoPlaying(false);
    getCachedDemoRound(activeDemoCacheIdRef.current, demoRound.round).then((cached) => {
      if (cancelled) return;
      setDemoSnapshots(cached?.snapshots || []);
      setDemoThrowSnapshots(cached?.throwSnapshots || []);
      setDemoProjectiles(cached?.projectiles || []);
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
    if (!analysisPlaying || !demoData?.rounds.length) return undefined;
    const timer = window.setInterval(() => setAnalysisTime((time) => {
      const next = Math.min(analysisDuration, time + 64 / 30);
      if (next >= analysisDuration) setAnalysisPlaying(false);
      return next;
    }), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [analysisPlaying, demoData, analysisDuration]);
  useEffect(() => {
     const onDemoKeyDown = (event) => {
       if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
         event.preventDefault();
         event.stopImmediatePropagation();
         const direction = event.code === 'ArrowLeft' ? -1 : 1;
         if (activePanel === 'analysis' && demoData && analysisSelectedPlayers.length && analysisRows.length) {
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
       if (!demoData) return;
        if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); if (event.repeat) return; if (activePanel === 'analysis') { if (analysisSelectedPlayers.length && analysisRows.length) setAnalysisPlaying((playing) => !playing); } else if (!demoRoundLoading && demoRound) setDemoPlaying((playing) => !playing); return; }
         if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target?.tagName)) return;
     };
    window.addEventListener('keydown', onDemoKeyDown, true);
    return () => window.removeEventListener('keydown', onDemoKeyDown, true);
  }, [activeFrameId, activePanel, analysisDuration, analysisRows.length, analysisSelectedPlayers.length, demoData, demoRound, demoRoundLoading, frames, hasActiveFrameContext]);
  useEffect(() => {
    let cancelled = false;
    setNavData(mapName === 'de_dust2' ? fallbackNavData : null);
    fetchAndParseNav(`${MAP_BASE}/${mapName}/${mapName}.nav`).then((data) => { if (!cancelled && data.areas) setNavData(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapName]);
  return <main className={`board-shell${isMobile ? ' is-mobile' : ''}${!hasLeftSidebar || !leftSidebarOpen ? ' left-sidebar-collapsed' : ''}${hasRightSidebar && !rightSidebarOpen ? ' right-sidebar-collapsed' : ''}`} data-panel={activePanel}>
    <header className="board-header">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>CS<span>BOARD</span></span></div>
       <nav className="topbar-panels"><button type="button" className={activePanel === 'demo' ? 'active' : ''} onClick={() => switchPanel('demo')}>{t('rounds')}</button><button type="button" className={activePanel === 'analysis' ? 'active' : ''} onClick={() => switchPanel('analysis')}>{t('analysis')}</button><button type="button" className={activePanel === 'utility' ? 'active' : ''} onClick={() => switchPanel('utility')}>{t('utilityNotes')}</button><button type="button" className={activePanel === 'collab' ? 'active' : ''} onClick={() => switchPanel('collab')}>{t('collab')}</button></nav>
       <div className="header-right"><label className="map-select header-map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select><MapIcon map={mapName} /></label><a className="github-link" href="https://github.com/dlwm/csBoard" target="_blank" rel="noreferrer">GITHUB</a><button type="button" className={`game-switch${parseGameState !== 'hidden' ? ' active' : ''}`} title={language === 'zh' ? '小游戏' : 'Mini games'} aria-label={language === 'zh' ? '打开小游戏' : 'Open mini games'} aria-pressed={parseGameState !== 'hidden'} onClick={() => { if (parseGameState !== 'hidden') { setParseGameManual(false); setParseGameState('hidden'); } else { setParseGameManual(true); setParseGameState('visible'); } }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8h9.6a4 4 0 0 1 3.8 5.2l-1.2 3.7a2.2 2.2 0 0 1-3.5 1.1l-2.1-1.7h-3.6L8.1 18a2.2 2.2 0 0 1-3.5-1.1l-1.2-3.7A4 4 0 0 1 7.2 8Z"/><path d="M8 11v4M6 13h4M16.5 11.5h.01M18 14h.01"/></svg></button><button type="button" className="language-switch" onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')}>{t('language')}</button></div>
    </header>
    <section className="board-stage">
         {parseGameState !== 'hidden' && <div className={`parse-game-layer ${parseGameState}`}><SideGameHub language={language} stopped={!parseGameManual && parseGameState === 'stopped'} manual={parseGameManual} onClose={() => { setParseGameDismissed(true); setParseGameManual(false); setParseGameState('hidden'); }} /></div>}
        <ThreeBoard key={`${mapName}-${navData ? navData.version : 'loading'}`} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelOpacity={modelOpacity} modelViewMode={modelViewMode} trackpadDetection={trackpadDetection} showDemoNames={showDemoNames} demoSnapshot={activePanel === 'demo' ? demoSnapshot : utilityReplaySnapshot} demoSnapshots={activePanel === 'demo' ? demoSnapshots : []} demoTick={activePanel === 'demo' ? demoTick : utilityReplay?.tick || 0} demoFires={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'weapon_fire') || [] : []} demoHurts={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_hurt') || [] : []} demoGrenades={activePanel === 'demo' ? demoData?.events?.filter((event) => ['grenade_thrown', 'smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate'].includes(event.event_name)) || [] : utilityReplay?.note.replay.events || []} demoProjectiles={activePanel === 'demo' ? demoProjectiles : utilityReplay?.note.replay.projectiles || []} demoGrenadeSegments={activePanel === 'demo' ? demoGrenadeSegments : utilityReplaySegments} onDemoGrenadeSelect={activePanel === 'demo' ? onDemoGrenadeSelect : null} demoDeaths={activePanel === 'demo' ? demoDeaths : []} demoC4Events={activePanel === 'demo' ? demoC4Events : []} demoHltvEvents={activePanel === 'demo' ? demoHltvEvents : []} demoCameraMode={activePanel === 'demo' ? demoCameraMode : 'manual'} onDemoCameraInterrupt={() => setDemoCameraMode('manual')} utilityFirstPerson={activePanel === 'utility' ? utilityFirstPerson : null} heatDeaths={activePanel === 'analysis' ? demoData?.events?.filter((event) => event.event_name === 'player_death') || [] : []} demoViewFlags={demoViewFlags} analysisRows={analysisRows} analysisSelectedPlayers={analysisSelectedPlayers} analysisSide={analysisSide} analysisEnabled={activePanel === 'analysis'} analysisRounds={demoData?.rounds || []} analysisTime={analysisTime} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={onPointSelect} onGrenadeWheel={setGrenadeWheel} onCameraSlots={onCameraSlots} onReady={onReady} onModelLoadState={setModelLoadState} pointPlacementEnabled={activePanel === 'collab'} brushEnabled={true} brushColor={brushColor} brushWidth={brushWidth} eraserEnabled={eraserEnabled} onBrushChange={handleBrushChange} onCollabEdit={() => scheduleCollabSave()} />
         {isMobile && <MobileCameraWheel slots={cameraSlotState} active={activeCameraSlot} language={language} onRestore={(slot) => boardRef.current?.restoreCameraSlot?.(slot)} onSave={(slot) => boardRef.current?.saveCameraSlot?.(slot)} onReset={() => boardRef.current?.reset?.()} />}
         <div className="stage-vignette" />
          {activePanel === 'demo' && <DemoPovHud player={demoPovPlayer} firing={demoPovFiring} hurt={demoPovHurt} />}
          {activePanel === 'demo' && demoSnapshot && <div className="demo-combat-hud"><div className={`demo-score${roundWinner ? ` winner-${roundWinner.toLowerCase()}` : ''}`}><span><SideLogo side="T" /></span><strong>{demoScore.T}</strong><i>ROUND {demoRound?.round || '-'}{roundResult ? <b className="round-result">{roundResult}</b> : c4Countdown != null ? <b className={c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? 'c4-paused' : ''}>C4 {c4Countdown.toFixed(4)}s</b> : <b className="round-clock">{roundClock}</b>}{defuseProgress != null && <span className={`score-defuse${currentDefuser.hasDefuser ? ' has-kit' : ''}`} style={{ '--defuse-progress': `${defuseProgress * 360}deg` }}><i>{currentDefuser.hasDefuser ? 'KIT' : '10s'}</i></span>}</i><strong>{demoScore.CT}</strong><span><SideLogo side="CT" /></span></div>{demoKills.length > 0 && <DemoKillFeed kills={demoKills} round={demoRound} language={language} collapsed={demoKillsCollapsed} onToggle={() => setDemoKillsCollapsed((collapsed) => !collapsed)} />}</div>}
       {demoData?.demo.map && demoData.demo.map !== mapName && <div className="map-name map-mismatch"><button type="button" onClick={() => setMapName(demoData.demo.map)}>{language === 'zh' ? '当前地图不匹配，可跳转' : 'Map mismatch, switch to Demo map'}</button></div>}
       {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>{t('smoke')}</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>{t('fire')}</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>{t('flash')}</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>{t('grenade')}</div><span className="wheel-key">Q</span></div>}
      {saveArchiveModal && <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) setSaveArchiveModal(false); }}><div className="save-archive-dialog" onKeyDown={(event) => { if (event.key === 'Enter' && (saveArchiveSelected || saveArchiveName.trim())) saveWorkspaceArchive(saveArchiveSelected, saveArchiveName); else if (event.key === 'Escape') setSaveArchiveModal(false); }}><header><strong>{t('saveFrame')}</strong><button type="button" onClick={() => setSaveArchiveModal(false)}>×</button></header><label className="collab-utility-search"><span>{t('saveToArchive')}</span><select value={saveArchiveSelected} onChange={(event) => { setSaveArchiveSelected(event.target.value); }}>{archives.filter((archive) => archive.mapName === mapName).map((archive) => <option key={archive.id} value={archive.id}>{archive.name || archive.mapName.toUpperCase()} · {new Date(archive.savedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</option>)}<option value="">{t('newArchive')}</option></select></label>{saveArchiveSelected === '' && <label className="collab-utility-search"><span>{t('archiveName')}</span><input autoFocus value={saveArchiveName} placeholder={t('newArchive')} onChange={(event) => setSaveArchiveName(event.target.value)} /></label>}<div className="save-archive-actions"><button type="button" onClick={() => setSaveArchiveModal(false)}>{t('cancel')}</button><button type="button" onClick={() => saveWorkspaceArchive(saveArchiveSelected, saveArchiveName)} disabled={!saveArchiveSelected && !saveArchiveName.trim()}>{t('save')}</button></div></div></div>}
      {renameModal && <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) setRenameModal(null); }}><div className="save-archive-dialog"><header><strong>{t('rename')}</strong><button type="button" onClick={() => setRenameModal(null)}>×</button></header><label className="collab-utility-search"><span>{t('name')}</span><input autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmRename(); else if (event.key === 'Escape') setRenameModal(null); }} /></label><div className="save-archive-actions"><button type="button" onClick={() => setRenameModal(null)}>{t('cancel')}</button><button type="button" onClick={confirmRename} disabled={!renameDraft.trim()}>{t('save')}</button></div></div></div>}
            <div className="view-tools">
             <div className="view-tools-top">
               {map2dLayers[mapName]?.length ? <button type="button" className="map-preview-slot" aria-label={language === 'zh' ? '切换地图层级' : 'Switch map floor'} onClick={() => setMap2dLayer((layer) => (layer + 1) % map2dLayers[mapName].length)}>
                 <img src={map2dLayers[mapName][map2dLayer]?.url} alt="" />
                 {radarOverlay && <svg className="map-radar-overlay" viewBox="0 0 100 100" aria-hidden="true">
                   {radarOverlay.players.map((player) => <g className={`map-player-base side-${player.team.toLowerCase()}`} key={`${player.source}-${player.id}`} transform={`translate(${player.x} ${player.y}) rotate(${player.angle})`}><circle r="3.1" /><path d="M2.2 0 5.2-1.6 5.2 1.6Z" /></g>)}
                   <g className="map-camera-marker" transform={`translate(${radarOverlay.camera.x} ${radarOverlay.camera.y}) rotate(${radarOverlay.camera.angle})`}><path className="map-camera-fan" d="M0 0 23-10A25 25 0 0 1 23 10Z" /><circle r="2.2" /></g>
                 </svg>}
                 {map2dLayers[mapName].length > 1 && <span>{map2dLayers[mapName][map2dLayer]?.id === 'lower' ? 'LOWER' : 'UPPER'}</span>}
               </button> : <div className="map-preview-slot map-preview-empty" aria-hidden="true" />}
                <div className="camera-slots"><span>{t('cameraPositions')}</span>{cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved} className={activeCameraSlot === index ? 'active' : ''} onClick={() => boardRef.current?.restoreCameraSlot?.(index)}>{index === 9 ? 0 : index + 1}</button>)}</div>
             </div>
             <div className="brush-controls"><div className="brush-swatches">{['#a5e0ff', '#ff6b6b', '#7cf29c', '#ffd166', '#ffffff', '#c084fc'].map((c) => <button type="button" key={c} className={`brush-swatch${brushColor.toLowerCase() === c ? ' active' : ''}`} style={{ background: c }} aria-label={c} title={c} onClick={() => { setBrushColor(c); localStorage.setItem('csboard-brush-color', c); }} />)}</div><div className="brush-util-row"><div className="brush-widths">{[2, 3, 5, 8].map((w) => <button type="button" key={w} className={`brush-width${brushWidth === w ? ' active' : ''}`} title={`${w}px`} onClick={() => { setBrushWidth(w); localStorage.setItem('csboard-brush-width', String(w)); }}><i style={{ width: Math.max(2, w), height: Math.max(2, w) }} /></button>)}</div><button type="button" className={`brush-eraser${eraserEnabled ? ' active' : ''}`} title={t('eraser')} aria-label={t('eraser')} onClick={() => setEraserEnabled((value) => !value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M11 3 14 6l-5 5H5l-3-3z" /><path d="M8 6 11 9" /></svg></button></div></div>
           </div>
           <div className="key-hints">{activePanel === 'demo' || activePanel === 'analysis' ? <><div className="key-group"><b>{t('hintCatEdit')}</b><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintBrushDrag')}</span><span><kbd>CTRL+LMB</kbd>{t('hintErase')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span></div><div className="key-group"><b>{t('hintCatPlayback')}</b><span><kbd>SPACE</kbd>{t('hintPlayPause')}</span><span><kbd>← →</kbd>{t('hintStep')}</span></div><div className="key-group"><b>{t('hintCatCamera')}</b><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>MMB</kbd>{t('hintRotate')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></> : activePanel === 'utility' ? <><div className="key-group"><b>{t('hintCatEdit')}</b><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintBrushDrag')}</span><span><kbd>CTRL+LMB</kbd>{t('hintErase')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span></div><div className="key-group"><b>{t('hintCatCamera')}</b><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></> : <><div className="key-group"><span><kbd>E</kbd>{t('hintPlacePoint')}</span><span><kbd>Q</kbd>{t('hintGrenadeWheel')}</span><span><kbd>CTRL+LMB</kbd>{t('hintDeleteUtility')}</span><span><kbd>LMB</kbd>{t('hintMovePlayer')}</span><span><kbd>CTRL+LMB</kbd>{t('hintYaw')}</span><span><kbd>SHIFT+LMB</kbd>{t('hintPitch')}</span><span><kbd>DBL</kbd>{t('hintCrouch')}</span><span><kbd>CTRL+Z</kbd>{t('hintUndo')}</span><span><kbd>CTRL+Y</kbd>{t('hintRedo')}</span><span><kbd>WASD</kbd>{t('hintMove')}</span><span><kbd>MMB</kbd>{t('hintRotate')}</span><span><kbd>SCROLL</kbd>{t('hintZoom')}</span></div></>}</div>
          <div className="aspect-frame" aria-hidden="true"><i /></div>
           {activePanel === 'demo' && demoSnapshot && <><DemoRoster side="T" players={demoTeams.T} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} language={language} /><DemoRoster side="CT" players={demoTeams.CT} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} language={language} /></>}
          {selectedPoint && selectedPointScreen && <div className="point-actions" style={{ left: selectedPointScreen.x, top: selectedPointScreen.y }}><span>{activePanel === 'collab' ? t('collabPlayer') : t('tacticalPoint')}</span><div className="point-choice"><b>{t('team')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div>{activePanel === 'collab' ? null : <div className="point-choice"><b>{t('type')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'X' })}>X</button></div>}<button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); setSelectedPointScreen(null); }}>{t('delete')}</button></div>}
          {activePanel === 'demo' && selectedDemoGrenade && selectedDemoGrenadeScreen && <div className="demo-grenade-actions" style={{ left: selectedDemoGrenadeScreen.x, top: selectedDemoGrenadeScreen.y }}><div><strong>{selectedDemoGrenade.kind.toUpperCase()}</strong><span>{selectedDemoGrenade.throwEvent.user_name || t('unknown')} · T{selectedDemoGrenade.throwTick}</span></div><button type="button" onClick={saveDemoGrenade}>{t('saveUtility')}</button><button type="button" className="close" aria-label={t('cancel')} onClick={() => { setSelectedDemoGrenade(null); setSelectedDemoGrenadeScreen(null); }}>×</button></div>}
        <div className="board-tools"><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}><i /> TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)} className={showModel ? 'selected' : ''}><i /> {modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) setShowModel(false); else { setShowModel(true); setModelViewMode(option.value); } setModeMenuOpen(false); }} /> <span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}><i /> AREA EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET VIEW</button></div>
          {activePanel === 'utility' && <aside className="utility-notes-panel"><div className="utility-notes-heading"><div><span>UTILITY NOTES</span><h2>{t('utilityNotes')}</h2></div><button type="button" onClick={() => { setUtilityDraft({ getpos: '', name: '', summary: '' }); setUtilityError(''); setUtilityModalOpen(true); }}>{t('addUtilityNote')}</button></div><p>{t('utilityIntro')}</p><div className="utility-notes-meta"><label className="map-select"><span>{t('map').toUpperCase()}</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><span>{t('utilityCount', { count: currentUtilityNotes.length })}</span></div><div className="utility-model-options"><label className="model-opacity"><span>{t('model').toUpperCase()}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="utility-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div></div>{currentUtilityNotes.length === 0 && <div className="utility-empty">{t('utilityEmpty')}</div>}<small>{t('localOnly')}</small></aside>}
          {activePanel === 'utility' && <aside className="utility-location-panel"><header><strong>{t('utilityLocations')}</strong><span>{currentUtilityGroups.length}</span></header>{currentUtilityGroups.length === 0 ? <div className="utility-location-empty">{t('utilityEmpty')}</div> : <div className="utility-location-groups">{currentUtilityGroups.map(({ location, categories }) => <section key={location}><div className="utility-location-heading"><strong>{location}</strong><span>{categories.reduce((sum, [, entries]) => sum + entries.length, 0)}</span></div>{categories.map(([kind, entries]) => <div className="utility-category" key={kind}><span>{kind === 'smoke' ? 'SMOKE' : kind === 'flash' ? 'FLASH' : kind === 'fire' ? 'FIRE' : kind === 'he' ? 'HE' : kind === 'decoy' ? 'DECOY' : 'CUSTOM'}</span>{entries.map((note) => <button type="button" key={note.id} className={note.replay ? 'replayable' : ''} onClick={() => { setUtilityHover({ key: note.positionKey, entries: note.positionEntries, x: 330, y: Math.max(150, window.innerHeight / 2 - 36) }); setSelectedUtilityNote(note); setUtilityCopied(false); }}><b>{note.name}</b><small>{note.thrower || t('customUtility')}</small></button>)}</div>)}</section>)}</div>}</aside>}
           {activePanel === 'utility' && utilityHover && <div className="utility-hover-card" style={{ left: utilityHover.x, top: utilityHover.y }} onPointerEnter={() => { utilityHoverInsideRef.current = true; window.clearTimeout(utilityHoverTimerRef.current); }} onPointerLeave={() => { utilityHoverInsideRef.current = false; utilityHoverTimerRef.current = window.setTimeout(() => { setUtilityHover(null); setSelectedUtilityNote(null); setUtilityEditDraft(null); }, 180); }}><header><strong>{selectedUtilityNote ? t('utilityDetails') : 'LOCATION'}</strong><span>{selectedUtilityNote ? <button type="button" onClick={() => { setSelectedUtilityNote(null); setUtilityEditDraft(null); }}>←</button> : utilityHover.entries.length}</span></header>{selectedUtilityNote ? <div className="utility-detail">{utilityEditDraft ? <form className="utility-edit-form" onSubmit={saveUtilityEdit}><label><span>{t('utilityTitle')}</span><input required value={utilityEditDraft.name} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('utilityDescription')}</span><textarea required value={utilityEditDraft.summary} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label><div><button type="button" onClick={() => setUtilityEditDraft(null)}>{t('cancel')}</button><button type="submit">{t('saveUtilityEdit')}</button></div></form> : <><strong>{selectedUtilityNote.name}</strong><p>{selectedUtilityNote.summary}</p></>}<dl><div><dt>{t('map')}</dt><dd>{selectedUtilityNote.mapName}</dd></div>{selectedUtilityNote.startPlace && <div><dt>{t('startPlace')}</dt><dd>{selectedUtilityNote.startPlace}</dd></div>}{selectedUtilityNote.throwPlace && <div><dt>{t('throwPlace')}</dt><dd>{selectedUtilityNote.throwPlace}</dd></div>}<div><dt>{t('position')}</dt><dd>{selectedUtilityNote.position.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('angles')}</dt><dd>{selectedUtilityNote.angles.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('exportedBy')}</dt><dd>{selectedUtilityNote.thrower || t('customUtility')}</dd></div>{selectedUtilityNote.demoSource && <div><dt>{t('sourceDemo')}</dt><dd>{selectedUtilityNote.demoSource.fileName} · R{selectedUtilityNote.demoSource.round || '-'} · T{selectedUtilityNote.demoSource.tick}</dd></div>}<div><dt>{t('exportedAt')}</dt><dd>{new Date(selectedUtilityNote.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</dd></div></dl><div className="utility-detail-actions"><button type="button" onClick={() => setUtilityEditDraft({ name: selectedUtilityNote.name, summary: selectedUtilityNote.summary || '' })}>{t('editUtility')}</button><button type="button" onClick={() => copyUtilityCommand(selectedUtilityNote)}>{utilityCopied ? t('copied') : t('getposCommand')}</button><button type="button" className="utility-delete" onClick={() => deleteUtilityNote(selectedUtilityNote)}>{t('delete')}</button>{selectedUtilityNote.replay && <><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote)}>{t('replayUtility')}</button><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote, true)}>{t('replayUtilityFirstPerson')}</button></>}</div></div> : <div className="utility-hover-list">{utilityHover.entries.map((note) => <button type="button" key={note.id} className={`utility-list-entry${note.replay ? ' replayable' : ''}`} onClick={() => { setSelectedUtilityNote(note); setUtilityEditDraft(null); setUtilityCopied(false); }}><strong>{note.name}</strong><span>{t('angles')}: {(note.angles || [0, 0, 0]).map((value) => Number(value).toFixed(2)).join(' / ')}</span><p>{note.summary}</p></button>)}</div>}</div>}
          {activePanel === 'utility' && utilityReplay && <div className="utility-replay-bar"><strong>{utilityReplay.note.name}</strong><span>{(utilityReplay.tick / utilityReplay.note.replay.tickRate).toFixed(1)}s / {(utilityReplay.note.replay.endTick / utilityReplay.note.replay.tickRate).toFixed(1)}s</span><button type="button" onClick={() => setUtilityReplay((current) => ({ ...current, tick: current.playing ? current.tick : current.tick >= current.note.replay.endTick ? 0 : current.tick, playing: !current.playing }))}>{utilityReplay.playing ? t('pause') : t('play')}</button><button type="button" onClick={() => setUtilityReplay(null)}>×</button></div>}
         {utilityModalOpen && <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setUtilityModalOpen(false); }}><form className="utility-modal" onSubmit={addUtilityNote}><header><div><span>GETPOS</span><h2>{t('addUtilityNote')}</h2></div><button type="button" onClick={() => setUtilityModalOpen(false)}>×</button></header><label><span>{t('getposOutput')}</span><textarea required value={utilityDraft.getpos} placeholder={t('getposPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, getpos: event.target.value }))} /></label><label><span>{t('utilityName')}</span><input required value={utilityDraft.name} placeholder={t('utilityNamePlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('throwSummary')}</span><textarea required value={utilityDraft.summary} placeholder={t('throwSummaryPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>{utilityError && <div className="utility-error">{utilityError}</div>}<footer><button type="button" onClick={() => setUtilityModalOpen(false)}>{t('cancel')}</button><button type="submit">{t('add')}</button></footer></form></div>}
          <div className={`demo-panel ${activePanel === 'demo' ? '' : 'panel-hidden'}${demoData ? ' has-demo' : ''}`}>
           <div className="demo-toolbar"><div className="demo-source-controls"><label className="demo-upload"><span>{t('multiDemo')}</span><input type="file" accept=".dem" multiple onChange={loadDemo} /><b>{t('chooseDemo')}</b></label>{demoStatus && !demoData ? <span className="demo-status">{demoStatus}</span> : <div className="demo-cache-picker"><button type="button" onClick={() => setDemoCacheOpen((open) => !open)}>{t('parsedDemos')} · {cachedDemos.length}</button>{demoCacheOpen && <div className="demo-cache-list"><header><strong>{t('parsedDemos')}</strong><button type="button" onClick={() => setDemoCacheOpen(false)}>×</button></header>{cachedDemos.length === 0 ? <div className="demo-cache-empty">{t('noCachedDemos')}</div> : cachedDemos.map((entry) => <article key={entry.id}><button type="button" className="demo-cache-open" onClick={() => openCachedDemo(entry.id)}><strong>{entry.fileName}</strong><span>{entry.map} · {entry.rounds} {t('round')}</span><small>{formatBytes((entry.dataBytes || 0) + (entry.analysisBytes || 0))} / {formatBytes(entry.sourceBytes)} · {new Date(entry.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></button><button type="button" className="demo-cache-delete" aria-label={t('deleteCachedDemo')} title={t('deleteCachedDemo')} onClick={() => removeCachedDemo(entry.id)}>×</button></article>)}</div>}</div>}{demoData && <span className="demo-name">{demoData.demo.map} / {demoData.demo.fileName}</span>}</div><div className="demo-playback-controls">{demoData && <div className={`demo-round-picker${demoRoundMenuOpen ? ' open' : ''}`}><button type="button" onClick={() => setDemoRoundMenuOpen((open) => !open)}>{demoRound ? `${t('round')} ${demoRound.round} · ${demoRoundEconomies.get(demoRound.round)?.T.label}/${demoRoundEconomies.get(demoRound.round)?.CT.label}` : t('selectRound')}</button>{demoRoundMenuOpen && <div className="demo-round-list">{demoData.rounds.map((round) => { const economy = demoRoundEconomies.get(round.round); return <button type="button" key={round.round} className={demoRound?.round === round.round ? 'active' : ''} style={{ '--economy-split': `${economy?.split ?? 50}%` }} onClick={() => { setDemoRound(round); setDemoRoundMenuOpen(false); }}><span className="economy-t">T {economy?.T.label}</span><strong>R{round.round}</strong><span className="economy-ct">CT {economy?.CT.label}</span><i /></button>; })}</div>}</div>}{demoData && demoRound && <div className="demo-scrub"><span className="demo-time">{((demoTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span><div className="timeline-track"><input className="demo-timeline" disabled={demoRoundLoading} style={{ '--timeline-progress': `${demoRound.endTick > demoRound.startTick ? ((demoTick - demoRound.startTick) / (demoRound.endTick - demoRound.startTick)) * 100 : 0}%` }} type="range" min={demoRound.startTick} max={demoRound.endTick} step="1" value={demoTick} onPointerUp={(event) => event.currentTarget.blur()} onChange={(event) => { setDemoPlaying(false); setDemoTick(Number(event.target.value)); }} />{timelineEvents.map((event, index) => <button type="button" className={`timeline-event event-${event.event_name}`} title={event.title} aria-label={event.title} style={{ left: `${((event.tick - demoRound.startTick) / Math.max(1, demoRound.endTick - demoRound.startTick)) * 100}%` }} key={`${event.event_name}-${event.tick}-${index}`} onClick={() => { setDemoPlaying(false); setDemoTick(event.tick); }}>{event.label}</button>)}</div><span className="demo-duration">/ {((demoRound.endTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span></div>}{demoRound && <button type="button" className="demo-play" disabled={demoRoundLoading} onClick={() => setDemoPlaying((playing) => !playing)}>{demoRoundLoading ? t('loading') : demoPlaying ? t('pause') : t('play')}</button>}<button type="button" className="demo-save-frame" onClick={() => openSaveArchiveModal(true)}>{t('saveFrame')}</button></div></div>
              <DemoParseSettings value={demoSampleRate} onChange={setDemoSampleRate} language={language} />
             {demoStatus && !demoData && <div className="demo-loading" role="progressbar" aria-label="Demo parsing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(demoParseProgress)}><i style={{ width: `${demoParseProgress}%` }} /><span>{Math.floor(demoParseProgress)}%</span></div>}
            <div className="demo-controls-row">{activePanel === 'demo' && demoData && <div className="demo-view-options"><span>{t('view')}</span><button type="button" className={showDemoNames ? 'selected' : ''} onClick={() => setShowDemoNames((value) => !value)}>{t('showNames')}</button>{[['manual','cameraManual'],['follow','cameraFollow'],['fixed','cameraFixed'],['chase','cameraChase']].map(([mode,key]) => <button type="button" key={mode} className={demoCameraMode === mode ? 'selected' : ''} onClick={() => setDemoCameraMode(mode)}>{t(key)}</button>)}</div>}<div className="demo-options"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}>GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}>TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><label className="model-opacity"><span>MODEL</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="demo-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}>EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET</button></div></div>
          </div>
          {activePanel === 'analysis' && <aside className="analysis-panel"><div className="collab-heading"><div><span>DEMO ANALYSIS</span><h2>{t('analysis')}</h2></div><button type="button" disabled={!analysisSelectedPlayers.length || !analysisRows.length} onClick={() => setAnalysisPlaying((playing) => !playing)}>{analysisPlaying ? t('pause') : t('play')}</button></div><p className="collab-note">{t('analysisHint')}</p>{analysisStatus && <div className="analysis-status">{analysisStatus}</div>}<div className="analysis-select"><span>{t('players').toUpperCase()}</span><div className="analysis-player-list">{analysisPlayers.map((player) => <button type="button" key={player} className={analysisSelectedPlayers.includes(player) ? 'selected' : ''} aria-pressed={analysisSelectedPlayers.includes(player)} onClick={() => { setAnalysisSelectedPlayers((selected) => selected.includes(player) ? selected.filter((name) => name !== player) : [...selected, player]); setAnalysisTime(0); setAnalysisPlaying(false); }}>{player}</button>)}</div></div>{analysisSelectedPlayers.length > 0 && <label className="analysis-side"><span>{t('side').toUpperCase()}</span><select value={analysisSide} onChange={(event) => { setAnalysisSide(event.target.value); setAnalysisTime(0); setAnalysisPlaying(false); }}><option value="ALL">{t('allRounds')}</option><option value="T">{t('tRounds')}</option><option value="CT">{t('ctRounds')}</option></select></label>}{analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}</aside>}
          {activePanel === 'collab' && <aside className="collab-panel"><div className="collab-heading"><div><span>COLLABORATION</span><h2>{t('collab')}</h2></div><div className="collab-actions"><button type="button" onClick={() => openSaveArchiveModal()}>{t('saveFrame')}</button>{roomCode ? <button type="button" onClick={leaveRoom}>{t('leaveRoom')}</button> : <button type="button" onClick={() => { const code = window.prompt(t('roomPrompt'), roomJoinCode); if (code != null) { setRoomJoinCode(code); joinRoom(code); } }}>{t('joinRoom')}</button>}<button type="button" disabled={Boolean(roomCode)} onClick={openRoom}>{t('openRoom')}</button></div></div><p className="collab-note">{t('currentMap')}: {mapName} · {t('name')}: {clientName.current}<br />{t('collabHint')}</p>{roomStatus && <div className="analysis-status">{roomStatus}</div>}{roomCode && <div className="room-open"><strong>{t('room')} {roomCode}</strong><span>{roomOwner ? t('owner') : t('member')}</span></div>}<div className="archive-list">{archives.filter((archive) => archive.mapName === mapName).length === 0 ? <div className="archive-empty">{t('noArchives')}</div> : archives.filter((archive) => archive.mapName === mapName).map((archive) => <div className="archive-item" key={archive.id}><button type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t('guestNoArchive') : t('restoreArchive')} onClick={() => restoreWorkspaceArchive(archive)}><strong>{archive.name || archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span><small>{archive.frames && archive.frames.length ? `${archive.frames.length} ${t('frames')}${archive.demo ? ` · ${t('manualEdit')}` : ''}` : archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t('manualEdit')}</small></button><button type="button" className="archive-delete" aria-label={t('deleteArchive')} title={t('deleteArchive')} onClick={() => deleteWorkspaceArchive(archive.id)}>×</button></div>)}</div></aside>}
           {activePanel === 'collab' && hasActiveFrameContext && <aside className="collab-objects"><div className="collab-objects-tabs"><button type="button" className={collabObjectTab === 'players' ? 'active' : ''} onClick={() => setCollabObjectTab('players')}>{t('collabPlayers')}</button><button type="button" className={collabObjectTab === 'utility' ? 'active' : ''} onClick={() => setCollabObjectTab('utility')}>{t('addUtility')}</button></div>{collabObjectTab === 'players' ? <div className="collab-players">{activeCollabPlayers().length === 0 ? <div className="archive-empty">{t('noCollabPlayers')}</div> : <div className="collab-player-list">{activeCollabPlayers().map((player) => <div className="collab-player-item" key={player.name}><span className="collab-player-name">{player.name}</span><button type="button" className="collab-player-rename" onClick={() => openRenameModal(player.id, player.name)}>{t('rename')}</button><span>{player.team || 'T'}</span></div>)}</div>}</div> : <div className="collab-utility"><label className="collab-utility-search"><span>{t('addUtility')}</span><input type="text" value={collabUtilitySearch} placeholder={t('searchUtility')} onChange={(event) => setCollabUtilitySearch(event.target.value)} /><select value={''} onChange={(event) => { const id = event.target.value; if (!id) return; const note = currentUtilityNotes.find((candidate) => candidate.id === id); if (note) boardRef.current?.addCollabUtility?.(note); setCollabUtilitySearch(''); event.target.value = ''; }}>{[...currentUtilityNotes].sort((left, right) => left.grenadeType?.localeCompare?.(right.grenadeType || 'custom') || 0).filter((note) => `${note.name} ${note.summary || ''} ${note.thrower || ''}`.toLowerCase().includes(collabUtilitySearch.trim().toLowerCase())).map((note) => <option key={note.id} value={note.id}>{note.name} · {note.grenadeType || 'custom'}{note.thrower ? ` · ${note.thrower}` : ''}</option>)}</select></label></div>}</aside>}
           {activePanel === 'collab' && hasActiveFrameContext && collabObjectTab === 'utility' && <CollabUtilityPortal><div className="collab-utility-manager"><header><strong>{t('importedUtilities')}</strong><button type="button" onClick={() => { setCollabUtilityPickerOpen(true); setCollabUtilitySelected(''); }}>{t('addUtility')}</button></header>{collabUtilityPickerOpen ? <div className="collab-utility-picker"><label className="collab-utility-search"><span>{t('selectUtility')}</span><input type="text" value={collabUtilitySearch} placeholder={t('searchUtility')} onChange={(event) => setCollabUtilitySearch(event.target.value)} /><select value={collabUtilitySelected} onChange={(event) => setCollabUtilitySelected(event.target.value)}><option value="">{t('selectUtility')}</option>{[...currentUtilityNotes].sort((left, right) => left.grenadeType?.localeCompare?.(right.grenadeType || 'custom') || 0).filter((note) => `${note.name} ${note.summary || ''} ${note.thrower || ''}`.toLowerCase().includes(collabUtilitySearch.trim().toLowerCase())).map((note) => <option key={note.id} value={note.id}>{note.name} · {note.grenadeType || 'custom'}{note.thrower ? ` · ${note.thrower}` : ''}</option>)}</select></label><div className="collab-utility-picker-actions"><button type="button" onClick={() => { setCollabUtilityPickerOpen(false); setCollabUtilitySelected(''); setCollabUtilitySearch(''); }}>{t('cancel')}</button><button type="button" disabled={!collabUtilitySelected} onClick={confirmCollabUtilityImport}>{t('confirmAdd')}</button></div></div> : activeImportedUtilities().length === 0 ? <div className="archive-empty">{t('noImportedUtilities')}</div> : <div className="collab-imported-list">{activeImportedUtilities().map((item) => <div className="collab-imported-item" key={item.id}><div><strong>{item.noteName || t('unknown')}</strong><span>{item.kind || 'custom'}</span></div><button type="button" onClick={() => deleteImportedUtility(item.id)}>{t('delete')}</button></div>)}</div>}</div></CollabUtilityPortal>}
             {activePanel === 'utility' && <UtilityNotesActionsPortal><div className="utility-io-actions"><button type="button" onClick={() => { setUtilityImportNotice(''); utilityImportInputRef.current?.click(); }}>{t('importNotes')}</button><button type="button" onClick={exportUtilityNotes}>{t('exportNotes')}</button><input ref={utilityImportInputRef} type="file" accept="application/json,.json" onChange={importUtilityNotes} />{utilityImportNotice && <span>{utilityImportNotice}</span>}</div></UtilityNotesActionsPortal>}
             {activePanel === 'collab' && roomCode && <RoomPresencePortal><div className="room-presence"><header><span>{t('currentUsers')}</span><b>{roomUsers.length}</b></header><div className="room-user-list">{roomUsers.map((user) => <div key={user.clientId}><i className={user.owner ? 'owner' : ''} /><strong>{user.name}</strong><span>{user.current ? t('you') : user.owner ? t('owner') : t('member')}</span></div>)}</div>{roomActivity.length > 0 && <div className="room-activity" aria-live="polite">{roomActivity.map((event) => <span key={event.id}>{event.text}</span>)}</div>}</div></RoomPresencePortal>}
            <CameraHintsPortal><span><kbd>1-0</kbd>{t('hintCameraRestore')}</span><span><kbd>CTRL+1-0</kbd>{t('hintCameraSave')}</span></CameraHintsPortal>
            {activePanel === 'collab' && hasActiveFrameContext && <div className="collab-frame-strip"><div className="collab-frame-timeline">{frames.map((frame, index) => <button type="button" key={frame.id} aria-label={`${t('frame')} ${index + 1}`} className={`collab-frame-dot${frame.id === activeFrameId ? ' active' : ''}`} onClick={() => switchFrame(frame.id)}><i /><small>{index + 1}</small></button>)}</div><div className="collab-frame-actions"><button type="button" title="Ctrl+Z" onClick={() => boardRef.current?.undoCollab?.()}>{t('hintUndo')}</button><button type="button" title="Ctrl+Y" onClick={() => boardRef.current?.redoCollab?.()}>{t('hintRedo')}</button><button type="button" onClick={insertFrame}>{t('insertFrame')}</button><button type="button" onClick={duplicateFrame}>{t('duplicateFrame')}</button><button type="button" onClick={deleteFrame} disabled={frames.length <= 1}>{t('deleteFrame')}</button></div></div>}
        {activePanel === 'analysis' && demoData && <AnalysisOptionsPortal><div className="analysis-view-options"><span>{t('heatmap')}</span><button type="button" className={`heat-killer${demoViewFlags.killerHeat ? ' selected' : ''}`} onClick={() => setDemoViewFlags((flags) => ({ ...flags, killerHeat: !flags.killerHeat }))}>{t('killerPosition')}</button><button type="button" className={`heat-victim${demoViewFlags.victimHeat ? ' selected' : ''}`} onClick={() => setDemoViewFlags((flags) => ({ ...flags, victimHeat: !flags.victimHeat }))}>{t('victimPosition')}</button><button type="button" className={`heat-target${demoViewFlags.targetHeat ? ' selected' : ''}`} onClick={() => setDemoViewFlags((flags) => ({ ...flags, targetHeat: !flags.targetHeat }))}>{t('targetPosition')}</button><button type="button" className={`heat-opponent${demoViewFlags.opponentHeat ? ' selected' : ''}`} onClick={() => setDemoViewFlags((flags) => ({ ...flags, opponentHeat: !flags.opponentHeat }))}>{t('opponentPosition')}</button></div></AnalysisOptionsPortal>}
        <div className="workspace-bottom-bar">
          {activePanel === 'analysis' && analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-bottom-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}
        </div>
        <ModelControlsPortal selector={modelControlsTarget}><div className="model-visual-controls"><ModelLoadIndicator state={modelLoadState} language={language} /><label className="model-opacity"><span>{t('model').toUpperCase()}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="workspace-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div></div></ModelControlsPortal>
        {hasLeftSidebar && <button type="button" className="sidebar-toggle sidebar-toggle-left" aria-label={leftSidebarOpen ? (language === 'zh' ? '收起左栏' : 'Collapse left sidebar') : (language === 'zh' ? '展开左栏' : 'Expand left sidebar')} onClick={() => setLeftSidebarOpen((open) => !open)}>{leftSidebarOpen ? '‹' : '›'}</button>}
        {hasRightSidebar && <button type="button" className="sidebar-toggle sidebar-toggle-right" aria-label={rightSidebarOpen ? (language === 'zh' ? '收起右栏' : 'Collapse right sidebar') : (language === 'zh' ? '展开右栏' : 'Expand right sidebar')} onClick={() => setRightSidebarOpen((open) => !open)}>{rightSidebarOpen ? '›' : '‹'}</button>}
     </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
