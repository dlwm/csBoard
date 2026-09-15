import { isDesktopRuntime } from '../app/runtime.js';

const panelValues = ['demo', 'analysis', 'utility', 'collab'];

const objectSchema = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

// AI tools are desktop-only, even when a normal browser supports WebMCP.
export function registerCsboardTools(api) {
  if (!isDesktopRuntime()) return () => {};
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
    name: 'get_round_analysis',
    description: 'Analyze one exact selected Demo round using both teams: context/prompts, all-player positioning timeline, combat/bomb events and utility. Supports evidence-based hypotheses about intent, CT rotations, fakes and reads; does not claim player knowledge or intent as fact. Read get_analysis_context for available Demo IDs and rounds. Does not change playback or filters.',
    inputSchema: objectSchema({
      demoId: { type: 'string', description: 'Exact selected Demo ID from get_analysis_context.roundAnalysis.availableDemos.' },
      round: { type: 'integer', minimum: 1 },
      dataset: { type: 'string', enum: ['context', 'timeline', 'events', 'utility'], description: 'Read context first, then paginate each other dataset.' },
      startSeconds: { type: 'number', minimum: -600, maximum: 3600, description: 'Optional window start relative to freeze end; negative means freeze time.' },
      endSeconds: { type: 'number', minimum: -600, maximum: 3600 },
      sampleSeconds: { type: 'number', minimum: 0.25, maximum: 5, description: 'Timeline sampling interval; default 1 second. Cannot exceed source temporal resolution.' },
      includeTrajectories: { type: 'boolean', description: 'Utility only; optionally include at most 65 trajectory samples per throw.' },
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 50. Keep small for timeline pages containing all players.' },
    }, ['demoId', 'round']),
    execute: request => api.getRoundAnalysis(request),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  });
  register({
    name: 'capture_3d_view',
    description: 'Capture only the current CSBoard 3D viewport for a vision-capable model. Returns an MCP-style base64 image plus optional map, Demo, Analysis, and camera context.',
    inputSchema: objectSchema({
      width: { type: 'integer', minimum: 320, maximum: 1600, description: 'Output width in pixels; defaults to 960.' },
      height: { type: 'integer', minimum: 180, maximum: 1200, description: 'Output height in pixels; omit to preserve the current viewport aspect ratio.' },
      format: { type: 'string', enum: ['webp', 'jpeg', 'png'], description: 'Output image format; defaults to compact WebP.' },
      quality: { type: 'number', minimum: 0.35, maximum: 1, description: 'WebP/JPEG encoding quality; defaults to 0.82 and is ignored for PNG.' },
      fit: { type: 'string', enum: ['contain', 'cover', 'stretch'], description: 'How the current viewport fits an explicitly sized image; defaults to contain.' },
      includeContext: { type: 'boolean', description: 'Include map, panel, playback, Analysis filters, and camera metadata; defaults to true.' },
    }),
    execute: (request) => api.capture3DView(request),
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
