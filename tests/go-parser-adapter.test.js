import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoParserAdapter } from '../src/demo/goParserAdapter.js';

test('Go transports use the same prepared query protocol and missing-value convention', async () => {
  const calls = [];
  const sources = [{ part: 2, byteLength: 100 }];
  const adapter = createGoParserAdapter({ init: async () => 'ready', openSources: async () => sources,
    request: async (method, args) => { calls.push({ method, args }); return [{ tick: 10, steamid: '76561198000000001', health: null, inventory: ['AK-47'], nested: { X: 1, Y: null } }]; },
  });
  assert.equal(await adapter.init(), 'ready');
  assert.equal(await adapter.openSources({ type: 'load' }), sources);
  const part = sources[0], ticks = new Int32Array([10, 20]);
  await adapter.prepareTicks(part, ['X', 'health'], ticks);
  const rows = await adapter.parseTicks(part, ['health'], ticks, ['76561198000000001']);
  assert.deepEqual(rows, [{ tick: 10, steamid: '76561198000000001', health: undefined, inventory: ['AK-47'], nested: { X: 1, Y: undefined } }]);
  await adapter.releaseTicks(part);
  assert.deepEqual(calls, [
    { method: 'prepareTicks', args: { part: 2, props: ['X', 'health'], ticks: [10, 20], throws: [] } },
    { method: 'ticks', args: { part: 2, props: ['health'], ticks: [10, 20], players: ['76561198000000001'] } },
    { method: 'releaseTicks', args: { part: 2 } },
  ]);
  assert.deepEqual([...ticks], [10, 20]);
});

test('Go parser failures reach the import caller', async () => {
  const error = new Error('source changed');
  const adapter = createGoParserAdapter({ init: async () => null, openSources: async () => [], request: async () => { throw error; } });
  await assert.rejects(adapter.parseHeader({ part: 0 }), error);
  await assert.rejects(adapter.parseGrenades({ part: 0 }, []), error);
});
