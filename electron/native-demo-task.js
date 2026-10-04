import { createNativeClient } from './native-client.js';
import { createDemoParser } from '../src/demo/parserRuntime.js';
import { createGoParserAdapter } from '../src/demo/goParserAdapter.js';
import { encodeStoredValue } from '../shared/storage-codec.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let parser;
let sequence = 0;
const storageRequests = new Map();
const send = message => process.parentPort.postMessage(message);
let staging;
const store = async (method, args) => {
  const name = `${randomUUID()}.json`;
  const file = path.join(staging, name);
  await fs.writeFile(file, args.value, { flag: 'wx', mode: 0o600 });
  const { value, ...metadata } = args;
  try { return await new Promise((resolve, reject) => {
  const id = ++sequence;
  storageRequests.set(id, { resolve, reject });
  send({ type: 'storage', id, method: 'cache.putFile', args: { ...metadata, name } });
  }); } finally { await fs.rm(file, { force: true }); }
};

process.parentPort.on('message', async ({ data }) => {
  if (data.type === 'storageResult') {
    const request = storageRequests.get(data.id);
    storageRequests.delete(data.id);
    if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data.result);
    return;
  }
  if (data.type !== 'start' || parser) return;
  const { binary, job } = data;
  staging = data.staging;
  let nativePeak = 0, workerPeak = 0, parserReleased = false, cachedRounds = 0;
  const timings = {};
  const reportMemory = () => {
    workerPeak = Math.max(workerPeak, process.memoryUsage().rss);
    send({ type: 'telemetry', metrics: { peakBytes: nativePeak + workerPeak, nativePeakBytes: nativePeak, workerPeakBytes: workerPeak, parserReleased, timings } });
  };
  const memoryTimer = setInterval(reportMemory, 1500);
  parser = createNativeClient(binary, [], { timeoutMs: 30 * 60_000, onMetrics: metrics => {
    nativePeak = Math.max(nativePeak, metrics.peakRssBytes || 0);
    const stage = timings[metrics.method] ||= { calls: 0, elapsedMs: 0 };
    stage.calls++; stage.elapsedMs += metrics.elapsedMs;
    reportMemory();
  } });
  parser.child.on('spawn', () => send({ type: 'parserPid', pid: parser.child.pid }));
  parser.child.on('exit', () => send({ type: 'parserPid', pid: null }));
  try {
    const parserInfo = await parser.ready();
    await parser.request('configure', { threads: data.allocation?.threads || 1 });
    const parse = createDemoParser({
      ...createGoParserAdapter({
        init: async () => null,
        openSources: () => parser.request('source', { paths: job.paths }),
        request: (method, args) => parser.request(method, args),
      }),
      postMessage: async message => {
        if (message.type === 'round') {
          await store('cache.putRound', { id: job.cacheId, round: message.data.round, value: encodeStoredValue(message.data) });
          send({ type: 'round-cached', completed: ++cachedRounds });
          return;
        }
        if (message.type === 'loaded') {
          send({ type: 'caching' });
          // Parsing is done. Release the Go heap before serializing the final
          // cache so another Demo can use its CPU and memory allocation.
          const exited = parser.child.exitCode !== null || parser.child.signalCode !== null
            ? Promise.resolve() : new Promise(resolve => parser.child.once('exit', resolve));
          parser.close();
          await exited;
          parserReleased = true;
          reportMemory();
          const { analysisRows, ...data } = message.data;
          const now = new Date().toISOString();
          const metadata = { id: job.cacheId, fileName: job.fileName, map: data.demo.map, rounds: data.rounds.length, sampleRate: data.demo.sampleRate, kind: data.demo.kind, sourceBytes: data.demo.bytes, dataBytes: message.estimatedBytes, analysisBytes: data.analysisBytes, createdAt: now, updatedAt: now, parserRevision: `go-${parserInfo.sourceRevision || 'local'}-adapter-1` };
          metadata.analysisIndexVersion = 1;
          metadata.cacheSchemaVersion = data.cacheSchemaVersion;
          metadata.analysisPlayerNames = [...new Set((analysisRows || []).flatMap(row => row.players.map(player => player.name).filter(Boolean)))];
          const { header, ...demoSummary } = data.demo;
          metadata.inspection = { cacheSchemaVersion: data.cacheSchemaVersion, demo: demoSummary, summary: data.summary, warnings: data.warnings, rounds: data.rounds.map(({ round }) => ({ round })) };
          await store('cache.put', { id: job.cacheId, metadata: encodeStoredValue(metadata), value: encodeStoredValue({ ...metadata, data, analysisRows }) });
          send({ type: 'complete', cacheId: job.cacheId, summary: { ...data.summary, map: data.demo.map, sampleRate: data.demo.sampleRate, kind: data.demo.kind, warnings: data.warnings, sourceBytes: data.demo.bytes, estimatedOutputBytes: message.estimatedBytes, performance: { nativePeakBytes: nativePeak, workerPeakBytes: workerPeak, timings } } });
          return;
        }
        send(message);
      },
    });
    await parse({ type: 'load', fileName: job.fileName, sampleRate: job.sampleRate, kind: job.kind });
  } catch (error) { send({ type: 'error', message: error.message }); }
  finally { clearInterval(memoryTimer); parser.close(); }
});
