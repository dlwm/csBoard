import test from 'node:test';
import assert from 'node:assert/strict';
import { runningTrailSamples } from '../src/three/demoMovementTrail.js';

const snapshots = (positionAt, until = 128) => Array.from({ length: until / 8 + 1 }, (_, index) => {
  const tick = index * 8;
  return { tick, players: [{ name: 'runner', hasPosition: true, position: { x: positionAt(tick), y: 0, z: 0 } }] };
});

test('steady running makes a short, spaced trail', () => {
  const samples = runningTrailSamples(snapshots((tick) => tick * 0.055), 'runner', 128);
  assert.ok(samples.length >= 5 && samples.length <= 8);
  assert.ok(samples.every((sample, index) => !index || sample.position.x - samples[index - 1].position.x >= 0.18));
});

test('small back-and-forth movements do not pile up puffs', () => {
  assert.deepEqual(runningTrailSamples(snapshots((tick) => tick % 16 ? 0.3 : -0.3), 'runner', 128), []);
});

test('a large reversal is not mistaken for sustained running', () => {
  const positions = [0, 1.8, 0.2, 0.9, 0.9];
  assert.deepEqual(runningTrailSamples(snapshots((tick) => positions[tick / 8], 32), 'runner', 32), []);
});

test('a teleport or discontinuous coordinate jump does not leave a giant trail', () => {
  assert.deepEqual(runningTrailSamples(snapshots((tick) => tick < 64 ? 0 : 12), 'runner', 88), []);
});

test('old running puffs fade out after the player stops', () => {
  const records = snapshots((tick) => Math.min(tick, 48) * 0.055, 160);
  assert.deepEqual(runningTrailSamples(records, 'runner', 160), []);
});

test('missing coordinates and sparse history cannot create duplicate stationary puffs', () => {
  const records = snapshots((tick) => tick * 0.055).map((record) => record.tick < 112 ? { ...record, players: [{ name: 'runner', hasPosition: false, position: { x: 0, y: 0, z: 0 } }] } : record);
  assert.deepEqual(runningTrailSamples(records, 'runner', 128), []);
});
