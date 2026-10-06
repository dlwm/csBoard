import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildMonitorRoster, mergeMonitorSnapshot, monitorTeamPrimary, sameTeamMonitorPlayers } from '../src/demo/monitorPlayers.js';
import createDemoMonitorRenderer from '../src/three/demoMonitorRenderer.js';

// Mirror the WebGL state used by the monitor's cached render targets. Keep
// restoration observable instead of making missing renderer APIs no-ops.
function createRendererStub(onRender = () => {}) {
  const viewport = new THREE.Vector4(0, 0, 1000, 600);
  const scissor = viewport.clone();
  const viewportCalls = [];
  let target = null, scissorTest = false;
  const copyRect = (rect, args) => args[0]?.isVector4 ? rect.copy(args[0]) : rect.set(...args);
  return {
    autoClear: true,
    viewportCalls,
    domElement: { getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600 }) },
    getPixelRatio: () => 1,
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    getViewport: output => output.copy(viewport),
    setViewport(...args) { copyRect(viewport, args); viewportCalls.push(viewport.toArray()); },
    getScissor: output => output.copy(scissor),
    setScissor(...args) { copyRect(scissor, args); },
    getScissorTest: () => scissorTest,
    setScissorTest(value) { scissorTest = value; },
    clear() {},
    render: onRender,
  };
}

test('monitor roster retains players omitted after death and merges the live POV fields', () => {
  const snapshots = [
    { tick: 10, players: [{ steamid: '1', name: 'alive', health: 100, team: 2 }, { steamid: '2', name: 'later-dead', health: 100, team: 3 }] },
    { tick: 20, players: [{ steamid: '1', name: 'alive', health: 63, team: 2, yaw: 45, position: { x: 1, y: 2, z: 3 } }] },
  ];
  const roster = buildMonitorRoster(snapshots);
  const players = mergeMonitorSnapshot(roster, snapshots[1]);

  assert.equal(players.length, 2);
  assert.deepEqual(players.map((player) => player.monitorId), ['1', '2']);
  assert.equal(players[0].health, 63);
  assert.equal(players[0].yaw, 45);
  assert.equal(players[1].health, 0);
  assert.equal(players[1].name, 'later-dead');
});

test('team switch prefers a living player and falls back to a dead teammate', () => {
  const players = [
    { monitorId: 't-dead', team: 2, health: 0 },
    { monitorId: 't-alive', team: 2, health: 42, hasPosition: true },
    { monitorId: 'ct-dead', team: 3, health: 0 },
  ];

  assert.equal(monitorTeamPrimary(players, 2)?.monitorId, 't-alive');
  assert.equal(monitorTeamPrimary(players, 3)?.monitorId, 'ct-dead');
  assert.equal(monitorTeamPrimary(players, 1), null);
});

test('monitor wall only exposes teammates of the selected primary POV', () => {
  const players = [
    { monitorId: 't1', team: 2 },
    { monitorId: 't2', team: 2 },
    { monitorId: 'ct1', team: 3 },
    { monitorId: 'ct2', team: 3 },
  ];

  assert.deepEqual(sameTeamMonitorPlayers(players, 't1').map((player) => player.monitorId), ['t2']);
  assert.deepEqual(sameTeamMonitorPlayers(players, 'ct1').map((player) => player.monitorId), ['ct2']);
  assert.deepEqual(sameTeamMonitorPlayers(players, 'missing'), []);
});

test('leaving monitor mode restores the full WebGL viewport', () => {
  const wall = {
    getBoundingClientRect: () => ({ left: 800 }),
    querySelectorAll: () => [],
  };
  const renderer = createRendererStub();
  const modeRef = { current: 'monitor' };
  const monitor = createDemoMonitorRenderer({
    mount: { parentElement: { querySelector: () => wall } },
    renderer,
    scene: new THREE.Scene(),
    primaryCamera: new THREE.PerspectiveCamera(),
    playersRef: { current: [{ monitorId: '1' }] },
    modeRef,
    getModelCenter: () => new THREE.Vector3(),
    markers: new Map(),
  });

  monitor.render(1000);
  modeRef.current = 'manual';
  monitor.render(1016);

  assert.deepEqual(renderer.viewportCalls.at(-1), [0, 0, 1000, 600]);
  assert.equal(renderer.autoClear, true);
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(renderer.getScissorTest(), false);
  monitor.dispose();
});

test('monitor views update shared world matrices once and restore flags after errors', () => {
  const scene = new THREE.Scene();
  let updates = 0;
  const update = scene.updateMatrixWorld.bind(scene);
  scene.updateMatrixWorld = (...args) => { updates++; update(...args); };
  let fail = false;
  let renders = 0;
  const overlay = new THREE.Object3D();
  const marker = new THREE.Object3D();
  const renderer = createRendererStub(renderedScene => {
    // The cached tile is composited in a separate scene; count only world passes.
    if (renderedScene !== scene) return;
    renders++;
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (fail && renderer.getRenderTarget()) throw Error('renderer failed');
  });
  const savedViewport = renderer.getViewport(new THREE.Vector4()).clone();
  const savedScissor = renderer.getScissor(new THREE.Vector4()).clone();
  const wall = { getBoundingClientRect: () => ({ left: 800 }), querySelectorAll: () => [{ dataset: { monitorPlayerId: '1' }, getBoundingClientRect: () => ({ left: 810, right: 990, top: 0, bottom: 200 }) }] };
  const monitor = createDemoMonitorRenderer({ mount: { parentElement: { querySelector: () => wall } }, renderer, scene, primaryCamera: new THREE.PerspectiveCamera(), playersRef: { current: [{ monitorId: '1', name: 'P', health: 100, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }] }, modeRef: { current: 'monitor' }, getModelCenter: () => new THREE.Vector3(), markers: new Map([['P', marker]]), primaryOnlyObjects: [overlay] });
  monitor.render(1000);
  assert.equal(renders, 2); assert.equal(updates, 1); assert.equal(scene.matrixWorldAutoUpdate, true); assert.equal(marker.visible, true); assert.equal(overlay.visible, true);
  fail = true;
  assert.throws(() => monitor.render(1100), /renderer failed/);
  assert.equal(scene.matrixWorldAutoUpdate, true); assert.equal(renderer.autoClear, true); assert.equal(overlay.visible, true);
  assert.equal(marker.visible, true);
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(renderer.getScissorTest(), false);
  assert.deepEqual(renderer.getViewport(new THREE.Vector4()), savedViewport);
  assert.deepEqual(renderer.getScissor(new THREE.Vector4()), savedScissor);
  monitor.dispose();
});
