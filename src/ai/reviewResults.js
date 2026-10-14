// Result protocol v1: models supply interpretation and evidence references only.
// 中文：证据由查询工具注册；模型不能提交导航动作或虚构坐标。
const string = maxLength => ({ type: 'string', minLength: 1, maxLength });
const refs = { type: 'array', minItems: 1, maxItems: 12, items: string(200) };
export const reviewResultParameters = { type: 'object', additionalProperties: false, required: ['schemaVersion', 'cards'], properties: {
  schemaVersion: { type: 'string', enum: ['1'] }, cards: { type: 'array', minItems: 1, maxItems: 4, items: {
    type: 'object', additionalProperties: false, required: ['type', 'title', 'description', 'basis', 'limitations'], properties: {
      type: { type: 'string', enum: ['finding', 'clips', 'comparison'] }, title: string(200), description: string(1500),
      basis: { type: 'string', enum: ['observed', 'inferred'] }, limitations: { type: 'array', maxItems: 8, items: string(300) }, evidenceIds: refs,
      columns: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['label', 'evidenceIds'], properties: { label: string(120), evidenceIds: refs } } },
    },
  } },
} };
const invalid = message => Object.assign(new Error(message), { code: 'invalid_arguments' });
export function resolveReviewResult(input, registry) {
  let referenceCount = 0;
  const resolve = ids => {
    referenceCount += ids?.length || 0;
    if (referenceCount > 24) throw invalid('A result supports at most 24 evidence references across all cards');
    if (!ids?.length) throw invalid('Each card or comparison column requires evidenceIds from this turn');
    return [...new Set(ids)].map(id => {
      const record = registry.get(id);
      if (!record) throw invalid(`Unknown or stale evidence ID: ${id}. Query current evidence first.`);
      return { ...record };
    });
  };
  const cards = input.cards.map(card => {
    const { type, title, description, basis, limitations } = card;
    const common = { type, title, description, basis, limitations: [...limitations] };
    if (type === 'comparison') {
      if (card.evidenceIds || card.columns?.length !== 2) throw invalid('Comparison requires exactly two columns and no top-level evidenceIds');
      return { ...common, columns: card.columns.map(column => ({ label: column.label, evidence: resolve(column.evidenceIds) })) };
    }
    if (card.columns) throw invalid('Finding and clips cards use evidenceIds, not columns');
    return { ...common, evidence: resolve(card.evidenceIds) };
  });
  return { schemaVersion: '1', id: crypto.randomUUID(), cards, historical: false };
}
// Persist only bounded display fields; imports cannot restore executable actions.
export function portableReviewResult(value) {
  if (!value || !Array.isArray(value.cards)) return null;
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const evidence = items => (Array.isArray(items) ? items : []).slice(0, 12).filter(item => item && typeof item.demoId === 'string' && Number.isInteger(item.round) && item.round >= 0 && Number.isInteger(item.tick) && item.tick >= 0).map(item => ({
    id: text(item.id, 200), demoId: text(item.demoId, 1024), fileName: text(item.fileName, 300), round: item.round, tick: item.tick,
    secondsFromRoundStart: Number.isFinite(item.secondsFromRoundStart) ? item.secondsFromRoundStart : null,
    type: text(item.type, 80), player: text(item.player, 200), attacker: text(item.attacker, 200),
  }));
  return { schemaVersion: text(value.schemaVersion, 40), historical: true, cards: value.cards.slice(0, 4).filter(card => card && typeof card === 'object').map(card => ({
    type: text(card.type, 40), title: text(card.title, 200), description: text(card.description, 1500), basis: text(card.basis, 40),
    limitations: (Array.isArray(card.limitations) ? card.limitations : []).slice(0, 8).map(item => text(item, 300)),
    evidence: evidence(card.evidence), columns: (Array.isArray(card.columns) ? card.columns : []).slice(0, 2).map(column => ({ label: text(column?.label, 120), evidence: evidence(column?.evidence) })),
  })) };
}
