const panelValues = ['demo', 'analysis', 'utility', 'collab'];

const objectSchema = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

// WebMCP is progressive enhancement: unsupported browsers keep the exact same
// UI, while capable agents receive a small, state-aware set of safe actions.
export function registerCsboardTools(api) {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) return () => {};

  const controller = new AbortController();
  const register = (tool) => modelContext.registerTool(tool, { signal: controller.signal }).catch((error) => {
    if (error.name !== 'AbortError') console.warn(`WebMCP tool ${tool.name} was not registered.`, error);
  });
  const mapValues = api.maps.map((map) => map.id);

  register({
    name: 'get_workspace_context',
    description: 'Read the current CSBoard map, workspace panel, Demo playback, Analysis selection, and model status.',
    inputSchema: objectSchema({}),
    execute: () => api.getContext(),
    annotations: { readOnlyHint: true },
  });
  register({
    name: 'get_analysis_context',
    description: 'Read the active CSBoard Analysis filters, data availability, field semantics, and starter prompts before requesting filtered records.',
    inputSchema: objectSchema({}),
    execute: () => api.getAnalysisContext(),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  });
  register({
    name: 'get_filtered_analysis_data',
    description: 'Return one page of JSON records after applying the Analysis panel player, Demo, side, economy, phase, utility, and event-location filters.',
    inputSchema: objectSchema({
      dataset: { type: 'string', enum: ['current', 'kd', 'area', 'utility'], description: 'Use current for the analysis type selected in the UI.' },
      offset: { type: 'integer', minimum: 0, description: 'Pagination offset, initially 0.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Records per page; defaults to 100.' },
      includeTrajectories: { type: 'boolean', description: 'Include utility projectile samples; false by default to keep model context compact.' },
    }),
    execute: (request) => api.getFilteredAnalysisData(request),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  });
  register({
    name: 'select_map',
    description: 'Switch CSBoard to one of its supported CS2 maps.',
    inputSchema: objectSchema({ map: { type: 'string', enum: mapValues, description: 'Exact CSBoard map identifier.' } }, ['map']),
    execute: ({ map }) => api.selectMap(map),
  });
  register({
    name: 'select_workspace_panel',
    description: 'Open the Demo, Analysis, Utility Notes, or Collaboration workspace panel. Leaving an active collaboration room is refused.',
    inputSchema: objectSchema({ panel: { type: 'string', enum: panelValues } }, ['panel']),
    execute: ({ panel }) => api.selectPanel(panel),
  });
  register({
    name: 'select_demo_round',
    description: 'Select a round from the currently opened parsed Demo.',
    inputSchema: objectSchema({ round: { type: 'integer', minimum: 1 } }, ['round']),
    execute: ({ round }) => api.selectDemoRound(round),
  });
  register({
    name: 'seek_demo_tick',
    description: 'Pause and seek the currently selected Demo round to an absolute Demo tick.',
    inputSchema: objectSchema({ tick: { type: 'number', minimum: 0 } }, ['tick']),
    execute: ({ tick }) => api.seekDemoTick(tick),
  });
  register({
    name: 'reset_camera',
    description: 'Reset the 3D board camera to the default view for the current map.',
    inputSchema: objectSchema({}),
    execute: () => api.resetCamera(),
  });

  return () => controller.abort();
}
