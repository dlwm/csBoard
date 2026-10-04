import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRecords } from '../src/platform/drivers/storage/sqliteRecords.js';
import { runAnalysisQuery } from '../src/analysis/queryService.js';
import { startPlaybackClock } from '../src/app/playbackClock.js';
import { handleBroadcastTransfer } from '../server/core/broadcastTransfer.js';
import { digest, TRANSFER_CHUNK_BYTES } from '../shared/broadcast-transfer.js';

test('desktop collection saves send changed slots and reset after uncertain writes', async () => {
  const requests = [];
  let fail = false;
  const records = createSqliteRecords({ storage: async (method, args) => { requests.push({ method, args }); if (fail) { fail = false; throw Error('lost response'); } } }, {});
  await records.put('workspace-archives', [{ id: 'a', name: 'A' }, { id: 'b' }]);
  assert.equal(requests.at(-1).args.replace, true);
  await records.put('workspace-archives', [{ id: 'a', name: 'changed' }, { id: 'b' }]);
  assert.deepEqual(requests.at(-1).args.updates.map(item => item.slot), [0]);
  assert.equal(requests.at(-1).args.replace, false);
  fail = true;
  await assert.rejects(records.put('workspace-archives', [{ id: 'c' }]));
  await records.put('workspace-archives', [{ id: 'a', name: 'changed' }, { id: 'b' }]);
  assert.equal(requests.at(-1).args.replace, true);
  assert.equal(requests.at(-1).args.updates.length, 2);
  await records.put('workspace-archives', []);
  assert.equal(requests.at(-1).args.count, 0);
});

test('analysis catalogue avoids round reads; queries read only selected demos and skip rounds without throws', async () => {
  const entry = { id: 'a', data: { cacheSchemaVersion: 30, demo: { map: 'de_nuke', tickRate: 64 }, rounds: [{ round: 1, startTick: 10, endTick: 100 }], events: [] }, analysisRows: [{ tick: 20, players: [{ name: 'P', team: 2 }] }] };
  const reads = [];
  const cache = { getCachedDemo: async id => { reads.push(id); return { ...entry, id }; }, getCachedDemoRound: async (id, round) => { reads.push(`${id}:${round}`); return {}; } };
  const directory = await runAnalysisQuery(cache, 'analysis.catalog', { ids: ['a', 'b'], map: 'de_nuke', schema: 30 });
  assert.deepEqual(reads, ['a', 'b']);
  assert.deepEqual(directory[0].analysisPlayerNames, ['P']);
  assert.equal(directory[0].analysisRows, undefined);
  reads.length = 0;
  const data = await runAnalysisQuery(cache, 'analysis.query', { ids: ['b'], players: ['P'] });
  assert.deepEqual(reads, ['b']);
  assert.equal(data.rows.length, 1);
});

test('playback advances by monotonic elapsed time including delayed callbacks', t => {
  let now = 0;
  let callback;
  const elapsed = [];
  let stopped = false;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', fn => { callback = fn; return 123; });
  t.mock.method(globalThis, 'clearInterval', id => { stopped = id === 123; });
  const stop = startPlaybackClock(seconds => elapsed.push(seconds), { delayMs: 1000 });
  now = 500; callback();
  now = 1500; callback();
  now = 61500; callback();
  assert.deepEqual(elapsed, [0.5, 60]);
  stop(); assert.equal(stopped, true);
});

test('broadcast payload is verified, immutable and kept outside Yjs', async () => {
  const data = new Uint8Array(TRANSFER_CHUNK_BYTES + 13).fill(23);
  const parts = [data.subarray(0, TRANSFER_CHUNK_BYTES), data.subarray(TRANSFER_CHUNK_BYTES)];
  const manifest = { version: 1, id: 'a'.repeat(32), bytes: data.length, hashes: await Promise.all(parts.map(digest)) };
  const secret = 'b'.repeat(64);
  const store = new Map();
  const storage = { get: async key => store.get(key), put: async (key, value) => store.set(key, value) };
  const call = (method, part, body, authorized = true) => handleBroadcastTransfer(new Request(`http://localhost/rooms/ABC123/transfer${part ? `/${part}` : ''}?id=${manifest.id}`, { method, headers: authorized ? { Authorization: `Bearer ${secret}` } : {}, body }), part, storage);
  assert.equal((await call('POST', undefined, JSON.stringify({ manifest, secret }))).status, 201);
  assert.equal((await call('GET')).status, 404);
  assert.equal((await call('PUT', '0', parts[0], false)).status, 403);
  assert.equal((await call('PUT', '0', new Uint8Array(parts[0].length))).status, 400);
  assert.equal((await call('POST', 'complete')).status, 409);
  for (let i = 0; i < parts.length; i++) assert.equal((await call('PUT', String(i), parts[i])).status, 200);
  assert.equal((await call('POST', 'complete')).status, 200);
  assert.deepEqual(await (await call('GET')).json(), manifest);
  for (let i = 0; i < parts.length; i++) assert.deepEqual(new Uint8Array(await (await call('GET', String(i))).arrayBuffer()), parts[i]);
  assert.equal((await call('PUT', '0', parts[0])).status, 409);
});
