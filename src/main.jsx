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
  },
  en: {
    rounds: 'Round Replay', analysis: 'Analysis', collab: 'Collaboration', utilityNotes: 'Utility Notes', loaded: 'Reference Data Loaded', recentKills: 'Recent Kills', expand: 'Expand', collapse: 'Collapse', cameraPositions: 'Camera Positions', view: 'View', showNames: 'Show Names', selectRound: 'Select a round', round: 'Round', multiDemo: 'Demo Files', chooseDemo: 'Choose Files', multiPartHint: 'Multi-part selection supported', noFileChosen: 'No files selected', play: 'Play', pause: 'Pause', loading: 'Load', allRounds: 'All Rounds', tRounds: 'T Rounds', ctRounds: 'CT Rounds', analysisHint: 'Selected players are overlaid from freeze end across all rounds.', heatmap: 'Heatmap', killerPosition: 'Killer Position', victimPosition: 'Victim Position', targetPosition: 'Target Position', opponentPosition: 'Opponent Position', saveFrame: 'Save Frame', leaveRoom: 'Leave Room', joinRoom: 'Join Room', openRoom: 'Open Room', roomPrompt: 'Enter 6-digit room code', currentMap: 'Current map', name: 'Name', collabHint: 'Saves the map, camera presets, tactical edits and current Demo frame. The Demo file is not stored.', owner: 'Owner', member: 'Member', noArchives: 'No local archives', guestNoArchive: 'Room members cannot switch archives', restoreArchive: 'Restore archive', deleteArchive: 'Delete archive', manualEdit: 'Manual map edit', room: 'Room', roomOpened: 'opened', roomDestroyed: 'Room destroyed', roomLeft: 'Left room', roomExited: 'Disconnected from room', joiningRoom: 'Joining room', joinedRoom: 'Joined room', connected: 'connected', connecting: 'connecting', disconnected: 'disconnected', analysisReady: 'Full-match movement data ready', analysisLoading: 'Reading full-match movement data...', parseFailed: 'Parse failed', combiningParts: 'Combining {count} Demo parts...', readingDemo: 'Reading Demo file...', smoke: 'SMK', fire: 'FIRE', flash: 'FL', grenade: 'HE', decoy: 'DEC', c4Planted: 'C4 planted', c4Exploded: 'C4 exploded', roundEnd: 'Round ended', world: 'WORLD', unknown: 'UNKNOWN', language: '中文', tacticalPoint: 'Tactical Point', team: 'Team', type: 'Type', delete: 'Delete', map: 'Map', reset: 'Reset', players: 'Players', side: 'Side', model: 'Model', c4Paused: 'DEFUSED', noGrenades: '-', addUtilityNote: 'Add Note', utilityIntro: 'Run getpos in the CS2 console and paste its output here. One position can store multiple angles.', utilityEmpty: 'No utility notes for this map', getposOutput: 'getpos output', utilityName: 'Utility name', throwSummary: 'Throw summary', getposPlaceholder: 'setpos 123 456 78;setang -12 90 0', utilityNamePlaceholder: 'Example: A Long cross smoke', throwSummaryPlaceholder: 'Example: Hug the wall, standing throw', cancel: 'Cancel', add: 'Add', invalidGetpos: 'Could not parse getpos. Include setpos and setang values.', position: 'Position', angles: 'Angles', localOnly: 'Stored only in this browser', utilityCount: '{count} notes',
  },
};

const translate = (language, key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), messages[language][key] || key);

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
    return { ...next, health: amount < 0.5 ? player.health : next.health, position: { x: THREE.MathUtils.lerp(player.position.x, next.position.x, amount), y: THREE.MathUtils.lerp(player.position.y, next.position.y, amount), z: THREE.MathUtils.lerp(player.position.z, next.position.z, amount) }, yaw: THREE.MathUtils.lerp(player.yaw, next.yaw, amount), pitch: THREE.MathUtils.lerp(player.pitch, next.pitch, amount), duckAmount: THREE.MathUtils.lerp(player.duckAmount || 0, next.duckAmount || 0, amount) };
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

function ThreeBoard({ mapName, navData, showEdges, showGrid, showModel, modelOpacity, modelViewMode, trackpadDetection, showDemoNames, demoSnapshot, demoTick, demoFires, demoGrenades, demoProjectiles, demoDeaths, demoC4Events, utilityNotes, utilityNotesEnabled, onUtilityHover, heatDeaths, demoViewFlags, analysisRows, analysisSelectedPlayers, analysisSide, analysisEnabled, analysisRounds, analysisTime, deletePointId, pointUpdate, onPointSelect, onGrenadeWheel, onCameraSlots, onReady }) {
  const mountRef = useRef(null);
  const edgesRef = useRef(null);
  const modelModeRef = useRef(null);
  const navFocusRef = useRef(null);
  const navGroupRef = useRef(null);
  const gridRef = useRef(null);
  const modelRef = useRef(null);
  const modelBasePositionRef = useRef(null);
  const demoSnapshotRef = useRef(demoSnapshot);
  const demoTickRef = useRef(demoTick);
  const demoFiresRef = useRef(demoFires);
  const demoGrenadesRef = useRef(demoGrenades);
  const demoProjectilesRef = useRef(demoProjectiles);
  const demoDeathsRef = useRef(demoDeaths || []);
  const demoC4EventsRef = useRef(demoC4Events || []);
  const heatDeathsRef = useRef(heatDeaths || []);
  const demoViewFlagsRef = useRef(demoViewFlags || {});
  const showDemoNamesRef = useRef(showDemoNames);
  const hoveredDemoPlayerRef = useRef(null);
  const utilityNotesRef = useRef(utilityNotes || []);
  const utilityNotesEnabledRef = useRef(utilityNotesEnabled);
  const utilityHoverRef = useRef(onUtilityHover);
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
  demoTickRef.current = demoTick;
  demoFiresRef.current = demoFires;
  demoGrenadesRef.current = demoGrenades;
  demoProjectilesRef.current = demoProjectiles;
  demoDeathsRef.current = demoDeaths || [];
  demoC4EventsRef.current = demoC4Events || [];
  heatDeathsRef.current = heatDeaths || [];
  demoViewFlagsRef.current = demoViewFlags || {};
  showDemoNamesRef.current = showDemoNames;
  utilityNotesRef.current = utilityNotes || utilityRuntime.notes;
  utilityNotesEnabledRef.current = utilityNotesEnabled ?? utilityRuntime.enabled;
  utilityHoverRef.current = onUtilityHover || utilityRuntime.onHover;
  analysisRowsRef.current = analysisRows || [];
  analysisSelectedPlayersRef.current = analysisSelectedPlayers || [];
  analysisEnabledRef.current = analysisEnabled;
  analysisRoundsRef.current = analysisRounds || [];
  analysisTimeRef.current = analysisTime || 0;
  analysisSideRef.current = analysisSide || 'ALL';
  useEffect(() => {
    const byEntity = new Map();
    demoProjectiles.forEach((projectile) => {
      if (!byEntity.has(projectile.entity_id)) byEntity.set(projectile.entity_id, []);
      byEntity.get(projectile.entity_id).push(projectile);
    });
    const groups = new Map();
    byEntity.forEach((records, entityId) => {
      records.sort((left, right) => left.tick - right.tick);
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
    demoProjectileGroupsRef.current = groups;
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
           const standingBody = new THREE.Group();
           standingBody.userData.demoStandingBody = true;
           const standingTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.82, 16), bodyMaterial);
           standingTorso.position.y = 0.52;
           const standingHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), bodyMaterial);
           standingHead.position.y = 1.1;
           standingBody.add(standingTorso, standingHead);
           const crouchedBody = new THREE.Group();
           crouchedBody.userData.demoCrouchedBody = true;
           const crouchedTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.38, 0.58, 16), bodyMaterial);
           crouchedTorso.position.y = 0.36;
           const crouchedHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), bodyMaterial);
           crouchedHead.position.y = 0.78;
           crouchedBody.add(crouchedTorso, crouchedHead);
           marker.add(standingBody, crouchedBody);
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
           marker.add(label);
        }
        marker.position.set(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z);
        updateTacticalPoint(marker, displaySide, 'T');
        const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
        marker.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : marker.rotation.y;
         marker.userData.demoPitch = player.pitch || 0;
         marker.userData.demoYaw = player.yaw || 0;
         const duckAmount = THREE.MathUtils.clamp(player.duckAmount || 0, 0, 1);
         const standingBody = marker.children.find((child) => child.userData.demoStandingBody);
         const crouchedBody = marker.children.find((child) => child.userData.demoCrouchedBody);
         if (standingBody) standingBody.visible = duckAmount < 0.5;
         if (crouchedBody) crouchedBody.visible = duckAmount >= 0.5;
         const nameLabel = marker.children.find((child) => child.userData.demoNameLabel);
         if (nameLabel) nameLabel.visible = Boolean(showDemoNamesRef.current || hoveredDemoPlayerRef.current === player.name);
          const aimRay = marker.children.find((child) => child.userData.aimRay);
          if (aimRay) {
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
            marker.userData.aimTarget?.position.copy(new THREE.Vector3(0, 0.15, -length).applyEuler(aimRay.rotation).add(origin));
         }
         if (!marker.userData.muzzleFlash) {
          marker.userData.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true }));
          marker.userData.muzzleFlash.position.set(0, 0.28, -0.42);
          marker.add(marker.userData.muzzleFlash);
        }
        const firing = demoFiresRef.current.some((event) => event.user_name === player.name && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 8);
        marker.userData.muzzleFlash.visible = firing;
        marker.userData.muzzleFlash.scale.setScalar(firing ? 1 + Math.sin(performance.now() * 0.04) * 0.35 : 0.01);
        marker.visible = player.health > 0;
      });
      demoMarkers.forEach((marker, name) => { if (!activeNames.has(name)) marker.visible = false; });
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
          const yaw = THREE.MathUtils.lerp(current.yaw || 0, next.yaw || 0, amount);
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
      const groups = new Map();
      notes.forEach((note) => { const key = utilityPositionKey(note.position); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(note); });
      groups.forEach((entries, key) => {
        const [sourceX, sourceY, sourceZ] = entries[0].position;
        const marker = new THREE.Group();
        marker.position.set(sourceY * 0.0254 - modelCenter.x, sourceZ * 0.0254 - modelCenter.y + 0.05, sourceX * 0.0254 - modelCenter.z);
        marker.userData.utilityPositionKey = key;
        marker.userData.utilityEntries = entries;
        const material = new THREE.MeshStandardMaterial({ color: '#c58cff', emissive: '#30134e', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.12, depthTest: true, depthWrite: false });
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 20), material);
        pin.position.y = 0.34;
        pin.rotation.x = Math.PI;
        pin.userData.utilityMarker = true;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#dfb8ff', transparent: true, opacity: 0.8, depthWrite: false }));
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.06;
        halo.userData.utilityMarker = true;
        marker.add(pin, halo);
        entries.forEach((note) => {
          const [pitch, yaw] = note.angles;
          const pitchRadians = THREE.MathUtils.degToRad(pitch);
          const yawRadians = THREE.MathUtils.degToRad(yaw);
          const direction = new THREE.Vector3(Math.sin(yawRadians) * Math.cos(pitchRadians), -Math.sin(pitchRadians), Math.cos(yawRadians) * Math.cos(pitchRadians)).normalize();
          const origin = new THREE.Vector3(0, 1.62, 0);
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, direction.multiplyScalar(6).add(origin)]), new THREE.LineBasicMaterial({ color: '#d8a7ff', transparent: true, opacity: 0.68, depthTest: true, depthWrite: false }));
          line.userData.utilityRay = true;
          marker.add(line);
        });
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
      const detonations = grenadeEvents.filter((event) => event.event_name.endsWith('_detonate') || event.event_name === 'inferno_startburn');
      if (!demoProjectilesRef.current.length) grenadeEvents.filter((event) => event.event_name === 'grenade_thrown' && event.user_X != null).forEach((event) => {
         const landingName = event.weapon?.includes('smoke') ? 'smokegrenade_detonate' : event.weapon?.includes('flash') ? 'flashbang_detonate' : event.weapon?.includes('hegrenade') ? 'hegrenade_detonate' : event.weapon?.includes('decoy') ? 'decoy_started' : 'inferno_startburn';
        const landing = detonations.find((candidate) => candidate.event_name === landingName && candidate.user_steamid === event.user_steamid && candidate.tick > event.tick && candidate.tick - event.tick < 640);
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
    c4Trajectory.visible = false;
    scene.add(c4Trajectory);
    c4Group.add(c4Block, c4Wave);
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
      const progress = ((tick - event.tick) % 64) / 64;
      const range = planted ? 2 : 1;
      c4Wave.scale.setScalar((0.35 + progress * 1.65) * range);
      c4Wave.material.color.set(planted ? '#ff3b30' : '#ffd166');
      c4Wave.material.opacity = 0.75 * (1 - progress);
    };
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(17, 23, 25);
    const controls = new OrbitControls(camera, renderer.domElement);
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
    const cameraSlots = Array.from({ length: 9 }, (_, index) => {
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
      const numberSlot = Number.parseInt(event.key, 10) - 1;
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
        controls.enabled = true;
        return;
      }
      if (event.button !== 0 || !pointPointerTarget) return;
      const distance = pointPointerStart.distanceTo(pointerPosition(event));
       if (performance.now() - pointPointerTime < 450 && distance < 0.03) { const projected = pointPointerTarget.position.clone().project(camera); pointSelectRef.current?.(pointPointerTarget.userData.pointId, { x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth, y: (-projected.y * 0.5 + 0.5) * renderer.domElement.clientHeight }); }
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
      updateDemoPlayers();
      updateDemoDeaths();
      updateDeathHeat();
      updateAnalysis();
      updateUtilityNotes();
      updateDemoGrenades();
      updateC4();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate(performance.now());
     return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); renderer.domElement.removeEventListener('wheel', onWheel); renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('contextmenu', onContextMenu); controls.dispose(); [...new Set([...grenadeEffects, grenadePreview, activeGrenade].filter(Boolean))].forEach(disposeGrenadeEffect); demoGrenadeObjectsRef.current.forEach((effect) => { scene.remove(effect); disposeGrenadeEffect(effect); }); demoGrenadeObjectsRef.current.clear(); [...pointsRef.current, previewPoint].filter(Boolean).forEach((point) => point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); })); pathLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); scene.remove(line); }); pathLines.length = 0; pointsRef.current = []; gridRef.current = null; modelRef.current = null; modelBasePositionRef.current = null; navFocusRef.current = null; navGroupRef.current = null; demoPlayersRef.current = null; demoMarkers.forEach((marker) => marker.traverse((object) => object.material?.dispose())); demoDeathMarkers.forEach((marker) => { marker.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); scene.remove(marker); }); analysisPaths.forEach((item) => { item.line.geometry.dispose(); item.line.material.dispose(); item.marker.geometry.dispose(); item.marker.material.dispose(); }); analysisGroup.removeFromParent(); if (nav) { nav.geometry.dispose(); nav.edgeGeometry.dispose(); nav.mesh.material.dispose(); nav.edgeLines.material.dispose(); nav.distanceField?.texture?.dispose(); } if (worldModel) scene.remove(worldModel); renderer.dispose(); mount.removeChild(renderer.domElement); };
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
  const [showModel, setShowModel] = useState(false);
  const [modelOpacity, setModelOpacity] = useState(0);
  const [modelViewMode, setModelViewMode] = useState(0);
  const [trackpadDetection, setTrackpadDetection] = useState(true);
  const [demoData, setDemoData] = useState(null);
  const [demoTick, setDemoTick] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoStatus, setDemoStatus] = useState('');
  const [demoKillsCollapsed, setDemoKillsCollapsed] = useState(false);
  const [demoViewFlags, setDemoViewFlags] = useState({ deathVictim: true, deathKiller: true, killerHeat: false, victimHeat: false, targetHeat: false, opponentHeat: false });
  const [showDemoNames, setShowDemoNames] = useState(false);
  const [demoSnapshots, setDemoSnapshots] = useState([]);
  const [demoProjectiles, setDemoProjectiles] = useState([]);
  const [demoRound, setDemoRound] = useState(null);
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
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modelModeLabels = ['REACHABLE SURFACE', 'MOUSE LENS', 'CAMERA LENS'];
  const modeOptions = [{ label: 'MODEL OFF', value: -1 }, ...modelModeLabels.map((label, value) => ({ label, value }))];
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedPointScreen, setSelectedPointScreen] = useState(null);
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdate] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const [cameraSlotState, setCameraSlotState] = useState(Array(9).fill(false));
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);
  const [activePanel, setActivePanel] = useState('demo');
  const [utilityNotes, setUtilityNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('csboard-utility-notes') || '[]'); } catch { return []; } });
  const [utilityModalOpen, setUtilityModalOpen] = useState(false);
  const [utilityDraft, setUtilityDraft] = useState({ getpos: '', name: '', summary: '' });
  const [utilityError, setUtilityError] = useState('');
  const [utilityHover, setUtilityHover] = useState(null);
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
    if (panel === 'analysis') setAnalysisTime(0);
    if (panel === 'demo' && activePanel === 'collab') boardRef.current?.clearWorkspaceState?.();
    if (panel !== 'collab' && roomCode) { const wasOwner = roomOwner; leaveRoom(); window.alert(wasOwner ? t('roomDestroyed') : t('roomExited')); }
    if (panel !== 'utility') { setUtilityModalOpen(false); setUtilityHover(null); setUtilityError(''); }
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
  const restoreWorkspaceArchive = (archive) => {
    if (roomCode && !roomOwner) return;
    if (archive.mapName !== mapName) { pendingArchiveRef.current = archive; setMapName(archive.mapName); } else boardRef.current?.restoreWorkspaceState?.(archive.workspace);
    if (archive.demo && demoData?.demo.fileName === archive.demo.fileName) { const round = demoData.rounds.find((item) => item.round === archive.demo.round); if (round) setDemoRound(round); setDemoTick(archive.demo.tick); }
    if (roomDocRef.current && roomOwner) { const doc = roomDocRef.current; const room = doc.getMap('room'); const points = doc.getMap('points'); const paths = doc.getMap('paths'); doc.transact(() => { points.clear(); paths.clear(); archive.workspace.points?.forEach((point) => points.set(point.id, point)); archive.workspace.paths?.forEach((path) => paths.set(path.join(':'), path)); room.set('mapName', archive.mapName); room.set('cameraSlots', archive.workspace.cameraSlots || []); room.set('workspace', roomWorkspace(archive.workspace, archive.workspace.cameraSlots)); room.set('revision', Number(room.get('revision') || 0) + 1); }); }
  };
  const selectedMode = showModel ? modelViewMode : -1;
  const currentUtilityNotes = utilityNotes.filter((note) => note.mapName === mapName);
  utilityRuntime.notes = currentUtilityNotes;
  utilityRuntime.enabled = activePanel === 'utility';
  utilityRuntime.onHover = setUtilityHover;
  const demoSnapshot = demoRound && (demoTick < demoRound.startTick || demoTick > demoRound.endTick) ? null : interpolateDemoSnapshot(demoSnapshots, demoTick);
  const demoTeams = { T: demoSnapshot?.players.filter((player) => player.team === 2) || [], CT: demoSnapshot?.players.filter((player) => player.team === 3) || [] };
  const demoScore = { T: demoTeams.T[0]?.score || 0, CT: demoTeams.CT[0]?.score || 0 };
  const demoKills = activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick).slice(-5) || [] : [];
  const demoDeaths = demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick) || [];
  const demoC4Events = demoData?.events?.filter((event) => demoRound && ['bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_exploded', 'bomb_defused', 'round_end'].includes(event.event_name) && event.tick >= demoRound.startTick && event.tick <= demoRound.endTick) || [];
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
      if (event.data.type === 'diagnostic') console.info('Demo parser diagnostic:', event.data.phase, event.data.data);
       if (event.data.type === 'loaded') { setDemoData(event.data.data); setDemoRound(null); setDemoTick(0); setDemoSnapshots([]); setDemoProjectiles([]); setDemoRoundLoading(false); setDemoPlaying(false); }
       if (event.data.type === 'analysis') { const rows = event.data.rows || []; const players = [...new Set(rows.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))].sort(); setAnalysisRows(rows); setAnalysisPlayers(players); setAnalysisSelectedPlayers((selected) => selected.filter((name) => players.includes(name))); setAnalysisStatus(translate(currentLanguage, 'analysisReady')); }
       if (event.data.type === 'error') { setDemoStatus(`${translate(currentLanguage, 'parseFailed')}: ${event.data.message}`); console.error('Demo parse failed:', event.data.message, event.data.diagnostic); }
    };
    demoWorkerRef.current = worker;
    return () => worker.terminate();
  }, []);
  useEffect(() => {
    if (activePanel !== 'analysis' || !demoData || analysisLoadedFor === demoData.demo.fileName) return;
    setAnalysisStatus(t('analysisLoading'));
    setAnalysisLoadedFor(demoData.demo.fileName);
    demoWorkerRef.current?.postMessage({ type: 'analysis', rounds: demoData.rounds });
  }, [activePanel, demoData, analysisLoadedFor]);
  const loadDemo = async (event) => {
    const files = [...(event.target.files || [])].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    if (files.length === 0) return;
     setDemoData(null);
     setDemoSnapshots([]);
     setDemoProjectiles([]);
     setAnalysisRows([]);
     setAnalysisPlayers([]);
     setAnalysisSelectedPlayers([]);
     setAnalysisLoadedFor('');
     setAnalysisPlaying(false);
     setAnalysisTime(0);
     setDemoStatus(files.length > 1 ? t('combiningParts', { count: files.length }) : t('readingDemo'));
    const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
    demoWorkerRef.current?.postMessage({ type: 'load', fileName: files.map((file) => file.name).join(' + '), buffers }, buffers);
  };
  useEffect(() => {
    if (!demoRound || !demoData) return;
    const cached = demoData.roundData?.find((item) => item.round === demoRound.round);
    setDemoTick(demoRound.startTick);
    setDemoSnapshots(cached?.snapshots || []);
    setDemoProjectiles(cached?.projectiles || []);
    setDemoRoundLoading(false);
    setDemoPlaying(false);
  }, [demoRound, demoData]);
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
    window.addEventListener('keydown', onDemoKeyDown);
    return () => window.removeEventListener('keydown', onDemoKeyDown);
  }, [activePanel, analysisRows.length, analysisSelectedPlayers.length, demoData, demoRound, demoRoundLoading]);
  useEffect(() => {
    let cancelled = false;
    setNavData(mapName === 'de_dust2' ? fallbackNavData : null);
    fetch(`/api/maps/${mapName}/nav`).then((response) => response.json()).then((data) => { if (!cancelled && data.areas) setNavData(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapName]);
  return <main className="board-shell">
    <header className="board-header">
      <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>CS<span>BOARD</span></span></div>
       <nav className="topbar-panels"><button type="button" className={activePanel === 'demo' ? 'active' : ''} onClick={() => switchPanel('demo')}>{t('rounds')}</button><button type="button" className={activePanel === 'analysis' ? 'active' : ''} onClick={() => switchPanel('analysis')}>{t('analysis')}</button><button type="button" className={activePanel === 'utility' ? 'active' : ''} onClick={() => switchPanel('utility')}>{t('utilityNotes')}</button><button type="button" className={activePanel === 'collab' ? 'active' : ''} onClick={() => switchPanel('collab')}>{t('collab')}</button></nav>
       <button type="button" className="language-switch" onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')}>{t('language')}</button><div className="header-status"><i /> {t('loaded')}</div>
    </header>
    <section className="board-stage">
       <ThreeBoard key={`${mapName}-${navData ? navData.version : 'loading'}`} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelOpacity={modelOpacity} modelViewMode={modelViewMode} trackpadDetection={trackpadDetection} showDemoNames={showDemoNames} demoSnapshot={activePanel === 'demo' ? demoSnapshot : null} demoTick={demoTick} demoFires={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'weapon_fire') || [] : []} demoGrenades={activePanel === 'demo' ? demoData?.events?.filter((event) => ['grenade_thrown', 'smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate'].includes(event.event_name)) || [] : []} demoProjectiles={activePanel === 'demo' ? demoProjectiles : []} demoDeaths={activePanel === 'demo' ? demoDeaths : []} demoC4Events={activePanel === 'demo' ? demoC4Events : []} heatDeaths={activePanel === 'analysis' ? demoData?.events?.filter((event) => event.event_name === 'player_death') || [] : []} demoViewFlags={demoViewFlags} analysisRows={analysisRows} analysisSelectedPlayers={analysisSelectedPlayers} analysisSide={analysisSide} analysisEnabled={activePanel === 'analysis'} analysisRounds={demoData?.rounds || []} analysisTime={analysisTime} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={onPointSelect} onGrenadeWheel={setGrenadeWheel} onCameraSlots={onCameraSlots} onReady={onReady} />
       <div className="stage-vignette" />
       {activePanel === 'demo' && demoSnapshot && <div className="demo-score"><span>T</span><strong>{demoScore.T}</strong><i>ROUND {demoRound?.round || '-'}{c4Countdown != null && <b className={c4Terminal?.event_name === 'bomb_defused' && demoTick >= c4Terminal.tick ? 'c4-paused' : ''}>C4 {c4Countdown.toFixed(4)}s</b>}</i><strong>{demoScore.CT}</strong><span>CT</span></div>}
       <div className="map-name"><span>01</span><h1>{mapName.toUpperCase()}</h1></div>
       {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>{t('smoke')}</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>{t('fire')}</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>{t('flash')}</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>{t('grenade')}</div><span className="wheel-key">Q</span></div>}
         {demoKills.length > 0 && <div className={`demo-kills hud-left${demoKillsCollapsed ? ' collapsed' : ''}`}><div className="demo-kills-heading"><span>{t('recentKills')}</span><button type="button" onClick={() => setDemoKillsCollapsed((collapsed) => !collapsed)}>{demoKillsCollapsed ? t('expand') : t('collapse')}</button></div>{demoKills.map((kill) => <div className="demo-kill" key={`${kill.tick}-${kill.user_steamid}`}><small>{((kill.tick - demoRound.startTick) / 64).toFixed(1)}s</small><b>{kill.attacker_name || t('world')}{kill.assister_name ? ` + ${kill.assister_name}` : ''}</b><i>{kill.weapon || 'KILL'}{kill.headshot ? ' · HS' : ''}{kill.thrusmoke ? ' · SMOKE' : ''}{kill.attackerblind ? ' · BLIND' : ''}</i><strong>→ {kill.user_name || t('unknown')}</strong></div>)}</div>}
        <div className="hud hud-right"><span>VIEW CONTROLS</span><strong>MMB <em>ROTATE</em></strong><strong>SHIFT + MMB <em>PAN</em></strong><strong>SCROLL <em>ZOOM</em></strong><strong>WASD <em>MOVE</em></strong><strong>LEFT CLICK <em>POINT MENU</em></strong></div>
         <div className="camera-slots"><span>{t('cameraPositions')}</span>{cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved} className={activeCameraSlot === index ? 'active' : ''} onClick={() => boardRef.current?.restoreCameraSlot?.(index)}>{index + 1}</button>)}</div>
         {activePanel === 'demo' && demoSnapshot && <><div className="team-roster team-roster-t"><span>T SIDE</span>{demoTeams.T.map((player) => <div className={`roster-player${player.health > 0 ? '' : ' dead'}${player.hasC4 ? ' has-c4' : ''}`} key={player.steamid || player.name}><strong>{player.name}</strong><b>{Math.max(0, player.health || 0)} HP</b><small>{playerGrenades(player.inventory, language)}</small><em>{String(player.activeWeapon || '-').replace(/^weapon_/, '').toUpperCase()}</em></div>)}</div><div className="team-roster team-roster-ct"><span>CT SIDE</span>{demoTeams.CT.map((player) => <div className={`roster-player${player.health > 0 ? '' : ' dead'}${player.hasC4 ? ' has-c4' : ''}`} key={player.steamid || player.name}><strong>{player.name}</strong><b>{Math.max(0, player.health || 0)} HP</b><small>{playerGrenades(player.inventory, language)}</small><em>{String(player.activeWeapon || '-').replace(/^weapon_/, '').toUpperCase()}</em></div>)}</div></>}
         {selectedPoint && selectedPointScreen && <div className="point-actions" style={{ left: selectedPointScreen.x, top: selectedPointScreen.y }}><span>{t('tacticalPoint')}</span><div className="point-choice"><b>{t('team')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div><div className="point-choice"><b>{t('type')}</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'X' })}>X</button></div><button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); setSelectedPointScreen(null); }}>{t('delete')}</button></div>}
        <div className="board-tools"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}><i /> TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)} className={showModel ? 'selected' : ''}><i /> {modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) setShowModel(false); else { setShowModel(true); setModelViewMode(option.value); } setModeMenuOpen(false); }} /> <span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}><i /> AREA EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET VIEW</button></div>
         {activePanel === 'utility' && <aside className="utility-notes-panel"><div className="utility-notes-heading"><div><span>UTILITY NOTES</span><h2>{t('utilityNotes')}</h2></div><button type="button" onClick={() => { setUtilityDraft({ getpos: '', name: '', summary: '' }); setUtilityError(''); setUtilityModalOpen(true); }}>{t('addUtilityNote')}</button></div><p>{t('utilityIntro')}</p><div className="utility-notes-meta"><label className="map-select"><span>{t('map').toUpperCase()}</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><span>{t('utilityCount', { count: currentUtilityNotes.length })}</span></div>{currentUtilityNotes.length === 0 && <div className="utility-empty">{t('utilityEmpty')}</div>}<small>{t('localOnly')}</small></aside>}
         {activePanel === 'utility' && utilityHover && <div className="utility-hover-card" style={{ left: utilityHover.x, top: utilityHover.y }}><header><strong>LOCATION</strong><span>{utilityHover.entries.length}</span></header><div className="utility-hover-list">{utilityHover.entries.map((note) => <article key={note.id}><strong>{note.name}</strong><span>{t('angles')}: {note.angles.map((value) => value.toFixed(2)).join(' / ')}</span><p>{note.summary}</p></article>)}</div></div>}
         {utilityModalOpen && <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setUtilityModalOpen(false); }}><form className="utility-modal" onSubmit={addUtilityNote}><header><div><span>GETPOS</span><h2>{t('addUtilityNote')}</h2></div><button type="button" onClick={() => setUtilityModalOpen(false)}>×</button></header><label><span>{t('getposOutput')}</span><textarea required value={utilityDraft.getpos} placeholder={t('getposPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, getpos: event.target.value }))} /></label><label><span>{t('utilityName')}</span><input required value={utilityDraft.name} placeholder={t('utilityNamePlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, name: event.target.value }))} /></label><label><span>{t('throwSummary')}</span><textarea required value={utilityDraft.summary} placeholder={t('throwSummaryPlaceholder')} onChange={(event) => setUtilityDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>{utilityError && <div className="utility-error">{utilityError}</div>}<footer><button type="button" onClick={() => setUtilityModalOpen(false)}>{t('cancel')}</button><button type="submit">{t('add')}</button></footer></form></div>}
         <div className={`demo-panel ${activePanel === 'demo' ? '' : 'panel-hidden'}`}>
          <div className="demo-toolbar">
             <label className="demo-upload"><span>{t('multiDemo')}</span><input type="file" accept=".dem" multiple onChange={loadDemo} /><b>{t('chooseDemo')}</b><small>{demoData?.demo.fileName || t('noFileChosen')} · {t('multiPartHint')}</small></label>
            {demoStatus && <span className="demo-status">{demoStatus}</span>}
             <button type="button" className="demo-save-frame" onClick={() => saveWorkspaceArchive(true)}>{t('saveFrame')}</button>{demoData && <>
              <label className="demo-round"><span>{t('round').toUpperCase()}</span><select value={demoRound?.round || ''} onChange={(event) => setDemoRound(demoData.rounds.find((round) => String(round.round) === event.target.value) || null)}><option value="">{t('selectRound')}</option>{demoData.rounds.map((round) => <option key={round.round} value={round.round}>{t('round')} {round.round}</option>)}</select></label>
              {demoRound && <button type="button" className="demo-play" disabled={demoRoundLoading} onClick={() => setDemoPlaying((playing) => !playing)}>{demoRoundLoading ? t('loading') : demoPlaying ? t('pause') : t('play')}</button>}
              <span className="demo-name">{demoData.demo.map} / {demoData.demo.fileName}</span>
            </>}
          </div>
             {activePanel === 'demo' && demoData && <div className="demo-view-options"><span>{t('view')}</span><button type="button" className={showDemoNames ? 'selected' : ''} onClick={() => setShowDemoNames((value) => !value)}>{t('showNames')}</button></div>}
           {demoStatus && !demoData && <div className="demo-loading" aria-label="Demo parsing in progress"><i /></div>}
          {demoData && demoRound && <div className="demo-scrub"><span className="demo-time">{((demoTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span><div className="timeline-track"><input className="demo-timeline" disabled={demoRoundLoading} style={{ '--timeline-progress': `${demoRound.endTick > demoRound.startTick ? ((demoTick - demoRound.startTick) / (demoRound.endTick - demoRound.startTick)) * 100 : 0}%` }} type="range" min={demoRound.startTick} max={demoRound.endTick} step="1" value={demoTick} onPointerUp={(event) => event.currentTarget.blur()} onChange={(event) => { setDemoPlaying(false); setDemoTick(Number(event.target.value)); }} />{timelineEvents.map((event, index) => <button type="button" className={`timeline-event event-${event.event_name}`} title={event.title} aria-label={event.title} style={{ left: `${((event.tick - demoRound.startTick) / Math.max(1, demoRound.endTick - demoRound.startTick)) * 100}%` }} key={`${event.event_name}-${event.tick}-${index}`} onClick={() => { setDemoPlaying(false); setDemoTick(event.tick); }}>{event.label}</button>)}</div><span className="demo-duration">/ {((demoRound.endTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span></div>}
           <div className="demo-options"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}>GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}>TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><label className="model-opacity"><span>MODEL</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="demo-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}>EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET</button></div>
          </div>
          {activePanel === 'analysis' && <aside className="analysis-panel"><div className="collab-heading"><div><span>DEMO ANALYSIS</span><h2>{t('analysis')}</h2></div><button type="button" disabled={!analysisSelectedPlayers.length || !analysisRows.length} onClick={() => setAnalysisPlaying((playing) => !playing)}>{analysisPlaying ? t('pause') : t('play')}</button></div><p className="collab-note">{t('analysisHint')}</p>{analysisStatus && <div className="analysis-status">{analysisStatus}</div>}<label className="analysis-select"><span>{t('players').toUpperCase()}</span><select multiple size={Math.min(8, Math.max(3, analysisPlayers.length))} value={analysisSelectedPlayers} onChange={(event) => { setAnalysisSelectedPlayers([...event.target.selectedOptions].map((option) => option.value)); setAnalysisTime(0); setAnalysisPlaying(false); }}>{analysisPlayers.map((player) => <option key={player} value={player}>{player}</option>)}</select></label>{analysisSelectedPlayers.length > 0 && <label className="analysis-side"><span>{t('side').toUpperCase()}</span><select value={analysisSide} onChange={(event) => { setAnalysisSide(event.target.value); setAnalysisTime(0); setAnalysisPlaying(false); }}><option value="ALL">{t('allRounds')}</option><option value="T">{t('tRounds')}</option><option value="CT">{t('ctRounds')}</option></select></label>}{analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}</aside>}
          {activePanel === 'collab' && <aside className="collab-panel"><div className="collab-heading"><div><span>COLLABORATION</span><h2>{t('collab')}</h2></div><div className="collab-actions"><button type="button" onClick={saveWorkspaceArchive}>{t('saveFrame')}</button>{roomCode ? <button type="button" onClick={leaveRoom}>{t('leaveRoom')}</button> : <button type="button" onClick={() => { const code = window.prompt(t('roomPrompt'), roomJoinCode); if (code != null) { setRoomJoinCode(code); joinRoom(code); } }}>{t('joinRoom')}</button>}<button type="button" disabled={Boolean(roomCode)} onClick={openRoom}>{t('openRoom')}</button></div></div><p className="collab-note">{t('currentMap')}: {mapName} · {t('name')}: {clientName.current}<br />{t('collabHint')}</p>{roomStatus && <div className="analysis-status">{roomStatus}</div>}{roomCode && <div className="room-open"><strong>{t('room')} {roomCode}</strong><span>{roomOwner ? t('owner') : t('member')}</span></div>}<div className="archive-list">{archives.filter((archive) => archive.mapName === mapName).length === 0 ? <div className="archive-empty">{t('noArchives')}</div> : archives.filter((archive) => archive.mapName === mapName).map((archive) => <div className="archive-item" key={archive.id}><button type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t('guestNoArchive') : t('restoreArchive')} onClick={() => restoreWorkspaceArchive(archive)}><strong>{archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span><small>{archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t('manualEdit')}</small></button><button type="button" className="archive-delete" aria-label={t('deleteArchive')} title={t('deleteArchive')} onClick={() => deleteWorkspaceArchive(archive.id)}>×</button></div>)}</div></aside>}
       {activePanel === 'analysis' && demoData && <div className="analysis-view-options"><span>{t('heatmap')}</span><button type="button" className={demoViewFlags.killerHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, killerHeat: !flags.killerHeat }))}>{t('killerPosition')}</button><button type="button" className={demoViewFlags.victimHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, victimHeat: !flags.victimHeat }))}>{t('victimPosition')}</button><button type="button" className={demoViewFlags.targetHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, targetHeat: !flags.targetHeat }))}>{t('targetPosition')}</button><button type="button" className={demoViewFlags.opponentHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, opponentHeat: !flags.opponentHeat }))}>{t('opponentPosition')}</button></div>}
     </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
