import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { createNativeClient } from '../../electron/native-client.js';
import { createDemoParser } from '../../src/demo/parserRuntime.js';
import { createGoParserEngine } from '../../src/demo/parsers/goEngine.js';
import { STUDY_SCHEMA, createStudyEncoder, decisionWindows } from './dataset.js';

const job = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const encode = createStudyEncoder(job.salt);
const destination = job.staging;
await fs.mkdir(destination, { recursive: true });
let summary, parseError, nativePeakBytes = 0;
const rounds = new Map();
const native = createNativeClient(job.binary, [], { timeoutMs: job.config.timeoutMinutes * 60_000,
  env: { ...process.env, GOMEMLIMIT: String(job.config.goMemoryMiB * 1024 * 1024) },
  onMetrics: metric => { nativePeakBytes = Math.max(nativePeakBytes, metric.peakRssBytes || 0); } });
// If the Node worker is interrupted or killed, close its owned parser as well.
// 断点续跑时只重做当前 Demo，已完成输出不会改写。
const stop = () => { native.close(); process.exitCode = 130; };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const started = Date.now();
async function jsonl(file, records) {
  const gzip = createGzip();
  const done = pipeline(gzip, createWriteStream(path.join(destination, file)));
  // Observe stream failures immediately, including while the producer is waiting.
  done.catch(() => {});
  try {
    for (const value of records) if (!gzip.write(`${JSON.stringify(value)}\n`)) await once(gzip, 'drain');
    gzip.end(); await done;
  } catch (error) { gzip.destroy(error); await done.catch(() => {}); throw error; }
}
try {
  await native.ready(); await native.request('configure', { threads: job.config.threads });
  const engine = createGoParserEngine({ execution: 'process', compactTicks: true,
    init: async () => null, openSources: () => native.request('source', { paths: [job.file] }),
    request: (method, args) => native.request(method, args) }, { includeVoice: false });
  await createDemoParser({ engine, postMessage: async message => {
    if (message.type === 'error') { parseError = message.message; return; }
    if (message.type === 'status') console.log(`  ${message.code || message.message}`);
    if (message.type === 'round') {
      const { round, snapshots, smokeVoxelFrames = [], infernoFrames = [], projectiles = [] } = message.data;
      // All observations are Source-aligned facts, with coordinates declared per stream.
      // 不导出语音或聊天；身份仅在本批次内用不可逆令牌关联。
      function* states() { for (const snapshot of snapshots) yield { tick: snapshot.tick, players: snapshot.players.map(encode.player) }; }
      function* effects() {
        for (const [type, frames] of [['smoke', smokeVoxelFrames], ['fire', infernoFrames]]) {
          for (const frame of frames) yield JSON.parse(JSON.stringify({ type, ...frame }, (_, item) => ArrayBuffer.isView(item) ? Array.from(item) : item));
        }
      }
      await jsonl(`round-${round}-states.jsonl.gz`, states());
      await jsonl(`round-${round}-effects.jsonl.gz`, effects());
      await jsonl(`round-${round}-projectiles.jsonl.gz`, projectiles.map(value => {
        const result = {};
        for (const key of ['tick', 'entityId', 'entityid', 'entity_id', 'grenade_entity_id', 'kind', 'grenade_type', 'initial_velocity', 'X', 'Y', 'Z', 'x', 'y', 'z']) if (value[key] != null) result[key] = value[key];
        result.thrower = encode.token(`player:${value.thrower_steamid || value.thrower_name || 'unknown'}`);
        return result;
      }));
      // Retain only coarse states until metadata arrives; discard volumes immediately.
      const stride = Math.max(1, Math.round(64 / Math.min(job.config.sampleRate, 2)));
      let lastTick = -Infinity;
      rounds.set(round, snapshots.filter(snapshot => { if (snapshot.tick - lastTick < stride) return false; lastTick = snapshot.tick; return true; }));
      console.log(`  round ${round} exported`);
    }
    if (message.type === 'loaded') summary = message.data;
  } })({ type: 'load', kind: 'match', fileName: path.basename(job.file), sampleRate: job.config.sampleRate });
  if (parseError || !summary) throw new Error(parseError || 'Parser returned no match summary');
  if (job.config.maps.length && !job.config.maps.includes(summary.demo.map)) throw new Error(`Map excluded: ${summary.demo.map}`);
  const events = summary.events || [], tickRate = summary.demo.tickRate;
  await jsonl('events.jsonl.gz', events.map(encode.event));
  let windows = 0;
  function* samples() {
    for (const metadata of summary.rounds) {
      // Replay includes a post-round buffer; decisions stop at the actual round end.
      const endEvent = events.find(event => event.event_name === 'round_end' && event.tick >= metadata.startTick && event.tick <= metadata.endTick);
      const round = { ...metadata, endTick: endEvent?.tick ?? metadata.endTick };
      for (const sample of decisionWindows({ round, snapshots: rounds.get(round.round) || [], events, tickRate,
        config: job.config, encode, demoId: job.demoId, split: job.split })) { windows++; yield sample; }
    }
  }
  await jsonl('windows.jsonl.gz', samples());
  const counts = Object.fromEntries(['grenade_thrown', 'player_death', 'player_hurt', 'player_blind', 'smokegrenade_detonate', 'flashbang_detonate'].map(type => [type, events.filter(event => event.event_name === type).length]));
  const qualityWarnings = [];
  if (counts.flashbang_detonate > 0 && counts.player_blind === 0) qualityWarnings.push('flash-detonations-without-blind-events');
  if (counts.player_blind > 0 && !events.some(event => event.event_name === 'player_blind' && Number.isFinite(event.blind_duration))) qualityWarnings.push('blind-events-without-observed-duration');
  for (const warning of qualityWarnings) console.warn(`  DATA QUALITY: ${warning}`);
  const report = { qualityWarnings, schemaVersion: STUDY_SCHEMA, demoId: job.demoId, sourceSha256: job.sourceHash,
    split: job.split, groupId: job.groupId, map: summary.demo.map, patch: summary.demo.patch,
    tickRate, sampleRate: job.config.sampleRate, parser: summary.demo.parser,
    capabilities: summary.demo.formatCapabilities, rounds: summary.rounds, counts, windows,
    sourceBytes: job.sourceBytes, elapsedSeconds: (Date.now() - started) / 1000, nativePeakBytes,
    nodeRssBytes: process.memoryUsage().rss, recordedSmokeFrames: summary.demo.formatCapabilities?.smokeVoxels,
    blindWithDuration: events.filter(event => event.event_name === 'player_blind' && Number.isFinite(event.blind_duration)).length,
    missingDeathTeams: events.filter(event => event.event_name === 'player_death' && ![2, 3].includes(event.user_team_num)).length,
    coordinates: { states: 'world metres: x=SourceY*.0254,y=SourceZ*.0254,z=SourceX*.0254',
      events: 'Source XYZ inches', effects: 'unaltered parser smoke/inferno frame contract', projectiles: 'Source XYZ inches' },
    limitations: ['Observational data, not measured causal effects.', 'Overlapping windows are correlated; split by match group.',
      'Privileged opponent states must not be treated as known online information.', 'GOMEMLIMIT is a soft GC target, not a process memory cap.'] };
  await fs.writeFile(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
} finally { native.close(); }
