import { buildAnalysisDataset } from '../../analysis/buildAnalysisDataset.js';
import { roundEconomy } from '../../demo/economy.js';

// The same query runs beside IndexedDB in a Worker or beside SQLite in a
// desktop utility process. Only catalogue rows and selected results reach React.
export async function runAnalysisQuery(cache, method, args) {
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
  if (method !== 'analysis.query') throw new Error('Unknown analysis query');
  const demos = [];
  for (const id of args.ids) {
    const entry = await cache.getCachedDemo(id);
    if (!entry?.data || !entry.analysisRows?.length) continue;
    const roundGrenades = {};
    const selectedPlayers = new Set(args.players);
    const selectedThrows = (entry.data.events || []).filter(event => event.event_name === 'grenade_thrown' && selectedPlayers.has(event.user_name));
    // Bound in-flight reads: loading every round concurrently duplicates large payloads.
    for (const round of args.includeUtilities === false ? [] : entry.data.rounds) {
      if (!selectedThrows.some(event => event.tick >= (round.contextStartTick ?? round.startTick) && event.tick <= round.endTick)) continue;
      const data = await cache.getCachedDemoRound(id, round.round);
      if (data) roundGrenades[round.round] = {
        projectiles: data.projectiles || [], throwSnapshots: data.throwSnapshots || [],
        smokeVoxelFrames: data.smokeVoxelFrames || [], infernoFrames: data.infernoFrames || [],
      };
    }
    demos.push({ ...entry, analysisRoundGrenades: roundGrenades });
  }
  return buildAnalysisDataset({ demos, selectedPlayers: args.players, getRoundEconomy: roundEconomy, includeUtilities: args.includeUtilities !== false });
}
