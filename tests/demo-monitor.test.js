import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildMonitorRoster, mergeMonitorSnapshot, monitorTeamPrimary, sameTeamMonitorPlayers } from '../src/demo/monitorPlayers.js';
import createDemoMonitorRenderer from '../src/three/demoMonitorRenderer.js';

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
  const viewportCalls = [];
  const wall = {
    getBoundingClientRect: () => ({ left: 800 }),
    querySelectorAll: () => [],
  };
  const renderer = {
    autoClear: true,
    domElement: { getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600 }) },
    clear: () => {},
    render: () => {},
    setScissor: () => {},
    setScissorTest: () => {},
    setViewport: (...args) => viewportCalls.push(args),
  };
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

  assert.deepEqual(viewportCalls.at(-1), [0, 0, 1000, 600]);
  assert.equal(renderer.autoClear, true);
});
