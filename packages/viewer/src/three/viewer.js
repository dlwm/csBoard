import { createUtilityReferenceController } from '../core/utilityReferences.js';
import { normalizeWorkspacePlayers, createWorkspaceLayout } from '../data/workspace.js';
import { createVoicePlaybackController } from '../playback/voiceController.js';
import { createCombatOverlay, combatOverlayState } from '../overlays/index.js';
import { createDirectorTimeline } from '../playback/directorTimeline.js';
import { createDirectorCameraController } from './directorController.js';
import { createBombTimeline } from '../playback/bombTimeline.js';
import createBombSceneController from './c4SceneController.js';
import { createPlayerTimeline, delayedPlayerHealth, flashPresentation, weaponAnimation } from '../playback/playerTimeline.js';
import { describePlayer } from '../data/playerStatus.js';
import { playerBaseColor } from '../data/playerColors.js';
import { createWeaponModel, updateWeaponModel } from './weaponModel.js';
import { createPlayerCameraController } from './playerCamera.js';
import { createMonitorRenderer } from './monitorRenderer.js';
import { createMonitorLayout } from '../data/monitorLayout.js';
import * as THREE from 'three';
import { createResourceController } from '../resources/controller.js';
import { createGhostMaterial, enableMapSquareFade } from './materials.js';
import { createMapDisplayController } from './mapDisplay.js';
import { cacheStaticMapTransforms } from './staticMapRuntime.js';
import { enableMaterialFloorFade, floorVisibilityAtY } from './floorMaterial.js';
import { deriveNavFloorRanges, applyFloorRange } from '../data/floorRanges.js';
import { removeImportedMapLights } from './mapLights.js';
import { createReplayController } from '../playback/controller.js';
import { createReplayEffects } from './replayEffects.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCommandRegistry } from '../core/commandRegistry.js';
import { createViewerController, ViewerError } from '../core/controller.js';
import { createThreeViewport } from './viewport.js';
import { createRenderLoop } from './renderLoop.js';
import { createNavMesh } from './navMesh.js';
import { createPlayerPawn } from './playerPawn.js';
import { createBoardProjectionController } from './boardCamera.js';

const vector = (value, field) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new ViewerError('invalid_argument', `${field} requires three finite numbers`);
  return [...value];
};
// Source XYZ inches → viewer XYZ metres; Y is up in the scene.
// Source 坐标单位为英寸；转换后 Y 向上，并减去 NAV 的场景中心。
export function sourceToScene(position, origin = [0, 0, 0]) {
  const [x, y, z] = vector(position, 'position'); vector(origin, 'origin');
  return [y * .0254 - origin[0], z * .0254 - origin[1], x * .0254 - origin[2]];
}
export function sceneToSource(position, origin = [0, 0, 0]) {
  const [x, y, z] = vector(position, 'position'); vector(origin, 'origin');
  return [(z + origin[2]) / .0254, (x + origin[0]) / .0254, (y + origin[1]) / .0254];
}
const releaseObjects = root => {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) materials.add(material);
  });
  for (const geometry of geometries) { geometry.disposeBoundsTree?.(); geometry.boundsTree = null; geometry.dispose(); }
  for (const material of materials) material.dispose();
  root.clear();
};

// First standalone rendering slice: NAV, player pawns, camera and picking.
// 宿主提供 NAV 和人员快照；这里不读取地图目录、Demo、存档、房间或 AI 配置。
export function createViewer({ container, navData, mapName = null, pixelRatioLimit = 2, policy, presentation, onObserverError, dataSource = null, readProducerFields, playbackBudget = {}, resourceLoader = null, floorRanges = null, floorBoundary = null, monitorLayout = null, weaponIcons = null, flashMode = 'sample', readDirectorEvent = null, combatOverlay = {}, combatOverlayTheme = {}, voiceDecoder = null, voiceDriver = null, utilitySource = null, createUtilityRenderer = null } = {}) {
  if ((utilitySource == null) !== (createUtilityRenderer == null) || (utilitySource && ['list', 'load'].some(k => typeof utilitySource[k] !== 'function')) || (createUtilityRenderer != null && typeof createUtilityRenderer !== 'function')) throw new ViewerError('invalid_ports', 'Provide utilitySource and createUtilityRenderer together');
  if ((voiceDecoder == null) !== (voiceDriver == null) || (voiceDecoder != null && typeof voiceDecoder !== 'function')
    || (voiceDriver && ['now', 'schedule', 'stopAll', 'setVolume'].some(key => typeof voiceDriver[key] !== 'function'))) throw new ViewerError('invalid_argument', 'Provide a voice decoder and audio driver together');
  if (!['sample', 'source-duration'].includes(flashMode)) throw new ViewerError('invalid_argument', 'flashMode must be sample or source-duration');
  if (weaponIcons != null && typeof weaponIcons !== 'function') throw new ViewerError('invalid_argument', 'weaponIcons must resolve a weapon to an icon descriptor');
  if (monitorLayout != null && typeof monitorLayout !== 'function') throw new ViewerError('invalid_argument', 'monitorLayout must be a synchronous host layout function');
  if (!navData?.areas || !Object.values(navData.areas).some(area => area.corners?.length >= 3)) throw new ViewerError('invalid_nav', 'NAV requires nonempty areas with corners');
  for (const area of Object.values(navData.areas)) {
    if (!Array.isArray(area.corners) || !area.corners.every(point => [point.x, point.y, point.z].every(Number.isFinite))) throw new ViewerError('invalid_nav', 'NAV corners must have finite Source XYZ coordinates');
  }
  if (dataSource && dataSource.getMetadata().mapName !== mapName) throw new ViewerError('map_mismatch', 'Replay map does not match the injected NAV');
  for (const [key, value] of Object.entries(playbackBudget)) if (!['maxBytes', 'maxRows'].includes(key) || !Number.isFinite(value) || value <= 0 || (key === 'maxRows' && !Number.isInteger(value))) throw new ViewerError('invalid_argument', 'Playback budget requires positive maxBytes/maxRows');
  if (floorRanges != null && (typeof floorRanges !== 'object' || Array.isArray(floorRanges))) throw new ViewerError('invalid_floor', 'Floor ranges must be an object keyed by floor ID');
  const ranges = floorRanges == null ? deriveNavFloorRanges(navData, floorBoundary) : structuredClone(floorRanges);
  for (const [id, range] of Object.entries(ranges)) { if (id === 'all' || !id) throw new ViewerError('invalid_floor', 'Floor ID must not be all or empty'); applyFloorRange({ set() {} }, range); }
  if (!combatOverlay || typeof combatOverlay !== 'object' || Array.isArray(combatOverlay)
    || Object.keys(combatOverlay).some(key => !['enabled', 'hurt', 'flash', 'reducedEffects', 'maxFlashOpacity'].includes(key))) throw new ViewerError('invalid_argument', 'Invalid combat overlay options');
  const overlayOptions = { enabled: true, hurt: true, flash: true, maxFlashOpacity: 1,
    reducedEffects: Boolean(container.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches), ...combatOverlay };
  combatOverlayState({}, overlayOptions);
  const viewport = createThreeViewport({ container, pixelRatioLimit });
  const { scene, camera, renderer } = viewport;
  const previousContainerPosition = container.style.position;
  const ownsContainerPosition = container.ownerDocument.defaultView.getComputedStyle(container).position === 'static';
  if (ownsContainerPosition) container.style.position = 'relative';
  const overlayLayer = createCombatOverlay({ container, theme: combatOverlayTheme });
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const viewportSize = new THREE.Vector2(); renderer.getDrawingBufferSize(viewportSize);
  const nav = createNavMesh(navData, new THREE.Vector2(), { value: 0 }, viewportSize);
  nav.group.position.copy(nav.center).negate(); scene.add(nav.group);
  const origin = nav.center.toArray();
  const floorState = new THREE.Vector4(0, 0, 0, 0);
  enableMaterialFloorFade(nav.mesh.material, floorState);
  let activeFloor = 'all', display = null;
  const modelStyle = { opacity: 1, focus: 'full', range: .5 };
  const focusScreen = new THREE.Vector2(.5, .5), modelMode = { value: 0 }, modelRange = { value: .5 };
  const content = new THREE.Group(); scene.add(content);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x313638, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(20, 35, 10); scene.add(light);
  const span = Math.max(nav.bounds.getSize(new THREE.Vector3()).length(), 10);
  const resetCamera = () => { controls.target.set(0, 0, 0); camera.position.set(span * .55, span * .7, span * .55); camera.far = span * 10; camera.updateProjectionMatrix(); controls.update(); };
  resetCamera();
  const projection = createBoardProjectionController(camera, controls, () => ({ target: new THREE.Vector3(), span }));
  let players = [], selectedId = null, controller, disposed = false;
  let worldModel = null, modelVisible = false, collisionVersion = 0;
  const modelCollisions = [nav.mesh];
  const resources = resourceLoader ? createResourceController({ loader: resourceLoader,
    onReady: (_key, gltf) => {
      const model = gltf.scene; if (!model?.isObject3D) throw new ViewerError('invalid_model', 'World resources require a GLTF scene');
      removeImportedMapLights(model); model.position.sub(nav.center); scene.add(model); worldModel = model;
      model.visible = modelVisible && !camera.planView; model.updateMatrixWorld(true);
      display = createMapDisplayController({ gltf, renderer, createMaterial: () => { const material = createGhostMaterial(focusScreen, viewportSize, modelMode, modelRange); material.opacity = modelStyle.opacity; enableMapSquareFade(material, nav.modelBoundary, floorState); enableMaterialFloorFade(material, floorState); return material; } });
      modelCollisions.splice(0, modelCollisions.length, ...display.collisions); cacheStaticMapTransforms(model); collisionVersion++;
    },
    onRelease: (_key, gltf) => { scene.remove(gltf.scene); worldModel = null; display = null; modelCollisions.splice(0, modelCollisions.length, nav.mesh); collisionVersion++; },
    onState: state => controller?.notify('resource.state', state),
  }) : null;
  let cameraPlayers = new Map(), monitorIds = [], seekRevision = 0, hudPlayers = [], hudById = new Map(), hudTick = 0, killEvents = [], hudKills = [], playerTimeline = null, bombTimeline = null, directorTimeline = null, timelineSegment = null, timelineRate = 64;
  const flashedHeadColor = new THREE.Color('#e4e7e5');
  const baseColors = new Map(), sideSeats = new Map();
  const povEquipment = new THREE.Group(); camera.add(povEquipment); scene.add(camera);
  povEquipment.position.set(.35, -.35, -.7); povEquipment.visible = false;
  let povWeapon = null;
  const playerCamera = createPlayerCameraController({ camera, controls, readPose: id => cameraPlayers.get(id),
    onState: state => controller?.notify('camera.follow', state),
  });
  const director = createDirectorCameraController({ camera, controls,
    readEvent: mode => directorTimeline?.at(hudTick, mode), readPlayer: id => cameraPlayers.get(id),
    onState: state => controller?.notify('camera.director', state),
  });
  const releaseCamera = () => { playerCamera.release(); director.release(); };
  const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray(), mode: camera.planView ? '2d' : '3d', follow: playerCamera.getState(), director: director.getState(), monitorIds: [...monitorIds] });
  const getCombatOverlayState = () => {
    const followed = playerCamera.getState(), directed = director.getState();
    const id = followed.playerId || directed.playerId, player = hudById.get(id);
    const recentHurt = id && playerTimeline?.latest(id, 'player_hurt', hudTick, .16);
    return combatOverlayState({ active: !camera.planView && Boolean(player && (followed.status === 'following' || directed.status === 'following')),
      alive: player?.alive ?? null, hurt: player?.animation?.hurt ?? null,
      hurtAgeSeconds: recentHurt ? Math.max(0, (hudTick - recentHurt.tick) / timelineRate) : null,
      flashOpacity: player?.animation?.flash.opacity ?? null }, overlayOptions);
  };
  const find = id => { const player = players.find(item => item.id === id); if (!player) throw new ViewerError('not_found', `Player ${id} was not found`); return player; };
  let utilityReferences = null, utilityRenderer = null, workspaceEpoch = 0;
  const readWorkspace = () => createWorkspaceLayout({ players: players.map(({ kind, alive, ...p }) => p), mapName, origin, utilities: utilityReferences?.getPlacements() || [] });
  const normalize = points => {
    if (!Array.isArray(points) || points.length > 256) throw new ViewerError('invalid_snapshot', 'Snapshot points must be an array with at most 256 players');
    const ids = new Set();
    return points.map(point => {
      if (!point || typeof point.id !== 'string' || !point.id || ids.has(point.id)) throw new ViewerError('invalid_snapshot', 'Players require unique string IDs');
      ids.add(point.id);
      if (!['T', 'CT'].includes(point.team) || (point.kind && point.kind !== 'player')) throw new ViewerError('invalid_snapshot', 'This viewer slice supports T/CT players only');
      if (point.alive != null && typeof point.alive !== 'boolean') throw new ViewerError('invalid_snapshot', 'alive must be boolean or null');
      if (point.rotationY != null && !Number.isFinite(point.rotationY)) throw new ViewerError('invalid_snapshot', 'rotationY must be finite radians');
      if (point.baseColor != null && !/^#[0-9a-f]{6}$/i.test(point.baseColor)) throw new ViewerError('invalid_snapshot', 'baseColor must be a six-digit hex color');
      return { id: point.id, kind: 'player', name: String(point.name || point.id), team: point.team, position: vector(point.position, 'player.position'), rotationY: point.rotationY || 0, alive: point.alive ?? null, crouched: Boolean(point.crouched), baseColor: point.baseColor || '#4c97e8' };
    });
  };
  const markers = new Map();
  const createHeldWeapon = (weapon, side, id) => {
    let held;
    held = createWeaponModel(weapon, { side, resolveIcon: weaponIcons, document: container.ownerDocument,
      onLoad: details => controller?.notify('equipment.ready', { playerId: held?.userData.playerId || id, weapon: details.weapon, key: details.key }),
      onError: (error, details) => controller?.notify('equipment.failed', { playerId: held?.userData.playerId || id, weapon: details.weapon, message: error.message }),
    });
    held.userData.playerId = id; return held;
  };
  const drawPlayers = () => {
    const active = new Set(players.map(player => player.id));
    for (const [id, marker] of markers) if (!active.has(id)) { releaseObjects(marker); content.remove(marker); markers.delete(id); }
    for (const player of players) {
      let pawn = markers.get(player.id);
      const style = `${player.team}:${player.crouched}:${player.baseColor}:${player.alive}`;
      if (!pawn || pawn.userData.style !== style) {
        if (pawn) { releaseObjects(pawn); content.remove(pawn); }
        const material = new THREE.MeshStandardMaterial({ color: player.alive === false ? '#66716b' : player.team === 'T' ? '#cb8653' : '#70a8bb', roughness: .65 });
        const headMaterial = material.clone();
        pawn = createPlayerPawn(material, headMaterial, player.crouched, player.baseColor);
        pawn.userData.bodyMaterial = material; pawn.userData.headMaterial = headMaterial;
        pawn.userData.style = style; pawn.userData.playerId = player.id;
        content.add(pawn); markers.set(player.id, pawn);
      }
      pawn.visible = floorVisibilityAtY(player.position[1], floorState) > .5;
      pawn.scale.y = player.alive === false ? .25 : 1;
      pawn.position.fromArray(player.position); pawn.rotation.y = player.rotationY;
      const status = hudById.get(player.id);
      const sideColor = player.alive === false ? '#66716b' : player.team === 'T' ? '#cb8653' : '#70a8bb';
      pawn.userData.bodyMaterial.color.set(status?.animation?.hurt ? '#ff352f' : sideColor);
      pawn.userData.headMaterial.color.set(status?.animation?.headHurt ? '#ff352f' : sideColor);
      if (player.alive !== false && !status?.animation?.headHurt) pawn.userData.headMaterial.color.lerp(flashedHeadColor, (status?.animation?.flash.opacity ?? 0) * .82);
      if (weaponIcons) {
        let held = pawn.userData.heldWeapon;
        if (!held && status?.weapon) {
          held = createHeldWeapon(status.weapon.name, player.team, player.id);
          held.position.y += .72; pawn.add(held); pawn.userData.heldWeapon = held;
        }
        if (held) {
          held.visible = Boolean(status?.weapon); updateWeaponModel(held, status?.weapon?.name || '', { side: player.team });
          const drop = weaponAnimation(status?.animation?.reload, status?.animation?.firing, status?.weapon?.kind || 'none').reloadDrop;
          held.position.y = .75 - (player.crouched ? .28 : 0) - drop * .36; held.rotation.x = drop * .72;
        }
      }
    }
  };
  const effects = createReplayEffects({ scene, navData, nav, origin: nav.center, readProducerFields, getCollisionMeshes: () => modelCollisions, getCollisionVersion: () => collisionVersion, floorState });
  const bombScene = createBombSceneController({ scene, getModelCenter: () => nav.center, getNav: () => nav,
    getState: () => ({ tick: hudTick, tickRate: timelineRate, bomb: bombTimeline?.at(hudTick) || { status: 'unknown' } }) });
  const voice = createVoicePlaybackController({ driver: voiceDriver, decode: voiceDecoder,
    resolveSide: id => hudById.get(id)?.side, emit: (type, value) => controller?.notify(type, value),
    setTimer: container.ownerDocument.defaultView.setInterval.bind(container.ownerDocument.defaultView),
    clearTimer: container.ownerDocument.defaultView.clearInterval.bind(container.ownerDocument.defaultView),
  });
  const playback = createReplayController({
    ...playbackBudget,
    emit: (type, payload) => {
      if (disposed) return;
      const discontinuity = ['playback.seek', 'playback.source', 'playback.loading'].includes(type);
      if (discontinuity) { seekRevision++; director.invalidate(); director.update(); }
      if (type.startsWith('playback.')) voice.sync({ tick: payload.tick, playing: payload.playing, speed: payload.speed, discontinuity });
      controller?.notify(type, payload, { changed: !['playback.time', 'playback.loading'].includes(type) });
    },
    onTracks: (tracks, context) => {
      if (disposed) return;
      voice.setTracks(tracks.voiceFrames || [], { tickRate: context.tickRate,
        status: context.segment ? playback.getState().capabilities.voiceFrames?.status || 'unknown' : 'unknown' });
      effects.setTracks(tracks, context); killEvents = (tracks.events || []).filter(event => event.type === 'player_death');
      timelineSegment = context.segment; timelineRate = context.tickRate;
      directorTimeline = createDirectorTimeline({ events: tracks.events || [], readEvent: event => {
        if (!['hltv_fixed', 'hltv_chase'].includes(event.type)) return null;
        const record = readDirectorEvent ? readDirectorEvent(event, { origin: [...origin], frames: tracks.frames || [], roster: context.roster || [] })
          : { type: event.type, tick: event.tick, position: event.position ? sourceToScene(event.position, origin) : null,
            targetId: event.targetId, secondaryId: event.secondaryId, pitch: event.pitch, yaw: event.yaw, fov: event.fov, distanceMetres: event.distanceMetres, inEye: event.inEye, inertia: event.inertia };
        if (record == null) return null;
        if (!['hltv_fixed', 'hltv_chase'].includes(record.type) || !Number.isFinite(record.tick)
          || ['pitch', 'yaw', 'fov', 'distanceMetres', 'inertia'].some(key => record[key] != null && !Number.isFinite(record[key]))
          || ['targetId', 'secondaryId'].some(key => record[key] != null && (typeof record[key] !== 'string' || !record[key]))
          || (record.position != null && (!Array.isArray(record.position) || record.position.length !== 3 || !record.position.every(Number.isFinite)))
          || (record.inEye != null && typeof record.inEye !== 'boolean')) throw new ViewerError('invalid_director', 'Director adapter must return finite scene-local positions, angles and stable player IDs');
        return record;
      } });
      bombTimeline = createBombTimeline({ events: tracks.events || [], tickRate: context.tickRate, readEvent: event => {
        const fields = readProducerFields?.(event.producerFields) || {};
        const position = event.position || [fields.x ?? fields.user_X, fields.y ?? fields.user_Y, fields.z ?? fields.user_Z];
        const kit = fields.hasKit ?? fields.haskit ?? fields.has_kit ?? fields.has_defuser;
        return { type: event.type, tick: event.tick, position: Array.isArray(position) && position.length === 3 && position.every(Number.isFinite) ? position : null, hasKit: kit == null ? null : Boolean(kit) };
      } });
      playerTimeline = createPlayerTimeline({ frames: tracks.frames || [], events: tracks.events || [], tickRate: context.tickRate,
        readEvent: event => {
          const fields = readProducerFields?.(event.producerFields) || {};
          return { ...event, playerId: ['player_hurt', 'player_death', 'player_blind'].includes(event.type) ? event.targetId : event.actorId,
            health: fields.health, cost: fields.cost, sold: fields.was_sold, hitGroup: fields.hitgroup ?? fields.hit_group };
        },
      });
    },
    onFrame: (frame, { tick, roster }) => {
      if (disposed) return;
      cameraPlayers = new Map((frame?.players || []).map(player => [player.playerId, { id: player.playerId, position: player.position ? sourceToScene(player.position, origin) : null, pitch: player.pitch, yaw: player.yaw, crouchAmount: player.crouchAmount, scoped: player.scoped, alive: player.alive ?? (Number.isFinite(player.health) ? player.health > 0 : null) }]));
      const names = new Map(roster.map(player => [player.id, player.name]));
      hudTick = tick;
      const eventsKnown = ['available', 'empty'].includes(playback.getState().capabilities.events?.status);
      hudPlayers = (frame?.players || []).map(player => {
        const status = describePlayer(player), id = player.playerId;
        const hurt = playerTimeline?.latest(id, 'player_hurt', tick, 1.6);
        const shortHurt = playerTimeline?.latest(id, 'player_hurt', tick, .15625);
        const firing = playerTimeline?.latest(id, 'weapon_fire', tick, .125);
        const balance = playerTimeline?.balanceAt(id, tick);
        const purchases = playerTimeline?.purchasesAt(id, tick, { startTick: timelineSegment?.activeStartTick, freezeStartTick: timelineSegment?.startTick });
        const fields = readProducerFields?.(player.producerFields) || {};
        const sourceFlash = flashMode === 'source-duration' ? playerTimeline?.flashAt(id, tick) : null;
        if (sourceFlash) status.flashDurationSeconds = sourceFlash.remaining;
        return { id, name: names.get(id) || id, side: player.side, ...status, animation: {
          reload: status.alive === false ? null : playerTimeline?.reloadAt(id, tick) || null,
          delayedHealth: delayedPlayerHealth(status.health, hurt, hurt ? (tick - hurt.tick) / timelineRate : Infinity),
          firing: eventsKnown ? Boolean(firing && tick - firing.tick < timelineRate * .125) : null,
          hurt: eventsKnown ? Boolean(shortHurt && tick - shortHurt.tick < timelineRate * .15625) : null,
          headHurt: eventsKnown ? Boolean(shortHurt && tick - shortHurt.tick < timelineRate * .15625 && (Number(shortHurt.hitGroup) === 1 || shortHurt.hitGroup === 'head')) : null,
          moneyDelta: status.money == null ? null : balance?.delta || purchases?.delta || 0,
          flash: flashPresentation({ remaining: sourceFlash?.remaining ?? status.flashDurationSeconds, initial: sourceFlash?.initial ?? fields.flashInitialDuration, maxAlpha: fields.flashMaxAlpha }),
        } };
      });
      hudById = new Map(hudPlayers.map(player => [player.id, player]));
      // Events are ordered by the source contract; binary seek avoids rescanning
      // the entire track every frame. UI receives only the last five deaths.
      let left = 0, right = killEvents.length;
      while (left < right) { const middle = Math.floor((left + right) / 2); if (killEvents[middle].tick <= tick) left = middle + 1; else right = middle; }
      hudKills = killEvents.slice(Math.max(0, left - 5), left).reverse().map(event => ({ id: event.id, tick: event.tick,
        actorId: event.actorId ?? null, actorName: names.get(event.actorId) ?? null,
        targetId: event.targetId ?? null, targetName: names.get(event.targetId) ?? null,
        assistantId: event.assistantId ?? null, assistantName: names.get(event.assistantId) ?? null, weapon: event.weapon ?? null,
      }));
      for (const player of frame?.players || []) if (['T', 'CT'].includes(player.side) && !baseColors.has(player.playerId)) { const seat = sideSeats.get(player.side) || 0; baseColors.set(player.playerId, playerBaseColor(seat, player.playerId)); sideSeats.set(player.side, seat + 1); }
      players = (frame?.players || []).filter(player => player.position && ['T', 'CT'].includes(player.side)).map(player => ({
        id: player.playerId, kind: 'player', name: names.get(player.playerId) || player.playerId, team: player.side,
        position: sourceToScene(player.position, origin), rotationY: Math.atan2(-Math.sin((player.yaw || 0) * Math.PI / 180), -Math.cos((player.yaw || 0) * Math.PI / 180)),
        alive: hudById.get(player.playerId)?.alive ?? null, crouched: (player.crouchAmount || 0) > .5, baseColor: baseColors.get(player.playerId),
      }));
      if (selectedId && !players.some(player => player.id === selectedId)) selectedId = null;
      drawPlayers(); effects.update(tick); bombScene.update(); playerCamera.update();
    },
  });
  const equipmentStats = () => {
    const stats = { ready: 0, loading: 0, failed: 0, triangles: 0 };
    for (const group of [...markers.values()].map(pawn => pawn.userData.heldWeapon).concat(povWeapon).filter(Boolean)) {
      const status = group.userData.weaponModelStatus;
      if (status === 'ready') stats.ready++; else if (status === 'loading') stats.loading++; else if (status === 'error') stats.failed++;
      for (const child of group.children) stats.triangles += (child.geometry?.index?.count || child.geometry?.getAttribute('position')?.count || 0) / 3;
    }
    return stats;
  };
  let layoutFailed = false;
  const readMonitorLayout = () => {
    const { width, height } = renderer.domElement.getBoundingClientRect();
    if (!monitorLayout) return createMonitorLayout(width, height, monitorIds);
    try {
      const value = monitorLayout({ width, height, playerIds: [...monitorIds] });
      if (value == null) { layoutFailed = false; return null; }
      if (!Number.isFinite(value.mainWidth) || value.mainWidth <= 0 || value.mainWidth > width
        || !Array.isArray(value.tiles) || value.tiles.length > monitorIds.length
        || new Set(value.tiles.map(tile => tile.id)).size !== value.tiles.length
        || value.tiles.some(tile => !monitorIds.includes(tile.id) || ![tile.x, tile.y, tile.width, tile.height].every(Number.isFinite)
          || tile.x < 0 || tile.y < 0 || tile.width < 2 || tile.height < 2 || tile.x + tile.width > width || tile.y + tile.height > height)) {
        throw new ViewerError('invalid_layout', 'Monitor layout requires unique selected IDs and rectangles within the canvas');
      }
      layoutFailed = false;
      return { width, height, mainWidth: value.mainWidth, tiles: value.tiles.map(tile => ({ ...tile })) };
    } catch (error) {
      if (!layoutFailed) { try { onObserverError?.(error); } catch {} }
      layoutFailed = true; return null;
    }
  };
  const monitor = createMonitorRenderer({ renderer, scene, primaryCamera: camera, viewportSize, markers, primaryOnlyObjects: [povEquipment],
    getPrimaryHiddenObjects: () => { const followed = playerCamera.getState(), directed = director.getState(); const pawn = followed.status === 'following' ? markers.get(followed.playerId) : directed.status === 'following' ? markers.get(directed.playerId) : null; return pawn ? [pawn] : []; },
    getPlayers: () => monitorIds.map(id => cameraPlayers.get(id)).filter(Boolean),
    isActive: () => monitorIds.length > 0 && !camera.planView,
    getPose: player => player,
    getLayout: readMonitorLayout,
    getPlaybackState: () => ({ source: playback.getState().segment?.id, seek: seekRevision, tick: playback.getState().tick }),
    getContentState: () => [playback.getState().tick, collisionVersion, modelVisible, modelStyle.opacity, modelStyle.focus, modelStyle.range, floorState.x, floorState.y, floorState.w, focusScreen.x, focusScreen.y, ...[...markers.values()].map(pawn => pawn.userData.heldWeapon?.userData.weaponModelRevision)],
  });
  const changed = () => { workspaceEpoch++; drawPlayers(); controller.notify('workspace.changed', { playerCount: players.length }, { changed: true }); };
  const focusPoint = position => { const point = new THREE.Vector3().fromArray(vector(position, 'position')); releaseCamera(); const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(12); if (camera.planView) { camera.planSpan = 16; camera.updateProjectionMatrix(); } controls.target.copy(point); camera.position.copy(point).add(offset); controls.update(); controller.notify('camera.changed', cameraState(), { changed: true }); };
  if (utilitySource) {
    utilityRenderer = createUtilityRenderer({ scene, origin: [...origin], navData, floorState });
    if (!utilityRenderer || ['place', 'move', 'remove', 'getPlacements', 'clear', 'dispose'].some(k => typeof utilityRenderer[k] !== 'function')) throw new ViewerError('invalid_ports', 'Utility renderer requires placement, clear and disposal methods');
    utilityReferences = createUtilityReferenceController({ source: utilitySource, renderer: utilityRenderer, mapName,
      isEditable: () => !disposed && playback.getState().status === 'empty', readGuard: () => workspaceEpoch,
      notify: (...args) => { workspaceEpoch++; controller.notify(...args); }, onReleaseError: onObserverError });
  }
  const commands = createCommandRegistry({
    ...(utilityReferences ? { 'utility.place': (args, context) => utilityReferences.place(args, context), 'utility.move': args => utilityReferences.move(args), 'utility.remove': args => utilityReferences.remove(args) } : {}),
    ...(resources ? {
      'model.style': ({ opacity, focus, range }) => {
        if ((opacity != null && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1))
          || (range != null && (!Number.isFinite(range) || range < 0 || range > 1))
          || (focus != null && !['full', 'pointer', 'camera'].includes(focus))) {
          throw new ViewerError('invalid_argument', 'Model style requires opacity/range 0–1 and full/pointer/camera focus');
        }
        if (opacity != null) modelStyle.opacity = opacity;
        if (range != null) modelStyle.range = range;
        if (focus != null) modelStyle.focus = focus;
        modelMode.value = ['full', 'pointer', 'camera'].indexOf(modelStyle.focus);
        modelRange.value = modelStyle.range;
        display?.setOpacity(modelStyle.opacity);
        controller.notify('model.style', { ...modelStyle }, { changed: true });
      },
      'model.visibility': ({ visible }) => { if (typeof visible !== 'boolean') throw new ViewerError('invalid_argument', 'visible must be a boolean'); modelVisible = visible; if (worldModel) worldModel.visible = visible && !camera.planView; else if (visible && !camera.planView) resources.ensure('world-model').catch(() => {}); else resources.cancel('world-model'); controller.notify('model.visibility', { visible }, { changed: true }); },
      'model.objectsVisibility': ({ ids, visible, signature }) => { if (!display) throw new ViewerError('not_ready', 'Model is not ready'); display.setObjects(ids, visible, signature); collisionVersion++; controller.notify('model.objectsChanged', { signature, ids, visible }, { changed: true }); },
      'model.unload': () => { modelVisible = false; resources.unload('world-model'); controller.notify('model.visibility', { visible: false }, { changed: true }); },
    } : {}),
    'map.floor': ({ id }) => { if (typeof id !== 'string' || (id !== 'all' && !Object.hasOwn(ranges, id))) throw new ViewerError('invalid_floor', 'Unknown floor ID'); applyFloorRange(floorState, id === 'all' ? null : ranges[id], origin[1]); activeFloor = id; drawPlayers(); effects.update(playback.getState().tick); controller.notify('map.floor', { id }, { changed: true }); },
    'replay.open': ({ segmentId }, context) => playback.openSegment(segmentId, { signal: context.signal, ...(voiceDecoder ? { tracks: ['frames', 'events', 'projectiles', 'smokeFrames', 'fireFrames', 'voiceFrames'] } : {}) }),
    'voice.configure': args => { voice.configure(args); controller.notify('voice.options', voice.getState(), { changed: true }); },
    'replay.play': () => playback.play(), 'replay.pause': () => playback.pause(),
    'replay.seek': ({ tick }) => playback.seek(tick), 'replay.speed': ({ speed }) => playback.setSpeed(speed),
    'replay.overlays': args => {
      const allowed = ['enabled', 'hurt', 'flash', 'reducedEffects', 'maxFlashOpacity'];
      if (Object.keys(args).some(key => !allowed.includes(key)) || allowed.slice(0, 4).some(key => Object.hasOwn(args, key) && typeof args[key] !== 'boolean')
        || (Object.hasOwn(args, 'maxFlashOpacity') && (!Number.isFinite(args.maxFlashOpacity) || args.maxFlashOpacity < 0 || args.maxFlashOpacity > 1))) throw new ViewerError('invalid_argument', 'Overlay options require booleans and maximum flash opacity 0–1');
      Object.assign(overlayOptions, args); overlayLayer.update(getCombatOverlayState());
      controller.notify('playback.overlays', { ...overlayOptions }, { changed: true });
    },
    'replay.display': ({ effects: showEffects, trajectories }) => { if ((showEffects != null && typeof showEffects !== 'boolean') || (trajectories != null && typeof trajectories !== 'boolean')) throw new ViewerError('invalid_argument', 'Effect display flags must be booleans'); effects.setDisplay({ ...(showEffects != null ? { effects: showEffects } : {}), ...(trajectories != null ? { trajectories } : {}) }); effects.update(playback.getState().tick); controller.notify('playback.display', effects.getDisplay(), { changed: true }); },
    'workspace.players': ({ players: input, ...extra }) => { if (Object.keys(extra).length) throw new ViewerError('invalid_workspace', 'workspace.players accepts only players'); const next = normalizeWorkspacePlayers(input); players = normalize(next); selectedId = null; changed(); controller.notify('workspace.playersChanged', { players: readWorkspace().players }, { changed: true }); },
    'board.apply': ({ snapshot }) => { const next = normalize(snapshot?.points); players = next; selectedId = null; changed(); },
    'board.clear': () => { utilityRenderer?.clear(); players = []; selectedId = null; changed(); },
    'player.rename': ({ id, name }) => { if (typeof name !== 'string' || !name.trim()) throw new ViewerError('invalid_argument', 'Name is required'); find(id).name = name.trim(); changed(); },
    'player.team': ({ id, team }) => { if (!['T', 'CT'].includes(team)) throw new ViewerError('invalid_argument', 'Team must be T or CT'); find(id).team = team; changed(); },
    'player.move': ({ id, position }) => { const next = vector(position, 'position'); find(id).position = next; changed(); },
    'camera.pov': ({ id }) => { playerCamera.validate(id); director.release(); playerCamera.follow(id); controller.notify('camera.changed', cameraState(), { changed: true }); },
    'camera.director': ({ mode }) => { director.validate(mode); if (playback.getState().status !== 'ready') throw new ViewerError('not_ready', 'Load a replay before enabling the director'); playerCamera.release(); director.start(mode); controller.notify('camera.changed', cameraState(), { changed: true }); },
    'camera.free': () => { releaseCamera(); controller.notify('camera.changed', cameraState(), { changed: true }); },
    'camera.monitor': ({ playerIds }) => {
      if (!Array.isArray(playerIds) || playerIds.length > 16 || new Set(playerIds).size !== playerIds.length || playerIds.some(id => typeof id !== 'string' || !cameraPlayers.has(id))) throw new ViewerError('invalid_argument', 'Monitor requires up to 16 unique player IDs from the current frame');
      if (camera.planView && playerIds.length) throw new ViewerError('camera_mode', 'Switch to 3D before enabling monitors');
      monitorIds = [...playerIds]; seekRevision++; controller.notify('camera.changed', cameraState(), { changed: true });
    },
    'camera.reset': () => { releaseCamera(); projection.update(false); resetCamera(); controller.notify('camera.changed', cameraState(), { changed: true }); },
    'camera.mode': ({ mode }) => { if (!['2d', '3d'].includes(mode)) throw new ViewerError('invalid_argument', 'Mode must be 2d or 3d'); releaseCamera(); if (mode === '2d') monitorIds = []; projection.update(mode === '2d'); if (mode === '3d' && modelVisible && !worldModel) resources?.ensure('world-model').catch(() => {}); controller.notify('camera.changed', cameraState(), { changed: true }); },
    'camera.focusPoint': ({ position }) => focusPoint(position),
    'camera.focusPlayer': ({ id }) => focusPoint(find(id).position),
  }, { before: type => { if (/^(board|player|workspace|utility)\./.test(type) && playback.getState().status !== 'empty') throw new ViewerError('readonly_replay', 'Detach the replay source before editing the board'); } });
  controller = createViewerController({ commands, policy, onObserverError, profile: 'standalone', queries: ['getModelObjects', 'getModelObjectTree'],
    readWorkspace,
    ...(utilityReferences ? { readUtilityCatalogue: (query, context) => utilityReferences.list(query, context) } : {}),
    readState: () => ({ ready: true, mapName, workspace: { points: players.map(player => ({ ...player, position: [...player.position] })) }, selectedId, camera: cameraState(), voice: voice.getState(), hud: { overlayOptions: { ...overlayOptions }, overlays: getCombatOverlayState(), bomb: bombTimeline?.at(hudTick) || null, tick: hudTick, players: hudPlayers, kills: hudKills, eventsStatus: playback.getState().capabilities.events?.status || 'unknown' }, equipmentStats: equipmentStats(), playback: playback.getState(), effectCounts: effects.getCounts(), effectDisplay: effects.getDisplay(), resources: resources?.getState() || [], renderStats: { frame: renderer.info.render.frame, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }, monitorStats: { ...monitor.stats }, modelVisible, modelStats: worldModel?.userData.renderStats || null, modelStyle: { ...modelStyle }, floor: activeFloor, floors: Object.entries(ranges).map(([id, range]) => ({ id, range: [...range] })), coordinates: { space: 'scene-local', unit: 'metres', origin } }),
    readCapabilities: () => ({ utilityReferences: Boolean(utilityReferences), editing: playback.getState().status === 'empty', camera: true, picking: true, director: true, voice: Boolean(voiceDriver && voiceDecoder), firstPerson: true, monitors: true, equipment: Boolean(weaponIcons), hud: true, nav: true, utilities: true, replay: true, model: Boolean(resources) }),
  });
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down = null;
  const pointerDown = event => { down = [event.clientX, event.clientY]; };
  const pointerUp = event => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) { down = null; return; }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    let object = raycaster.intersectObjects([...markers.values()].filter(marker => marker.visible), true)[0]?.object;
    while (object && !object.userData.playerId) object = object.parent;
    selectedId = object?.userData.playerId || null;
    controller.notify('selection.changed', { id: selectedId }, { origin: 'pointer' });
  };
  const pointerMove = event => { const rect = renderer.domElement.getBoundingClientRect(); focusScreen.set((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height); };
  renderer.domElement.addEventListener('pointermove', pointerMove);
  const cameraChanged = () => controller.notify('camera.changed', cameraState(), { origin: 'pointer' });
  controls.addEventListener('end', cameraChanged);
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
  const stopResize = viewport.onResize(() => renderer.getDrawingBufferSize(viewportSize));
  const win = container.ownerDocument.defaultView;
  const stopLoop = createRenderLoop(timestamp => {
    playback.update(timestamp);
    { const state = playback.getState(); voice.sync({ tick: state.tick, playing: state.playing, speed: state.speed }); }
    playerCamera.update(); director.update(timestamp);
    if (!playerCamera.getState().playerId && !director.getState().mode) controls.update();
    projection.update(Boolean(camera.planView));
    const monitorRect = monitorIds.length && !camera.planView ? readMonitorLayout() : null;
    const bounds = renderer.domElement.getBoundingClientRect();
    overlayLayer.setViewport(monitorRect ? { left: 0, top: 0, width: monitorRect.mainWidth, height: bounds.height } : null);
    overlayLayer.update(getCombatOverlayState());
    const primaryPlayerId = playerCamera.getState().playerId || director.getState().playerId;
    const followedStatus = hudById.get(primaryPlayerId);
    povEquipment.visible = Boolean(weaponIcons && (playerCamera.getState().status === 'following' || director.getState().status === 'following') && followedStatus?.weapon);
    if (povEquipment.visible) {
      if (!povWeapon) { povWeapon = createHeldWeapon(followedStatus.weapon.name, followedStatus.side, followedStatus.id); povEquipment.add(povWeapon); }
      povWeapon.userData.playerId = followedStatus.id;
      updateWeaponModel(povWeapon, followedStatus.weapon.name, { side: followedStatus.side });
      const { reloadDrop: drop, recoil } = weaponAnimation(followedStatus.animation?.reload, followedStatus.animation?.firing, followedStatus.weapon.kind);
      povEquipment.position.y = -.35 + recoil * .05 - drop * .56; povEquipment.rotation.x = -recoil * .06 + drop * .68;

    }
    if (worldModel) worldModel.visible = modelVisible && !camera.planView;
    const followed = playerCamera.getState(), directed = director.getState(), pawn = followed.status === 'following' ? markers.get(followed.playerId) : directed.status === 'following' ? markers.get(directed.playerId) : null;
    const visible = pawn?.visible;
    // Hide the followed pawn in the primary view only, not in other monitors.
    // 主视图隐藏自身棋子；监视器仍可看到其他玩家，最后恢复显隐。
    if (!monitor.render(timestamp)) {
      if (pawn) pawn.visible = false;
      try { viewport.render(); } finally { if (pawn) pawn.visible = visible; }
    }
  }, { presentation, document: container.ownerDocument, requestFrame: win.requestAnimationFrame.bind(win), cancelFrame: win.cancelAnimationFrame.bind(win) });
  const setDataSource = source => { if (disposed) throw new ViewerError('disposed', 'Viewer is disposed'); if (source && source.getMetadata().mapName !== mapName) throw new ViewerError('map_mismatch', 'Replay map does not match the injected NAV'); workspaceEpoch++; releaseCamera(); monitorIds = []; baseColors.clear(); sideSeats.clear(); playback.setSource(source); };
  if (dataSource) setDataSource(dataSource);
  return Object.freeze({ setDataSource, getModelObjects: query => { if (disposed) throw new ViewerError('disposed', 'Viewer is disposed'); if (!display) throw new ViewerError('not_ready', 'Model is not ready'); return display.objects.getCatalogue(query); }, getModelObjectTree: query => { if (disposed) throw new ViewerError('disposed', 'Viewer is disposed'); if (!display) throw new ViewerError('not_ready', 'Model is not ready'); return display.objects.getTree(query); }, apiVersion: controller.apiVersion, execute: controller.execute, getState: controller.getState, getCapabilities: controller.getCapabilities, getContract: controller.getContract, getWorkspace: controller.getWorkspace, ...(utilityReferences ? { getUtilityCatalogue: controller.getUtilityCatalogue } : {}), on: controller.on,
    dispose() { if (disposed) return; disposed = true; utilityReferences?.dispose(); utilityRenderer?.dispose(); stopLoop(); voice.dispose(); resources?.dispose(); monitor.dispose(); director.dispose(); playerCamera.dispose(); playback.dispose(); cameraPlayers.clear(); hudPlayers = []; hudById.clear(); killEvents = []; hudKills = []; playerTimeline = null; bombTimeline = null; directorTimeline = null; timelineSegment = null; effects.dispose(); bombScene.dispose(); overlayLayer.dispose(); if (ownsContainerPosition && container.style.position === 'relative') container.style.position = previousContainerPosition; stopResize(); controls.removeEventListener('end', cameraChanged); controls.dispose(); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); controller.dispose(); releaseObjects(povEquipment); scene.remove(camera); releaseObjects(content); releaseObjects(nav.group); viewport.dispose(); },
  });
}
