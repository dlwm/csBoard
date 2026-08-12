import { useEffect, useMemo, useRef, useState } from 'react';
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
    return { ...next, health: amount < 0.5 ? player.health : next.health, position: { x: THREE.MathUtils.lerp(player.position.x, next.position.x, amount), y: THREE.MathUtils.lerp(player.position.y, next.position.y, amount), z: THREE.MathUtils.lerp(player.position.z, next.position.z, amount) }, yaw: THREE.MathUtils.lerp(player.yaw, next.yaw, amount), pitch: THREE.MathUtils.lerp(player.pitch, next.pitch, amount) };
  }) };
}

function ThreeBoard({ mapName, navData, showEdges, showGrid, showModel, modelOpacity, modelViewMode, trackpadDetection, showDemoNames, demoSnapshot, demoTick, demoFires, demoGrenades, demoProjectiles, demoDeaths, heatDeaths, demoViewFlags, analysisRows, analysisSelectedPlayers, analysisSide, analysisEnabled, analysisRounds, analysisTime, deletePointId, pointUpdate, onPointSelect, onGrenadeWheel, onCameraSlots, onReady }) {
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
  const heatDeathsRef = useRef(heatDeaths || []);
  const demoViewFlagsRef = useRef(demoViewFlags || {});
  const showDemoNamesRef = useRef(showDemoNames);
  const hoveredDemoPlayerRef = useRef(null);
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
  heatDeathsRef.current = heatDeaths || [];
  demoViewFlagsRef.current = demoViewFlags || {};
  showDemoNamesRef.current = showDemoNames;
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
    const analysisGroup = new THREE.Group();
    const analysisPaths = new Map();
    let analysisSignature = '';
    scene.add(analysisGroup);
    scene.add(demoPlayers);
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
          demoPlayers.add(marker);
           demoMarkers.set(player.name, marker);
           const canvas = document.createElement('canvas');
           canvas.width = 512; canvas.height = 96;
           const context = canvas.getContext('2d');
           context.font = 'bold 34px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
           context.fillStyle = '#f2f7ee'; context.strokeStyle = '#08100b'; context.lineWidth = 8;
           context.strokeText(player.name, 256, 48); context.fillText(player.name, 256, 48);
           const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false }));
           label.scale.set(4.2, 0.78, 1); label.position.set(0, 2.8, 0); label.renderOrder = 30;
           label.userData.demoNameLabel = true;
           marker.add(label);
        }
        marker.position.set(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z);
        updateTacticalPoint(marker, displaySide, 'T');
        const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
        marker.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : marker.rotation.y;
        marker.userData.demoPitch = player.pitch || 0;
         marker.userData.demoYaw = player.yaw || 0;
         const nameLabel = marker.children.find((child) => child.userData.demoNameLabel);
         if (nameLabel) nameLabel.visible = Boolean(showDemoNamesRef.current || hoveredDemoPlayerRef.current === player.name);
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
          marker.position.set(y * 0.0254 - modelCenter.x, z * 0.0254 - modelCenter.y + 0.08, x * 0.0254 - modelCenter.z);
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
      const durations = { smokegrenade_detonate: 1152, inferno_startburn: 448, flashbang_detonate: 20, hegrenade_detonate: 20, decoy_detonate: 960 };
      const grenadeEvents = demoGrenadesRef.current;
      const detonations = grenadeEvents.filter((event) => event.event_name.endsWith('_detonate') || event.event_name === 'inferno_startburn');
      if (!demoProjectilesRef.current.length) grenadeEvents.filter((event) => event.event_name === 'grenade_thrown' && event.user_X != null).forEach((event) => {
        const landingName = event.weapon?.includes('smoke') ? 'smokegrenade_detonate' : event.weapon?.includes('flash') ? 'flashbang_detonate' : event.weapon?.includes('hegrenade') ? 'hegrenade_detonate' : event.weapon?.includes('decoy') ? 'decoy_detonate' : 'inferno_startburn';
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
      grenadeEvents.filter((event) => event.event_name !== 'grenade_thrown').forEach((event) => {
        const duration = durations[event.event_name] || 20;
        if (demoTickRef.current < event.tick || demoTickRef.current > event.tick + duration || event.x == null) return;
        const key = `${event.event_name}-${event.tick}-${event.entityid || event.user_steamid}`;
        active.add(key);
        let effect = demoGrenadeObjectsRef.current.get(key);
        if (!effect) {
          const position = new THREE.Vector3(event.y * 0.0254 - modelCenter.x, event.z * 0.0254 - modelCenter.y, event.x * 0.0254 - modelCenter.z);
           const type = event.event_name === 'smokegrenade_detonate' ? 'smoke' : event.event_name === 'inferno_startburn' ? 'fire' : event.event_name === 'flashbang_detonate' ? 'flash' : event.event_name === 'decoy_detonate' ? 'decoy' : 'explosion';
          effect = createGrenadeEffect(position, type, navData, nav);
          scene.add(effect);
          demoGrenadeObjectsRef.current.set(key, effect);
        }
        if (event.event_name === 'decoy_detonate') {
          const blink = effect.children.find((child) => child.userData.decoyBlink);
          if (blink?.material?.color) blink.material.color.set(performance.now() % 1000 < 250 ? '#ffffff' : '#7f8b91');
        }
      });
      demoGrenadeObjectsRef.current.forEach((effect, key) => {
        if (!active.has(key)) { scene.remove(effect); disposeGrenadeEffect(effect); demoGrenadeObjectsRef.current.delete(key); }
      });
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
    const getWorkspaceState = () => ({
      camera: { position: camera.position.toArray(), target: controls.target.toArray() },
      points: pointsRef.current.filter((point) => point.userData.pointId).map((point) => ({ id: point.userData.pointId, position: point.position.toArray(), rotationY: point.rotation.y, team: point.userData.team, type: point.userData.type, rayLength: point.children.find((child) => child.userData.aimRay)?.scale.z || 0.05, aimTarget: point.userData.aimTarget?.position.toArray() || [0, 0, -0.05] })),
      paths: pathLines.map((line) => line.userData.pathPointIds || []),
    });
    const restoreWorkspaceState = (saved) => {
      if (!saved) return;
      pathPoints.length = 0;
      pathLines.forEach((line) => { line.parent?.remove(line); line.geometry.dispose(); line.material.dispose(); });
      pathLines.length = 0;
      pointsRef.current.forEach((point) => { point.parent?.remove(point); point.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }); });
      pointsRef.current.length = 0;
      const restoredPoints = new Map();
      (saved.points || []).forEach((item) => {
        const point = createTacticalPoint(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), item.id, item.rayLength, item.team || 'T', item.type || 'T');
        point.position.fromArray(item.position || [0, 0, 0]);
        point.rotation.y = item.rotationY || 0;
        point.userData.pointId = item.id;
        point.userData.team = item.team || 'T';
        point.userData.type = item.type || 'T';
        point.userData.aimTarget?.position.fromArray(item.aimTarget || [0, 0, -0.05]);
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
      if (saved.camera) { camera.position.fromArray(saved.camera.position); controls.target.fromArray(saved.camera.target); controls.update(); }
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
        }
      }
    };
    const onPointerMove = (event) => {
      pointerCurrent = pointerPosition(event);
      raycaster.setFromCamera(pointerCurrent, camera);
      const demoHit = raycaster.intersectObjects([...demoMarkers.values()], true)[0]?.object;
      let demoOwner = demoHit;
      while (demoOwner && !demoOwner.userData.playerName) demoOwner = demoOwner.parent;
      hoveredDemoPlayerRef.current = demoOwner?.userData.playerName || null;
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
        object.frustumCulled = true;
        object.renderOrder = 3;
         if (object.material) object.material = Array.isArray(object.material) ? object.material.map(() => createGhostMaterial(focusScreen, viewportSize, modelMode, nav?.distanceField)) : createGhostMaterial(focusScreen, viewportSize, modelMode, nav?.distanceField);
         const materials = Array.isArray(object.material) ? object.material : [object.material];
         materials.forEach((material) => { material.opacity = modelOpacity; material.depthWrite = true; });
      });
      scene.add(worldModel);
      modelRef.current = worldModel;
      worldModel.visible = modelVisibilityRef.current;
      worldModel.position.y = modelBasePositionRef.current.y + (modelMode.value === 3 ? -0.12 : 0);
      resetCamera();
       onReady({ reset: () => resetToDefault(resetCamera), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState });
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
         onReady({ reset: () => resetToDefault(normalReset), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState });
      }
    });
    controls.target.set(0, 0, 0);
    controls.update();
     const initialReset = () => { camera.position.set(17, 23, 25); controls.target.set(0, 0, 0); controls.update(); };
     onReady({ reset: () => resetToDefault(initialReset), restoreCameraSlot, getWorkspaceState, restoreWorkspaceState });
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
      updateDemoGrenades();
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
  const [deletePointId, setDeletePointId] = useState(null);
  const [pointUpdate, setPointUpdate] = useState(null);
  const [grenadeWheel, setGrenadeWheel] = useState({ open: false, type: 'smoke' });
  const [cameraSlotState, setCameraSlotState] = useState(Array(9).fill(false));
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);
  const [activePanel, setActivePanel] = useState('demo');
  const [archives, setArchives] = useState(() => { try { return JSON.parse(localStorage.getItem('csboard-workspace-archives') || '[]'); } catch { return []; } });
  const pendingArchiveRef = useRef(null);
  const boardRef = useRef(null);
  const onReady = (value) => { boardRef.current = value; const pending = pendingArchiveRef.current; if (pending && pending.mapName === mapName) { value.restoreWorkspaceState?.(pending.workspace); pendingArchiveRef.current = null; } };
  const onCameraSlots = (slots, active) => { setCameraSlotState(slots); setActiveCameraSlot(active); };
  const saveWorkspaceArchive = () => {
    const archive = { id: `${Date.now()}`, savedAt: new Date().toISOString(), mapName, demo: demoData ? { fileName: demoData.demo.fileName, round: demoRound?.round, tick: demoTick } : null, workspace: boardRef.current?.getWorkspaceState?.() };
    if (!archive.workspace) return;
    const next = [archive, ...archives].slice(0, 30);
    setArchives(next);
    localStorage.setItem('csboard-workspace-archives', JSON.stringify(next));
  };
  const deleteWorkspaceArchive = (id) => {
    const next = archives.filter((archive) => archive.id !== id);
    setArchives(next);
    localStorage.setItem('csboard-workspace-archives', JSON.stringify(next));
  };
  const switchPanel = (panel) => {
    setDemoPlaying(false);
    setAnalysisPlaying(false);
    if (panel === 'analysis') setAnalysisTime(0);
    setActivePanel(panel);
  };
  const restoreWorkspaceArchive = (archive) => {
    if (archive.mapName !== mapName) { pendingArchiveRef.current = archive; setMapName(archive.mapName); } else boardRef.current?.restoreWorkspaceState?.(archive.workspace);
    if (archive.demo && demoData?.demo.fileName === archive.demo.fileName) { const round = demoData.rounds.find((item) => item.round === archive.demo.round); if (round) setDemoRound(round); setDemoTick(archive.demo.tick); }
  };
  const selectedMode = showModel ? modelViewMode : -1;
  const demoSnapshot = demoRound && (demoTick < demoRound.startTick || demoTick > demoRound.endTick) ? null : interpolateDemoSnapshot(demoSnapshots, demoTick);
  const demoKills = activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick).slice(-5) || [] : [];
  const demoDeaths = demoData?.events?.filter((event) => event.event_name === 'player_death' && demoRound && event.tick >= demoRound.startTick && event.tick <= demoTick) || [];
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
      if (event.data.type === 'status') setDemoStatus(event.data.message);
      if (event.data.type === 'diagnostic') console.info('Demo parser diagnostic:', event.data.phase, event.data.data);
       if (event.data.type === 'loaded') { setDemoData(event.data.data); setDemoRound(null); setDemoTick(0); setDemoSnapshots([]); setDemoProjectiles([]); setDemoRoundLoading(false); setDemoPlaying(false); }
      if (event.data.type === 'round') { setDemoSnapshots(event.data.snapshots); setDemoProjectiles(event.data.projectiles || []); setDemoRoundLoading(false); }
       if (event.data.type === 'analysis') { const rows = event.data.rows || []; const players = [...new Set(rows.flatMap((snapshot) => snapshot.players.map((player) => player.name)).filter(Boolean))].sort(); setAnalysisRows(rows); setAnalysisPlayers(players); setAnalysisSelectedPlayers((selected) => selected.filter((name) => players.includes(name))); setAnalysisStatus('全场移动数据已就绪'); }
      if (event.data.type === 'error') { setDemoStatus(`解析失败：${event.data.message}`); console.error('Demo parse failed:', event.data.message, event.data.diagnostic); }
    };
    demoWorkerRef.current = worker;
    return () => worker.terminate();
  }, []);
  useEffect(() => {
    if (activePanel !== 'analysis' || !demoData || analysisLoadedFor === demoData.demo.fileName) return;
    setAnalysisStatus('正在读取全场移动数据…');
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
     setDemoStatus(files.length > 1 ? `正在组合 ${files.length} 个 Demo 分片…` : '正在读取 Demo 文件…');
    const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
    demoWorkerRef.current?.postMessage({ type: 'load', fileName: files.map((file) => file.name).join(' + '), buffers }, buffers);
  };
  useEffect(() => {
    if (!demoRound || !demoWorkerRef.current) return;
    setDemoTick(demoRound.startTick);
    setDemoSnapshots([]);
    setDemoRoundLoading(true);
    setDemoPlaying(false);
    demoWorkerRef.current.postMessage({ type: 'round', round: demoRound.round, startTick: demoRound.startTick, endTick: demoRound.endTick });
  }, [demoRound]);
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
       <nav className="topbar-panels"><button type="button" className={activePanel === 'demo' ? 'active' : ''} onClick={() => switchPanel('demo')}>回合浏览</button><button type="button" className={activePanel === 'analysis' ? 'active' : ''} onClick={() => switchPanel('analysis')}>数据分析</button><button type="button" className={activePanel === 'collab' ? 'active' : ''} onClick={() => switchPanel('collab')}>协作面板</button></nav>
      <div className="header-status"><i /> REF DATA LOADED</div>
    </header>
    <section className="board-stage">
       <ThreeBoard key={`${mapName}-${navData ? navData.version : 'loading'}`} mapName={mapName} navData={navData} showEdges={showEdges} showGrid={showGrid} showModel={showModel} modelOpacity={modelOpacity} modelViewMode={modelViewMode} trackpadDetection={trackpadDetection} showDemoNames={showDemoNames} demoSnapshot={activePanel === 'demo' ? demoSnapshot : null} demoTick={demoTick} demoFires={activePanel === 'demo' ? demoData?.events?.filter((event) => event.event_name === 'weapon_fire') || [] : []} demoGrenades={activePanel === 'demo' ? demoData?.events?.filter((event) => ['grenade_thrown', 'smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_detonate'].includes(event.event_name)) || [] : []} demoProjectiles={activePanel === 'demo' ? demoProjectiles : []} demoDeaths={activePanel === 'demo' ? demoDeaths : []} heatDeaths={activePanel === 'analysis' ? demoData?.events?.filter((event) => event.event_name === 'player_death') || [] : []} demoViewFlags={demoViewFlags} analysisRows={analysisRows} analysisSelectedPlayers={analysisSelectedPlayers} analysisSide={analysisSide} analysisEnabled={activePanel === 'analysis'} analysisRounds={demoData?.rounds || []} analysisTime={analysisTime} deletePointId={deletePointId} pointUpdate={pointUpdate} onPointSelect={setSelectedPoint} onGrenadeWheel={setGrenadeWheel} onCameraSlots={onCameraSlots} onReady={onReady} />
      <div className="stage-vignette" />
       <div className="map-name"><span>01</span><h1>{mapName.toUpperCase()}</h1></div>
      {grenadeWheel.open && <div className="grenade-wheel"><div className={`wheel-item wheel-smoke ${grenadeWheel.type === 'smoke' ? 'active' : ''}`}>烟</div><div className={`wheel-item wheel-fire ${grenadeWheel.type === 'fire' ? 'active' : ''}`}>火</div><div className={`wheel-item wheel-flash ${grenadeWheel.type === 'flash' ? 'active' : ''}`}>闪</div><div className={`wheel-item wheel-explosion ${grenadeWheel.type === 'explosion' ? 'active' : ''}`}>雷</div><span className="wheel-key">Q</span></div>}
         {demoKills.length > 0 && <div className={`demo-kills hud-left${demoKillsCollapsed ? ' collapsed' : ''}`}><div className="demo-kills-heading"><span>RECENT KILLS</span><button type="button" onClick={() => setDemoKillsCollapsed((collapsed) => !collapsed)}>{demoKillsCollapsed ? '展开' : '收起'}</button></div>{demoKills.map((kill) => <div className="demo-kill" key={`${kill.tick}-${kill.user_steamid}`}><small>{((kill.tick - demoRound.startTick) / 64).toFixed(1)}s</small><b>{kill.attacker_name || 'WORLD'}{kill.assister_name ? ` + ${kill.assister_name}` : ''}</b><i>{kill.weapon || 'KILL'}{kill.headshot ? ' · HS' : ''}{kill.thrusmoke ? ' · SMOKE' : ''}{kill.attackerblind ? ' · BLIND' : ''}</i><strong>→ {kill.user_name || 'UNKNOWN'}</strong></div>)}</div>}
        <div className="hud hud-right"><span>VIEW CONTROLS</span><strong>MMB <em>ROTATE</em></strong><strong>SHIFT + MMB <em>PAN</em></strong><strong>SCROLL <em>ZOOM</em></strong><strong>WASD <em>MOVE</em></strong><strong>LEFT CLICK <em>POINT MENU</em></strong></div>
        <div className="camera-slots"><span>CAMERA POSITIONS</span>{cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved} className={activeCameraSlot === index ? 'active' : ''} onClick={() => boardRef.current?.restoreCameraSlot?.(index)}>{index + 1}</button>)}</div>
        {selectedPoint && <div className="point-actions"><span>TACTICAL POINT</span><div className="point-choice"><b>TEAM</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, team: 'CT' })}>CT</button></div><div className="point-choice"><b>TYPE</b><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'T' })}>T</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'V' })}>V</button><button type="button" onClick={() => setPointUpdate({ id: selectedPoint, type: 'X' })}>X</button></div><button type="button" onClick={() => { setDeletePointId(selectedPoint); setSelectedPoint(null); }}>DELETE</button></div>}
        <div className="board-tools"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}><i /> GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}><i /> TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)} className={showModel ? 'selected' : ''}><i /> {modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) setShowModel(false); else { setShowModel(true); setModelViewMode(option.value); } setModeMenuOpen(false); }} /> <span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}><i /> AREA EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET VIEW</button></div>
         <div className={`demo-panel ${activePanel === 'demo' ? '' : 'panel-hidden'}`}>
          <div className="demo-toolbar">
             <label className="demo-upload"><span>DEMO / 多选分片</span><input type="file" accept=".dem" multiple onChange={loadDemo} /></label>
            {demoStatus && <span className="demo-status">{demoStatus}</span>}
            {demoData && <>
               <label className="demo-round"><span>ROUND</span><select value={demoRound?.round || ''} onChange={(event) => setDemoRound(demoData.rounds.find((round) => String(round.round) === event.target.value) || null)}><option value="">请选择回合</option>{demoData.rounds.map((round) => <option key={round.round} value={round.round}>回合 {round.round}</option>)}</select></label>
               {demoRound && <button type="button" className="demo-play" disabled={demoRoundLoading} onClick={() => setDemoPlaying((playing) => !playing)}>{demoRoundLoading ? 'LOAD' : demoPlaying ? 'PAUSE' : 'PLAY'}</button>}
              <span className="demo-name">{demoData.demo.map} / {demoData.demo.fileName}</span>
            </>}
          </div>
            {activePanel === 'demo' && demoData && <div className="demo-view-options"><span>视图</span><button type="button" className={showDemoNames ? 'selected' : ''} onClick={() => setShowDemoNames((value) => !value)}>显示名称</button></div>}
           {demoStatus && !demoData && <div className="demo-loading" aria-label="Demo parsing in progress"><i /></div>}
          {demoData && demoRound && <div className="demo-scrub"><span className="demo-time">{((demoTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span><input className="demo-timeline" disabled={demoRoundLoading} style={{ '--timeline-progress': `${demoRound.endTick > demoRound.startTick ? ((demoTick - demoRound.startTick) / (demoRound.endTick - demoRound.startTick)) * 100 : 0}%` }} type="range" min={demoRound.startTick} max={demoRound.endTick} step="1" value={demoTick} onPointerUp={(event) => event.currentTarget.blur()} onChange={(event) => { setDemoPlaying(false); setDemoTick(Number(event.target.value)); }} /><span className="demo-duration">/ {((demoRound.endTick - demoRound.startTick) / demoData.demo.tickRate).toFixed(1)}s</span></div>}
           <div className="demo-options"><label className="map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select></label><button type="button" onClick={() => setShowGrid((value) => !value)} className={showGrid ? 'selected' : ''}>GRID</button><button type="button" onClick={() => setTrackpadDetection((value) => !value)} className={trackpadDetection ? 'selected' : ''}>TRACKPAD {trackpadDetection ? 'ON' : 'OFF'}</button><label className="model-opacity"><span>MODEL</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={(event) => { const value = Number(event.target.value); setModelOpacity(value); setShowModel(value > 0); }} /><b>{Math.round(modelOpacity * 100)}%</b></label><div className={`mode-picker ${modeMenuOpen ? 'open' : ''}`}><button type="button" onClick={() => setModeMenuOpen((value) => !value)}>{modeOptions.find((option) => option.value === selectedMode)?.label}</button>{modeMenuOpen && <div className="mode-list">{modeOptions.map((option) => <label key={option.value} className={option.value === selectedMode ? 'active' : ''}><input type="radio" name="demo-model-mode" checked={option.value === selectedMode} onChange={() => { if (option.value < 0) { setShowModel(false); setModelOpacity(0); } else { setShowModel(true); setModelOpacity((value) => value || 0.34); setModelViewMode(option.value); } setModeMenuOpen(false); }} /><span>{option.label}</span></label>)}</div>}</div>{navData && <button type="button" onClick={() => setShowEdges((value) => !value)} className={showEdges ? 'selected' : ''}>EDGES</button>}<button type="button" onClick={() => boardRef.current?.reset()}>RESET</button></div>
          </div>
          {activePanel === 'analysis' && <aside className="analysis-panel"><div className="collab-heading"><div><span>DEMO ANALYSIS</span><h2>数据分析</h2></div><button type="button" disabled={!analysisSelectedPlayers.length || !analysisRows.length} onClick={() => setAnalysisPlaying((playing) => !playing)}>{analysisPlaying ? '暂停' : '播放'}</button></div><p className="collab-note">选择选手后，所有回合会从冻结结束同时开始叠加播放。</p>{analysisStatus && <div className="analysis-status">{analysisStatus}</div>}<label className="analysis-select"><span>PLAYERS</span><select multiple size={Math.min(8, Math.max(3, analysisPlayers.length))} value={analysisSelectedPlayers} onChange={(event) => { setAnalysisSelectedPlayers([...event.target.selectedOptions].map((option) => option.value)); setAnalysisTime(0); setAnalysisPlaying(false); }}>{analysisPlayers.map((player) => <option key={player} value={player}>{player}</option>)}</select></label>{analysisSelectedPlayers.length > 0 && <label className="analysis-side"><span>SIDE</span><select value={analysisSide} onChange={(event) => { setAnalysisSide(event.target.value); setAnalysisTime(0); setAnalysisPlaying(false); }}><option value="ALL">全部回合</option><option value="T">T 回合</option><option value="CT">CT 回合</option></select></label>}{analysisSelectedPlayers.length > 0 && analysisRows.length > 0 && <div className="analysis-timeline"><span>{(analysisTime / 64).toFixed(1)}s</span><input type="range" min="0" max={analysisDuration} value={analysisTime} onChange={(event) => { setAnalysisPlaying(false); setAnalysisTime(Number(event.target.value)); }} /><span>{(analysisDuration / 64).toFixed(1)}s</span></div>}</aside>}
         {activePanel === 'collab' && <aside className="collab-panel"><div className="collab-heading"><div><span>COLLABORATION</span><h2>协作面板</h2></div><button type="button" onClick={saveWorkspaceArchive}>保存当前帧</button></div><p className="collab-note">保存地图、镜头、编辑点位和当前 Demo 帧。Demo 文件本身不会写入浏览器存储。</p><div className="archive-list">{archives.length === 0 ? <div className="archive-empty">暂无本地存档</div> : archives.map((archive) => <div className="archive-item" key={archive.id}><button type="button" className="archive-restore" onClick={() => restoreWorkspaceArchive(archive)}><strong>{archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString()}</span><small>{archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : '手动地图编辑'}</small></button><button type="button" className="archive-delete" aria-label="删除存档" title="删除存档" onClick={() => deleteWorkspaceArchive(archive.id)}>🗑</button></div>)}</div></aside>}
       {activePanel === 'analysis' && demoData && <div className="analysis-view-options"><span>热力图</span><button type="button" className={demoViewFlags.killerHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, killerHeat: !flags.killerHeat }))}>击杀时所在</button><button type="button" className={demoViewFlags.victimHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, victimHeat: !flags.victimHeat }))}>被击杀时所在</button><button type="button" className={demoViewFlags.targetHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, targetHeat: !flags.targetHeat }))}>击杀目标所在</button><button type="button" className={demoViewFlags.opponentHeat ? 'selected' : ''} onClick={() => setDemoViewFlags((flags) => ({ ...flags, opponentHeat: !flags.opponentHeat }))}>被击杀时对方所在</button></div>}
     </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
