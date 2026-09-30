import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNativeClient } from '../electron/native-client.js';
import { createDemoParser } from '../src/demo/parserRuntime.js';
import { createGoParserAdapter } from '../src/demo/goParserAdapter.js';
import { encodeStoredValue } from '../src/app/storageCodec.js';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const file = argv[0];
if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/benchmark-native-parser.js file.dem --threads 4 --output /tmp/parse-output [--sample-rate 8] [--binary path]');
const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform;
const binary = path.resolve(option('--binary', `build/go-parser/native/${platform}-${process.arch}/csboard-go-parser${process.platform === 'win32' ? '.exe' : ''}`));
const threads = Number(option('--threads', '1'));
const sampleRate = Number(option('--sample-rate', '8'));
const output = path.resolve(option('--output', await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-parser-bench-'))));
await fs.mkdir(output, { recursive: true });
const methods = {};
let nativePeakBytes = 0, workerPeakBytes = 0, rounds = 0;
const native = createNativeClient(binary, [], { timeoutMs: 30 * 60_000, onMetrics: metric => {
  nativePeakBytes = Math.max(nativePeakBytes, metric.peakRssBytes || 0);
  const stage = methods[metric.method] ||= { calls: 0, elapsedMs: 0 };
  stage.calls++; stage.elapsedMs += metric.elapsedMs;
} });
const sampleMemory = () => { workerPeakBytes = Math.max(workerPeakBytes, process.memoryUsage().rss); };
const timer = setInterval(sampleMemory, 100);
try {
  await native.ready();
  await native.request('configure', { threads });
  const parse = createDemoParser({
    ...createGoParserAdapter({
      init: async () => null,
      openSources: () => native.request('source', { paths: [path.resolve(file)] }),
      request: async (method, args) => { const result = await native.request(method, args); sampleMemory(); return result; },
    }),
    postMessage: async message => {
      if (message.type === 'round') { rounds++; await fs.writeFile(path.join(output, `round-${message.data.round}.json`), encodeStoredValue(message.data)); }
      if (message.type === 'loaded') await fs.writeFile(path.join(output, 'demo.json'), encodeStoredValue(message.data));
      if (message.type === 'error') throw new Error(message.message);
    },
  });
  const started = performance.now();
  await parse({ type: 'load', fileName: path.basename(file), sampleRate });
  const report = { file, threads, sampleRate, sourceBytes: (await fs.stat(file)).size, elapsedMs: performance.now() - started, rounds, nativePeakBytes, workerPeakBytes, methods };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }));
} finally { clearInterval(timer); native.close(); }
