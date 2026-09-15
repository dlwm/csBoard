import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResourceStore, identifyResource } from '../electron/resource-store.js';

function model(extra = {}) {
  const json = JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [] }], ...extra });
  const chunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, chunk]);
}

test('resource naming supports aliases without arbitrary output paths', () => {
  assert.equal(identifyResource('glock.svg').name, 'glock18.svg');
  assert.equal(identifyResource('DE_NUKE.GLB').key, 'de_nuke');
  assert.equal(identifyResource('script.js'), null);
  assert.equal(identifyResource('de_nuke.zones.glb'), null);
});

test('imports are persistent and partial; corrupt replacement keeps existing file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-resources-'));
  try {
    const source = path.join(root, 'glock.svg');
    const glb = path.join(root, 'de_nuke.glb');
    const svg = '<!DOCTYPE svg PUBLIC "svg" "http://example.invalid/dtd"><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>';
    await fs.writeFile(source, svg);
    await fs.writeFile(glb, model());
    const store = createResourceStore(path.join(root, 'installed'));
    const imported = await store.importFiles([source, glb, source]);
    assert.deepEqual(imported.results.map(item => item.ok), [true, true, false]);
    assert.equal(imported.status.models.de_nuke, 'imported');
    assert.equal(imported.status.icons.glock18, true);
    const installed = await store.resolve('icons', 'glock18');
    const safe = await fs.readFile(installed, 'utf8');
    assert.doesNotMatch(safe, /DOCTYPE/);
    await fs.writeFile(source, '<svg><script>alert(1)</script></svg>');
    assert.equal((await store.importFiles([source])).results[0].ok, false);
    assert.equal(await fs.readFile(installed, 'utf8'), safe);
    await fs.writeFile(glb, Buffer.alloc(20));
    assert.equal((await store.importFiles([glb])).results[0].ok, false);
    assert.deepEqual(await fs.readFile(await store.resolve('models', 'de_nuke')), model());
    assert.equal(await store.resolve('icons', '../package'), null);
    assert.deepEqual(await createResourceStore(path.join(root, 'installed')).status(), imported.status);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('local models are opt-in and imported models take priority', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-local-models-'));
  try {
    const maps = path.join(root, 'maps');
    await fs.mkdir(path.join(maps, 'de_nuke'), { recursive: true });
    await fs.writeFile(path.join(maps, 'de_nuke/de_nuke.glb'), model());
    const installed = path.join(root, 'installed');
    assert.deepEqual((await createResourceStore(installed).status()).models, {});
    const local = createResourceStore(installed, maps);
    assert.equal((await local.status()).models.de_nuke, 'local');
    await local.importFiles([path.join(maps, 'de_nuke/de_nuke.glb')]);
    assert.equal((await local.status()).models.de_nuke, 'imported');
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));
    assert.deepEqual(pkg.build.extraResources, []);
    assert.ok(!pkg.build.files.some(pattern => pattern.includes('.local')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('unsafe SVG external references and GLB external files are rejected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-unsafe-resources-'));
  try {
    const store = createResourceStore(path.join(root, 'installed'));
    const source = path.join(root, 'glock.svg');
    for (const svg of ['<svg onload="alert(1)"></svg>', '<svg><image href="https://example.com/a.svg"/></svg>', '<!DOCTYPE svg [<!ENTITY x "a">]><svg></svg>']) {
      await fs.writeFile(source, svg);
      assert.equal((await store.importFiles([source])).results[0].ok, false);
    }
    assert.deepEqual((await store.status()).icons, {});
    const glb = path.join(root, 'de_nuke.glb');
    await fs.writeFile(glb, model({ buffers: [{ uri: 'https://example.com/model.bin', byteLength: 12 }] }));
    assert.equal((await store.importFiles([glb])).results[0].ok, false);
    assert.deepEqual((await store.status()).models, {});
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
