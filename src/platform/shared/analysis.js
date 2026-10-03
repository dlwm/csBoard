import { buildUtilityRecommendations } from '../../analysis/utilityRecommendations.js';
import { buildAnalysisDataset } from '../../analysis/buildAnalysisDataset.js';
import { buildDemoGrenadeSegments } from '../../demo/grenades.js';
import { buildSavedThrowNote } from '../../utility/savedThrow.js';
import { roundEconomy } from '../../demo/economy.js';

// The same query runs beside IndexedDB in a Worker or beside SQLite in a
// desktop utility process. Only catalogue rows and selected results reach React.
export async function runAnalysisQuery(cache, method, args) {
  if (method === 'analysis.recommendations') return buildUtilityRecommendations(args);
  if (method === 'analysis.catalog') {
    const result = [];
    const index = new Map(cache.listCachedDemos ? (await cache.listCachedDemos()).map(entry => [entry.id, entry]) : []);
    for (const id of args.ids) {
      const metadata = index.get(id);
      if (metadata?.analysisIndexVersion === 1) {
        if (metadata.cacheSchemaVersion === args.schema && metadata.map === args.map && metadata.analysisPlayerNames?.length) result.push(metadata);
        continue;
      }
      const entry = await cache.getCachedDemo(id);
      if (entry?.data?.cacheSchemaVersion !== args.schema || entry.data.demo.map !== args.map || !entry.analysisRows?.length) continue;
      const names = new Set();
      for (const row of entry.analysisRows) for (const player of row.players) if (player.name) names.add(player.name);
      const { data, analysisRows, ...details } = entry;
      result.push({ ...details, rounds: data.rounds.length, analysisPlayerNames: [...names] });
    }
    return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  if (method === 'analysis.utility') {
    const entry = await cache.getCachedDemo(args.ids[0]);
    const round = entry?.data?.rounds?.find(round => round.round === args.round);
    const data = round && await cache.getCachedDemoRound(args.ids[0], args.round);
    if (!data) throw new Error('Utility round cache is missing; reparse this Demo.');
    const segment = buildDemoGrenadeSegments(data.projectiles, entry.data.events, data.throwSnapshots, round, entry.data.demo?.tickRate || 64)
      .find(segment => segment.id === args.segmentId && args.players.includes(segment.throwEvent?.user_name));
    if (!segment) throw new Error('This utility is no longer available; reload the analysis.');
    const note = buildSavedThrowNote({ mapName: entry.data.demo.map, segment, source: {
      fileName: entry.data.demo.fileName, round: args.round, tickRate: entry.data.demo.tickRate || 64,
      smokeVoxelFrames: data.smokeVoxelFrames, infernoFrames: data.infernoFrames,
    } });
    if (!note) throw new Error('Utility throw position is missing; reparse this Demo.');
    return note;
  }
  if (method !== 'analysis.query') throw new Error('Unknown analysis query');
  const demos = [];
  const diagnostics = { requestedDemos: args.ids.length, loadedDemos: 0, requiredRounds: 0, loadedRounds: 0, missingRounds: 0 };
  for (const id of args.ids) {
    const entry = await cache.getCachedDemo(id);
    if (!entry?.data || !entry.analysisRows?.length) continue;
    diagnostics.loadedDemos += 1;
    const roundGrenades = {};
    const selectedPlayers = new Set(args.players);
    const selectedThrows = (entry.data.events || []).filter(event => event.event_name === 'grenade_thrown' && selectedPlayers.has(event.user_name));
    // Bound in-flight reads: loading every round concurrently duplicates large payloads.
    for (const round of args.includeUtilities === false ? [] : entry.data.rounds) {
      if (!selectedThrows.some(event => event.tick >= (round.contextStartTick ?? round.startTick) && event.tick <= round.endTick)) continue;
      diagnostics.requiredRounds += 1;
      const data = await cache.getCachedDemoRound(id, round.round);
      if (data) diagnostics.loadedRounds += 1; else diagnostics.missingRounds += 1;
      if (data) roundGrenades[round.round] = {
        projectiles: data.projectiles || [], throwSnapshots: [],
        // Effect volumes and replay preparation are loaded only when saving one utility.
        smokeVoxelFrames: [], infernoFrames: [],
      };
    }
    demos.push({ ...entry, analysisRoundGrenades: roundGrenades });
  }
  const result = buildAnalysisDataset({ demos, selectedPlayers: args.players, getRoundEconomy: roundEconomy, includeUtilities: args.includeUtilities !== false, includeReplay: false });
  result.utilityDiagnostics = { ...result.utilityDiagnostics, ...diagnostics };
  return result;
}
