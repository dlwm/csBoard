import exampleUrl from '../../docs/presets/demos/operation-guide.json.gz?url';
import { decodeStoredValue } from '../../shared/storage-codec.js';
import { DEMO_CACHE_SCHEMA_VERSION } from '../demo/cacheSchema.js';
import { unpackExampleSnapshots } from './exampleCodec.js';

// Import the example through the same cache port as real Demos. UI, analysis
// and saved throws use their existing paths on every host.
// 示例只负责装入统一缓存，不复制回放、分析或道具保存逻辑。
export async function loadGuideExample(cache, onProgress = () => {}) {
  const response = await fetch(exampleUrl);
  if (!response.ok || !response.body) throw Error('Example replay could not be loaded');
  // Older iOS WebViews lack DecompressionStream. Use Three's bundled fflate
  // only on those hosts, without adding a second compression dependency.
  // 兼容较旧 iOS：按需使用 Three 内附的解压库，不重复增加依赖。
  let encoded;
  if (typeof DecompressionStream === 'function') encoded = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
  else { const { gunzipSync } = await import('three/examples/jsm/libs/fflate.module.js'); encoded = new TextDecoder().decode(gunzipSync(new Uint8Array(await response.arrayBuffer()))); }
  const payload = decodeStoredValue(encoded);
  if (payload.version !== 1 || payload.entry.data.cacheSchemaVersion !== DEMO_CACHE_SCHEMA_VERSION || !payload.rounds.some(round => round.round === 22)) throw Error('Example replay version is incompatible');
  const id = payload.entry.id;
  const existing = await cache.getCachedDemo(id);
  if (existing?.exampleAsset === exampleUrl && existing?.data?.cacheSchemaVersion === DEMO_CACHE_SCHEMA_VERSION && await cache.countCachedDemoRounds(id) === payload.rounds.length) return existing;
  // Metadata is published last, so partial writes never appear as ready Demos.
  for (const [index, round] of payload.rounds.entries()) {
    await cache.putCachedDemoRound(id, { ...round, snapshots: unpackExampleSnapshots(round.snapshots), throwSnapshots: unpackExampleSnapshots(round.throwSnapshots) });
    onProgress((index + 1) / (payload.rounds.length + 1));
  }
  const analysisRows = unpackExampleSnapshots(payload.entry.analysisRows), now = new Date().toISOString();
  const entry = { ...payload.entry, analysisRows, fileName: payload.sourceFileName, map: payload.entry.data.demo.map, kind: 'match',
    rounds: payload.rounds.length, sampleRate: payload.entry.data.demo.sampleRate, sourceBytes: 0, dataBytes: Number(response.headers.get('Content-Length')) || 0,
    analysisBytes: 0, createdAt: now, updatedAt: now, cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION,
    analysisIndexVersion: 1, analysisPlayerNames: payload.entry.data.players, builtinExample: true, exampleAsset: exampleUrl, suggestedPlayers: payload.suggestedPlayers };
  await cache.putCachedDemo(entry); onProgress(1);
  return entry;
}
