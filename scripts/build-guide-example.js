import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createNativeClient } from '../electron/native-client.js';
import { createGoParserAdapter } from '../src/demo/goParserAdapter.js';
import { createDemoParser } from '../src/demo/parserRuntime.js';
import { encodeStoredValue, decodeStoredValue } from '../shared/storage-codec.js';
import { buildAnalysisDataset } from '../src/analysis/buildAnalysisDataset.js';
import { buildUtilityRecommendations } from '../src/analysis/utilityRecommendations.js';
import { buildDemoGrenadeSegments } from '../src/demo/grenades.js';
import { buildSavedThrowNote } from '../src/utility/savedThrow.js';
import { packExampleSnapshots } from '../src/onboarding/exampleCodec.js';
import { roundEconomy } from '../src/demo/economy.js';

const source = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || '.local/dem/hltv/falcons-vs-vitality-m3-dust2.dem');
const staging = '.local/guide-example-build';
await fs.mkdir(staging, { recursive: true });
let data;
if (process.argv.includes('--reuse')) data = decodeStoredValue(await fs.readFile(`${staging}/loaded.json`, 'utf8'));
else {
  const binary = `build/go-parser/native/${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}/csboard-go-parser${process.platform === 'win32' ? '.exe' : ''}`;
  const parser = createNativeClient(binary, [], { env: { ...process.env, GOMEMLIMIT: '2147483648' }, timeoutMs: 30 * 60_000 });
  try {
    await parser.ready(); await parser.request('configure', { threads: 4 });
    const adapter = createGoParserAdapter({ compactTicks: true, init: async () => null, openSources: () => parser.request('source', { paths: [source] }), request: (method, args) => parser.request(method, args) });
    await createDemoParser({ ...adapter, parseVoice: undefined, postMessage: async message => {
      if (message.type === 'round') await fs.writeFile(`${staging}/round-${message.data.round}.json`, encodeStoredValue(message.data));
      if (message.type === 'loaded') { data = message.data; await fs.writeFile(`${staging}/loaded.json`, encodeStoredValue(data)); }
      if (message.type === 'error') throw Error(message.message);
      if (['status', 'error'].includes(message.type)) console.log(message.message);
    } })({ type: 'load', kind: 'match', sampleRate: 4, fileName: path.basename(source) });
  } finally { parser.close(); }
}
if (!data?.rounds?.some(round => round.round === 22)) throw Error('The guide source must include round 22');
const id = 'guide-example-v1';
const rounds = await Promise.all(data.rounds.map(async round => decodeStoredValue(await fs.readFile(`${staging}/round-${round.round}.json`, 'utf8'))));
const entry = { id, data, analysisRows: data.analysisRows, analysisRoundGrenades: Object.fromEntries(rounds.map(round => [round.round, round])) };
const dataset = buildAnalysisDataset({ demos: [entry], selectedPlayers: data.players, getRoundEconomy: round => roundEconomy(round, data.roundData.find(item => item.round === round.round)), includeReplay: false });
const groups = buildUtilityRecommendations({ utilities: dataset.utilities, flags: {}, side: 'ALL' });
const byId = new Map(dataset.utilities.map(utility => [utility.id, utility]));
const preferred = groups.find(group => group.memberIds.some(id => byId.get(id)?.source.round === 22)) || groups[0];
if (!preferred) throw Error('Source has no real utility recommendation group');
const selected = new Set([22]);
for (const id of preferred.memberIds) { if (selected.size >= 6) break; selected.add(byId.get(id).source.round); }
const keepTick = tick => data.rounds.some(round => selected.has(round.round) && tick >= (round.freezeStartTick ?? round.startTick) && tick <= round.endTick);
const selectedRounds = rounds.filter(round => selected.has(round.round));
// Four-Hz replay samples, dense pre-throw actions and actual effect volumes are
// retained. Voice and unrelated rounds are excluded; no synthetic throws.
// 保留 4Hz 回放、投掷前密集动作和真实效果，去掉语音与无关回合，不伪造道具。
const { analysisRows, ...summary } = data;
summary.rounds = data.rounds.filter(round => selected.has(round.round));
summary.roundData = data.roundData.filter(round => selected.has(round.round));
summary.events = data.events.filter(event => keepTick(event.tick));
summary.summary = { ...data.summary, rounds: summary.rounds.length, kills: summary.events.filter(event => event.event_name === 'player_death').length, damageEvents: summary.events.filter(event => event.event_name === 'player_hurt').length, shots: summary.events.filter(event => event.event_name === 'fire_bullets').length };
summary.demo = { ...summary.demo, voice: { frames: 0, skipped: 0, limited: false }, example: true, preferredRound: 22 };
summary.analysisBytes = 0;
const players = [...new Set(preferred.memberIds.map(id => byId.get(id).segment.throwEvent.user_name))];
const compactRound = round => {
  const context = summary.rounds.find(item => item.round === round.round), byTick = new Map();
  for (const segment of buildDemoGrenadeSegments(round.projectiles, summary.events, round.throwSnapshots, context, 64)) {
    const note = buildSavedThrowNote({ mapName: summary.demo.map, segment, source: { fileName: summary.demo.fileName, round: round.round, tickRate: 64, smokeVoxelFrames: round.smokeVoxelFrames, infernoFrames: round.infernoFrames } });
    for (const relative of note?.replay?.snapshots || []) {
      const tick = relative.tick + segment.throwTick - note.replay.throwTick;
      const snapshot = { ...relative, tick, timeSeconds: tick / 64 };
      if (!byTick.has(snapshot.tick)) byTick.set(snapshot.tick, { ...snapshot, players: [] });
      const target = byTick.get(snapshot.tick);
      for (const player of snapshot.players) if (!target.players.some(item => item.steamid === player.steamid && item.name === player.name)) target.players.push(player);
    }
  }
  return { ...round, voiceFrames: [], snapshots: packExampleSnapshots(round.snapshots), throwSnapshots: packExampleSnapshots([...byTick.values()].sort((a,b) => a.tick-b.tick)) };
};
const payload = { version: 1, preferredRound: 22, suggestedPlayers: players, sourceFileName: path.basename(source),
  entry: { id, data: summary, analysisRows: packExampleSnapshots(analysisRows.filter(row => keepTick(row.tick))) }, rounds: selectedRounds.map(compactRound) };
// Four decimal places preserve sub-millimetre positions while avoiding noisy
// IEEE-754 tails in the downloadable example. Input buttons/ticks stay exact.
// 示例坐标保留四位小数，消除浮点尾数；按键与 tick 原值不变。
const rounded = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10000) / 10000
  : ArrayBuffer.isView(value) ? value : Array.isArray(value) ? value.map(rounded)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key, rounded(item)])) : value;
const encoded = encodeStoredValue(rounded(payload)), compressed = gzipSync(encoded, { level: 9 });
const output = 'docs/presets/demos'; await fs.mkdir(output, { recursive: true });
await fs.writeFile(`${output}/operation-guide.json.gz`, compressed);
await fs.writeFile(`${output}/README.md`, `# Operation guide example\n\nA compact replay excerpt from ${path.basename(source)}. Round 22 is retained and selected by default. The other included rounds preserve a real repeated-utility group for the recommendation exercise.\n\nContains recorded player snapshots, throw actions, trajectories and effects; excludes voice and the original .dem file. It is a tutorial example, not the complete match.\n\nRegenerate after parser/cache changes with \`make guide-example DEMO="path/to/source.dem"\`. Reuse the local preparation with \`make guide-example ARGS=--reuse\`.\n`);
console.log(JSON.stringify({ selectedRounds: [...selected].sort((a,b)=>a-b), preferredRound: 22, suggestedPlayers: players, sourceBytes: (await fs.stat(source)).size, decodedBytes: Buffer.byteLength(encoded), compressedBytes: compressed.length, groupCount: preferred.count }, null, 2));
