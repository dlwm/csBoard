import { reviewResultParameters, resolveReviewResult } from './reviewResults.js';
import { createTacticalTools, validateToolArguments } from '../collaboration/tacticalTools.js';
const object = (properties = {}, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const text = { type: 'string', minLength: 1, maxLength: 200 };
const players = { type: 'array', items: text, minItems: 0, maxItems: 64 };
const round = { type: 'integer', minimum: 0, maximum: 10000 };
const page = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 40 } };
const definitions = [
  ['present_review_result', 'Present finding, clips or two-column comparison cards using evidence IDs returned by queries IN THIS TURN. At most 24 evidence references across all cards. Describe uncertainty and scope limitations. This renders cards, never applies actions. Unknown IDs are rejected. Do not repeat the entire card body in prose.', reviewResultParameters],
  ['get_review_context', 'Read current replay/analysis selection, loaded data availability and filters. Start here. This is a local application context, not an editable tactical board.', object()],
  ['query_match_events', 'Read deterministic event statistics and paged evidence from selected cached demos. Optional demoId must be in the current selection; at most 8 demos per query with omissions reported. Round numbers and ticks are original Demo values. Optional players/eventTypes narrow both evidence AND statistics. UI side/economy/position filters are not applied; disclose this statistical scope. Missing fields and unsupported causal judgments are explicit. Do not send entire tick streams or invent trade/visibility facts.', object({ demoId: text, round, players, eventTypes: { type: 'array', minItems: 0, maxItems: 8, items: { type: 'string', enum: ['player_death', 'player_hurt', 'player_blind', 'grenade_thrown', 'bomb_planted', 'bomb_defused', 'bomb_exploded', 'round_end'] } }, ...page })],
  ['list_utility_recommendations', 'Read current UI utility recommendations in frequency order, representative throws and their counts/scores. Uses the current player/demo/side/category filters. Loading and empty reasons are reported; switch to utility analysis if unavailable. Scores are heuristic frequency scores, not effectiveness percentages.', object(page)],
  ['prepare_replay_view', 'Prepare a clickable replay-view action from verified evidence. Does not move the view until the user clicks. Use a selected demoId, existing round, tick within that round and optional player name. Never claim navigation has already happened.', object({ demoId: text, round, tick: { type: 'integer', minimum: 0 }, player: text }, ['demoId', 'round', 'tick'])],
  ['prepare_analysis_filter', 'Prepare a clickable filter action. Does not apply it until the user clicks. Player names must come from current availablePlayers. Selected demo IDs must come from availableDemoIds. Selecting players resets the demo selection to compatible demos unless explicit demoIds are supplied. Utility metric enables recommendations.', object({ players, demoIds: { type: 'array', items: text, minItems: 0, maxItems: 64 }, side: { type: 'string', enum: ['all', 'T', 'CT'] }, metric: { type: 'string', enum: ['utility'] } })],
];
export const reviewToolDefinitions = definitions.map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }));
export const reviewToolNames = new Set(definitions.map(([name]) => name));
export const assistantContextKey = context => JSON.stringify([context.mapName, context.panel, context.frameId, context.archiveId, context.roomCode, context.enabled, context.review?.demoId, context.review?.round, context.review?.selectedDemoIds, context.review?.selectedPlayers, context.review?.side, context.review?.metric, context.review?.utilityKinds]);
export function createAssistantTools(getPorts) {
  const tactical = createTacticalTools(getPorts);
  const registry = new Map(); const sourceIds = new Map(); let evidenceScope;
  const beginTurn = () => { registry.clear(); sourceIds.clear(); evidenceScope = assistantContextKey(getPorts().context()); };
  const activeDefinitions = () => getPorts().context().panel === 'collab' ? tactical.definitions : reviewToolDefinitions;
  return { ...tactical, beginTurn, recordAction: entry => tactical.recordAction({ ...entry, readOnly: reviewToolNames.has(entry.name) || entry.readOnly === true }), allDefinitions: [...tactical.definitions, ...reviewToolDefinitions], get definitions() { return activeDefinitions(); }, contextKey: () => assistantContextKey(getPorts().context()),
    readScope: (name, input) => reviewToolNames.has(name) ? null : tactical.readScope(name, input),
    execute: async (name, input, options = {}) => {
      options.signal?.throwIfAborted();
      if (!activeDefinitions().some(tool => tool.function.name === name)) throw Object.assign(new Error('Tool is unavailable in the current menu'), { code: 'permission_denied' });
      if (!reviewToolNames.has(name)) return tactical.execute(name, input, options);
      const definition = reviewToolDefinitions.find(tool => tool.function.name === name);
      validateToolArguments(input, definition.function.parameters);
      const ports = getPorts();
      if (!ports.context().enabled) throw Object.assign(new Error('Load a replay or select analysis data first'), { code: 'invalid_data' });
      const scope = assistantContextKey(ports.context());
      if (scope !== evidenceScope) beginTurn();
      if (name === 'present_review_result') return { status: 'presented', reviewResult: resolveReviewResult(input, registry) };
      const result = await ports.review.execute(name, input, options);
      options.signal?.throwIfAborted();
      if (scope !== assistantContextKey(getPorts().context())) throw Object.assign(new Error('Review context changed'), { code: 'context_changed' });
      if (['query_match_events', 'list_utility_recommendations'].includes(name) && result.evidence) {
        const missing = new Set(result.evidence.map(item => `${name}:${item.id}`).filter(id => !sourceIds.has(id)));
        if (registry.size + missing.size > 256) throw Object.assign(new Error('Evidence budget reached; present the current findings before querying more'), { code: 'invalid_arguments' });
        return { ...result, evidence: result.evidence.map(item => {
          const sourceId = `${name}:${item.id}`;
          const id = sourceIds.get(sourceId) || `ev-${crypto.randomUUID()}`;
          sourceIds.set(sourceId, id); const record = { ...item, id }; registry.set(id, record); return record;
        }) };
      }
      return result;
    } };
}
