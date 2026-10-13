// Parser sessions own source identities and async reads, independent of hosts.
// 会话管理来源、能力与生命周期；取消正在运行的进程/Worker 仍由宿主驱动完成。
export const PARSER_API_VERSION = '0.1';
export const FRAME_PROFILE_NAMES = Object.freeze(['replay', 'analysis', 'preparation']);

export class ParserError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ParserError'; this.code = code; this.details = details; }
}
export const requireParser = (condition, code, message) => { if (!condition) throw new ParserError(code, message); };

export function frameTicks(query) {
  const ticks = query.ticks != null ? Array.from(query.ticks) : (() => {
    const { startTick, endTick, tickStep = 1 } = query;
    requireParser(Number.isSafeInteger(startTick) && Number.isSafeInteger(endTick) && Number.isSafeInteger(tickStep) && tickStep > 0 && endTick >= startTick, 'invalid_query', 'Frames require integer ticks or a valid tick range');
    const count = Math.floor((endTick - startTick) / tickStep) + 1;
    requireParser(count <= 1_000_000, 'invalid_query', 'Frame range exceeds one million samples');
    return Array.from({ length: count }, (_, index) => startTick + index * tickStep);
  })();
  requireParser(ticks.length <= 1_000_000 && ticks.every(Number.isSafeInteger), 'invalid_query', 'Frame ticks must be bounded integers');
  return [...new Set(ticks)].sort((a, b) => a - b);
}

export function createParserSession({ info, parts, capabilities, operations, dispose, diagnostics = () => ({}) }, { signal } = {}) {
  requireParser(parts.length > 0 && parts.every(part => typeof part.id === 'string' && part.id.length && Number.isSafeInteger(part.byteLength) && part.byteLength > 0) && new Set(parts.map(part => part.id)).size === parts.length, 'invalid_source', 'Parser sources must have unique IDs');
  let closed = false, disposing;
  const pending = new Set();
  const sources = Object.freeze(parts.map(part => Object.freeze({ ...part })));
  const check = query => {
    requireParser(!closed, 'session_closed', 'Parser session is closed');
    signal?.throwIfAborted(); query?.signal?.throwIfAborted();
    if (query?.partId != null) requireParser(sources.some(part => part.id === query.partId), 'unknown_source', `Unknown parser source ${query.partId}`);
  };
  const queryFields = { getMetadata: [], listSegments: ['kind'], readEvents: ['types', 'startTick', 'endTick', 'batchSize'],
    readFrames: ['profile', 'ticks', 'startTick', 'endTick', 'tickStep', 'players', 'batchSize'],
    prepareFrames: ['profiles', 'ticks', 'startTick', 'endTick', 'tickStep', 'throws'], readVoice: ['batchSize', 'startTick', 'endTick'], readUtilities: [], releasePreparedFrames: [] };
  const validateQuery = (method, query) => {
    const allowed = ['partId', 'signal', 'onProgress', ...(queryFields[method] || [])];
    for (const key of Object.keys(query)) requireParser(allowed.includes(key), 'invalid_query', `Unknown ${method} field ${key}; allowed: ${allowed.join(', ')}`);
    for (const key of ['startTick', 'endTick']) if (query[key] != null) requireParser(Number.isFinite(query[key]), 'invalid_query', `${key} must be finite`);
    if (query.startTick != null && query.endTick != null) requireParser(query.endTick >= query.startTick, 'invalid_query', 'Tick range is reversed');
    if (query.types != null) requireParser(Array.isArray(query.types) && query.types.every(type => typeof type === 'string'), 'invalid_query', 'Event types must be strings');
  };
  const normalizeQuery = query => ({ ...query, partId: query?.partId ?? (sources.length === 1 ? sources[0].id : undefined) });
  const feature = { getMetadata: 'metadata', listSegments: 'segments', readEvents: 'events', readFrames: 'frames', readUtilities: 'utilities', readVoice: 'voice', prepareFrames: 'prepareFrames' };
  const supported = method => requireParser(capabilities[feature[method]]?.supported !== false, 'unsupported_capability', `Parser does not support ${method}`);
  const invoke = async (method, query) => {
    query = normalizeQuery(query); check(query); supported(method); validateQuery(method, query);
    requireParser(typeof operations[method] === 'function', 'unsupported_capability', `Parser does not support ${method}`);
    const request = Promise.resolve().then(() => operations[method](query));
    pending.add(request);
    try { const value = await request; check(query); return value; }
    finally { pending.delete(request); }
  };
  const stream = method => async function* (query = {}) {
    query = normalizeQuery(query); check(query); supported(method); validateQuery(method, query);
    requireParser(typeof operations[method] === 'function', 'unsupported_capability', `Parser does not support ${method}`);
    const iterator = operations[method](query)[Symbol.asyncIterator]();
    try {
      for (;;) {
        check(query);
        const request = Promise.resolve().then(() => iterator.next()); pending.add(request);
        let next;
        try { next = await request; check(query); } finally { pending.delete(request); }
        if (next.done) return;
        yield next.value;
      }
    } finally { await iterator.return?.(); }
  };
  const readUtilities = stream('readUtilities');
  const selectUtilities = kinds => async function* (query) {
    for await (const observation of readUtilities(query)) if (kinds.includes(observation.kind)) yield observation;
  };
  return Object.freeze({
    info: Object.freeze({ ...info, apiVersion: PARSER_API_VERSION }), parts: sources, capabilities: Object.freeze({ ...capabilities }),
    listSegments: query => invoke('listSegments', query),
    getMetadata: query => invoke('getMetadata', query),
    readEvents: stream('readEvents'), readFrames: stream('readFrames'), readUtilities, readProjectiles: selectUtilities(['projectile']), readEffects: selectUtilities(['smoke', 'fire']), readVoice: stream('readVoice'),
    ...(operations.prepareFrames ? { prepareFrames: query => invoke('prepareFrames', query) } : {}),
    ...(operations.releasePreparedFrames ? { releasePreparedFrames: () => invoke('releasePreparedFrames') } : {}),
    diagnostics: () => diagnostics(),
    dispose() {
      if (disposing) return disposing;
      closed = true;
      disposing = (async () => { await Promise.allSettled([...pending]); await dispose?.(); })();
      return disposing;
    },
  });
}
