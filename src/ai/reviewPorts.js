import { queryAssistantEvidence } from '../analysis/assistantQueries.js';
const fail = (message, code = 'invalid_arguments') => { throw Object.assign(new Error(message), { code }); };
export const reviewScopeKey = s => JSON.stringify([s.panel, s.mapName, s.demoId, s.round?.round, s.selectedDemoIds, s.selectedPlayers, s.side, s.metric, s.utilityKinds]);
export function createReviewPorts({ getState, compute, navigate, filter }) {
  const context = () => {
    const s = getState();
    return { demoId: s.demoId, fileName: s.data?.demo.fileName || null, round: s.round?.round ?? null, tick: s.tick, tickRate: s.data?.demo.tickRate || null,
      customRecording: s.customRecording, replayLoading: s.replayLoading, selectedDemoIds: s.selectedDemoIds, selectedPlayers: s.selectedPlayers,
      availableDemoIds: s.availableDemoIds, availablePlayers: s.availablePlayers, side: s.side, metric: s.metric, utilityKinds: s.utilityKinds,
      analysisLoading: s.analysisLoading, recommendationsLoading: s.recommendationsLoading, recommendationCount: s.groups.length };
  };
  const selectedIds = s => s.panel === 'demo' ? s.data ? [s.demoId] : [] : s.selectedDemoIds;
  const evidence = async (s, input, signal) => {
    const ids = input.demoId ? [input.demoId] : selectedIds(s);
    if (!ids.length) fail('Select at least one Demo first', 'invalid_data');
    if (ids.some(id => !selectedIds(s).includes(id))) fail('Demo is outside the current selection', 'permission_denied');
    const args = { ids, round: input.round ?? (s.panel === 'demo' ? s.round?.round : undefined), players: input.players ?? (s.panel === 'analysis' ? s.selectedPlayers : []), eventTypes: input.eventTypes, offset: input.offset, limit: input.limit };
    signal?.throwIfAborted();
    const result = s.panel === 'demo' ? await queryAssistantEvidence({ getCachedDemo: async () => ({ data: s.data }) }, args) : await compute('analysis.assistant', args, { signal });
    signal?.throwIfAborted();
    if (reviewScopeKey(getState()) !== reviewScopeKey(s)) fail('Review context changed; query again', 'context_changed');
    return result;
  };
  const execute = async (name, input, { signal } = {}) => {
    const s = getState();
    if (name === 'get_review_context') return { ...context(), panel: s.panel, mapName: s.mapName, toolsAreExperimental: true };
    if (name === 'query_match_events') return evidence(s, input, signal);
    if (name === 'list_utility_recommendations') {
      if (s.panel !== 'analysis' || s.metric !== 'utility') return { status: 'unavailable', reason: 'Open utility events in Data Analysis', total: 0, recommendations: [] };
      if (s.analysisLoading || s.recommendationsLoading) return { status: 'loading', total: 0, recommendations: [] };
      if (s.analysisError) return { status: 'failed', error: s.analysisError };
      const offset = input.offset || 0, limit = input.limit || 20;
      const rows = s.groups.slice(offset, offset + limit).map(group => {
        const utility = s.utilities.find(utility => utility.id === group.representativeId);
        return { id: group.id, kind: group.kind, count: group.count, score: group.score, demoCount: group.demoCount, roundCount: group.roundCount,
          representative: utility ? { id: utility.id, demoId: utility.source.demoId, fileName: utility.source.fileName, round: utility.source.round, tick: utility.segment.throwEvent?.tick, player: utility.segment.throwEvent?.user_name, throwPosition: utility.throwPosition, landing: utility.landing } : null };
      });
      return { status: rows.length ? 'ready' : 'empty', emptyReason: rows.length ? null : !s.selectedPlayers.length ? 'no_players_selected' : !s.selectedDemoIds.length ? 'no_demos_selected' : 'no_groups_meet_current_filters',
        recommendations: rows, total: s.groups.length, nextOffset: offset + limit < s.groups.length ? offset + limit : null,
        evidence: rows.filter(row => row.representative && Number.isInteger(row.representative.tick)).map(row => ({ ...row.representative, type: row.kind })),
        scoring: 'Heuristic frequency score 0–100; not a win rate or effectiveness rating.', filters: context() };
    }
    if (name === 'prepare_replay_view') {
      const result = await evidence(s, { demoId: input.demoId, round: input.round, limit: 1 }, signal);
      const round = result.demos[0]?.rounds.find(round => round.round === input.round);
      if (!round || input.tick < (round.freezeStartTick ?? round.startTick) || input.tick > round.endTick) fail('Tick is outside the selected round');
      return { status: 'prepared', action: { kind: 'replay', ...input, scope: reviewScopeKey(s) }, applied: false };
    }
    if (name === 'prepare_analysis_filter') {
      if (s.panel !== 'analysis') fail('Open Data Analysis first', 'permission_denied');
      if (!Object.keys(input).length) fail('Provide at least one filter');
      if (input.players?.some(name => !s.availablePlayers.includes(name)) || input.demoIds?.some(id => !s.availableDemoIds.includes(id))) fail('Unknown player or Demo in filter');
      return { status: 'prepared', action: { kind: 'analysis', ...input, scope: reviewScopeKey(s) }, applied: false };
    }
    fail('Unknown review operation', 'unknown_command');
  };
  const apply = async (action, options = {}) => {
    const s = getState();
    if (action.scope && reviewScopeKey(s) !== action.scope) fail('Selection changed; prepare this action again', 'context_changed');
    if (action.kind === 'analysis') return filter(action);
    if (action.kind !== 'replay') fail('Unknown review action');
    const result = await evidence(s, { demoId: action.demoId, round: action.round, limit: 1 }, options.signal);
    const round = result.demos[0]?.rounds.find(round => round.round === action.round);
    if (!round || !Number.isInteger(action.tick) || action.tick < (round.freezeStartTick ?? round.startTick) || action.tick > round.endTick) fail('Evidence is no longer available', 'invalid_data');
    return navigate({ ...action, roundData: round }, options);
  };
  return { context, execute, apply };
}
