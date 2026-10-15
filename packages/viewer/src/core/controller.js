import { describeViewerContract } from './contract.js';
import { contractIssue } from './validation.js';
// Public operations, queries and subscriptions have no renderer dependency.
// UI、AI 与外部调用共享命令实现；宿主可注入权限策略，核心不连接存储或房间。
export const VIEWER_API_VERSION = '0.2';
export class ViewerError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ViewerError'; this.code = code; this.details = details; }
}
const requireValue = (value, code, message) => { if (!value) throw new ViewerError(code, message); };
const copy = (value, ancestors = new Set(), depth = 0) => {
  if (depth > 64 || (value && typeof value === 'object' && ancestors.has(value))) throw new ViewerError('invalid_data', 'Viewer data must be acyclic and at most 64 levels deep');
  const nested = item => copy(item, new Set([...ancestors, value]), depth + 1);
  if (Array.isArray(value)) return value.map(nested);
  if (ArrayBuffer.isView(value)) return value instanceof DataView ? new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) : value.slice();
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, nested(item)]));
  return value;
};
const errorValue = error => {
  let details; try { details = copy(error?.details || {}); } catch { details = { serializationError: 'invalid_data' }; }
  return { code: typeof error?.code === 'string' && error.code ? error.code : error?.name === 'AbortError' ? 'cancelled' : 'operation_failed', message: String(error?.message || error), details };
};

export function createViewerController({ commands, readState, readCapabilities = () => ({}), readWorkspace, readUtilityCatalogue, policy, onObserverError = () => {}, profile = 'custom', contractOverrides = {}, queries = [] }) {
  requireValue(typeof commands?.execute === 'function' && Array.isArray(commands.names) && typeof readState === 'function', 'invalid_ports', 'Viewer requires commands and a state reader');
  const subscribers = new Map();
  const contract = describeViewerContract({ apiVersion: VIEWER_API_VERSION, profile, names: commands.names, queries, overrides: contractOverrides });
  const descriptors = new Map(contract.commands.map(command => [command.name, command]));
  let revision = 0, sequence = 0, closed = false, active = null, pending = null, lastAction = null;
  const check = () => requireValue(!closed, 'disposed', 'Viewer has been disposed');
  const emit = (type, payload, operation = active) => {
    const issue = typeof type !== 'string' || !type ? { path: '/type', message: 'Event type must be a nonempty string' } : contractIssue(profile, 'event', type, payload);
    if (issue) { try { onObserverError(new ViewerError('invalid_event', `Invalid ${type} payload at ${issue.path || '/'}`, { event: type, issue })); } catch {} return; }
    const event = { type, revision, operationId: operation?.id || null, origin: operation?.origin || 'system', payload: copy(payload) };
    for (const listener of [...(subscribers.get(type) || []), ...(subscribers.get('*') || [])]) {
      try { listener(copy(event)); } catch (error) { try { onObserverError(error); } catch {} }
    }
  };
  const notify = (type, payload = {}, { origin = 'system', changed = false } = {}) => {
    if (closed) return;
    if (changed && active) { active.changed = true; active.events.push({ type, payload: copy(payload) }); return; }
    if (changed) revision++;
    emit(type, payload, origin === 'system' ? active || { origin } : { origin });
  };
  const execute = (command, context = {}) => {
    const validContext = context && typeof context === 'object' && !Array.isArray(context);
    if (!validContext) context = {};
    const operation = { id: typeof context.operationId === 'string' && context.operationId ? context.operationId : `viewer-${++sequence}`, origin: typeof context.origin === 'string' && context.origin ? context.origin : 'api', changed: false, events: [] };
    let args;
    const approvedRevision = revision;
    const flushChanges = () => {
      if (operation.changed) { revision++; operation.changed = false; }
      // Keep the lane occupied while publishing changes; subscriber edits must
      // not interleave revisions within one operation. 中文：变更发布时禁止重入。
      try { for (const event of operation.events.splice(0)) emit(event.type, event.payload, operation); }
      finally { if (active === operation) active = null; }
    };
    const failed = (error, status = context.signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed') => {
      flushChanges();
      if (pending === operation) pending = null;
      const result = { status, operationId: operation.id, revision, error: errorValue(error) };
      lastAction = { ...result, type: typeof command?.type === 'string' ? command.type : undefined, origin: operation.origin };
      emit(`operation.${status}`, lastAction, operation); return result;
    };
    const validate = () => {
      check();
      requireValue(validContext, 'invalid_context', 'Operation context must be an object');
      for (const key of ['origin', 'operationId']) requireValue(context[key] == null || (typeof context[key] === 'string' && Boolean(context[key])), 'invalid_context', `${key} must be a nonempty string`);
      requireValue(context.expectedRevision == null || (Number.isSafeInteger(context.expectedRevision) && context.expectedRevision >= 0), 'invalid_context', 'expectedRevision must be a nonnegative integer');
      requireValue(context.signal == null || ['throwIfAborted', 'addEventListener', 'removeEventListener'].every(key => typeof context.signal[key] === 'function'), 'invalid_context', 'signal must implement AbortSignal');
      context.signal?.throwIfAborted();
      requireValue(context.expectedRevision == null || context.expectedRevision === revision, 'revision_conflict', `Expected revision ${context.expectedRevision}, current revision ${revision}`);
    };
    const perform = decision => {
      try {
        validate();
        requireValue(!closed && (!pending || approvedRevision === revision), 'revision_conflict', 'State changed while host approval was pending');
        requireValue(decision !== false, 'permission_denied', 'Host rejected this operation');
        if (pending === operation) pending = null;
        requireValue(!active && !pending, 'operation_busy', 'Another viewer operation is pending');
        active = operation;
        emit('operation.started', { type: command.type }, operation);
        const complete = value => {
          flushChanges();
          const result = { status: 'succeeded', operationId: operation.id, revision, value: copy(value) };
          lastAction = { status: result.status, operationId: operation.id, revision, type: command.type, origin: operation.origin };
          emit('operation.succeeded', lastAction, operation); return result;
        };
        const value = commands.execute(command.type, args, context);
        return value && typeof value.then === 'function' ? Promise.resolve(value).then(complete).catch(error => failed(error)) : complete(value);
      } catch (error) { return failed(error, context.signal?.aborted ? 'cancelled' : 'failed'); }
    };
    try {
      validate();
      requireValue(command && typeof command === 'object' && !Array.isArray(command) && typeof command.type === 'string', 'invalid_command', 'Command requires a type');
      requireValue(commands.names.includes(command.type), 'unknown_command', `Unknown viewer command ${command.type}`);
      requireValue(!active && !pending, 'operation_busy', 'Another viewer operation is pending');
      const { type, ...parameters } = command; args = copy(parameters);
      const issue = !contractOverrides[type] && contractIssue(profile, 'command', type, args);
      if (issue) {
        const descriptor = descriptors.get(type);
        throw new ViewerError('invalid_argument', `Invalid ${type} argument at ${issue.path || '/'}: ${issue.message}`, { command: type, issue, allowedFields: Object.keys(descriptor.parameters.properties || {}), requiredFields: descriptor.parameters.required || [], examples: descriptor.examples, parameters: descriptor.parameters });
      }
      pending = operation;
      const decision = policy?.(copy(command), { ...context, revision });
      if (decision && typeof decision.then === 'function') {
        pending = operation;
        return new Promise(resolve => {
          let settled = false;
          const finish = callback => value => {
            if (settled) return; settled = true;
            context.signal?.removeEventListener('abort', abort); resolve(callback(value));
          };
          const abort = () => finish(error => failed(error, 'cancelled'))(context.signal?.reason || new ViewerError('cancelled', 'Operation cancelled'));
          operation.cancelApproval = abort;
          context.signal?.addEventListener('abort', abort, { once: true });
          decision.then(finish(perform), finish(error => failed(error)));
          if (context.signal?.aborted) abort();
        });
      }
      return perform(decision);
    } catch (error) { return failed(error, context.signal?.aborted ? 'cancelled' : 'failed'); }
  };
  const unwrap = result => {
    if (result.status !== 'succeeded') throw new ViewerError(result.error.code, result.error?.message, result.error?.details);
    return result.value;
  };
  return Object.freeze({
    apiVersion: VIEWER_API_VERSION, execute, notify,
    getState() { check(); return { ...copy(readState()), revision, lastAction: copy(lastAction) }; },
    ...(readWorkspace ? { getWorkspace() { check(); return { ...copy(readWorkspace()), revision }; } } : {}),
    ...(readUtilityCatalogue ? { getUtilityCatalogue(query, context) { check(); return readUtilityCatalogue(query, context); } } : {}),
    getContract() { check(); return describeViewerContract({ apiVersion: VIEWER_API_VERSION, profile, names: commands.names, queries: [...queries, ...(readWorkspace ? ['getWorkspace'] : []), ...(readUtilityCatalogue ? ['getUtilityCatalogue'] : [])], overrides: contractOverrides }); },
    getCapabilities() { check(); return { ...copy(readCapabilities()), commands: [...commands.names] }; },
    on(type, listener) {
      check(); requireValue(typeof type === 'string' && Boolean(type), 'invalid_argument', 'Event topic must be a nonempty string'); requireValue(typeof listener === 'function', 'invalid_listener', 'Event listener must be a function');
      if (!subscribers.has(type)) subscribers.set(type, new Set()); subscribers.get(type).add(listener);
      return () => subscribers.get(type)?.delete(listener);
    },
    // Transitional host adapter: existing synchronous UI/AI calls still execute
    // the same operation path; async callers should await viewer.execute().
    // 迁移期同步入口不复制命令规则，已有界面与助手也经过同一核心。
    commands: Object.freeze({ names: commands.names, execute(type, args = {}, context = { origin: 'ui' }) {
      const result = execute({ ...args, type }, { origin: 'ui', ...context });
      return result && typeof result.then === 'function' ? result.then(unwrap) : unwrap(result);
    } }),
    dispose() { if (closed) return; closed = true; pending?.cancelApproval?.(); emit('lifecycle.disposed', {}); subscribers.clear(); },
  });
}
