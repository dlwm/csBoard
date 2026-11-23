import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { decodeStoredValue } from '../shared/storage-codec.js';
import { DEMO_CACHE_SCHEMA_VERSION } from '../src/demo/cacheSchema.js';
import { adaptGuideExample, unpackExampleSnapshots } from '../src/onboarding/exampleCodec.js';

test('bundled tutorial example can be saved in the current replay cache', async () => {
  const asset = await readFile(new URL('../docs/presets/demos/operation-guide.json.gz', import.meta.url));
  const original = decodeStoredValue(gunzipSync(asset).toString());
  const previousVersion = original.entry.data.cacheSchemaVersion;
  const example = adaptGuideExample(original);
  assert.equal(example.entry.data.cacheSchemaVersion, DEMO_CACHE_SCHEMA_VERSION);
  assert.equal(original.entry.data.cacheSchemaVersion, previousVersion);
  assert.equal(example.entry.data.events, original.entry.data.events);
  const round = example.rounds.find(item => item.round === 22);
  assert.ok(unpackExampleSnapshots(round.snapshots).some(frame => frame.players.length === 10));
  assert.throws(() => adaptGuideExample({ ...original, version: 0 }), /incompatible/);
});
