import assert from 'node:assert/strict';
import test from 'node:test';
import { createPackageWriter } from '../src/formats/packageIO.js';
import { importReplayPackage } from '../src/formats/tasks.js';

test('v3 ZIP imports overlapping projectile tracks in tick order without altering either trajectory', async () => {
  const writer = createPackageWriter();
  const files = {};
  const add = (key, value) => {
    const name = key + '.json';
    writer.add(name, value, key);
    files[key] = name;
  };
  const mapName = 'de_nuke', tickrate = 64;
  add('match', { mapName, tickrate, durationSeconds: 3, serverName: null, source: 'demo',
    teamA: { teamKey: 'teamA', name: 'A', score: 0 }, teamB: { teamKey: 'teamB', name: 'B', score: 1 } });
  add('rounds', [{ roundNumber: 1, startTick: 90, freezeEndTick: 100, endTick: 149, teamASide: 't', teamBSide: 'ct',
    teamAScoreBefore: 0, teamBScoreBefore: 0, teamAEconomy: 'pistol', teamBEconomy: 'pistol',
    winnerTeamKey: 'teamB', winnerSide: 'ct', endReason: 'ct_win' }]);
  for (const key of ['players', 'playerStats', 'playerEconomies', 'kills', 'damages', 'blinds', 'bombs', 'grenades', 'clutches']) add(key, []);
  add('replay', {
    meta: { sampleRate: 8, tickrate, coordScale: 2, angleScale: 10 }, weaponDict: [], placeDict: [],
    rounds: [{ roundNumber: 1, startTick: 100, tickStep: 5, frameCount: 10, players: [], projectiles: [
      { grenade: 'smoke', throwerIndex: null, startTick: 110, x: [1, 2, 3, 4], y: [0, 0, 0, 0], z: [10, -1, -2, -3] },
      { grenade: 'flashbang', throwerIndex: null, startTick: 120, x: [20, -1], y: [1, 1], z: [15, -2] },
    ] }],
  });
  writer.add('manifest.json', {
    schemaVersion: 'cs2-demo-format/3.0', exporter: { name: 'fixture', version: '1' }, parser: { name: 'fixture', version: '1' },
    demo: { hash: null, sourceFileName: 'nuke.dem' }, mapName, tickrate, exportedAt: '2026-01-01T00:00:00Z', files,
  }, 'manifest');

  const rounds = [], entries = [];
  const cache = {
    async putCachedDemoRound(_id, payload) { rounds.push(payload); },
    async putCachedDemo(entry) { entries.push(entry); },
    async deleteCachedDemo() {},
  };
  const result = await importReplayPackage(cache, {
    bytes: writer.finish(), destinationId: 'format|' + crypto.randomUUID(), allowedMaps: [mapName],
  });

  assert.equal(result.segments, 1);
  assert.equal(entries.length, 1);
  assert.deepEqual(rounds[0].projectiles.map(({ entity_id, tick, x, y, z }) => [entity_id, tick, x, y, z]), [
    ['v3-projectile-1-0', 110, 2, 0, 20],
    ['v3-projectile-1-0', 115, 6, 0, 18],
    ['v3-projectile-1-0', 120, 12, 0, 14],
    ['v3-projectile-1-1', 120, 40, 2, 30],
    ['v3-projectile-1-0', 125, 20, 0, 8],
    ['v3-projectile-1-1', 125, 38, 4, 26],
  ]);
});
