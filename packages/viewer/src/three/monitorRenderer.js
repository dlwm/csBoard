import * as THREE from 'three';
import { applyPlayerCamera } from './playerCamera.js';

// Main view stays live; side views reuse bounded render textures. These limits
// control freshness, GPU memory and the amount of extra map work in one frame.
// 主视图实时绘制；小窗缓存画面并公平轮转，限制刷新频率、显存和单帧开销。
const MONITOR_FPS = 20;
const MAX_UPDATES_PER_FRAME = 2;
const UPDATE_BUDGET_MS = 5;
const MAX_TILE_WIDTH = 480;
const MAX_TILE_HEIGHT = 320;
const MAX_TILE_PIXEL_RATIO = 1.25;
const MAX_CACHE_PIXELS = 1024 * 1024;

export function createMonitorRenderer({ renderer, scene, primaryCamera, viewportSize, getPlayers, getPlayerId = player => player.id, getMonitorId = getPlayerId, isActive, getLayout, getPose, getContentState, getPlaybackState, markers, getPrimaryHiddenObjects = () => [], primaryOnlyObjects = [] }) {
  const tileCamera = new THREE.PerspectiveCamera(68, 1, 0.1, 200);
  const savedViewport = new THREE.Vector4(), savedScissor = new THREE.Vector4();
  const savedRenderSize = new THREE.Vector2();
  const blitScene = new THREE.Scene();
  const blitCamera = new THREE.Camera();
  const blitMaterial = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
  const blitGeometry = new THREE.PlaneGeometry(2, 2);
  const blitQuad = new THREE.Mesh(blitGeometry, blitMaterial);
  blitQuad.frustumCulled = false;
  blitScene.add(blitQuad);
  const cache = new Map();
  let wasActive = false;
  let updateCost = 0, frameCost = 0, lastFrameAt = null;
  let contentState = null, contentRevision = 0, playbackState = null;
  const stats = { scenePasses: 0, cachedTiles: 0, updates: 0, updateCostMs: 0 };

  const clearCache = () => { for (const entry of cache.values()) entry.target.dispose(); cache.clear(); stats.cachedTiles = 0; };
  const setPlayerCamera = (player, width, height) => {
    applyPlayerCamera(tileCamera, getPose(player), { aspect: width / Math.max(height, 1), far: primaryCamera.far });
  };

  const tileEntry = (tile, ratio) => {
    const scale = Math.min(ratio, MAX_TILE_WIDTH / tile.width, MAX_TILE_HEIGHT / tile.height);
    const width = Math.max(1, Math.round(tile.width * scale)), height = Math.max(1, Math.round(tile.height * scale));
    let entry = cache.get(tile.id);
    if (!entry) {
      const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, stencilBuffer: false, generateMipmaps: false });
      entry = { target, updatedAt: -Infinity, ready: false, contentRevision: -1 };
      cache.set(tile.id, entry);
    } else if (entry.target.width !== width || entry.target.height !== height) {
      entry.target.setSize(width, height); entry.updatedAt = -Infinity; entry.ready = false;
    }
    return entry;
  };

  const render = now => {
    const players = getPlayers() || [];
    const currentLayout = isActive() && players.length ? getLayout(now) : null;
    if (!currentLayout) {
      if (wasActive) {
        const { width, height } = renderer.domElement.getBoundingClientRect();
        primaryCamera.aspect = width / Math.max(height, 1); primaryCamera.updateProjectionMatrix();
        renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
        clearCache();
      }
      stats.scenePasses = 0; stats.updates = 0;
      wasActive = false; lastFrameAt = null; frameCost = 0;
      contentState = null; playbackState = null;
      return false;
    }
    wasActive = true;
    const nextPlayback = getPlaybackState?.();
    if (nextPlayback && playbackState && (nextPlayback.source !== playbackState.source || nextPlayback.seek !== playbackState.seek || nextPlayback.tick < playbackState.tick)) {
      // Do not present an old time/round while budgeted refreshes catch up.
      // 跳转/换回合时废弃旧画面，按预算生成新画面，不回显错误时间点。
      // Keep refresh timestamps for fair rotation during continuous scrubbing.
      for (const entry of cache.values()) entry.ready = false;
      contentState = null;
    }
    playbackState = nextPlayback;
    const nextContent = getContentState?.(now);
    if (!getContentState || !contentState || nextContent.length !== contentState.length || nextContent.some((value, index) => !Object.is(value, contentState[index]))) contentRevision++;
    contentState = nextContent;
    if (lastFrameAt != null) frameCost = frameCost ? frameCost * 0.9 + Math.min(200, now - lastFrameAt) * 0.1 : now - lastFrameAt;
    lastFrameAt = now;
    // A slower machine naturally refreshes fewer tiles. Pick the oldest tile
    // first, so one expensive view cannot starve the rest.
    // 慢设备降低小窗刷新频率，按最旧画面优先，避免某个视角长期得不到更新。
    const playersById = new Map(players.map(player => [getMonitorId(player), player]));
    const active = [];
    for (const tile of currentLayout.tiles) {
      const player = playersById.get(tile.id);
      const pose = player && getPose(player);
      if (!pose || pose.alive === false || !Array.isArray(pose.position) || pose.position.length !== 3 || !pose.position.every(Number.isFinite) || !Number.isFinite(pose.pitch) || !Number.isFinite(pose.yaw)) continue;
      active.push({ tile, player });
    }
    // Bound total texture pixels rather than player count, so custom recordings
    // with many bots keep all visible monitor slots.
    // 按总像素约束缓存，不按人数裁掉小窗，兼容多人自制录像。
    const pixels = active.reduce((sum, { tile }) => sum + tile.width * tile.height, 0);
    const ratio = Math.min(renderer.getPixelRatio(), MAX_TILE_PIXEL_RATIO, Math.sqrt(MAX_CACHE_PIXELS / Math.max(pixels, 1)));
    for (const item of active) item.entry = tileEntry(item.tile, ratio);
    const refreshInterval = Math.max(1000 / MONITOR_FPS, frameCost * active.length);
    const activeIds = new Set(active.map(({ tile }) => tile.id));
    for (const [id, entry] of cache) if (!activeIds.has(id)) { entry.target.dispose(); cache.delete(id); }
    // Pause stable views entirely. Live clocks (e.g. decoy/muzzle blinking),
    // settings, geometry visibility and playback contribute to content state.
    // 静止画面不重绘；闪烁动画、显示设置、对象显隐和回放进度会使缓存失效。
    const due = active.filter(({ entry }) => !entry.ready || (entry.contentRevision !== contentRevision && now - entry.updatedAt >= refreshInterval)).sort((a, b) => a.entry.updatedAt - b.entry.updatedAt);
    // Always allow one update to make progress, even if a single pass exceeds
    // the budget. A second is allowed only when recent measured cost is low.
    const updateLimit = Math.min(MAX_UPDATES_PER_FRAME, Math.max(1, Math.floor(UPDATE_BUDGET_MS / Math.max(updateCost, 0.1))));
    const autoUpdate = scene.matrixWorldAutoUpdate, autoClear = renderer.autoClear;
    const target = renderer.getRenderTarget(), scissorTest = renderer.getScissorTest();
    renderer.getViewport(savedViewport); renderer.getScissor(savedScissor);
    if (viewportSize) savedRenderSize.copy(viewportSize);
    const primaryOnlyVisibility = primaryOnlyObjects.map(object => object.visible);
    if (autoUpdate) scene.updateMatrixWorld();
    scene.matrixWorldAutoUpdate = false;
    stats.scenePasses = 0; stats.updates = 0;
    try {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, currentLayout.width, currentLayout.height);
      renderer.clear(); renderer.autoClear = false; renderer.setScissorTest(true);
      const aspect = currentLayout.mainWidth / Math.max(currentLayout.height, 1);
      if (primaryCamera.aspect !== aspect) { primaryCamera.aspect = aspect; primaryCamera.updateProjectionMatrix(); }
      renderer.setViewport(0, 0, currentLayout.mainWidth, currentLayout.height);
      renderer.setScissor(0, 0, currentLayout.mainWidth, currentLayout.height);
      const hiddenObjects = getPrimaryHiddenObjects(), hiddenVisibility = hiddenObjects.map(object => object.visible);
      hiddenObjects.forEach(object => { object.visible = false; });
      try { renderer.render(scene, primaryCamera); stats.scenePasses++; }
      finally { hiddenObjects.forEach((object, index) => { object.visible = hiddenVisibility[index]; }); }

      primaryOnlyObjects.forEach(object => { object.visible = false; });
      const startedAt = performance.now();
      for (const { tile, player, entry } of due.slice(0, updateLimit)) {
        if (stats.updates && performance.now() - startedAt >= UPDATE_BUDGET_MS) break;
        const began = performance.now();
        setPlayerCamera(player, tile.width, tile.height);
        // RenderTarget owns a physical-pixel viewport; do not pass its size to
        // setViewport(), which multiplies by the main canvas pixel ratio.
        renderer.setRenderTarget(entry.target);
        if (viewportSize) viewportSize.set(entry.target.width, entry.target.height);
        renderer.clear();
        const marker = markers.get(getPlayerId(player)), markerVisible = marker?.visible;
        if (marker) marker.visible = false;
        try { renderer.render(scene, tileCamera); }
        finally { if (marker) marker.visible = markerVisible; }
        entry.updatedAt = now; entry.ready = true; entry.contentRevision = contentRevision;
        const elapsed = performance.now() - began;
        updateCost = updateCost ? updateCost * 0.8 + elapsed * 0.2 : elapsed;
        stats.scenePasses++; stats.updates++;
      }
      if (viewportSize) viewportSize.copy(savedRenderSize);
      renderer.setRenderTarget(null); renderer.setScissorTest(true);
      for (const { tile, entry } of active) {
        if (!entry.ready) continue;
        blitMaterial.map = entry.target.texture;
        renderer.setViewport(tile.x, tile.y, tile.width, tile.height);
        renderer.setScissor(tile.x, tile.y, tile.width, tile.height);
        renderer.render(blitScene, blitCamera);
      }
      stats.cachedTiles = cache.size; stats.updateCostMs = updateCost;
    } finally {
      if (viewportSize) viewportSize.copy(savedRenderSize);
      scene.matrixWorldAutoUpdate = autoUpdate;
      primaryOnlyObjects.forEach((object, index) => { object.visible = primaryOnlyVisibility[index]; });
      renderer.setRenderTarget(target); renderer.setViewport(savedViewport); renderer.setScissor(savedScissor);
      renderer.setScissorTest(scissorTest); renderer.autoClear = autoClear;
    }
    return true;
  };

  return {
    render,
    // Runtime profiling only: does not change UI or persist machine data.
    stats,
    dispose: () => { clearCache(); blitGeometry.dispose(); blitMaterial.dispose(); },
  };
}
