import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoProtocolClient } from '../src/demo/parsers/goProtocol.js';

test('Go transports use the same prepared query protocol and missing-value convention', async () => {
  const calls = [];
  const sources = [{ part: 2, byteLength: 100 }];
  const adapter = createGoProtocolClient({ init: async () => 'ready', openSources: async () => sources,
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
  const adapter = createGoProtocolClient({ init: async () => null, openSources: async () => [], request: async () => { throw error; } });
  await assert.rejects(adapter.parseHeader({ part: 0 }), error);
  await assert.rejects(adapter.parseGrenades({ part: 0 }, []), error);
});

test('column and row transports produce identical ticks without turning missing values into zero', async () => {
  const row = {tick:10,health:null,nested:{X:1,Y:null}};
  const rows = createGoProtocolClient({request:async()=>structuredClone([row])});
  const columns = createGoProtocolClient({compactTicks:true,request:async(method,args)=>{
    assert.equal(args.format,'columns');
    return {columns:['tick','health','nested'],rows:[[10,null,{X:1,Y:null}]]};
  }});
  assert.deepEqual(await columns.parseTicks({part:0},[],[10]),await rows.parseTicks({part:0},[],[10]));
});

test('malformed tick tables fail before partial replay rows reach callers', async () => {
  for (const value of [{columns:['tick'],rows:[[10,20]]},{columns:['tick'],rows:[10]},{rows:[]}]) {
    const client=createGoProtocolClient({request:async()=>value});
    await assert.rejects(client.parseTicks({part:0},[],[]), /Invalid tick/);
  }
});

test('grenade pagination yields all pages and rejects gaps, loops and truncation', async () => {
  const pages=[{rows:[{id:'one'}],total:2,nextOffset:1},{rows:[{id:'two'}],total:2,nextOffset:null}];
  const offsets=[];
  const client=createGoProtocolClient({request:async(method,args)=>{offsets.push(args.offset);return structuredClone(pages.shift());}});
  const values=[];for await(const row of client.iterateGrenades({part:0},[]))values.push(row.id);
  assert.deepEqual(values,['one','two']);assert.deepEqual(offsets,[0,1]);
  for(const page of [{rows:[{}],total:2,nextOffset:null},{rows:[{}],total:2,nextOffset:0},{rows:[{}],total:2,nextOffset:2},{rows:[],total:2,nextOffset:1}]) {
    const broken=createGoProtocolClient({request:async()=>structuredClone(page)});
    await assert.rejects(async()=>{for await(const row of broken.iterateGrenades({part:0},[])) void row;},/Incomplete grenade journal|Invalid grenade page/);
  }
});
