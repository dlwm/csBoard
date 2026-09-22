import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectWorkerIcons, stageWorkerIcons } from '../scripts/build-worker-frontend.js';

test('Worker pack is optional and includes only recognized SVG icons', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-worker-pack-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configFile = path.join(directory, 'pack.json');
  assert.deepEqual(await collectWorkerIcons(configFile, true), []);
  await assert.rejects(collectWorkerIcons(configFile), { code: 'ENOENT' });

  const icons = path.join(directory, 'icons');
  await fs.mkdir(path.join(icons, 'Equip'), { recursive: true });
  await fs.writeFile(path.join(icons, 'Equip', 'ak47.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await fs.writeFile(path.join(icons, 'Equip', 'other.svg'), '<svg></svg>');
  await fs.writeFile(path.join(icons, 'de_nuke.glb'), 'not a Worker UI icon');
  await fs.writeFile(configFile, JSON.stringify({ iconDirectory: icons }));
  const found = await collectWorkerIcons(configFile);
  assert.deepEqual(found.map(icon => icon.name), ['ak47']);

  const output = path.join(directory, 'dist');
  await stageWorkerIcons(found, output);
  assert.match(await fs.readFile(path.join(output, 'resource-pack/icons/ak47.svg'), 'utf8'), /<svg/);
  await assert.rejects(fs.stat(path.join(output, 'resource-pack/icons/other.svg')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(output, 'resource-pack/icons/de_nuke.glb')), { code: 'ENOENT' });
});

test('Worker pack rejects active SVG content without rewriting the source', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-worker-pack-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'flash.svg');
  const svg = '<svg><script>alert(1)</script></svg>';
  await fs.writeFile(source, svg);
  await assert.rejects(stageWorkerIcons([{ name: 'flash', source }], path.join(directory, 'dist')), /self-contained|active content/);
  assert.equal(await fs.readFile(source, 'utf8'), svg);
});
