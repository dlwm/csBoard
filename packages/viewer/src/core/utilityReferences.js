import { ViewerError } from './controller.js';
// Source owns asset retrieval; renderer copies what it needs synchronously.
// 来源租约只借用到放置完成，渲染器拥有创建的资源；核心不识别录像字段。
const requireValue = (value, code, message) => { if (!value) throw new ViewerError(code, message); };
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const text = value => typeof value === 'string' && value.trim().length > 0;
export function createUtilityReferenceController({ source, renderer, mapName, isEditable, readGuard = () => 0, notify = () => {}, commit = action => action(), onReleaseError = () => {} }) {
  requireValue(source && ['list', 'load'].every(k => typeof source[k] === 'function') && renderer && ['place', 'move', 'remove', 'getPlacements'].every(k => typeof renderer[k] === 'function'), 'invalid_ports', 'Utility source and synchronous placement renderer are required');
  let closed = false, sequence = 0;
  const pending = new Set();
  const check = () => requireValue(!closed, 'disposed', 'Utility reference controller is disposed');
  const editable = () => { check(); requireValue(isEditable(), 'editing_unavailable', 'Utility editing is unavailable'); };
  const run = async (signal, action) => {
    check(); const abort = new AbortController(), cancel = () => abort.abort(signal.reason);
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    pending.add(abort);
    try { abort.signal.throwIfAborted(); return await action(abort.signal); }
    finally { pending.delete(abort); signal?.removeEventListener('abort', cancel); }
  };
  const synchronous = result => { requireValue(!result || typeof result.then !== 'function', 'invalid_driver', 'Placement renderer must commit synchronously'); return result; };
  const placements = () => structuredClone(renderer.getPlacements());
  const publish = (action, id) => notify('utility.placementsChanged', { action, id, placements: placements() }, { changed: true });
  return Object.freeze({
    list(query = {}, { signal } = {}) {
      requireValue(query && typeof query === 'object' && !Array.isArray(query) && !Object.keys(query).some(k => !['query', 'offset', 'limit'].includes(k)), 'invalid_query', 'Utility catalogue accepts query/offset/limit');
      const { query: search = '', offset = 0, limit = 20 } = query;
      requireValue(typeof search === 'string' && search.length <= 200 && Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 100, 'invalid_query', 'Utility catalogue requires text, offset>=0 and limit 1–100');
      return run(signal, async signal => {
        const result = await source.list({ query: search, offset, limit, mapName }, { signal });
        signal.throwIfAborted(); check();
        requireValue(result && Number.isInteger(result.total) && result.total >= 0 && Array.isArray(result.items) && result.items.length <= limit && result.items.every(item => text(item.referenceId) && item.mapName === mapName), 'invalid_catalogue', 'Source returned an invalid or cross-map catalogue');
        // Whitelist metadata; never return the asset payload to an agent.
        return { total: result.total, offset, items: result.items.map(item => ({ referenceId: item.referenceId, mapName: item.mapName, name: String(item.name || item.referenceId), kind: String(item.kind || 'unknown') })) };
      });
    },
    async place(args, { signal } = {}) {
      editable(); requireValue(args && typeof args === 'object' && !Object.keys(args).some(k => !['referenceId', 'id', 'position'].includes(k)) && text(args.referenceId) && (!Object.hasOwn(args, 'id') || text(args.id)) && (!Object.hasOwn(args, 'position') || vector(args.position)), 'invalid_argument', 'Place requires referenceId, optional ID and finite scene XYZ metres');
      const referenceId = args.referenceId, requestedPosition = args.position ? [...args.position] : null;
      const id = args.id || `utility-${Date.now()}-${++sequence}`, guard = readGuard();
      requireValue(!placements().some(p => p.id === id), 'duplicate_id', 'Utility placement ID already exists');
      return run(signal, async signal => {
        let lease;
        try {
          lease = await source.load(referenceId, { signal, mapName });
          requireValue(lease && typeof lease.release === 'function', 'invalid_asset', 'Source must return an asset lease');
          signal.throwIfAborted(); check();
          const asset = lease.asset;
          requireValue(asset && asset.referenceId === referenceId && asset.mapName === mapName && vector(asset.position), 'invalid_asset', 'Asset must match reference/map and provide scene XYZ metres');
          signal.throwIfAborted(); check(); editable();
          requireValue(readGuard() === guard, 'workspace_changed', 'Workspace changed during utility loading; reread before placing');
          requireValue(!placements().some(p => p.id === id), 'duplicate_id', 'Utility placement ID already exists');
          return synchronous(commit(() => { synchronous(renderer.place({ id, asset, position: [...(requestedPosition || asset.position)] })); publish('placed', id); return { id }; }));
        } finally { if (typeof lease?.release === 'function') { try { lease.release(); } catch (error) { try { onReleaseError(error); } catch {} } } }
      });
    },
    move({ id, position, ...extra }) {
      editable(); requireValue(!Object.keys(extra).length && text(id) && vector(position), 'invalid_argument', 'Move requires ID and finite scene XYZ metres');
      requireValue(placements().some(p => p.id === id), 'not_found', 'Utility placement was not found');
      return synchronous(commit(() => { synchronous(renderer.move({ id, position: [...position] })); publish('moved', id); return { id }; }));
    },
    remove({ id, ...extra }) {
      editable(); requireValue(!Object.keys(extra).length && text(id), 'invalid_argument', 'Remove requires a placement ID');
      requireValue(placements().some(p => p.id === id), 'not_found', 'Utility placement was not found');
      return synchronous(commit(() => { synchronous(renderer.remove(id)); publish('removed', id); return { id }; }));
    },
    getPlacements() { check(); return placements(); },
    dispose() { if (closed) return; closed = true; for (const controller of pending) controller.abort(); pending.clear(); },
  });
}
