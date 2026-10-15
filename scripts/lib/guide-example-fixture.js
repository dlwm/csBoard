import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { encodeStoredValue, decodeStoredValue } from '../../shared/storage-codec.js';
import { unpackExampleSnapshots } from '../../src/onboarding/exampleCodec.js';

// Seed only the caller's disposable desktop profile via the real storage bridge.
// 截图与流程验收共用内置示例，不借用用户数据，不另外维护回放格式。
export async function seedGuideExample(root, evaluate) {
  const example = decodeStoredValue(gunzipSync(await fs.readFile(path.join(root, 'docs/presets/demos/operation-guide.json.gz'))).toString());
  if (example.version !== 1 || !example.rounds.some(round => round.round === 22)) throw Error('Update the acceptance fixture for the new guide example');
  const now = new Date().toISOString();
  const entry = { ...example.entry, analysisRows: unpackExampleSnapshots(example.entry.analysisRows), fileName: example.sourceFileName,
    map: example.entry.data.demo.map, kind: 'match', rounds: example.rounds.length, sampleRate: example.entry.data.demo.sampleRate,
    createdAt: now, updatedAt: now, cacheSchemaVersion: example.entry.data.cacheSchemaVersion, analysisIndexVersion: 1,
    analysisPlayerNames: example.entry.data.players, builtinExample: true };
  const write = (method, args) => evaluate(`window.csboardDesktop.native.storage(${JSON.stringify(method)},${JSON.stringify(args)})`);
  for (const round of example.rounds) await write('cache.putRound', { id: entry.id, round: round.round,
    value: encodeStoredValue({ ...round, snapshots: unpackExampleSnapshots(round.snapshots), throwSnapshots: unpackExampleSnapshots(round.throwSnapshots) }) });
  const { data, analysisRows, ...metadata } = entry;
  for (const key of ['workspace-archives', 'utility-notes']) await write('record.put', { key, value: encodeStoredValue([]) });
  await write('cache.put', { id: entry.id, value: encodeStoredValue(entry), metadata: encodeStoredValue(metadata) });
  return { id: entry.id, rounds: example.rounds.map(round => round.round), map: entry.map };
}
