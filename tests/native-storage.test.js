import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeClient } from '../electron/native-client.js';
import { encodeStoredValue, decodeStoredValue } from '../src/app/storageCodec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform;
const binary = path.join(root, 'build/native', `${platform}-${process.arch}`, `csboard-native${process.platform === 'win32' ? '.exe' : ''}`);

test('storage codec preserves voxel buffers and tag-shaped user data', () => {
  const source = { voxels: new Uint16Array([0, 32767]), nested: { __csboard_value_v1__: 'Uint8Array', value: 'description' }, missing: undefined, number: NaN, id: 76561198000000000n, entries: new Map([['x', new Float32Array([1.25])]]) };
  assert.deepEqual(decodeStoredValue(encodeStoredValue(source)), source);
});

test('native storage survives restart, protects newer saves, and deletes only requested cache', async () => {
  await requireBinary();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-native-test-'));
  let client = createNativeClient(binary, ['storage', directory]);
  try {
    await client.ready();
    const request = (method, args) => client.request(method, args);
    const saved = [{ id: 'a', voxels: new Uint16Array([17, 4096]) }, { id: 'b', name: '保留' }];
    await request('record.put', { key: 'workspace-archives', value: encodeStoredValue(saved) });
    assert.equal(await request('record.import', { key: 'workspace-archives', value: encodeStoredValue([{ id: 'old' }]) }), false);
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'workspace-archives' })).value), saved);
    await assert.rejects(request('record.put', { key: 'workspace-archives', value: '{broken' }));
    await request('record.put', { key: 'utility-notes', value: encodeStoredValue({ version: 4, notes: saved }) });
    for (const id of ['demo-a', 'demo-b']) {
      await request('cache.putRound', { id, round: 1, value: encodeStoredValue({ round: 1, smokeVoxelFrames: saved }) });
      await request('cache.put', { id, value: encodeStoredValue({ id, data: 'demo' }), metadata: encodeStoredValue({ id }) });
    }
    await closeClient(client);
    client = createNativeClient(binary, ['storage', directory]);
    await client.ready();
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'utility-notes' })).value), { version: 4, notes: saved });
    await request('cache.delete', { id: 'demo-a' });
    assert.equal(await request('cache.count', { id: 'demo-a' }), 0);
    assert.equal(await request('cache.count', { id: 'demo-b' }), 1);
    assert.deepEqual(decodeStoredValue(await request('cache.round', { id: 'demo-b', round: 1 })).smokeVoxelFrames, saved);
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'workspace-archives' })).value), saved);
    const patch = { key: 'workspace-archives', kind: 'array', body: 'null', count: 2, replace: false, updates: [{ slot: 1, value: encodeStoredValue({ id: 'changed' }) }] };
    await request('record.patch', patch);
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'workspace-archives' })).value), [saved[0], { id: 'changed' }]);
    await assert.rejects(request('record.patch', { ...patch, count: 3, updates: [] }));
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'workspace-archives' })).value), [saved[0], { id: 'changed' }]);
    await request('record.put', { key: 'workspace-archives', value: encodeStoredValue([]) });
    await request('record.import', { key: 'workspace-archives', value: encodeStoredValue(saved) });
    assert.deepEqual(decodeStoredValue((await request('record.get', { key: 'workspace-archives' })).value), []);
  } finally { await closeClient(client); await fs.rm(directory, { recursive: true, force: true }); }
});

async function requireBinary() {
  await fs.access(binary).catch(() => { throw new Error('Native storage tests require npm run native:build'); });
}
async function closeClient(client) {
  const closed = client.child.exitCode !== null || client.child.signalCode !== null ? Promise.resolve() : once(client.child, 'close');
  client.close();
  await closed;
}
async function fixture(t) {
  await requireBinary();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-native-test-'));
  const clients = [];
  t.after(async () => {
    for (const client of clients) await closeClient(client);
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function open(folder) {
    const client = createNativeClient(binary, ['storage', folder]);
    clients.push(client);
    await client.ready();
    return client;
  }
  return { directory, open, client: await open(path.join(directory, 'live')) };
}

test('shared cache blobs survive deletion of one owner; corruption is detected', async t => {
  const { directory, client } = await fixture(t);
  const value = JSON.stringify({ data: { rounds: [1] } });
  for (const id of ['a', 'b']) await client.request('cache.put', { id, value, metadata: '{}' });
  const a = await client.request('cache.reference', { id: 'a' });
  assert.deepEqual(await client.request('cache.reference', { id: 'b' }), a);
  await client.request('cache.delete', { id: 'a' });
  assert.equal(await client.request('cache.get', { id: 'b' }), value);
  await fs.writeFile(path.join(directory, 'live/blobs', a.name), 'corrupt gzip');
  await assert.rejects(client.request('cache.get', { id: 'b' }));
  await assert.rejects(client.request('storage.check'));
});

test('native snapshot restores records and cache independently of later changes', async t => {
  const { directory, open, client } = await fixture(t);
  await client.request('record.put', { key: 'workspace-archives', value: '[{"id":"before"}]' });
  await client.request('cache.putRound', { id: 'a', round: 1, value: '{"tick":42}' });
  const backup = path.join(directory, 'snapshot');
  assert.equal(await client.request('storage.snapshot', { path: backup }), true);
  await client.request('record.put', { key: 'workspace-archives', value: '[]' });
  await client.request('cache.delete', { id: 'a' });
  const restored = await open(backup);
  assert.equal(await restored.request('storage.check'), true);
  assert.deepEqual(JSON.parse((await restored.request('record.get', { key: 'workspace-archives' })).value), [{ id: 'before' }]);
  assert.deepEqual(JSON.parse(await restored.request('cache.round', { id: 'a', round: 1 })), { tick: 42 });
  assert.equal(await client.request('cache.round', { id: 'a', round: 1 }), null);
});

test('cache inspection reads compact metadata and supports old cache without returning analysis payload', async t => {
  const { directory, client } = await fixture(t);
  const data = { cacheSchemaVersion: 4, demo: { name: 'match' }, summary: {}, warnings: [], rounds: [1], analysis: { large: 'payload' } };
  const { analysis, ...inspection } = data;
  await client.request('cache.put', { id: 'old', value: JSON.stringify({ data }), metadata: '{"dataBytes":123}' });
  assert.deepEqual(JSON.parse(await client.request('cache.inspect', { id: 'old' })), { data: inspection, dataBytes: 123 });
  await client.request('cache.put', { id: 'new', value: JSON.stringify({ data }), metadata: JSON.stringify({ inspection, dataBytes: 123 }) });
  const ref = await client.request('cache.reference', { id: 'new' });
  await fs.writeFile(path.join(directory, 'live/blobs', ref.name), 'unreadable');
  assert.deepEqual(JSON.parse(await client.request('cache.inspect', { id: 'new' })), { data: inspection, dataBytes: 123 });
  assert.equal(await client.request('cache.inspect', { id: 'missing' }), null);
});
