import { ViewerError } from './controller.js';
// Provider-neutral tool descriptions. The provider maps inputSchema into its
// own function format; every edit still traverses viewer.execute and policy.
export function createViewerToolAdapter(viewer, { origin = 'ai', maxResponseBytes = 256 * 1024 } = {}) {
  if (['execute', 'getState', 'getCapabilities', 'getContract'].some(key => typeof viewer?.[key] !== 'function')) throw new TypeError('Public viewer interface is required');
  if (!Number.isFinite(maxResponseBytes) || maxResponseBytes < 1024) throw new TypeError('Tool response budget must be at least 1024 bytes');
  const bound = value => { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxResponseBytes) throw new ViewerError('response_too_large', 'Request fewer state sections or a narrower host projection'); return value; };
  return Object.freeze({
    listTools() {
      const contract = viewer.getContract();
      return [...(contract.commands.length ? [{ name: 'viewer_execute', description: 'Execute a supported viewer command. Use the observed revision for edits; scene positions are metres. Host policy remains authoritative.', inputSchema: { type: 'object', properties: { command: { oneOf: contract.commands.map(command => ({ ...command.parameters, properties: { type: { const: command.name }, ...command.parameters.properties }, required: ['type', ...(command.parameters.required || [])] })) }, expectedRevision: { type: 'integer', minimum: 0 } }, required: ['command'], additionalProperties: false } }] : []),
        { name: 'viewer_get_state', description: 'Read compact current context, or explicitly request sections such as workspace. Unknown sections are rejected.', inputSchema: { type: 'object', properties: { sections: { type: 'array', items: { type: 'string' }, maxItems: 16, uniqueItems: true } }, additionalProperties: false } },
        ...(typeof viewer.getUtilityCatalogue === 'function' ? [{ name: 'viewer_get_utilities', description: 'Read a paginated catalogue of host utility references on this map. Does not return full replay or voxel payloads.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 200 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } }] : []),
        ...(typeof viewer.getWorkspace === 'function' ? [{ name: 'viewer_get_workspace', description: 'Read the neutral editable player layout, utility references and illustrative effects. Scene metres; this is not a host archive or replay track.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] : []),
        ...(typeof viewer.getModelObjects === 'function' ? [{ name: 'viewer_get_model_objects', description: 'Read model-node IDs and visibility signature before changing visibility.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, additionalProperties: false } }] : []),
        ...(typeof viewer.getModelObjectTree === 'function' ? [{ name: 'viewer_get_model_object_tree', description: 'Read the model tree, optionally filtered by object name.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false } }] : []),
        ...['capabilities', 'contract'].map(name => ({ name: `viewer_get_${name}`, description: `Read the current viewer ${name}.`, inputSchema: { type: 'object', properties: {}, additionalProperties: false } }))];
    },
    async invoke(name, args = {}, context = {}) {
      try {
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ViewerError('invalid_argument', 'Tool arguments must be an object');
        if (name === 'viewer_execute') {
          if (Object.keys(args).some(key => !['command', 'expectedRevision'].includes(key)) || (args.expectedRevision != null && (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 0))) throw new ViewerError('invalid_argument', 'Invalid execute arguments');
          const result = await viewer.execute(args.command, { ...context, origin, ...(args.expectedRevision != null ? { expectedRevision: args.expectedRevision } : {}) });
          // Never report an applied edit as failed merely because its value is large.
          const summary = () => ({ status: result.status, operationId: result.operationId, revision: result.revision, valueOmitted: true, ...(result.error ? { error: { code: result.error.code, message: 'Operation returned oversized or non-JSON details' } } : {}) });
          try { if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxResponseBytes) return summary(); }
          catch { return summary(); }
          return result;
        }
        if (name === 'viewer_get_state') {
          if (Object.keys(args).some(key => key !== 'sections') || (args.sections != null && (!Array.isArray(args.sections) || args.sections.length > 16 || args.sections.some(key => typeof key !== 'string')))) throw new ViewerError('invalid_argument', 'Invalid state sections');
          const state = viewer.getState(), sections = args.sections || ['revision', 'ready', 'mapName', 'selectedId', 'coordinates', 'camera', 'playback', 'voice', 'lastAction'];
          if (args.sections?.some(key => !Object.hasOwn(state, key))) throw new ViewerError('unknown_section', 'Requested state section is not available');
          return bound(Object.fromEntries(['revision', ...sections].filter((key, index, all) => Object.hasOwn(state, key) && all.indexOf(key) === index).map(key => [key, state[key]])));
        }
        if (name === 'viewer_get_utilities' && typeof viewer.getUtilityCatalogue === 'function') return bound(await viewer.getUtilityCatalogue(args, { signal: context.signal }));
        if (name === 'viewer_get_model_objects' && typeof viewer.getModelObjects === 'function') {
          if (Object.keys(args).some(key => !['query', 'offset', 'limit'].includes(key))) throw new ViewerError('invalid_argument', 'Unknown model query field');
          return bound(viewer.getModelObjects(args));
        }
        if (name === 'viewer_get_model_object_tree' && typeof viewer.getModelObjectTree === 'function') {
          if (Object.keys(args).some(key => key !== 'query') || (args.query != null && typeof args.query !== 'string')) throw new ViewerError('invalid_argument', 'Invalid model tree query');
          return bound(viewer.getModelObjectTree(args.query));
        }
        if (Object.keys(args).length) throw new ViewerError('invalid_argument', 'This query takes no arguments');
        if (name === 'viewer_get_workspace' && typeof viewer.getWorkspace === 'function') return bound(viewer.getWorkspace());
        if (name === 'viewer_get_capabilities') return bound(viewer.getCapabilities());
        if (name === 'viewer_get_contract') return bound(viewer.getContract());
        throw new ViewerError('unknown_tool', 'Unknown viewer tool');
      } catch (error) { return { status: 'failed', error: { code: error.code || 'tool_failed', message: error.message || String(error) } }; }
    },
  });
}
