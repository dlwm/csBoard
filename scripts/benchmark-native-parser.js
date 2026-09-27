import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNativeClient } from '../electron/native-client.js';
import { createDemoParser } from '../src/demo/parserRuntime.js';
import { encodeStoredValue } from '../src/app/storageCodec.js';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const file = argv[0];
if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/benchmark-native-parser.js file.dem --threads 4 --output /tmp/parse-output [--sample-rate 8] [--parallel-ticks] [--binary path]');
const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform;
const binary = path.resolve(option('--binary', `build/native/${platform}-${process.arch}/csboard-native${process.platform === 'win32' ? '.exe' : ''}`));
const threads = Number(option('--threads', '1'));
const parallelTicks = threads > 1 || argv.includes('--parallel-ticks');
const sampleRate = Number(option('--sample-rate', '8'));
const output = path.resolve(option('--output', await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-parser-bench-'))));
await fs.mkdir(output, { recursive: true });
const methods = {};
let nativePeakBytes = 0, workerPeakBytes = 0, firstPassMs = 0, stderr = '', rounds = 0;
const native = createNativeClient(binary, [], { timeoutMs: 30 * 60_000, onMetrics: metric => {
  nativePeakBytes = Math.max(nativePeakBytes, metric.peakRssBytes || 0);
  const stage = methods[metric.method] ||= { calls: 0, elapsedMs: 0 };
  stage.calls++; stage.elapsedMs += metric.elapsedMs;
} });
native.child.stderr.on('data', chunk => {
  stderr += chunk;
  const lines = stderr.split('\n'); stderr = lines.pop();
  for (const line of lines) { const match = line.match(/\[prof\] first_pass: ([\d.]+)s/); if (match) firstPassMs += Number(match[1]) * 1000; }
});
const sampleMemory = () => { workerPeakBytes = Math.max(workerPeakBytes, process.memoryUsage().rss); };
const timer = setInterval(sampleMemory, 100);
const wasmShape = value => {
  if (value === null) return undefined;
  if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = wasmShape(value[key]);
  return value;
};
try {
  await native.ready();
  if (!argv.includes('--legacy')) await native.request('configure', { threads, parallelTicks });
  const call = async (method, part, args = {}) => { const result = wasmShape(await native.request(method, { part: part.part, ...args })); sampleMemory(); return result; };
  const parse = createDemoParser({
    init: async () => null,
    openSources: () => native.request('source', { paths: [path.resolve(file)] }),
    parseHeader: part => call('header', part),
    parseEvents: (part, events, props) => call('events', part, { events, props }),
    parseGrenades: (part, props) => call('grenades', part, { props }),
    parseTicks: (part, props, ticks, players) => call('ticks', part, { props, ticks: Array.from(ticks), players }),
    postMessage: async message => {
      if (message.type === 'round') { rounds++; await fs.writeFile(path.join(output, `round-${message.data.round}.json`), encodeStoredValue(message.data)); }
      if (message.type === 'loaded') await fs.writeFile(path.join(output, 'demo.json'), encodeStoredValue(message.data));
      if (message.type === 'error') throw new Error(message.message);
    },
  });
  const started = performance.now();
  await parse({ type: 'load', fileName: path.basename(file), sampleRate });
  const report = { file, threads, parallelTicks, sampleRate, sourceBytes: (await fs.stat(file)).size, elapsedMs: performance.now() - started, rounds, nativePeakBytes, workerPeakBytes, firstPassMs, methods };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }));
} finally { clearInterval(timer); native.close(); }
