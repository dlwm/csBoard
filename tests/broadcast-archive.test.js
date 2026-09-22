import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBroadcastArchive, deserializeBroadcastArchive, serializeBroadcastArchive, splitBroadcastPayload } from '../src/broadcast/archive.js';
import { buildDemoGrenadeSegments } from '../src/demo/grenades.js';

const demoData = {
  demo: { fileName: 'match.dem', map: 'de_nuke', tickRate: 64 },
  rounds: [{ round: 3, startTick: 100, endTick: 500, freezeStartTick: 80 }],
  events: [
    { tick: 140, event_name: 'smokegrenade_detonate', entityid: 8 },
    { tick: 150, event_name: 'weapon_fire' },
    { tick: 310, event_name: 'smokegrenade_expired', entityid: 8 },
    { tick: 350, event_name: 'player_death' },
  ],
};
const roundData = {
  snapshots: [{ tick: 100 }, { tick: 180 }, { tick: 260 }, { tick: 340 }],
  throwSnapshots: [{ tick: 190 }, { tick: 390 }],
  projectiles: [{ tick: 210 }, { tick: 410 }],
  smokeVoxelFrames: [{ tick: 160, entityId: 8, voxels: Uint16Array.from([1, 2, 3]) }, { tick: 220, entityId: 8, voxels: Uint16Array.from([4, 5, 6]) }],
  infernoFrames: [{ tick: 160, entityId: 9, cells: Float32Array.from([0.5]) }, { tick: 230, entityId: 9, cells: Float32Array.from([1.5, 2.5]) }],
};

test('broadcast archive contains exactly one clipped interval', () => {
  const archive = buildBroadcastArchive({ id: 'clip', name: ' Execute ', demoData, round: demoData.rounds[0], roundData, startTick: 175, endTick: 300, now: '2026-01-01T00:00:00.000Z' });

  assert.equal(archive.name, 'Execute');
  assert.equal(archive.demoData.rounds.length, 1);
  assert.deepEqual([archive.startTick, archive.endTick], [175, 300]);
  assert.deepEqual(archive.roundData.snapshots.map((item) => item.tick), [100, 180, 260, 340]);
  assert.deepEqual(archive.roundData.projectiles.map((item) => item.tick), [210]);
  assert.deepEqual(archive.demoData.events.map((item) => item.tick), [140, 310]);
  assert.deepEqual(archive.roundData.smokeVoxelFrames.map((item) => item.tick), [160, 220]);
  assert.deepEqual(archive.roundData.infernoFrames.map((item) => item.tick), [160, 230]);
});

test('broadcast payload chunks round-trip typed smoke and fire arrays', () => {
  const archive = buildBroadcastArchive({ id: 'clip', name: 'Execute', demoData, round: demoData.rounds[0], roundData, startTick: 175, endTick: 300 });
  const serialized = serializeBroadcastArchive(archive);
  const chunks = splitBroadcastPayload(serialized, 31);
  const restored = deserializeBroadcastArchive(chunks.join(''));

  assert.ok(chunks.length > 1);
  assert.ok(restored.roundData.smokeVoxelFrames[0].voxels instanceof Uint16Array);
  assert.ok(restored.roundData.infernoFrames[0].cells instanceof Float32Array);
  assert.deepEqual([...restored.roundData.smokeVoxelFrames[1].voxels], [4, 5, 6]);
});

test('a clip starting during smoke retains the throw context needed to save it', () => {
  const source = {
    ...demoData,
    events: [
      { tick: 120, event_name: 'grenade_thrown', weapon: 'smokegrenade', user_name: 'Player', user_steamid: '7', user_X: 1, user_Y: 2, user_Z: 3 },
      { tick: 140, event_name: 'smokegrenade_detonate', entityid: 8, x: 4, y: 5, z: 6 },
      { tick: 310, event_name: 'smokegrenade_expired', entityid: 8 },
    ],
  };
  const data = {
    ...roundData,
    snapshots: [{ tick: 110, players: [] }, { tick: 125, players: [] }, { tick: 180, players: [] }, { tick: 260, players: [] }],
    throwSnapshots: [{ tick: 110, players: [] }, { tick: 125, players: [] }, { tick: 180, players: [] }],
    projectiles: [{ tick: 130, entity_id: 8, grenade_type: 'smokegrenade', thrower_steamid: '7', x: 1, y: 2, z: 3 }, { tick: 132, entity_id: 8, grenade_type: 'smokegrenade', thrower_steamid: '7', x: 4, y: 5, z: 6 }],
  };
  const archive = buildBroadcastArchive({ name: 'Smoke', demoData: source, round: source.rounds[0], roundData: data, startTick: 175, endTick: 250 });
  const segments = buildDemoGrenadeSegments(archive.roundData.projectiles, archive.demoData.events, archive.roundData.throwSnapshots, archive.demoData.rounds[0], 64);

  assert.equal(archive.demoData.rounds[0].startTick, 175);
  assert.equal(archive.demoData.rounds[0].contextStartTick, 120);
  assert.deepEqual(archive.roundData.projectiles.map((item) => item.tick), [130, 132]);
  assert.deepEqual(archive.roundData.throwSnapshots.map((item) => item.tick), [110, 125, 180]);
  assert.deepEqual(archive.demoData.events.map((item) => item.tick), [120, 140, 310]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].throwEvent.user_name, 'Player');
  assert.equal(segments[0].landing.tick, 140);
});

test('a clip starting during an HE smoke opening retains the detonation', () => {
  const source = { ...demoData, events: [{ tick: 120, event_name: 'hegrenade_detonate', x: 1, y: 2, z: 3 }] };
  const archive = buildBroadcastArchive({ name: 'Cleared smoke', demoData: source, round: source.rounds[0], roundData, startTick: 175, endTick: 250 });
  assert.ok(archive.demoData.events.some((event) => event.event_name === 'hegrenade_detonate'));
  const later = buildBroadcastArchive({ name: 'Later', demoData: source, round: source.rounds[0], roundData, startTick: 270, endTick: 300 });
  assert.ok(!later.demoData.events.some((event) => event.event_name === 'hegrenade_detonate'));
});
