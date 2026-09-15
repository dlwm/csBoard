import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoundAnalysisData, listAnalysisRounds } from '../src/analysis/roundModelAccess.js';

const player = (name, team, valid = true) => ({
  name, steamid: name, team, health: 100, hasPosition: valid,
  position: { x: 1, y: 2, z: 3 }, placeName: 'Mid', inventory: ['smokegrenade'],
});
const entry = {
  id: 'one', data: {
    demo: { tickRate: 128, map: 'de_mirage', fileName: 'test.dem' },
    rounds: [{ round: 2, freezeStartTick: 0, startTick: 128, endTick: 768 }],
    events: [
      { tick: 128, event_name: 'grenade_thrown', user_name: 't', user_steamid: 't', weapon: 'smokegrenade', user_X: 100, user_Y: 200, user_Z: 300 },
      { tick: 256, event_name: 'smokegrenade_detonate', user_name: 't', user_steamid: 't', x: 300, y: 400, z: 500 },
      { tick: 384, event_name: 'bomb_planted', user_name: 't', site: 1 },
      { tick: 640, event_name: 'round_end', winner: 2 },
    ],
  },
  analysisRows: [0, 128, 192, 256, 384, 640, 768].map(tick => ({
    tick, players: [player('t', 2), player('ct', 3), player('missing', 3, false)],
  })),
};
const options = { selectedDemos: [entry], selectedPlayers: ['t'], language: 'zh' };
const read = request => getRoundAnalysisData(options, { demoId: 'one', round: 2, ...request });

test('context exposes exact Demo/round and evidence limits', () => {
  assert.equal(listAnalysisRounds([entry])[0].rounds[0].round, 2);
  const data = read({});
  assert.equal(data.tickRate, 128);
  assert.equal(data.plant.elapsedSeconds, 2);
  assert.equal(data.endTick, 640);
  assert.equal(data.roster.length, 3);
  assert.match(data.promptTemplate, /事实和推测/);
});
test('timeline uses original ticks, both teams, explicit missing positions and round-end bound', () => {
  const data = read({ dataset: 'timeline' });
  assert.deepEqual(data.records.map(r => r.tick), [0, 128, 256, 384, 640]);
  assert.equal(data.records[0].elapsedSeconds, -1);
  assert.equal(data.records[0].players[1].side, 'CT');
  assert.equal(data.records[0].players[2].position, null);
  assert.equal(data.records[3].phase, 'postPlant');
});
test('windows, finer sampling and pages are deterministic', () => {
  const first = read({ dataset: 'timeline', startSeconds: 0, endSeconds: 1, sampleSeconds: .25, limit: 2 });
  assert.deepEqual(first.records.map(r => r.tick), [128, 192]);
  assert.equal(first.pagination.nextOffset, 2);
  const last = read({ dataset: 'timeline', startSeconds: 0, endSeconds: 1, sampleSeconds: .25, limit: 2, offset: 2 });
  assert.deepEqual(last.records.map(r => r.tick), [256]);
  assert.equal(last.pagination.hasMore, false);
});
test('event IDs survive narrower windows and missing coordinates stay null', () => {
  const full = read({ dataset: 'events' });
  const window = read({ dataset: 'events', startSeconds: 2 });
  assert.equal(full.records[2].id, window.records[0].id);
  assert.equal(window.records[0].position, null);
  assert.deepEqual(full.records[0].playerPosition, { x: 5.08, y: 7.62, z: 2.54 });
});
test('utility can pair throw/effect events without projectile samples', () => {
  const data = read({ dataset: 'utility', includeTrajectories: true });
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].throwSeconds, 0);
  assert.equal(data.records[0].effectSeconds, 1);
  assert.equal(data.records[0].effectTiming, 'event');
  assert.deepEqual(data.records[0].trajectory, []);
});
test('rejects unselected Demos, missing rounds, invalid windows and loading data', () => {
  assert.throws(() => read({ demoId: 'other' }), /Select this Demo/);
  assert.throws(() => read({ round: 99 }), /Round not found/);
  assert.throws(() => read({ startSeconds: 5, endSeconds: 1 }), /must not precede/);
  assert.throws(() => getRoundAnalysisData({ ...options, playersLoading: true }, {}), /loading/);
});
