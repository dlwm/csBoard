import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import fallbackNavData from './data/de_dust2.json';
import { createNavMesh } from './three/navMesh.js';
import { createGhostMaterial } from './three/materials.js';
import { createTacticalPoint, updateTacticalPoint } from './three/tacticalPoint.js';
import { createFireNavEffect, createGrenadeEffect, disposeGrenadeEffect, grenadeTypeFromPointer } from './three/grenadeEffects.js';
import { deleteCachedDemo, demoCacheId, getCachedDemo, listCachedDemos, putCachedDemo } from './demoCache.js';
import './styles.css';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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

const messages = {
  zh: {
    rounds: '回合浏览', analysis: '数据分析', collab: '协作面板', utilityNotes: '道具速记', loaded: '参考数据已加载', recentKills: '最近击杀', expand: '展开', collapse: '收起', cameraPositions: '摄像机位置', view: '视图', showNames: '显示名称', selectRound: '请选择回合', round: '回合', multiDemo: 'Demo 文件', chooseDemo: '选择文件', multiPartHint: '支持多选分片', noFileChosen: '尚未选择文件', play: '播放', pause: '暂停', loading: '加载中', allRounds: '全部回合', tRounds: 'T 回合', ctRounds: 'CT 回合', analysisHint: '选择选手后，所有回合会从冻结结束同时开始叠加播放。', heatmap: '热力图', killerPosition: '击杀时所在', victimPosition: '被击杀时所在', targetPosition: '击杀目标所在', opponentPosition: '被击杀时对方所在', saveFrame: '保存当前帧', leaveRoom: '离开房间', joinRoom: '加入房间', openRoom: '开放房间', roomPrompt: '输入 6 位房间号', currentMap: '当前地图', name: '名称', collabHint: '保存地图、镜头、编辑点位和当前 Demo 帧。Demo 文件本身不会写入浏览器存储。', owner: '房主', member: '成员', noArchives: '暂无本地存档', guestNoArchive: '房间成员不能切换存档', restoreArchive: '恢复存档', deleteArchive: '删除存档', manualEdit: '手动地图编辑', room: '房间', roomOpened: '已公开', roomDestroyed: '房间已销毁', roomLeft: '已离开房间', roomExited: '已从房间退出', joiningRoom: '正在加入房间', joinedRoom: '已加入房间', connected: '已连接', connecting: '连接中', disconnected: '连接断开', analysisReady: '全场移动数据已就绪', analysisLoading: '正在读取全场移动数据…', parseFailed: '解析失败', combiningParts: '正在组合 {count} 个 Demo 分片…', readingDemo: '正在读取 Demo 文件…', smoke: '烟', fire: '火', flash: '闪', grenade: '雷', decoy: '诱', c4Planted: 'C4 安装', c4Exploded: 'C4 爆炸', roundEnd: '回合结束', world: '世界', unknown: '未知', language: 'EN', tacticalPoint: '战术点', team: '阵营', type: '类型', delete: '删除', map: '地图', reset: '重置', players: '选手', side: '阵营', model: '模型', c4Paused: '已拆除', noGrenades: '-', addUtilityNote: '添加速记', utilityIntro: '在 CS2 控制台输入 getpos，将输出粘贴到这里。相同位置可保存多个不同角度。', utilityEmpty: '当前地图暂无道具速记', getposOutput: 'getpos 输出', utilityName: '道具名称', throwSummary: '投掷简述', getposPlaceholder: 'setpos 123 456 78;setang -12 90 0', utilityNamePlaceholder: '例如：A 大过点烟', throwSummaryPlaceholder: '例如：贴墙站立，静步投掷', cancel: '取消', add: '添加', invalidGetpos: '无法识别 getpos，请包含 setpos 与 setang 数据', position: '位置', angles: '角度', localOnly: '数据仅保存在当前浏览器', utilityCount: '{count} 条速记',
    utilityIntro: '手动添加仍只需粘贴 getpos；从 Demo 保存的复杂投掷会与同一起点的手动记录归在一起。',
    saveUtility: '保存道具', clickToReplay: '点击重播投掷', utilityStorageFailed: '保存失败，浏览器本地空间不足',
    parsedDemos: '已解析 Demo', noCachedDemos: '暂无已解析 Demo', openCachedDemo: '打开', deleteCachedDemo: '删除缓存', cacheFailed: 'Demo 缓存失败', cacheReady: '已从缓存打开', analysisNeedsSource: '该缓存尚无分析数据，请重新选择原 Demo 后打开分析面板',
    utilityDetails: '道具详情', replayUtility: '播放', replayUtilityFirstPerson: '第一人称播放', getposCommand: 'GETPOS', copied: '已复制', exportedBy: '来源选手', exportedAt: '保存时间', sourceDemo: '来源 Demo', customUtility: '手动添加',
    utilityLocations: '点位列表', startPlace: '起始区域', throwPlace: '出手区域',
    cameraManual: '手动镜头', cameraFollow: '导播', cameraFixed: '固定镜头', cameraChase: '追踪镜头',
    directorCamera: '导播',
    editUtility: '编辑', saveUtilityEdit: '保存', utilityTitle: '标题', utilityDescription: '描述',
  },
  en: {
    rounds: 'Round Replay', analysis: 'Analysis', collab: 'Collaboration', utilityNotes: 'Utility Notes', loaded: 'Reference Data Loaded', recentKills: 'Recent Kills', expand: 'Expand', collapse: 'Collapse', cameraPositions: 'Camera Positions', view: 'View', showNames: 'Show Names', selectRound: 'Select a round', round: 'Round', multiDemo: 'Demo Files', chooseDemo: 'Choose Files', multiPartHint: 'Multi-part selection supported', noFileChosen: 'No files selected', play: 'Play', pause: 'Pause', loading: 'Load', allRounds: 'All Rounds', tRounds: 'T Rounds', ctRounds: 'CT Rounds', analysisHint: 'Selected players are overlaid from freeze end across all rounds.', heatmap: 'Heatmap', killerPosition: 'Killer Position', victimPosition: 'Victim Position', targetPosition: 'Target Position', opponentPosition: 'Opponent Position', saveFrame: 'Save Frame', leaveRoom: 'Leave Room', joinRoom: 'Join Room', openRoom: 'Open Room', roomPrompt: 'Enter 6-digit room code', currentMap: 'Current map', name: 'Name', collabHint: 'Saves the map, camera presets, tactical edits and current Demo frame. The Demo file is not stored.', owner: 'Owner', member: 'Member', noArchives: 'No local archives', guestNoArchive: 'Room members cannot switch archives', restoreArchive: 'Restore archive', deleteArchive: 'Delete archive', manualEdit: 'Manual map edit', room: 'Room', roomOpened: 'opened', roomDestroyed: 'Room destroyed', roomLeft: 'Left room', roomExited: 'Disconnected from room', joiningRoom: 'Joining room', joinedRoom: 'Joined room', connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', analysisReady: 'Full-match movement data ready', analysisLoading: 'Reading full-match movement data...', parseFailed: 'Parse failed', combiningParts: 'Combining {count} Demo parts...', readingDemo: 'Reading Demo file...', smoke: 'SMK', fire: 'FIRE', flash: 'FL', grenade: 'HE', decoy: 'DEC', c4Planted: 'C4 planted', c4Exploded: 'C4 exploded', roundEnd: 'Round ended', world: 'WORLD', unknown: 'UNKNOWN', language: '中文', tacticalPoint: 'Tactical Point', team: 'Team', type: 'Type', delete: 'Delete', map: 'Map', reset: 'Reset', players: 'Players', side: 'Side', model: 'Model', c4Paused: 'DEFUSED', noGrenades: '-', addUtilityNote: 'Add Note', utilityIntro: 'Run getpos in the CS2 console and paste its output here. One position can store multiple angles.', utilityEmpty: 'No utility notes for this map', getposOutput: 'getpos output', utilityName: 'Utility name', throwSummary: 'Throw summary', getposPlaceholder: 'setpos 123 456 78;setang -12 90 0', utilityNamePlaceholder: 'Example: A Long cross smoke', throwSummaryPlaceholder: 'Example: Hug the wall, standing throw', cancel: 'Cancel', add: 'Add', invalidGetpos: 'Could not parse getpos. Include setpos and setang values.', position: 'Position', angles: 'Angles', localOnly: 'Stored only in this browser', utilityCount: '{count} notes',
    utilityIntro: 'Manual entry still accepts getpos only. Complex Demo throws are grouped with manual notes at the same start position.',
    saveUtility: 'Save Utility', clickToReplay: 'Click to replay throw', utilityStorageFailed: 'Could not save: browser storage is full',
    parsedDemos: 'Parsed Demos', noCachedDemos: 'No parsed Demos', openCachedDemo: 'Open', deleteCachedDemo: 'Delete cache', cacheFailed: 'Demo cache failed', cacheReady: 'Opened from cache', analysisNeedsSource: 'This cache has no analysis data. Select the source Demo and open Analysis.',
    utilityDetails: 'Utility Details', replayUtility: 'Play', replayUtilityFirstPerson: 'First-person', getposCommand: 'GETPOS', copied: 'Copied', exportedBy: 'Player', exportedAt: 'Saved', sourceDemo: 'Source Demo', customUtility: 'Manual entry',
    utilityLocations: 'Locations', startPlace: 'Start place', throwPlace: 'Throw place',
    cameraManual: 'Manual', cameraFollow: 'Director', cameraFixed: 'Fixed camera', cameraChase: 'Chase camera',
    directorCamera: 'Director',
    editUtility: 'Edit', saveUtilityEdit: 'Save', utilityTitle: 'Title', utilityDescription: 'Description',
  },
};

const UTILITY_NOTES_VERSION = 3;
const DEMO_CACHE_SCHEMA_VERSION = 13;

const translate = (language, key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), messages[language][key] || key);
const formatBytes = (bytes = 0) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
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

function RosterIcon({ type }) {
  const paths = {
    armor: <><path d="M4 4l4-2 4 2v4c0 3-1.7 5.2-4 6-2.3-.8-4-3-4-6V4z" /><path d="M6 7h4M8 4v8" /></>,
    helmet: <><path d="M3 8a5 5 0 0110 0v2H8l-2 3H3V8z" /><path d="M8 10v3h4" /></>,
    armorHelmet: <><path d="M2 7l4-2 4 2v3c0 2.4-1.6 4.2-4 5-2.4-.8-4-2.6-4-5V7z" /><path d="M7 5a3.5 3.5 0 017 0v2h-4l-2 2M4 9h4M6 7v6" /></>,
    defuser: <><rect x="3" y="5" width="10" height="8" rx="1" /><path d="M6 5V3h4v2M6 8h4M8 8v3" /></>,
    c4: <><rect x="3" y="4" width="10" height="9" rx="1" /><path d="M6 4V2m4 2V2M5 7h6M5 10h2m2 0h2" /></>,
  };
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

const normalizedWeaponIcon = (weapon = '') => String(weapon).toLowerCase().replace(/^weapon_/, '').replace(/^planted_/, '').replace('inferno', 'molotov');

function KillIcon({ type, weapon }) {
  const weaponKey = normalizedWeaponIcon(weapon);
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
  if (type === 'weapon' && weaponIconPaths[weaponKey]) return <svg className={`kill-icon kill-icon-weapon kill-icon-${weaponKey}`} viewBox="0 0 32 16" aria-hidden="true" fill="currentColor"><path d={weaponIconPaths[weaponKey]} /></svg>;
  return <svg className={`kill-icon kill-icon-${kind}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{paths[kind] || paths.rifle}</svg>;
}

function DemoKillFeed({ kills, round, language, collapsed, onToggle }) {
  const t = (key) => translate(language, key);
  return <div className={`demo-kills hud-left${collapsed ? ' collapsed' : ''}`}><div className="demo-kills-heading"><span>{t('recentKills')}</span><button type="button" onClick={onToggle}>{collapsed ? t('expand') : t('collapse')}</button></div>{kills.map((kill) => <div className="demo-kill" key={`${kill.tick}-${kill.user_steamid}`}>
    <small>{((kill.tick - round.startTick) / 64).toFixed(1)}s</small>
    <b>{kill.attacker_name || t('world')}{kill.assister_name && <span className={kill.assistedflash ? 'flash-assist' : ''}> + {kill.assister_name}{kill.assistedflash && <KillIcon type="blind" />}</span>}</b>
    <i title={String(kill.weapon || 'kill').replace(/^weapon_/, '')}><KillIcon type="weapon" weapon={kill.weapon} />{kill.headshot && <KillIcon type="headshot" />}{kill.thrusmoke && <KillIcon type="smoke" />}{kill.attackerblind && <KillIcon type="blind" />}{Number(kill.penetrated) > 0 && <KillIcon type="wallbang" />}{kill.noscope && <KillIcon type="noscope" />}{kill.attackerinair && <KillIcon type="airborne" />}</i>
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
    const intervals = reloadEvents.map((event) => {
      const completion = ammoJumps.find((record) => record.tick >= event.tick && record.tick <= event.tick + tickRate * 5);
      const weapon = completion?.player.activeWeapon || event.weapon || player.activeWeapon;
      return { startTick: event.tick, endTick: completion?.tick ?? event.tick + Math.round(reloadDurationSeconds(weapon) * tickRate), weapon };
    });
    ammoJumps.forEach((completion) => {
      if (intervals.some((reload) => completion.tick >= reload.startTick && completion.tick <= reload.endTick + tickRate * 0.2)) return;
      const durationTicks = Math.round(reloadDurationSeconds(completion.player.activeWeapon) * tickRate);
      intervals.push({ startTick: completion.tick - durationTicks, endTick: completion.tick, weapon: completion.player.activeWeapon });
    });
    reloads.set(playerId, intervals.sort((left, right) => left.startTick - right.startTick));
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
      <small>{playerGrenades(player.inventory, language)}</small><em>{String(player.activeWeapon || '-').replace(/^weapon_/, '').toUpperCase()}{player.activeWeaponAmmo != null && <span>{player.activeWeaponAmmo}</span>}</em>
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
    <div className="demo-pov-weapon"><small>POV · {player.name}</small><div><KillIcon type="weapon" weapon={player.activeWeapon} /><strong>{weapon}</strong>{player.activeWeaponAmmo != null && <b>{player.activeWeaponAmmo}</b>}</div></div>
    {hurt && <div className="demo-pov-hurt" />}
    {flashOpacity > 0 && <div className="demo-pov-flash" style={{ opacity: flashOpacity }} />}
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
  if (name.includes('molotov') || name.includes('incgrenade') || name.includes('incendiary') || name.includes('inferno')) return 'fire';
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

function ThreeBoard({ mapName, navData, showEdges, showGrid, showModel, modelOpacity, modelViewMode, trackpadDetection, showDemoNames, demoSnapshot, demoSnapshots, demoTick, demoFires, demoHurts, demoGrenades, demoProjectiles, demoGrenadeSegments, onDemoGrenadeSelect, demoDeaths, demoC4Events, demoHltvEvents, demoCameraMode, demoInEyePlayer, onDemoCameraInterrupt, utilityNotes, utilityNotesEnabled, onUtilityHover, utilityFirstPerson, heatDeaths, demoViewFlags, analysisRows, analysisSelectedPlayers, analysisSide, analysisEnabled, analysisRounds, analysisTime, deletePointId, pointUpdate, onPointSelect, onGrenadeWheel, onCameraSlots, onReady }) {
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
  const analysisRoundsRef = useRef(analysisRounds || []);
  const analysisTimeRef = useRef(analysisTime || 0);
  const analysisSideRef = useRef(analysisSide || 'ALL');
  const demoProjectileGroupsRef = useRef(new Map());
  const demoGrenadeObjectsRef = useRef(new Map());
  const demoPlayersRef = useRef(null);
  const modelVisibilityRef = useRef(showModel);
  const pointsRef = useRef([]);
  const pathLinesRef = useRef([]);
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
    demoPlayersRef.current = demoPlayers;
    let modelCenter = new THREE.Vector3();
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
          const hiddenInEye = demoInEyePlayerRef.current?.name === player.name;
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
      const teamColor = (team) => team === 2 ? '#ffb347' : team === 3 ? '#5da9ff' : '#aeb7ad';
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
        if (flags.killerHeat && selectedAttacker) add(`killerHeat-${event.attacker_team_num}`, event.attacker_X, event.attacker_Y, event.attacker_Z, teamColor(event.attacker_team_num));
        if (flags.targetHeat && selectedAttacker) add(`targetHeat-${event.user_team_num}`, event.user_X, event.user_Y, event.user_Z, teamColor(event.user_team_num));
        if (flags.victimHeat && selectedVictim) add(`victimHeat-${event.user_team_num}`, event.user_X, event.user_Y, event.user_Z, teamColor(event.user_team_num));
        if (flags.opponentHeat && selectedVictim) add(`opponentHeat-${event.attacker_team_num}`, event.attacker_X, event.attacker_Y, event.attacker_Z, teamColor(event.attacker_team_num));
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
          const records = (rowsByRound[roundIndex] || []).flatMap((snapshot) => snapshot.players.filter((player) => player.name === name).map((player) => ({ time: snapshot.tick - round.startTick, health: player.health, team: player.team, yaw: player.yaw || 0, position: new THREE.Vector3(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.08, player.position.z - modelCenter.z) }))).sort((left, right) => left.time - right.time);
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
          const marker = createTacticalPoint(new THREE.Vector3(), new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(records[0].yaw)), 0, Math.cos(THREE.MathUtils.degToRad(records[0].yaw))), null, 5.25, records[0].team === 2 ? 'T' : 'CT', 'T');
          marker.geometry = marker.children[0]?.children[0]?.geometry;
          marker.material = marker.children[0]?.children[0]?.material;
          marker.scale.setScalar(1.35);
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
        } else {
          marker.position.copy(current.position);
          marker.rotation.y = Math.atan2(-Math.sin(THREE.MathUtils.degToRad(current.yaw || 0)), -Math.cos(THREE.MathUtils.degToRad(current.yaw || 0)));
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
    const c4EventPosition = (event) => {
      const x = event?.x ?? event?.user_X;
      const y = event?.y ?? event?.user_Y;
      const z = event?.z ?? event?.user_Z;
      if (x == null || y == null || z == null) return null;
      const position = new THREE.Vector3(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y, x * 0.0254 - modelCenter.z);
      if (nav?.mesh) {
        nav.mesh.updateWorldMatrix(true, false);
        groundRaycaster.set(position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, -1, 0));
        groundRaycaster.far = 2.4;
        const hits = groundRaycaster.intersectObject(nav.mesh, true);
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
    scene.add(camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    let utilityFirstPersonActive = false;
    let utilityProjectileCameraActive = false;
    let demoDirectorCameraActive = false;
    let demoDirectorEventKey = '';
    const utilityProjectileDirection = new THREE.Vector3();
    let utilityProjectileSpeed = 0;
    let cameraTransition = null;
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
    const getWorkspaceState = ({ includeDemo = false } = {}) => {
      const points = pointsRef.current.filter((point) => point.userData.pointId).map((point) => ({ id: point.userData.pointId, position: point.position.toArray(), rotationY: point.rotation.y, team: point.userData.team, type: point.userData.type, rayLength: point.children.find((child) => child.userData.aimRay)?.scale.z || 0.05, aimTarget: point.userData.aimTarget?.position.toArray() || [0, 0, -0.05] }));
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
      return { cameraSlots: cameraSlots.map((saved) => saved ? { position: saved.position.toArray(), target: saved.target.toArray() } : null), camera: { position: camera.position.toArray(), target: controls.target.toArray() }, points, paths: pathLines.map((line) => line.userData.pathPointIds || []), grenades };
    };
    const restoreWorkspaceState = (saved, includeCurrentCamera = true) => {
      if (!saved) return;
      pathPoints.length = 0;
      pathLines.forEach((line) => { line.parent?.remove(line); line.geometry.dispose(); line.material.dispose(); });
      pathLines.length = 0;
      pointsRef.current.forEach((point) => { point.parent?.remove(point); point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); });
      pointsRef.current.length = 0;
      grenadeEffects.forEach((effect) => { effect.parent?.remove(effect); disposeGrenadeEffect(effect); });
      grenadeEffects.length = 0;
      const restoredPoints = new Map();
      (saved.points || []).forEach((item) => {
        const point = createTacticalPoint(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), item.id, item.rayLength, item.team || 'T', item.type || 'T');
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
        scene.add(point);
        pointsRef.current.push(point);
        restoredPoints.set(item.id, point);
      });
      (saved.paths || []).forEach(([fromId, toId]) => {
        const from = restoredPoints.get(fromId);
        const to = restoredPoints.get(toId);
        if (!from || !to) return;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(createGroundPathPoints(from.position, to.position)), new THREE.LineDashedMaterial({ color: '#ffd166', dashSize: 0.18, gapSize: 0.12, linewidth: 2, transparent: true, opacity: 0.9 }));
        line.computeLineDistances();
        line.renderOrder = 6;
        line.userData.pathPointIds = [fromId, toId];
        scene.add(line);
        pathLines.push(line);
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
      if (saved.cameraSlots) {
        saved.cameraSlots.forEach((slot, index) => { cameraSlots[index] = slot ? { position: new THREE.Vector3(...slot.position), target: new THREE.Vector3(...slot.target) } : null; });
        localStorage.setItem(cameraStorageKey, JSON.stringify(cameraSlots.map((slot) => slot ? { position: slot.position.toArray(), target: slot.target.toArray() } : null)));
        updateCameraSlotState(null);
      }
      if (includeCurrentCamera && saved.camera) { camera.position.fromArray(saved.camera.position); controls.target.fromArray(saved.camera.target); controls.update(); }
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
      const pressedNumber = Number.parseInt(event.key, 10);
      const numberSlot = pressedNumber === 0 ? 9 : pressedNumber - 1;
      if (numberSlot >= 0 && numberSlot < cameraSlots.length) {
        if (event.ctrlKey) {
          saveCameraSlot(numberSlot);
          if (pathMode && pathPoints.length === 0) { pathMode = false; controls.enabled = true; }
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
          activeGrenade.userData.grenadeId = `grenade-${Date.now()}-${grenadeEffects.length}`;
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
      if ((event.button === 1 || event.button === 2) && (demoCameraModeRef.current !== 'manual' || demoInEyePlayerRef.current)) demoCameraInterruptRef.current?.();
      if (event.button === 0) renderer.domElement.setPointerCapture?.(event.pointerId);
      if (event.button === 1 || event.button === 2) updateCameraSlotState(null);
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
        } else pointSelectRef.current?.(null);
      }
    };
    const onPointerMove = (event) => {
      pointerCurrent = pointerPosition(event);
      raycaster.setFromCamera(pointerCurrent, camera);
      const demoHit = raycaster.intersectObjects([...demoMarkers.values()], true)[0]?.object;
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
        if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
        return;
      }
      if (event.button !== 0 || !pointPointerTarget) return;
      const distance = pointPointerStart.distanceTo(pointerPosition(event));
       if (performance.now() - pointPointerTime < 450 && distance < 0.03) { const projected = pointPointerTarget.position.clone().project(camera); pointSelectRef.current?.(pointPointerTarget.userData.pointId, { x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight }); }
      pointPointerTarget = null;
      pointPointerDragging = false;
      if (!cameraTransition && !utilityFirstPersonRef.current?.player && !demoDirectorCameraActive) controls.enabled = true;
    };
    const cancelPointerInteraction = () => {
      pressedKeys.clear();
      pathPointerDown = false;
      grenadeAdjusting = false;
      pointPointerTarget = null;
      pointPointerDragging = false;
      placing = false;
      pathMode = false;
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
    const resetToDefault = (normalReset) => {
      camera.up.set(0, 1, 0);
      normalReset();
    };
    new GLTFLoader().load(`/maps/${mapName}/${mapName}.glb`, (gltf) => {
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
      worldModel.position.y = modelBasePositionRef.current.y + (modelMode.value === 3 ? -0.12 : 0);
      resetCamera();
      onReady({ reset: () => resetToDefault(resetCamera), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }) });
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
         const normalReset = () => { camera.position.set(distance * 0.68, distance * 0.9, distance); controls.target.set(0, 0, 0); controls.update(); };
         onReady({ reset: () => resetToDefault(normalReset), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }) });
      }
    });
    controls.target.set(0, 0, 0);
    controls.update();
     const initialReset = () => { camera.position.set(17, 23, 25); controls.target.set(0, 0, 0); controls.update(); };
     onReady({ reset: () => resetToDefault(initialReset), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState, clearWorkspaceState: () => restoreWorkspaceState({ points: [], paths: [] }) });
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
        const worldDiameter = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (5 / viewportHeight);
        const parentScale = target.parent?.getWorldScale(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
        target.scale.set(worldDiameter / Math.max(0.001, parentScale.x * 0.2), worldDiameter / Math.max(0.001, parentScale.y * 0.2), worldDiameter / Math.max(0.001, parentScale.z * 0.2));
      });
    };
    const animate = (now) => {
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
      if (firstPerson?.player) {
        const player = firstPerson.player;
        if (firstPerson.projectile) {
          const projectile = firstPerson.projectile;
          const position = projectile.position.clone().sub(modelCenter);
          const rawDirection = projectile.velocity.lengthSq() ? projectile.velocity.clone().normalize() : cs2AnglesToSceneDirection(player.pitch, player.yaw);
          if (!utilityProjectileCameraActive) {
            utilityProjectileDirection.copy(rawDirection);
            utilityProjectileSpeed = projectile.speed;
          } else {
            // Bounce ticks can reverse velocity abruptly; blend the camera basis independently.
            utilityProjectileDirection.lerp(rawDirection, 0.075).normalize();
            utilityProjectileSpeed = THREE.MathUtils.lerp(utilityProjectileSpeed, projectile.speed, 0.1);
          }
          const direction = utilityProjectileDirection;
          const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
          if (!side.lengthSq()) side.set(1, 0, 0);
          const speedRatio = THREE.MathUtils.clamp(utilityProjectileSpeed / 28, 0, 1);
          const distance = THREE.MathUtils.lerp(2.8, 9.5, speedRatio);
          const height = THREE.MathUtils.lerp(1.25, 3.4, speedRatio);
          const desiredPosition = position.clone().addScaledVector(direction, -distance).addScaledVector(side, distance * 0.34).add(new THREE.Vector3(0, height, 0));
          const desiredTarget = position.clone().addScaledVector(direction, THREE.MathUtils.lerp(0.8, 2.8, speedRatio)).add(new THREE.Vector3(0, 0.18, 0));
          if (!utilityProjectileCameraActive) {
            camera.position.copy(desiredPosition);
            controls.target.copy(desiredTarget);
          } else {
            // Smooth the moving anchor and preserve user orbit/zoom offsets.
            const anchorDelta = desiredTarget.clone().sub(controls.target).multiplyScalar(0.22);
            camera.position.add(anchorDelta);
            controls.target.add(anchorDelta);
          }
          controls.enabled = true;
          controls.update();
          utilityProjectileCameraActive = true;
        } else {
          const eye = new THREE.Vector3(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 1.62 - (player.duckAmount || 0) * 0.34, player.position.z - modelCenter.z);
          const direction = cs2AnglesToSceneDirection(player.pitch, player.yaw);
          camera.position.copy(eye);
          controls.target.copy(eye).add(direction.multiplyScalar(6));
          utilityProjectileCameraActive = false;
        }
        camera.lookAt(controls.target);
        if (!firstPerson.projectile) controls.enabled = false;
        utilityFirstPersonActive = true;
      } else if (utilityFirstPersonActive) { controls.enabled = true; utilityFirstPersonActive = false; utilityProjectileCameraActive = false; utilityProjectileSpeed = 0; }
      const manualPovPlayer = demoInEyePlayerRef.current;
      if (!firstPerson?.player && manualPovPlayer) {
        const eye = new THREE.Vector3(manualPovPlayer.position.x - modelCenter.x, manualPovPlayer.position.y - modelCenter.y + 1.62 - (manualPovPlayer.duckAmount || 0) * 0.34, manualPovPlayer.position.z - modelCenter.z);
        const direction = cs2AnglesToSceneDirection(manualPovPlayer.pitch, manualPovPlayer.yaw);
        camera.position.copy(eye);
        controls.target.copy(eye).add(direction.multiplyScalar(8));
        camera.fov = manualPovPlayer.scoped ? 35 : 68;
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        controls.enabled = false;
        demoDirectorCameraActive = true;
        const marker = demoMarkers.get(manualPovPlayer.name);
        const equipment = marker?.children.find((child) => child.userData.demoEquipment);
        const weaponKind = demoEquipmentKind(manualPovPlayer.activeWeapon);
        const equipmentKey = `${manualPovPlayer.name}:${weaponKind}`;
        if (demoPovEquipment.userData.equipmentKey !== equipmentKey) {
          demoPovEquipment.children.filter((child) => child !== demoPovMuzzleFlash).forEach((child) => demoPovEquipment.remove(child));
          const held = equipment?.children.find((child) => child.userData.demoEquipmentKind === weaponKind);
          if (held) {
            const clone = held.clone(true);
            clone.position.set(0, 0, 0);
            clone.visible = true;
            clone.traverse((child) => { child.visible = true; });
            demoPovEquipment.add(clone);
          }
          demoPovEquipment.userData.equipmentKey = equipmentKey;
        }
        const firing = demoFiresRef.current.some((event) => demoEventPlayerMatches(event, manualPovPlayer) && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 8);
        const reload = demoPlayerReload(demoRosterRuntime.reloads, manualPovPlayer, demoTickRef.current);
        const reloadDrop = reload && !['melee', 'c4'].includes(weaponKind) && !weaponKind.startsWith('utility-') ? Math.sin(reload.progress * Math.PI) : 0;
        demoPovEquipment.visible = true;
        demoPovEquipment.position.y = (firing ? -0.43 : -0.48) - reloadDrop * 0.56;
        demoPovEquipment.rotation.x = (firing ? -0.14 : -0.08) + reloadDrop * 0.68;
        demoPovMuzzleFlash.visible = firing && weaponKind !== 'melee' && !weaponKind.startsWith('utility-') && weaponKind !== 'c4';
      } else if (!firstPerson?.player && demoCameraModeRef.current !== 'manual' && demoSnapshotRef.current) {
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
      } else if (demoDirectorCameraActive) {
        controls.enabled = true;
        camera.fov = 38;
        camera.updateProjectionMatrix();
        demoDirectorCameraActive = false;
        demoDirectorEventKey = '';
      }
      if (!manualPovPlayer) demoPovEquipment.visible = false;
      camera.updateMatrixWorld();
      updateDemoPlayers();
      updateDemoDeaths();
      updateDeathHeat();
      updateAnalysis();
      updateUtilityNotes();
      updateDemoGrenades();
      updateC4();
      updateAimTargetScreenSizes();
      const interactionLocked = Boolean(cameraTransition || utilityFirstPersonRef.current?.player || demoDirectorCameraActive || placing || pathMode || grenadeAdjusting || pointPointerTarget);
      if (!interactionLocked && !controls.enabled) controls.enabled = true;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate(performance.now());
     return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); renderer.domElement.removeEventListener('wheel', onWheel); renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('contextmenu', onContextMenu); controls.dispose(); [...new Set([...grenadeEffects, grenadePreview, activeGrenade].filter(Boolean))].forEach(disposeGrenadeEffect); demoGrenadeObjectsRef.current.forEach((effect) => { scene.remove(effect); disposeGrenadeEffect(effect); }); demoGrenadeObjectsRef.current.clear(); [...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); })); pathLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); scene.remove(line); }); pathLines.length = 0; pointsRef.current = []; gridRef.current = null; modelRef.current = null; modelBasePositionRef.current = null; navFocusRef.current = null; navGroupRef.current = null; demoPlayersRef.current = null; demoMarkers.forEach((marker) => marker.traverse((object) => object.material?.dispose())); demoMovementTrails.forEach((trail) => { trail.geometry.dispose(); trail.material.dispose(); scene.remove(trail); }); demoDeathMarkers.forEach((marker) => { marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); scene.remove(marker); }); analysisPaths.forEach((item) => { item.line.geometry.dispose(); item.line.material.dispose(); item.marker.geometry.dispose(); item.marker.material.dispose(); }); analysisGroup.removeFromParent(); if (nav) { nav.geometry.dispose(); nav.edgeGeometry.dispose(); nav.mesh.material.dispose(); nav.edgeLines.material.dispose(); nav.distanceField?.texture?.dispose(); } if (worldModel) scene.remove(worldModel); renderer.dispose(); mount.removeChild(renderer.domElement); };
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
    if (modelRef.current && modelBasePositionRef.current) modelRef.current.position.y = modelBasePositionRef.current.y + (modelViewMode === 3 ? -0.12 : 0);
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

  return <div ref={(node) => { mountRef.current = node; }} className="three-board">{error && <div className="board-error">{error}</div>}</div>;
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('csboard-language') || 'zh');
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
  const [trackpadDetection, setTrackpadDetection] = useState(true);
  const [demoData, setDemoData] = useState(null);
  const [demoTick, setDemoTick] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoStatus, setDemoStatus] = useState('');
  const [demoParseProgress, setDemoParseProgress] = useState(0);
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
  const demoWorkerRef = useRef(null);
  const pendingDemoCacheRef = useRef(null);
  const activeDemoCacheIdRef = useRef('');
  const [demoSourceReady, setDemoSourceReady] = useState(false);
  const [cachedDemos, setCachedDemos] = useState([]);
  const [demoCacheOpen, setDemoCacheOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modelModeLabels = ['REACHABLE SURFACE', 'MOUSE LENS', 'CAMERA LENS'];
  const modeOptions = [{ label: 'MODEL OFF', value: -1 }, ...modelModeLabels.map((label, value) => ({ label, value }))];
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedPointScreen, setSelectedPointScreen] = useState(null);
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdate] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const [cameraSlotState, setCameraSlotState] = useState(Array(10).fill(false));
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);
  const [activePanel, setActivePanel] = useState('demo');
  const [utilityNotes, setUtilityNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('csboard-utility-notes') || '[]'); } catch { return []; } });
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
  const [roomCode, setRoomCode] = useState('');
  const [roomOwner, setRoomOwner] = useState(false);
  const [roomStatus, setRoomStatus] = useState('');
  const [roomJoinCode, setRoomJoinCode] = useState('');
  const [roomNotice, setRoomNotice] = useState('');
  const roomProviderRef = useRef(null);
  const roomDocRef = useRef(null);
  const roomWorkspaceRef = useRef('');
  const roomOwnerRef = useRef(roomOwner);
  const mapNameRef = useRef(mapName);
  const clientName = useRef(localStorage.getItem('csboard-client-name') || (() => { const value = Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase(); localStorage.setItem('csboard-client-name', value); return value; })());
  const pendingArchiveRef = useRef(null);
  const boardRef = useRef(null);
  roomOwnerRef.current = roomOwner;
  mapNameRef.current = mapName;
  useEffect(() => {
    localStorage.setItem('csboard-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
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
  const refreshCachedDemos = () => listCachedDemos().then(setCachedDemos).catch(() => setDemoStatus(t('cacheFailed')));
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
  useEffect(() => () => window.clearTimeout(utilityHoverTimerRef.current), []);
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
    if (!entry?.data || entry.data.cacheSchemaVersion !== DEMO_CACHE_SCHEMA_VERSION) { if (entry) await deleteCachedDemo(id); await refreshCachedDemos(); return; }
    applyDemoData(entry.data, id, entry.analysisRows || [], false);
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
    const pending = pendingArchiveRef.current;
    if (pending && pending.mapName === mapName && navData) {
      value.restoreWorkspaceState?.(pending.workspace);
      pendingArchiveRef.current = null;
      return;
    }
    const doc = roomDocRef.current;
    if (!doc) return;
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    const fallback = room.get('workspace');
    value.restoreWorkspaceState?.({ points: points.size ? [...points.values()] : fallback?.points || [], paths: paths.size ? [...paths.values()] : fallback?.paths || [], grenades: fallback?.grenades || [], cameraSlots: room.get('cameraSlots') || fallback?.cameraSlots || [] }, false);
  };
  const onPointSelect = (id, screen) => { setSelectedPoint(id); setSelectedPointScreen(screen); };
  useEffect(() => {
    const closePointActions = (event) => {
      if (event.target.closest?.('.point-actions') || event.target.closest?.('.three-board')) return;
      setSelectedPoint(null);
      setSelectedPointScreen(null);
    };
    document.addEventListener('pointerdown', closePointActions);
    return () => document.removeEventListener('pointerdown', closePointActions);
  }, []);
  const onCameraSlots = (slots, active) => { setCameraSlotState(slots); setActiveCameraSlot(active); };
  const saveWorkspaceArchive = (includeDemo = false) => {
    const archive = { id: `${Date.now()}`, savedAt: new Date().toISOString(), mapName, map: mapName, demo: demoData ? { fileName: demoData.demo.fileName, round: demoRound?.round, tick: demoTick } : null, workspace: boardRef.current?.getWorkspaceState?.({ includeDemo: includeDemo === true }) };
    if (!archive.workspace) return;
    const next = [archive, ...archives].slice(0, 30);
    setArchives(next);
    localStorage.setItem('csboard-workspace-archives', JSON.stringify(next));
    if (roomDocRef.current && roomOwner) { const room = roomDocRef.current.getMap('room'); room.set('mapName', archive.mapName); room.set('workspace', roomWorkspace(archive.workspace, archive.workspace.cameraSlots)); room.set('revision', Number(room.get('revision') || 0) + 1); }
  };
  const openRoom = () => {
    const workspace = boardRef.current?.getWorkspaceState?.();
    if (!workspace) return;
    const code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    setRoomCode(code); setRoomOwner(true); setRoomStatus(`${t('room')} ${code} ${t('roomOpened')}`);
    localStorage.setItem(`csboard-room-${code}`, JSON.stringify({ mapName, workspace, owner: clientName.current }));
    window.setTimeout(() => { const room = roomDocRef.current?.getMap('room'); if (room) { room.set('mapName', mapName); room.set('workspace', roomWorkspace(workspace, workspace.cameraSlots)); room.set('closed', false); } }, 0);
  };
  const leaveRoom = () => { const room = roomDocRef.current?.getMap('room'); if (room && roomOwner) room.set('closed', true); setRoomStatus(roomOwner ? t('roomDestroyed') : t('roomLeft')); setRoomCode(''); setRoomOwner(false); };
  const roomWorkspace = (workspace, slots) => { const { camera: _camera, ...shared } = workspace || {}; return { ...shared, cameraSlots: slots || shared.cameraSlots || [] }; };
  const joinRoom = (value = roomJoinCode) => { const code = value.trim().toUpperCase(); if (/^[0-9A-F]{6}$/.test(code)) { setRoomCode(code); setRoomOwner(false); setRoomStatus(`${t('joiningRoom')} ${code}...`); } };
  useEffect(() => {
    if (!roomNotice) return;
    window.alert(roomNotice);
    setRoomNotice('');
  }, [roomNotice]);
  useEffect(() => {
    if (!roomCode) return undefined;
    const doc = new Y.Doc(); const provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rooms`, roomCode, doc);
    roomDocRef.current = doc; roomProviderRef.current = provider;
    const room = doc.getMap('room');
    const points = doc.getMap('points');
    const paths = doc.getMap('paths');
    let applyingRemote = false;
    let synced = false;
    let localBaseline = null;
    const applySharedWorkspace = () => {
      const fallback = room.get('workspace');
      const shared = {
        points: points.size ? [...points.values()] : fallback?.points || [],
        paths: paths.size ? [...paths.values()] : fallback?.paths || [],
        grenades: fallback?.grenades || [],
        cameraSlots: room.get('cameraSlots') || fallback?.cameraSlots || [],
      };
      const serialized = JSON.stringify(shared);
      if (serialized === roomWorkspaceRef.current) return;
      roomWorkspaceRef.current = serialized;
      applyingRemote = true;
      boardRef.current?.restoreWorkspaceState?.(shared, false);
      applyingRemote = false;
      localBaseline = shared;
    };
    let appliedRevision = -1;
    const tr = (key, values) => translate(languageRef.current, key, values);
    const apply = () => { if (room.get('closed')) { setRoomNotice(tr('roomDestroyed')); setRoomStatus(tr('roomDestroyed')); setRoomCode(''); setRoomOwner(false); return; } const revision = Number(room.get('revision') || 0); const map = room.get('mapName'); if (map && map !== mapNameRef.current && !roomOwnerRef.current) setMapName(map); if (revision !== appliedRevision) { appliedRevision = revision; roomWorkspaceRef.current = ''; } applySharedWorkspace(); setRoomStatus(`${tr('joinedRoom')} ${roomCode}`); };
    const publishWorkspace = (force = false) => {
      if (!synced || applyingRemote) return;
      const workspace = boardRef.current?.getWorkspaceState?.();
      if (!workspace) return;
      const previousPoints = new Map((localBaseline?.points || []).map((point) => [point.id, point]));
      const currentPoints = new Map(workspace.points.map((point) => [point.id, point]));
      const previousPaths = new Map((localBaseline?.paths || []).map((path) => [path.join(':'), path]));
      const currentPaths = new Map(workspace.paths.map((path) => [path.join(':'), path]));
      doc.transact(() => {
        currentPoints.forEach((point, id) => { if (force || JSON.stringify(previousPoints.get(id)) !== JSON.stringify(point)) points.set(id, point); });
        previousPoints.forEach((_, id) => { if (!currentPoints.has(id)) points.delete(id); });
        currentPaths.forEach((path, id) => { if (force || JSON.stringify(previousPaths.get(id)) !== JSON.stringify(path)) paths.set(id, path); });
        previousPaths.forEach((_, id) => { if (!currentPaths.has(id)) paths.delete(id); });
        if (roomOwnerRef.current) {
          if (room.get('mapName') !== mapNameRef.current) room.set('mapName', mapNameRef.current);
          if (JSON.stringify(room.get('cameraSlots') || []) !== JSON.stringify(workspace.cameraSlots)) room.set('cameraSlots', workspace.cameraSlots);
        }
      });
      localBaseline = { points: workspace.points, paths: workspace.paths, grenades: workspace.grenades || [], cameraSlots: room.get('cameraSlots') || [] };
      roomWorkspaceRef.current = JSON.stringify({ points: workspace.points, paths: workspace.paths, grenades: workspace.grenades || [], cameraSlots: room.get('cameraSlots') || [] });
    };
    provider.on('status', ({ status }) => { setRoomStatus(status === 'connected' ? `${tr('room')} ${roomCode} ${tr('connected')} · ${clientName.current}` : `${tr('room')} ${status === 'disconnected' ? tr('disconnected') : tr('connecting')}...`); });
    provider.on('sync', (isSynced) => { synced = isSynced; if (!isSynced) return; apply(); if (roomOwnerRef.current && !points.size && !paths.size) publishWorkspace(true); });
    room.observe(apply); points.observe(apply); paths.observe(apply); apply();
    const publish = window.setInterval(publishWorkspace, 300);
    return () => { window.clearInterval(publish); room.unobserve(apply); points.unobserve(apply); paths.unobserve(apply); provider.destroy(); doc.destroy(); roomDocRef.current = null; roomProviderRef.current = null; };
  }, [roomCode]);
  const deleteWorkspaceArchive = (id) => {
    const next = archives.filter((archive) => archive.id !== id);
    setArchives(next);
    localStorage.setItem('csboard-workspace-archives', JSON.stringify(next));
  };
  const switchPanel = (panel) => {
    setDemoPlaying(false);
    setAnalysisPlaying(false);
    setSelectedDemoGrenade(null);
    setSelectedDemoGrenadeScreen(null);
    setUtilityReplay(null);
    if (panel === 'analysis') setAnalysisTime(0);
    if (panel === 'demo' && activePanel === 'collab') boardRef.current?.clearWorkspaceState?.();
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
  const restoreWorkspaceArchive = (archive) => {
    if (roomCode && !roomOwner) return;
    if (archive.mapName !== mapName) { pendingArchiveRef.current = archive; setMapName(archive.mapName); } else boardRef.current?.restoreWorkspaceState?.(archive.workspace);
    if (archive.demo && demoData?.demo.fileName === archive.demo.fileName) { const round = demoData.rounds.find((item) => item.round === archive.demo.round); if (round) setDemoRound(round); setDemoTick(archive.demo.tick); }
    if (roomDocRef.current && roomOwner) { const doc = roomDocRef.current; const room = doc.getMap('room'); const points = doc.getMap('points'); const paths = doc.getMap('paths'); doc.transact(() => { points.clear(); paths.clear(); archive.workspace.points?.forEach((point) => points.set(point.id, point)); archive.workspace.paths?.forEach((path) => paths.set(path.join(':'), path)); room.set('mapName', archive.mapName); room.set('cameraSlots', archive.workspace.cameraSlots || []); room.set('workspace', roomWorkspace(archive.workspace, archive.workspace.cameraSlots)); room.set('revision', Number(room.get('revision') || 0) + 1); }); }
  };
  const selectedMode = showModel ? modelViewMode : -1;
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
    const attack = attackRows.some((player) => player.fire && player.secondaryFire) ? 'both' : attackRows.at(-1)?.secondaryFire ? 'secondary' : 'primary';
    const movement = [...new Set(preparation.slice(-32).flatMap((player) => player.movement || []))];
    const behavior = { attack, jumped: preparation.slice(-32).some((player) => player.isAirborne), crouched: preparation.slice(-8).some((player) => Number(player.duckAmount) >= 0.8), walking: preparation.slice(-8).some((player) => player.walking), movement, hasRunup: replayStart.hasRunup, runupPeakSpeed: replayStart.peakSpeed, runupDistance: replayStart.distance };
    const behaviorText = [attack, replayStart.hasRunup ? 'runup' : null, behavior.jumped ? 'jump' : null, behavior.crouched ? 'crouch' : null, behavior.walking ? 'walk' : null, movement.length ? movement.join('+') : 'stationary'].filter(Boolean).join(' · ');
    const replay = {
      tickRate,
      throwTick: segment.throwTick - replayStartTick,
      effectTick: segment.effectTick - replayStartTick,
      endTick: segment.endTick - replayStartTick,
      snapshots: replaySnapshots,
      projectiles: segment.projectiles.map((record) => ({ tick: record.tick - replayStartTick, entity_id: record.entity_id, grenade_type: record.grenade_type, x: record.x, y: record.y, z: record.z })),
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
    const records = utilityReplay.note.replay.projectiles || [];
    if (utilityReplay.tick < utilityReplay.note.replay.throwTick || !records.length) return { player };
    let before = records[0];
    let after = records.at(-1);
    for (let index = 1; index < records.length; index += 1) {
      if (records[index].tick >= utilityReplay.tick) { before = records[index - 1]; after = records[index]; break; }
    }
    const amount = before.tick === after.tick ? 0 : THREE.MathUtils.clamp((utilityReplay.tick - before.tick) / (after.tick - before.tick), 0, 1);
    const position = new THREE.Vector3(THREE.MathUtils.lerp(before.y, after.y, amount) * 0.0254, THREE.MathUtils.lerp(before.z, after.z, amount) * 0.0254, THREE.MathUtils.lerp(before.x, after.x, amount) * 0.0254);
    const elapsed = Math.max((after.tick - before.tick) / utilityReplay.note.replay.tickRate, 1 / utilityReplay.note.replay.tickRate);
    const velocity = new THREE.Vector3((after.y - before.y) * 0.0254 / elapsed, (after.z - before.z) * 0.0254 / elapsed, (after.x - before.x) * 0.0254 / elapsed);
    return { player, projectile: { position, velocity, speed: velocity.length() } };
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
  const demoKills = activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick).slice(-5) || [] : [];
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
  const analysisDuration = useMemo(() => analysisSelectedPlayers.length && analysisRows.length ? Math.max(0, ...analysisSelectedPlayers.flatMap((name) => demoData?.rounds?.map((round) => {
    const records = analysisRows.filter((snapshot) => snapshot.tick >= round.startTick && snapshot.tick <= round.endTick).flatMap((snapshot) => snapshot.players.filter((player) => player.name === name).map((player) => ({ ...player, tick: snapshot.tick }))).sort((left, right) => left.tick - right.tick);
    const roundSide = records[0]?.team === 2 ? 'T' : records[0] ? 'CT' : null;
    if (analysisSide !== 'ALL' && roundSide !== analysisSide) return 0;
    const last = records.find((player) => player.health != null && player.health <= 0) || records.at(-1);
    return last ? Math.min(last.tick - round.startTick, round.endTick - round.startTick) : 0;
  }) || [])) : 0, [analysisSelectedPlayers, analysisRows, analysisSide, demoData?.rounds]);
  useEffect(() => {
    const worker = new Worker(new URL('./demoWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
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
       if (event.data.type === 'loaded') {
          demoParseProgressRef.current = { ...demoParseProgressRef.current, real: 100, completed: demoParseProgressRef.current.total, lastRealAt: performance.now(), hasReal: true };
          setDemoParseProgress(100);
         const data = event.data.data;
         const pending = pendingDemoCacheRef.current;
         applyDemoData(data, pending?.id, [], true);
         if (pending) {
           const entry = { id: pending.id, fileName: data.demo.fileName, map: data.demo.map, rounds: data.rounds.length, sourceBytes: pending.sourceBytes, dataBytes: event.data.estimatedBytes || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data, analysisRows: [] };
           putCachedDemo(entry).then(refreshCachedDemos).catch(() => setDemoStatus(translate(currentLanguage, 'cacheFailed')));
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
       if (event.data.type === 'error') { demoParseProgressRef.current.startedAt = 0; setDemoStatus(`${translate(currentLanguage, 'parseFailed')}: ${event.data.message}`); console.error('Demo parse failed:', event.data.message, event.data.diagnostic); }
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
    const cacheId = demoCacheId(files);
    const cached = await getCachedDemo(cacheId).catch(() => null);
    if (cached?.data?.cacheSchemaVersion === DEMO_CACHE_SCHEMA_VERSION) {
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
      setDemoParseProgress(0);
      demoParseProgressRef.current = { startedAt: performance.now(), real: 0, completed: 0, total: 0, lastRealAt: 0, msPerPercent: 3000, hasReal: false };
     pendingDemoCacheRef.current = { id: cacheId, sourceBytes: files.reduce((sum, file) => sum + file.size, 0) };
     const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
    demoWorkerRef.current?.postMessage({ type: 'load', fileName: files.map((file) => file.name).join(' + '), buffers }, buffers);
  };
  useEffect(() => {
    if (!demoRound || !demoData) return;
    setDemoPovPlayerId('');
    const cached = demoData.roundData?.find((item) => item.round === demoRound.round);
    setDemoTick(demoRound.startTick);
    setDemoSnapshots(cached?.snapshots || []);
    setDemoThrowSnapshots(cached?.throwSnapshots || []);
    setDemoProjectiles(cached?.projectiles || []);
    setDemoRoundLoading(false);
    setDemoPlaying(false);
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
      if (!demoData) return;
        if (event.code === 'Space') { event.preventDefault(); event.target?.blur?.(); if (activePanel === 'analysis') { if (analysisSelectedPlayers.length && analysisRows.length) setAnalysisPlaying((playing) => !playing); } else if (!demoRoundLoading && demoRound) setDemoPlaying((playing) => !playing); return; }
       if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) return;
       if (event.code === 'ArrowLeft') { event.preventDefault(); setDemoPlaying(false); setDemoTick((tick) => Math.max(demoRound.startTick, tick - 16)); }
       if (event.code === 'ArrowRight') { event.preventDefault(); setDemoPlaying(false); setDemoTick((tick) => Math.min(demoRound.endTick, tick + 16)); }
    };
    window.addEventListener('keydown', onDemoKeyDown, true);
    return () => window.removeEventListener('keydown', onDemoKeyDown, true);
  }, [activePanel, analysisRows.length, analysisSelectedPlayers.length, demoData, demoRound, demoRoundLoading]);
  useEffect(() => {
    let cancelled = false;
    setNavData(mapName === 'de_dust2' ? fallbackNavData : null);
    fetch(`/api/maps/${mapName}/nav`).then((response) => response.json()).then((data) => { if (!cancelled && data.areas) setNavData(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapName]);
  return <main className="board-shell">
    <header className="board-header">
      <div className="brand"><svg className="brand-mark" viewBox="0 0 78 44" aria-label="CSBoard"><g className="penrose penrose-left"><path className="brand-beam beam-top" d="M34 3 5 22l7 7 15-10-7 12 7 4 14-24z" /><path className="brand-beam beam-left" d="M5 22 34 41l5-9-16-10h14V14H9z" /><path className="brand-beam beam-right" d="M34 41 41 3H30l-3 20-7-12-7 4 14 24z" /></g><g className="penrose penrose-right" transform="translate(78 0) scale(-1 1)"><path className="brand-beam beam-top" d="M34 3 5 22l7 7 15-10-7 12 7 4 14-24z" /><path className="brand-beam beam-left" d="M5 22 34 41l5-9-16-10h14V14H9z" /><path className="brand-beam beam-right" d="M34 41 41 3H30l-3 20-7-12-7 4 14 24z" /></g><path className="brand-two" d="M29 13h20l-12 9h12L29 34" /></svg><span>CS<span>BOARD</span></span></div>
       <nav className="topbar-panels"><button type="button" className={activePanel === 'demo' ? 'active' : ''} onClick={() => switchPanel('demo')}>{t('rounds')}</button><button type="button" className={activePanel === 'analysis' ? 'active' : ''} onClick={() => switchPanel('analysis')}>{t('analysis')}</button><button type="button" className={activePanel === 'utility' ? 'active' : ''} onClick={() => switchPanel('utility')}>{t('utilityNotes')}</button><button type="button" className={activePanel === 'collab' ? 'active' : ''} onClick={() => switchPanel('collab')}>{t('collab')}</button></nav>
        <button type="button" className="language-switch" onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')}>{t('language')}</button>
    </header>
    <section className="board-stage">
        <ThreeBoard key={`${mapName}-${navData ? navData.version : 'loading'}`} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelOpacity={modelOpacity} modelViewMode={modelViewMode} trackpadDetection={trackpadDetection} showDemoNames={showDemoNames} demoSnapshot={activePanel === 'demo' ? demoSnapshot : utilityReplaySnapshot} demoSnapshots={activePanel === 'demo' ? demoSnapshots : []} demoTick={activePanel === 'demo' ? demoTick : utilityReplay?.tick || 0} demoFires={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'weapon_fire') || [] : []} demoHurts={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_hurt') || [] : []} demoGrenades={activePanel === 'demo' ? demoData?.events?.filter((event) => ['grenade_thrown', 'smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate'].includes(event.event_name)) || [] : utilityReplay?.note.replay.events || []} demoProjectiles={activePanel === 'demo' ? demoProjectiles : utilityReplay?.note.replay.projectiles || []} demoGrenadeSegments={activePanel === 'demo' ? demoGrenadeSegments : utilityReplaySegments} onDemoGrenadeSelect={activePanel === 'demo' ? onDemoGrenadeSelect : null} demoDeaths={activePanel === 'demo' ? demoDeaths : []} demoC4Events={activePanel === 'demo' ? demoC4Events : []} demoHltvEvents={activePanel === 'demo' ? demoHltvEvents : []} demoCameraMode={activePanel === 'demo' ? demoCameraMode : 'manual'} onDemoCameraInterrupt={() => setDemoCameraMode('manual')} utilityFirstPerson={activePanel === 'utility' ? utilityFirstPerson : null} heatDeaths={activePanel === 'analysis' ? demoData?.events?.filter((event) => event.event_name === 'player_death') || [] : []} demoViewFlags={demoViewFlags} analysisRows={analysisRows} analysisSelectedPlayers={analysisSelectedPlayers} analysisSide={analysisSide} analysisEnabled={activePanel === 'analysis'} analysisRounds={demoData?.rounds || []} analysisTime={analysisTime} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={onPointSelect} onGrenadeWheel={setGrenadeWheel} onCameraSlots={onCameraSlots} onReady={onReady} />
         <div className="stage-vignette" />
          {activePanel === 'demo' && <DemoPovHud player={demoPovPlayer} firing={demoPovFiring} hurt={demoPovHurt} />}
         {activePanel === 'demo' && demoSnapshot && <div className={`demo-score${roundWinner ? ` winner-${roundWinner.toLowerCase()}` : ''}`}><span>T</span><strong>{demoScore.T}</strong><i>ROUND {demoRound?.round || '-'}{roundResult ? <b className="round-result">{roundResult}</b> : c4Countdown != null ? <b className={c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? 'c4-paused' : ''}>C4 {c4Countdown.toFixed(4)}s</b> : <b className="round-clock">{roundClock}</b>}{defuseProgress != null && <span className={`score-defuse${currentDefuser.hasDefuser ? ' has-kit' : ''}`} style={{ '--defuse-progress': `${defuseProgress * 360}deg` }}><i>{currentDefuser.hasDefuser ? 'KIT' : '10s'}</i></span>}</i><strong>{demoScore.CT}</strong><span>CT</span></div>}
       <div className="map-name"><h1>{mapName.toUpperCase()}</h1></div>
       {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>{t('smoke')}</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>{t('fire')}</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>{t('flash')}</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>{t('grenade')}</div><span className="wheel-key">Q</span></div>}
         {demoKills.length > 0 && <DemoKillFeed kills={demoKills} round={demoRound} language={language} collapsed={demoKillsCollapsed} onToggle={() => setDemoKillsCollapsed((collapsed) => !collapsed)} />}
        <div className="hud hud-right"><span>VIEW CONTROLS</span><strong>MMB <em>ROTATE</em></strong><strong>SHIFT + MMB <em>PAN</em></strong><strong>SCROLL <em>ZOOM</em></strong><strong>WASD <em>MOVE</em></strong><strong>LEFT CLICK <em>POINT MENU</em></strong></div>
          <div className="camera-slots"><span>{t('cameraPositions')}</span>{cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved} className={activeCameraSlot === index ? 'active' : ''} onClick={() => boardRef.current?.restoreCameraSlot?.(index)}>{index === 9 ? 0 : index + 1}</button>)}</div>
           {activePanel === 'demo' && demoSnapshot && <><DemoRoster side="T" players={demoTeams.T} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} language={language} /><DemoRoster side="CT" players={demoTeams.CT} events={demoData?.events || []} tick={demoTick} round={demoRound} tickRate={demoData.demo.tickRate || 64} language={language} /></>}
          {selectedPoint && selectedPointScreen && <div className="point-actions" style={{ left: selectedPointScreen.x, top: selectedPointScreen.y }}><span>{t('tacticalPoint')}</span><div className="point-choice"><b>{t('team')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div><div className="point-choice"><b>{t('type')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'X' })}>X</button></div><button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); setSelectedPointScreen(null); }}>{t('delete')}</button></div>}
          {activePanel === 'demo' && selectedDemoGrenade && selectedDemoGrenadeScreen && <div className="demo-grenade-actions" style={{ left: selectedDemoGrenadeScreen.x, top: selectedDemoGrenadeScreen.y }}><div><strong>{selectedDemoGrenade.kind.toUpperCase()}</strong><span>{selectedDemoGrenade.throwEvent.user_name || t('unknown')} · T{selectedDemoGrenade.throwTick}</span></div><button type="button" onClick={saveDemoGrenade}>{t('saveUtility')}</button><button type="button" className="close" aria-label={t('cancel')} onClick={() => { setSelectedDemoGrenade(null); setSelectedDemoGrenadeScreen(null); }}>×</button></div>}
        <div className="board-tools"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}><i /> TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)} className={showModel ? 'selected' : ''}><i /> {modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) setShowModel(false); else { setShowModel(true); setModelViewMode(option.value); } setModeMenuOpen(false); }} /> <span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}><i /> AREA EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET VIEW</button></div>
          {activePanel === 'utility' && <aside className="utility-notes-panel"><div className="utility-notes-heading"><div><span>UTILITY NOTES</span><h2>{t('utilityNotes')}</h2></div><button type="button" onClick={() => { setUtilityDraft({ getpos: '', name: '', summary: '' }); setUtilityError(''); setUtilityModalOpen(true); }}>{t('addUtilityNote')}</button></div><p>{t('utilityIntro')}</p><div className="utility-notes-meta"><label className="map-select"><span>{t('map').toUpperCase()}</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><span>{t('utilityCount', { count: currentUtilityNotes.length })}</span></div><div className="utility-model-options"><label className="model-opacity"><span>{t('model').toUpperCase()}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="utility-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div></div>{currentUtilityNotes.length === 0 && <div className="utility-empty">{t('utilityEmpty')}</div>}<small>{t('localOnly')}</small></aside>}
          {activePanel === 'utility' && <aside className="utility-location-panel"><header><strong>{t('utilityLocations')}</strong><span>{currentUtilityGroups.length}</span></header>{currentUtilityGroups.length === 0 ? <div className="utility-location-empty">{t('utilityEmpty')}</div> : <div className="utility-location-groups">{currentUtilityGroups.map(({ location, categories }) => <section key={location}><div className="utility-location-heading"><strong>{location}</strong><span>{categories.reduce((sum, [, entries]) => sum + entries.length, 0)}</span></div>{categories.map(([kind, entries]) => <div className="utility-category" key={kind}><span>{kind === 'smoke' ? 'SMOKE' : kind === 'flash' ? 'FLASH' : kind === 'fire' ? 'FIRE' : kind === 'he' ? 'HE' : kind === 'decoy' ? 'DECOY' : 'CUSTOM'}</span>{entries.map((note) => <button type="button" key={note.id} className={note.replay ? 'replayable' : ''} onClick={() => { setUtilityHover({ key: note.positionKey, entries: note.positionEntries, x: 330, y: Math.max(150, window.innerHeight / 2 - 36) }); setSelectedUtilityNote(note); setUtilityCopied(false); }}><b>{note.name}</b><small>{note.thrower || t('customUtility')}</small></button>)}</div>)}</section>)}</div>}</aside>}
           {activePanel === 'utility' && utilityHover && <div className="utility-hover-card" style={{ left: utilityHover.x, top: utilityHover.y }} onPointerEnter={() => { utilityHoverInsideRef.current = true; window.clearTimeout(utilityHoverTimerRef.current); }} onPointerLeave={() => { utilityHoverInsideRef.current = false; utilityHoverTimerRef.current = window.setTimeout(() => { setUtilityHover(null); setSelectedUtilityNote(null); setUtilityEditDraft(null); }, 180); }}><header><strong>{selectedUtilityNote ? t('utilityDetails') : 'LOCATION'}</strong><span>{selectedUtilityNote ? <button type="button" onClick={() => { setSelectedUtilityNote(null); setUtilityEditDraft(null); }}>←</button> : utilityHover.entries.length}</span></header>{selectedUtilityNote ? <div className="utility-detail">{utilityEditDraft ? <form className="utility-edit-form" onSubmit={saveUtilityEdit}><label><span>{t('utilityTitle')}</span><input required value={utilityEditDraft.name} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('utilityDescription')}</span><textarea required value={utilityEditDraft.summary} onChange={(event) => setUtilityEditDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label><div><button type="button" onClick={() => setUtilityEditDraft(null)}>{t('cancel')}</button><button type="submit">{t('saveUtilityEdit')}</button></div></form> : <><strong>{selectedUtilityNote.name}</strong><p>{selectedUtilityNote.summary}</p></>}<dl><div><dt>{t('map')}</dt><dd>{selectedUtilityNote.mapName}</dd></div>{selectedUtilityNote.startPlace && <div><dt>{t('startPlace')}</dt><dd>{selectedUtilityNote.startPlace}</dd></div>}{selectedUtilityNote.throwPlace && <div><dt>{t('throwPlace')}</dt><dd>{selectedUtilityNote.throwPlace}</dd></div>}<div><dt>{t('position')}</dt><dd>{selectedUtilityNote.position.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('angles')}</dt><dd>{selectedUtilityNote.angles.map((value) => Number(value).toFixed(2)).join(' / ')}</dd></div><div><dt>{t('exportedBy')}</dt><dd>{selectedUtilityNote.thrower || t('customUtility')}</dd></div>{selectedUtilityNote.demoSource && <div><dt>{t('sourceDemo')}</dt><dd>{selectedUtilityNote.demoSource.fileName} · R{selectedUtilityNote.demoSource.round || '-'} · T{selectedUtilityNote.demoSource.tick}</dd></div>}<div><dt>{t('exportedAt')}</dt><dd>{new Date(selectedUtilityNote.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</dd></div></dl><div className="utility-detail-actions"><button type="button" onClick={() => setUtilityEditDraft({ name: selectedUtilityNote.name, summary: selectedUtilityNote.summary || '' })}>{t('editUtility')}</button><button type="button" onClick={() => copyUtilityCommand(selectedUtilityNote)}>{utilityCopied ? t('copied') : t('getposCommand')}</button><button type="button" className="utility-delete" onClick={() => deleteUtilityNote(selectedUtilityNote)}>{t('delete')}</button>{selectedUtilityNote.replay && <><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote)}>{t('replayUtility')}</button><button type="button" onClick={() => playUtilityReplay(selectedUtilityNote, true)}>{t('replayUtilityFirstPerson')}</button></>}</div></div> : <div className="utility-hover-list">{utilityHover.entries.map((note) => <button type="button" key={note.id} className={`utility-list-entry${note.replay ? ' replayable' : ''}`} onClick={() => { setSelectedUtilityNote(note); setUtilityEditDraft(null); setUtilityCopied(false); }}><strong>{note.name}</strong><span>{t('angles')}: {(note.angles || [0, 0, 0]).map((value) => Number(value).toFixed(2)).join(' / ')}</span><p>{note.summary}</p></button>)}</div>}</div>}
          {activePanel === 'utility' && utilityReplay && <div className="utility-replay-bar"><strong>{utilityReplay.note.name}</strong><span>{(utilityReplay.tick / utilityReplay.note.replay.tickRate).toFixed(1)}s / {(utilityReplay.note.replay.endTick / utilityReplay.note.replay.tickRate).toFixed(1)}s</span><button type="button" onClick={() => setUtilityReplay((current) => ({ ...current, tick: current.playing ? current.tick : current.tick >= current.note.replay.endTick ? 0 : current.tick, playing: !current.playing }))}>{utilityReplay.playing ? t('pause') : t('play')}</button><button type="button" onClick={() => setUtilityReplay(null)}>×</button></div>}
         {utilityModalOpen && <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setUtilityModalOpen(false); }}><form className="utility-modal" onSubmit={addUtilityNote}><header><div><span>GETPOS</span><h2>{t('addUtilityNote')}</h2></div><button type="button" onClick={() => setUtilityModalOpen(false)}>×</button></header><label><span>{t('getposOutput')}</span><textarea required value={utilityDraft.getpos} placeholder={t('getposPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, getpos: event.target.value }))} /></label><label><span>{t('utilityName')}</span><input required value={utilityDraft.name} placeholder={t('utilityNamePlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('throwSummary')}</span><textarea required value={utilityDraft.summary} placeholder={t('throwSummaryPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>{utilityError && <div className="utility-error">{utilityError}</div>}<footer><button type="button" onClick={() => setUtilityModalOpen(false)}>{t('cancel')}</button><button type="submit">{t('add')}</button></footer></form></div>}
          <div className={`demo-panel ${activePanel === 'demo' ? '' : 'panel-hidden'}`}>
           <div className="demo-toolbar"><div className="demo-source-controls"><label className="demo-upload"><span>{t('multiDemo')}</span><input type="file" accept=".dem" multiple onChange={loadDemo} /><b>{t('chooseDemo')}</b></label>{demoStatus && !demoData ? <span className="demo-status">{demoStatus}</span> : <div className="demo-cache-picker"><button type="button" onClick={() => setDemoCacheOpen((open) => !open)}>{t('parsedDemos')} · {cachedDemos.length}</button>{demoCacheOpen && <div className="demo-cache-list"><header><strong>{t('parsedDemos')}</strong><button type="button" onClick={() => setDemoCacheOpen(false)}>×</button></header>{cachedDemos.length === 0 ? <div className="demo-cache-empty">{t('noCachedDemos')}</div> : cachedDemos.map((entry) => <article key={entry.id}><button type="button" className="demo-cache-open" onClick={() => openCachedDemo(entry.id)}><strong>{entry.fileName}</strong><span>{entry.map} · {entry.rounds} {t('round')}</span><small>{formatBytes((entry.dataBytes || 0) + (entry.analysisBytes || 0))} / {formatBytes(entry.sourceBytes)} · {new Date(entry.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></button><button type="button" className="demo-cache-delete" aria-label={t('deleteCachedDemo')} title={t('deleteCachedDemo')} onClick={() => removeCachedDemo(entry.id)}>×</button></article>)}</div>}</div>}{demoData && <span className="demo-name">{demoData.demo.map} / {demoData.demo.fileName}</span>}</div><div className="demo-playback-controls">{demoData && <div className={`demo-round-picker${demoRoundMenuOpen ? ' open' : ''}`}><button type="button" onClick={() => setDemoRoundMenuOpen((open) => !open)}>{demoRound ? `${t('round')} ${demoRound.round} · ${demoRoundEconomies.get(demoRound.round)?.T.label}/${demoRoundEconomies.get(demoRound.round)?.CT.label}` : t('selectRound')}</button>{demoRoundMenuOpen && <div className="demo-round-list">{demoData.rounds.map((round) => { const economy = demoRoundEconomies.get(round.round); return <button type="button" key={round.round} className={demoRound?.round === round.round ? 'active' : ''} style={{ '--economy-split': `${economy?.split ?? 50}%` }} onClick={() => { setDemoRound(round); setDemoRoundMenuOpen(false); }}><span className="economy-t">T {economy?.T.label}</span><strong>R{round.round}</strong><span className="economy-ct">CT {economy?.CT.label}</span><i /></button>; })}</div>}</div>}{demoData && demoRound && <div className="demo-scrub"><span className="demo-time">{((demoTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span><div className="timeline-track"><input className="demo-timeline" disabled={demoRoundLoading} style={{ '--timeline-progress': `${demoRound.endTick > demoRound.startTick ? ((demoTick - demoRound.startTick) / (demoRound.endTick - demoRound.startTick)) * 100 : 0}%` }} type="range" min={demoRound.startTick} max={demoRound.endTick} step="1" value={demoTick} onPointerUp={(event) => event.currentTarget.blur()} onChange={(event) => { setDemoPlaying(false); setDemoTick(Number(event.target.value)); }} />{timelineEvents.map((event, index) => <button type="button" className={`timeline-event event-${event.event_name}`} title={event.title} aria-label={event.title} style={{ left: `${((event.tick - demoRound.startTick) / Math.max(1, demoRound.endTick - demoRound.startTick)) * 100}%` }} key={`${event.event_name}-${event.tick}-${index}`} onClick={() => { setDemoPlaying(false); setDemoTick(event.tick); }}>{event.label}</button>)}</div><span className="demo-duration">/ {((demoRound.endTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span></div>}{demoRound && <button type="button" className="demo-play" disabled={demoRoundLoading} onClick={() => setDemoPlaying((playing) => !playing)}>{demoRoundLoading ? t('loading') : demoPlaying ? t('pause') : t('play')}</button>}<button type="button" className="demo-save-frame" onClick={() => saveWorkspaceArchive(true)}>{t('saveFrame')}</button></div></div>
             {demoStatus && !demoData && <div className="demo-loading" role="progressbar" aria-label="Demo parsing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(demoParseProgress)}><i style={{ width: `${demoParseProgress}%` }} /><span>{Math.floor(demoParseProgress)}%</span></div>}
            <div className="demo-controls-row">{activePanel === 'demo' && demoData && <div className="demo-view-options"><span>{t('view')}</span><button type="button" className={showDemoNames ? 'selected' : ''} onClick={() => setShowDemoNames((value) => !value)}>{t('showNames')}</button>{[['manual','cameraManual'],['follow','cameraFollow'],['fixed','cameraFixed'],['chase','cameraChase']].map(([mode,key]) => <button type="button" key={mode} className={demoCameraMode === mode ? 'selected' : ''} onClick={() => setDemoCameraMode(mode)}>{t(key)}</button>)}</div>}<div className="demo-options"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}>GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}>TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><label className="model-opacity"><span>MODEL</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="demo-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}>EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET</button></div></div>
          </div>
          {activePanel === 'analysis' && <aside className="analysis-panel"><div className="collab-heading"><div><span>DEMO ANALYSIS</span><h2>{t('analysis')}</h2></div><button type="button" disabled={!analysisSelectedPlayers.length || !analysisRows.length} onClick={() => setAnalysisPlaying((playing) => !playing)}>{analysisPlaying ? t('pause') : t('play')}</button></div><p className="collab-note">{t('analysisHint')}</p>{analysisStatus && <div className="analysis-status">{analysisStatus}</div>}<label className="analysis-select"><span>{t('players').toUpperCase()}</span><select multiple size={Math.min(8, Math.max(3, analysisPlayers.length))} value={analysisSelectedPlayers} onChange={(event) => { setAnalysisSelectedPlayers([...event.target.selectedOptions].map((option) => option.value)); setAnalysisTime(0); setAnalysisPlaying(false); }}>{analysisPlayers.map((player) => <option key={player} value={player}>{player}</option>)}</select></label>{analysisSelectedPlayers.length > 0 && <label className="analysis-side"><span>{t('side').toUpperCase()}</span><select value={analysisSide} onChange={(event) => { setAnalysisSide(event.target.value); setAnalysisTime(0); setAnalysisPlaying(false); }}><option value="ALL">{t('allRounds')}</option><option value="T">{t('tRounds')}</option><option value="CT">{t('ctRounds')}</option></select></label>}{analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}</aside>}
          {activePanel === 'collab' && <aside className="collab-panel"><div className="collab-heading"><div><span>COLLABORATION</span><h2>{t('collab')}</h2></div><div className="collab-actions"><button type="button" onClick={saveWorkspaceArchive}>{t('saveFrame')}</button>{roomCode ? <button type="button" onClick={leaveRoom}>{t('leaveRoom')}</button> : <button type="button" onClick={() => { const code = window.prompt(t('roomPrompt'), roomJoinCode); if (code != null) { setRoomJoinCode(code); joinRoom(code); } }}>{t('joinRoom')}</button>}<button type="button" disabled={Boolean(roomCode)} onClick={openRoom}>{t('openRoom')}</button></div></div><p className="collab-note">{t('currentMap')}: {mapName} · {t('name')}: {clientName.current}<br />{t('collabHint')}</p>{roomStatus && <div className="analysis-status">{roomStatus}</div>}{roomCode && <div className="room-open"><strong>{t('room')} {roomCode}</strong><span>{roomOwner ? t('owner') : t('member')}</span></div>}<div className="archive-list">{archives.filter((archive) => archive.mapName === mapName).length === 0 ? <div className="archive-empty">{t('noArchives')}</div> : archives.filter((archive) => archive.mapName === mapName).map((archive) => <div className="archive-item" key={archive.id}><button type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t('guestNoArchive') : t('restoreArchive')} onClick={() => restoreWorkspaceArchive(archive)}><strong>{archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span><small>{archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t('manualEdit')}</small></button><button type="button" className="archive-delete" aria-label={t('deleteArchive')} title={t('deleteArchive')} onClick={() => deleteWorkspaceArchive(archive.id)}>×</button></div>)}</div></aside>}
       {activePanel === 'analysis' && demoData && <div className="analysis-view-options"><span>{t('heatmap')}</span><button type="button" className={demoViewFlags.killerHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, killerHeat: !flags.killerHeat }))}>{t('killerPosition')}</button><button type="button" className={demoViewFlags.victimHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, victimHeat: !flags.victimHeat }))}>{t('victimPosition')}</button><button type="button" className={demoViewFlags.targetHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, targetHeat: !flags.targetHeat }))}>{t('targetPosition')}</button><button type="button" className={demoViewFlags.opponentHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, opponentHeat: !flags.opponentHeat }))}>{t('opponentPosition')}</button></div>}
     </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
