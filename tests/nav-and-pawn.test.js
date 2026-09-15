import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildNavTopViewLayers } from '../src/data/navTopView.js';
import { squareRadarBounds } from '../src/data/radarBounds.js';
import { createPlayerPawn } from '../src/three/playerPawn.js';
import { createCollabPlayer, setCollabPlayerCrouch } from '../src/three/collabPlayer.js';

test('non-square world extents preserve equal X/Y scale and center', () => {
  assert.deepEqual(squareRadarBounds(0, 200, 0, 100), { minX: 0, minY: -50, size: 200 });
  assert.deepEqual(squareRadarBounds(-50, 50, -200, 200), { minX: -200, minY: -200, size: 400 });
});

test('real multi-floor NAV layers use one square viewport', () => {
  for (const name of ['de_nuke', 'de_train', 'de_vertigo']) {
    const nav = JSON.parse(readFileSync(new URL(`../src/data/nav/${name}.json`, import.meta.url)));
    const layers = buildNavTopViewLayers(nav, name);
    assert.deepEqual(layers.map(layer => layer.id), ['main', 'lower']);
    const boxes = layers.map(layer => {
      const svg = decodeURIComponent(layer.url.slice(layer.url.indexOf(',') + 1));
      assert.ok(svg.includes('preserveAspectRatio="xMidYMid meet"'));
      return svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    });
    assert.deepEqual(boxes[0], boxes[1]);
    assert.equal(boxes[0][2], boxes[0][3]);
  }
});

test('Train main ground does not disappear into the lower floor', () => {
  const area = (x, z) => ({ corners: [{ x, y: 0, z }, { x: x + 10, y: 0, z }, { x, y: 10, z }] });
  const layers = buildNavTopViewLayers({ areas: { a: area(0, -200), b: area(20, -300) } }, 'de_train');
  const svg = layer => decodeURIComponent(layer.url.slice(layer.url.indexOf(',') + 1));
  assert.match(svg(layers[0]), /M0 0L10 0L0 -10Z/);
  assert.doesNotMatch(svg(layers[0]), /M20 0/);
  assert.match(svg(layers[1]), /M20 0L30 0L20 -10Z/);
});

test('NAV shading follows height rather than horizontal position', () => {
  const area = (x, z) => ({ corners: [{ x, y: 0, z }, { x: x + 10, y: 0, z }, { x, y: 10, z }] });
  const render = areas => {
    const layer = buildNavTopViewLayers({ areas }, 'de_mirage')[0];
    return decodeURIComponent(layer.url.slice(layer.url.indexOf(',') + 1));
  };
  const svg = render({ high: area(0, 100), low: area(20, 0), sameLow: area(40, 0) });
  const fills = [...svg.matchAll(/<path[^>]*fill="rgb\(([^)]+)\)"/g)].map(match => match[1].split(',').map(Number));
  assert.equal(fills.length, 3);
  assert.deepEqual(fills[0], fills[1]);
  assert.ok(fills[2].every((value, index) => value > fills[0][index]));
  assert.ok(svg.indexOf('M20 0') < svg.indexOf('M0 0'));
  const flat = render({ a: area(0, 0), b: area(20, 0) });
  assert.doesNotMatch(flat, /NaN|Infinity|linearGradient/);
});

test('standing and crouching pawns keep a common ground plane', () => {
  const material = new THREE.MeshStandardMaterial();
  const standing = new THREE.Box3().setFromObject(createPlayerPawn(material, material));
  const crouched = new THREE.Box3().setFromObject(createPlayerPawn(material, material, true));
  assert.equal(standing.min.y, crouched.min.y);
  assert.ok(crouched.max.y < standing.max.y);
  assert.ok(crouched.max.x > standing.max.x);
});

test('collaboration crouch updates body, weapon and eye anchors together', () => {
  const player = createCollabPlayer({ position: new THREE.Vector3(), id: 'test', name: 'test', showName: false, crouched: true });
  const body = posture => player.children.find(child => child.userData.collabBody === posture);
  const equipment = player.children.find(child => child.userData.collabEquipment);
  for (const crouched of [true, false, true]) {
    setCollabPlayerCrouch(player, crouched);
    assert.equal(body('standing').visible, !crouched);
    assert.equal(body('crouched').visible, crouched);
    assert.equal(equipment.position.y, crouched ? .44 : .72);
    assert.equal(player.userData.aimRay.position.y, crouched ? .62 : .93);
  }
});
