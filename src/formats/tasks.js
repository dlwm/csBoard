import { openPackage, createPackageWriter, validateFormat, REPLAY_PROFILE_VERSION } from './packageIO.js';
import { createCsboardReplayProducer, createCsboardReplayConsumer } from './replayAdapter.js';
import { createV3ReplayConsumer } from './v3Adapter.js';
import { requireFormat } from './errors.js';

export async function exportReplayPackage({ data, analysisRows = [], readRound, signal, onProgress = () => {} }) {
  const producer = createCsboardReplayProducer(data), writer = createPackageWriter({ signal });
  const segments = [];
  for (const [index, round] of data.rounds.entries()) {
    signal?.throwIfAborted();
    const payload = await readRound(round.round);
    const segment = producer.encodeSegment(round, payload);
    const file = `segments/${index + 1}.json`;
    writer.add(file, segment, 'replaySegment');
    segments.push({ id: segment.id, file, startTick: round.freezeStartTick ?? round.startTick, activeStartTick: round.startTick, endTick: round.endTick, sourceRound: round.sourceRound ?? (data.demo.kind === 'recording' ? null : round.round) });
    onProgress({ phase: 'segments', completed: index + 1, total: data.rounds.length, percent: Math.round((index + 1) / data.rounds.length * 85) });
  }
  if (analysisRows.length) writer.add('analysis.json', producer.encodeFrames(analysisRows), 'replayFrames');
  writer.add('metadata.json', producer.metadata(), 'replayMetadata');
  const events = producer.events();
  writer.add('players.json', [...producer.players.values()], 'replayPlayers');
  writer.add('events.json', events, 'replayEvents');
  const manifest = { schemaVersion: REPLAY_PROFILE_VERSION, kind: data.demo.kind === 'recording' ? 'recording' : 'match',
    producer: { name: 'csboard', version: 'replay-adapter/1', parser: data.demo.parserId || data.formatFacts?.manifest?.parser?.name || 'unknown' },
    mapName: data.demo.map, tickRate: data.demo.tickRate || 64, sampleRate: data.demo.sampleRate || null,
    coordinateSpace: 'source2-world-units', capabilities: { ...producer.capabilities(), freezeTime: { status: data.rounds.some(round => round.freezeStartTick < round.startTick) ? 'available' : 'unknown' }, analysis: { status: analysisRows.length ? 'available' : 'unavailable', ...(!analysisRows.length ? { reason: 'not-provided' } : {}) } },
    files: { metadata: 'metadata.json', players: 'players.json', events: 'events.json', ...(analysisRows.length ? { analysis: 'analysis.json' } : {}) }, segments };
  writer.add('manifest.json', manifest, 'replayManifest');
  const bytes = writer.finish(); onProgress({ phase: 'complete', percent: 100 }); return bytes;
}

export async function importReplayPackage(cache, { bytes, destinationId, allowedMaps, signal, onProgress = () => {} }) {
  requireFormat(/^format\|[a-f0-9-]{36}$/.test(destinationId), 'invalid_destination', 'Import destination must be a fresh format ID');
  const reader = await openPackage(bytes, { signal });
  let consumer, analysisRows, segmentCount;
  if (reader.manifest.schemaVersion === REPLAY_PROFILE_VERSION) {
    const { files } = reader.manifest;
    consumer = createCsboardReplayConsumer(reader.manifest,
      await reader.readJSON(files.metadata, 'replayMetadata'), await reader.readJSON(files.players, 'replayPlayers'),
      await reader.readJSON(files.events, 'replayEvents'), files.analysis ? await reader.readJSON(files.analysis, 'replayFrames') : []);
    analysisRows = consumer.analysisRows; segmentCount = reader.manifest.segments.length;
  } else {
    const files = {};
    for (const [key, name] of Object.entries(reader.manifest.files)) files[key] = await reader.readJSON(name, key);
    consumer = createV3ReplayConsumer(files, reader.manifest); analysisRows = []; segmentCount = consumer.data.rounds.length;
  }
  const data = consumer.data;
  requireFormat(data.demo.tickRate === 64, 'unsupported_tickrate', 'The current CSBoard replay UI requires a 64-tick time base');
  requireFormat(!allowedMaps || allowedMaps.includes(data.demo.map), 'unsupported_map', `No map resources are available for ${data.demo.map}`);
  requireFormat(new Set(data.rounds.map(round => round.round)).size === segmentCount, 'duplicate_segment', 'Segment numbers are not unique');
  const tickStep = Math.max(1, data.demo.tickRate / 2);
  let dataBytes = 0;
  try {
    for (let index = 0; index < segmentCount; index++) {
      signal?.throwIfAborted();
      const info = reader.manifest.segments?.[index];
      const encoded = info ? await reader.readJSON(info.file, 'replaySegment') : null;
      if (info) requireFormat(encoded.id === info.id && info.startTick <= info.activeStartTick && info.activeStartTick <= info.endTick, 'invalid_timeline', 'Segment metadata or timeline is inconsistent');
      const payload = info ? consumer.decodeSegment(encoded, index) : consumer.decodeSegment(index);
      for (const track of [payload.snapshots, payload.throwSnapshots || [], payload.projectiles || [], payload.smokeVoxelFrames || [], payload.infernoFrames || [], payload.voiceFrames || []]) {
        let previous = -Infinity;
        for (const sample of track) { requireFormat(sample.tick >= previous, 'invalid_timeline', 'Replay track ticks must be ordered'); previous = sample.tick; }
      }
      if (!info && data.demo.kind !== 'recording') {
        let last = -Infinity;
        for (const snapshot of payload.snapshots) if (snapshot.tick - last >= tickStep) { analysisRows.push(snapshot); last = snapshot.tick; }
      }
      await cache.putCachedDemoRound(destinationId, payload);
      data.roundData.push({ round: payload.round, snapshots: [payload.snapshots.find(snapshot => snapshot.tick >= data.rounds[index].startTick) || payload.snapshots[0]] });
      dataBytes += JSON.stringify(payload).length * 2;
      onProgress({ phase: 'segments', completed: index + 1, total: segmentCount, percent: Math.round((index + 1) / segmentCount * 95) });
    }
    signal?.throwIfAborted();
    const entry = { id: destinationId, kind: data.demo.kind, fileName: data.demo.fileName, map: data.demo.map,
      sampleRate: data.demo.sampleRate, rounds: segmentCount, updatedAt: new Date().toISOString(), data, analysisRows,
      analysisIndexVersion: 1, cacheSchemaVersion: data.cacheSchemaVersion,
      analysisPlayerNames: [...new Set(analysisRows.flatMap(snapshot => snapshot.players.map(player => player.name).filter(Boolean)))],
      analysisBytes: JSON.stringify(analysisRows).length * 2, dataBytes, sourceBytes: 0,
      format: { schemaVersion: reader.manifest.schemaVersion, capabilities: data.demo.formatCapabilities } };
    // Publish metadata only after every segment is durable. Until this point,
    // no partially imported package appears in the replay catalogue.
    await cache.putCachedDemo(entry);
    onProgress({ phase: 'complete', percent: 100 });
    return { id: destinationId, capabilities: data.demo.formatCapabilities, segments: segmentCount };
  } catch (error) { await cache.deleteCachedDemo(destinationId).catch(() => {}); throw error; }
}

export async function runFormatTask(cache, method, args, options = {}) {
  if (method === 'format.import') return importReplayPackage(cache, { ...args, ...options });
  if (method === 'format.export') {
    const entry = args.inline || await cache.getCachedDemo(args.ids[0]);
    requireFormat(entry?.data, 'missing_replay', 'Select a cached replay before exporting');
    return exportReplayPackage({ data: entry.data, analysisRows: entry.analysisRows || [],
      readRound: round => args.inline ? Promise.resolve(args.inline.roundData) : cache.getCachedDemoRound(args.ids[0], round), ...options });
  }
  throw new Error('Unknown format operation');
}
