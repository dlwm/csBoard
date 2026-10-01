import { findNavPath, listNavAreas } from '../data/navQueries.js';
import { spatialObservation } from './spatialObservation.js';
import { createMapLocations } from '../data/mapLocations.js';

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1, maxLength: 120 };
const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const location = object({ areaId: { type: 'integer' }, position: vector });
const player = object({ name: string, team: { type: 'string', enum: ['T', 'CT'] }, position: vector, areaId: { type: 'integer' }, location: { ...location, description: 'Legacy placement shape; prefer flat position or areaId. Do not combine them.' }, yaw: { type: 'number', minimum: -360, maximum: 360 }, pitch: { type: 'number', minimum: -89, maximum: 89 }, crouched: { type: 'boolean' }, weapon: string });
const operation = object({
  kind: { type: 'string', enum: ['add_player', 'update_player', 'delete_player', 'add_effect', 'update_effect', 'delete_effect', 'add_line', 'delete_line', 'delete_utility'] },
  id: { ...string, description: 'Existing object ID for update/delete; not required when adding' }, player, location, effect: { type: 'string', enum: ['smoke', 'fire', 'flash', 'explosion', 'decoy'] }, range: { type: 'number', minimum: 0.35, maximum: 10 },
  points: { type: 'array', items: location, minItems: 2, maxItems: 64 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, width: { type: 'number', minimum: 0.5, maximum: 12 },
}, ['kind']);
const definitions = [
  ['inspect_board_view', 'Inspect a read-only board view: current camera, top view, or oblique focus view around a known location/player. Focus accepts azimuth (Source XY degrees, 0 = +X) and elevation (degrees above ground); defaults 45 and 55. Building models are excluded; screenshots show NAV ground and board entities. Returns numbered markers with Source coordinates, screen pixels, floor filtering and imported geometry occlusion. Vision-enabled sessions also attach a JPEG; text-only sessions get structured projections. Does not move the user camera. Use resolve_view_point for pixel placement, never guess Source coordinates from an image. At most three views per turn.', object({ view: { type: 'string', enum: ['current', 'top', 'focus'] }, playerId: string, location, radius: { type: 'number', minimum: 128, maximum: 2048 }, azimuth: { type: 'number', minimum: -360, maximum: 360 }, elevation: { type: 'number', minimum: 15, maximum: 85 } })],
  ['resolve_view_point', 'Resolve a pixel from a recent inspect_board_view to NAV triangle intersections. Requires unchanged frame revision. Multiple floors may overlap; inspect all candidates and select explicit Z. Returns Source positions for edits; areaId placement instead uses the NAV polygon center. Does not prove visibility or gameplay reachability.', object({ viewId: string, pixel: { type: 'array', items: { type: 'number', minimum: 0 }, minItems: 2, maxItems: 2 }, floor: { type: 'string', enum: ['main', 'lower', 'all'] } }, ['viewId', 'pixel'])],
  ['inspect_spatial_context', 'Read local 3D NAV geometry without image input: explicit height ranges, nearby polygon bounds, raw directed connections and their height differences, plus relative player/utility positions. Specify a known location or existing player. Distances use Source game units; no pathfinding or cover validation.', object({ playerId: string, location, radius: { type: 'number', minimum: 128, maximum: 2048 }, limit: { type: 'integer', minimum: 1, maximum: 24 } })],
  ['get_board_state', 'Read map, current frame, revision, players, effects and annotations. Positions use Source game units [X,Y,Z]; angles use degrees. Read before editing.', object()],
  ['get_map_context', 'Read offline map references and coordinate conventions. Overview labels are approximate XY, not region boundaries. Inspect height alternatives. Grid cells are omitted unless includeGrid is true; grid names are not callouts. Use list_map_places for the complete paged name catalog.', object({ includeGrid: { type: 'boolean' } })],
  ['list_map_places', 'List indexed place names, aliases, reference IDs and floors without NAV geometry. Read once before name lookups; paginate using nextOffset. This is not a complete callout map. Missing names must not trigger repeated synonym probes or guessed coordinates.', object({ offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 80 } })],
  ['find_map_locations', 'Find NAV positions by indexed name, locationId (including grid:main:C4), single areaId, or near a known Source position. Choose only one of query/locationId/areaId. Near returns sorted 3D and XY distances. Default limit 8; grid lists are opt-in via includeGrid. Unknown names return empty matches and available names: stop probing synonyms. At most 6 searches per conversation turn.', object({ query: { type: 'string', maxLength: 120 }, locationId: string, floor: { type: 'string', enum: ['main', 'lower'] }, areaId: { type: 'integer' }, near: vector, limit: { type: 'integer', minimum: 1, maximum: 30 }, includeGrid: { type: 'boolean' } })],
  ['list_nav_areas', 'List NAV polygons whose bounds overlap a Source XYZ bounding box, with vertices, heights and directed neighbors. Page with nextOffset. This is geometric overlap, not cover or validated reachable space.', object({ bounds: object({ min: vector, max: vector }, ['min', 'max']), offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 24 } }, ['bounds'])],
  ['find_nav_path', 'Read a directed NAV adjacency path between two known area IDs in one query. Returns area sequence and polygon geometry. Fewest polygon hops, not shortest walk distance; crouch/jump/ladders, timings and dynamic obstructions are not validated.', object({ fromAreaId: { type: 'integer' }, toAreaId: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 64 } }, ['fromAreaId', 'toAreaId'])],
  ['get_action_history', 'Read assistant tool and session outcomes from this local application session, including cancelled, failed and interrupted requests. Not a shared room log and not persisted across reloads. Read this when asked why execution stopped; do not infer the reason from revision or undo flags.', object({ limit: { type: 'integer', minimum: 1, maximum: 32 } })],
  ['apply_tactical_changes', 'Apply up to 32 player/effect/line edits atomically as one undo step. Use NAV area IDs from find_map_locations. New IDs are returned. Existing IDs must come from board state. Player position is flat player.position (Source XYZ), or player.areaId; do not copy read-only id/mapLocation into player. Effect positions use change.location. Deletions require user confirmation; no clearing required.', object({ expectedRevision: string, changes: { type: 'array', items: operation, minItems: 1, maxItems: 32 } }, ['expectedRevision', 'changes'])],
  ['search_utilities', 'Search current-map saved throws by short keywords in name, description, kind or place. Returns context for semantic matching. Use an empty query and offset to browse all candidates. Recorded throws retain their original positions and trajectories.', object({ query: { type: 'string', maxLength: 120 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 40 } })],
  ['get_utility_details', 'Read one current-map saved throw: recorded start and release positions, observed effect event and flight interval. Missing facts are null, not inferred from a title or the last trajectory sample. Does not validate coverage, flash hits or planned synchronization.', object({ noteId: string }, ['noteId'])],
  ['import_utility', 'Import a matching saved throw into the explicit active frame at its recorded position. Switch to the target frame and reread state first.', object({ noteId: string, frameId: string, expectedRevision: string }, ['noteId', 'frameId', 'expectedRevision'])],
  ['manage_frames', 'Create appends a completely empty frame and activates it. Duplicate copies all current-frame players, effects, saved throws/replay data and brush lines, inserts after the current frame and activates it. Switch selects frameId. Delete affects the active frame only, requires confirmation and cannot remove the last frame. frameId for duplicate/delete must equal the active frame. There is no separate default/initial-frame setting; the active frame is saved with the archive.', object({ action: { type: 'string', enum: ['create', 'duplicate', 'switch', 'delete'] }, frameId: string, expectedRevision: string }, ['action', 'expectedRevision'])],
  ['control_camera', 'Focus a player/utility, end preview, or save/restore a camera slot (0–9).', object({ action: { type: 'string', enum: ['focus_player', 'focus_utility', 'end_preview', 'save_slot', 'restore_slot'] }, id: string, slot: { type: 'integer', minimum: 0, maximum: 9 } }, ['action'])],
  ['edit_history', 'Undo or redo the most recent edit; confirmation required because it can include manual changes.', object({ action: { type: 'string', enum: ['undo', 'redo'] }, expectedRevision: string }, ['action', 'expectedRevision'])],
  ['clear_board', 'Clear editable content in the active frame. Always requires user confirmation.', object({ expectedRevision: string }, ['expectedRevision'])],
  ['list_archives', 'List saved tactical archives; does not load their complete payloads.', object()],
  ['manage_archive_folders', 'List, create, move or delete folders, or assign an archive to a folder. Deleting a folder moves its contents to the parent, never deletes archives.', object({ action: { type: 'string', enum: ['list', 'create', 'delete', 'move', 'assign'] }, name: string, folderId: string, parentId: string, archiveId: string }, ['action'])],
  ['request_room_action', 'Open, join or leave a collaboration room after user confirmation. Joining/leaving changes the tactical context and ends the current planning turn.', object({ action: { type: 'string', enum: ['open', 'join', 'leave'] }, code: { type: 'string', pattern: '^[0-9a-fA-F]{6}$', maxLength: 6 } }, ['action'])],
  ['request_archive_action', 'Open the existing save/new/overwrite/delete or restore flow. Save waits for the user to finish the dialog; restore requires confirmation. Guests cannot restore over a shared room.', object({ action: { type: 'string', enum: ['save', 'new', 'overwrite', 'delete', 'restore'] }, archiveId: string }, ['action'])],
];
export const tacticalToolDefinitions = definitions.map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }));

function validate(value, schema, path = 'arguments') {
  const fail = reason => { throw Object.assign(new Error(`${path}: ${reason}`), { code: 'invalid_arguments', path, ...(schema.properties ? { acceptedFields: Object.keys(schema.properties) } : {}) }); }; 
  if (schema.enum && !schema.enum.includes(value)) fail(`expected one of ${schema.enum.join(', ')}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) fail(`unknown field '${key}'; accepted fields: ${Object.keys(schema.properties).join(', ')}`);
      validate(value[key], schema.properties[key], `${path}.${key}`);
    }
    for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`required field '${key}'; accepted fields: ${Object.keys(schema.properties).join(', ')}`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail(`expected array of ${schema.minItems ?? 0}–${schema.maxItems ?? 'unlimited'} items`);
    value.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`));
  }
  if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > schema.maxLength || (schema.pattern && !new RegExp(schema.pattern).test(value)))) fail('invalid text');
  if (['number', 'integer'].includes(schema.type) && (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('invalid number');
  if (schema.type === 'boolean' && typeof value !== 'boolean') fail('expected boolean');
}
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const center = area => area.corners.reduce((result, point) => result.map((value, index) => value + [point.x, point.y, point.z][index] / area.corners.length), [0, 0, 0]);
const contextKey = context => JSON.stringify([context.mapName, context.frameId, context.roomCode, context.archiveId, context.enabled]);
export const tacticalContextKey = contextKey;

export function createTacticalTools(getPorts) {
  let revision = 0; let previous = '';
  const capturedViews = new Map();
  const actions = []; let lastAction = null; let lastFailure = null;
  const readOnlyNames = new Set(['read_app_documentation', 'get_board_state', 'get_map_context', 'list_map_places', 'find_map_locations', 'inspect_board_view', 'resolve_view_point', 'inspect_spatial_context', 'list_nav_areas', 'find_nav_path', 'search_utilities', 'get_utility_details', 'list_archives', 'get_action_history']);
  const recordAction = entry => {
    const actionId = entry.id || id('action');
    const existing = actions.findIndex(action => action.id === actionId);
    const action = { ...(existing >= 0 ? actions[existing] : {}), ...entry, id: actionId, timestamp: existing >= 0 ? actions[existing].timestamp : new Date().toISOString(), ...(entry.status !== 'running' ? { finishedAt: new Date().toISOString() } : {}), context: { ...getPorts().context() }, revision: String(revision), readOnly: readOnlyNames.has(entry.name) || entry.name === 'manage_archive_folders' && entry.readOnly === true };
    if (existing >= 0) actions[existing] = action; else actions.push(action);
    if (actions.length > 32) actions.shift();
    if (!action.readOnly && action.status !== 'running') lastAction = action;
    if (['error', 'cancelled', 'interrupted'].includes(action.status)) lastFailure = action;
  };

  const state = () => {
    const ports = getPorts(); const context = ports.context(); const board = ports.board();
    if (!context.enabled || !board?.ready || !board.applyTacticalSnapshot) throw new Error('Open an editable tactical frame first');
    board.finalizeFrameTween?.();
    const workspace = board.getWorkspaceState();
    const fingerprint = JSON.stringify([contextKey(context), workspace.points, workspace.grenades, workspace.collabUtilities, workspace.brushStrokes]);
    if (fingerprint !== previous) { previous = fingerprint; revision += 1; }
    return { ports, context, board, workspace, revision: String(revision) };
  };
  const check = (s, expected) => { if (expected !== s.revision) throw new Error('Board changed; read get_board_state and replan'); };
  const areas = s => Object.values(s.ports.nav()?.areas || {}).filter(area => area.corners?.length >= 3);
  let mapReferenceCache = null;
  const mapReferences = s => {
    const nav = s.ports.nav(); const notes = s.ports.notes();
    if (mapReferenceCache?.nav !== nav || mapReferenceCache?.notes !== notes || mapReferenceCache?.mapName !== s.context.mapName) {
      mapReferenceCache = { nav, notes, mapName: s.context.mapName, value: createMapLocations(nav, s.context.mapName, notes) };
    }
    return mapReferenceCache.value;
  };
  const resolve = (s, target) => {
    if (!target || Boolean(target.areaId != null) === Boolean(target.position)) throw new Error('Specify exactly one location: areaId or position');
    if (target.areaId != null) {
      const area = s.ports.nav()?.areas?.[target.areaId];
      if (!area?.corners?.length) throw new Error('Unknown NAV area');
      return s.board.gameToBoard(center(area));
    }
    // Project onto NAV triangles, never onto a bounding box or another floor.
    const [x, y, z] = target.position;
    let height = null; let distance = Infinity;
    for (const area of areas(s)) {
      for (let i = 1; i < area.corners.length - 1; i += 1) {
        const [a, b, c] = [area.corners[0], area.corners[i], area.corners[i + 1]];
        const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(d) < 1e-8) continue;
        const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d;
        const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
        if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
        const candidate = u * a.z + v * b.z + (1 - u - v) * c.z;
        if (Math.abs(candidate - z) < distance) { height = candidate; distance = Math.abs(candidate - z); }
      }
    }
    if (height == null || distance > 96) throw new Error('Position is outside walkable NAV or on the wrong floor');
    return s.board.gameToBoard([x, y, height]);
  };
  const summary = s => ({
    ...s.context, revision: s.revision, coordinateSystem: 'Source [X,Y,Z], game units; yaw/pitch in degrees',
    namedAnchorsAvailable: Boolean(mapReferences(s).overview().totalNamedAnchors), mapReferenceCoverage: mapReferences(s).overview().coverage, namedRegionBoundariesAvailable: false,
    lastAction,
    lastFailure,
    actionHistoryScope: 'local application session; not shared or persisted',
    frameSemantics: { create: 'empty appended frame', duplicate: 'complete active-frame copy inserted after source', selectionPersistence: 'archive activeFrameId', separateInitialFrameSupported: false },
    mapReferencesAvailable: true,
    canUndo: Boolean(s.board.canUndoCollab?.()), canRedo: Boolean(s.board.canRedoCollab?.()),
    cameraSlots: (s.workspace.cameraSlots || []).map((slot, index) => ({ index, saved: Boolean(slot) })),
    frames: s.ports.frames().map((frame, index) => {
      const workspace = frame.id === s.context.frameId ? s.workspace : frame.workspace;
      return { id: frame.id, number: index + 1, active: frame.id === s.context.frameId,
        playerCount: (workspace?.points || []).filter(p => p.kind === 'player').length,
        utilityCount: (workspace?.collabUtilities || []).length,
      };
    }),
    players: s.workspace.points.filter(p => p.kind === 'player').map(p => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, crouched: p.crouched, position: s.board.boardToGame(p.position), mapLocation: mapReferences(s).describe(s.board.boardToGame(p.position)), yaw: ((p.rotationY * 180 / Math.PI + 180) % 360 + 360) % 360, pitch: (p.pitch || 0) * 180 / Math.PI })),
    effects: s.workspace.grenades.map(item => ({ ...item, position: s.board.boardToGame(item.position) })),
    utilities: s.workspace.collabUtilities.map(item => ({ id: item.id, name: item.noteName, summary: item.noteSummary, kind: item.kind, noteId: item.noteId })),
    lines: s.workspace.brushStrokes.map(line => ({ ...line, points: line.points.map(p => s.board.boardToGame(p)) })),
    room: s.ports.room(),
  });
  const execute = async (name, input, { signal, allowImages = false, confirm = async () => false } = {}) => {
    const definition = tacticalToolDefinitions.find(tool => tool.function.name === name);
    if (!definition) throw new Error('Unknown tactical tool');
    try { validate(input, definition.function.parameters); } catch (error) {
      if (name === 'apply_tactical_changes') {
        const change = input?.changes?.[0]; const target = change?.player?.position || change?.player?.location?.position;
        error.example = { expectedRevision: input?.expectedRevision || '<current revision from get_board_state>', changes: [{ kind: 'update_player', id: change?.id || '<existing player ID>', player: { position: target || [0, 0, 0] } }] };
        error.exampleGuidance = target ? 'Uses your supplied Source position; object ID and revision must match current state.' : 'Replace the sample position with a known Source XYZ from a tool; do not execute example coordinates blindly.';
      }
      throw error;
    }
    signal?.throwIfAborted();
    if (name === 'get_action_history') return { scope: 'local application session; not shared or persisted', actions: actions.filter(action => action.name !== 'get_action_history').slice(-(input.limit || 10)) };
    let s = state();
    if (input.expectedRevision) check(s, input.expectedRevision);
    if (name === 'manage_frames') {
      if (input.action === 'create' && input.frameId) throw new Error('Create makes a new empty frame; omit frameId');
      if (['duplicate', 'delete'].includes(input.action) && input.frameId && input.frameId !== s.context.frameId) throw new Error('Duplicate/delete applies to the active frame. Switch to the target frame and reread revision first.');
    }
    const needsConfirm = name === 'clear_board' || name === 'edit_history' || name === 'request_room_action' || (name === 'apply_tactical_changes' && input.changes.some(change => change.kind.startsWith('delete_'))) || (name === 'manage_archive_folders' && input.action === 'delete') || (name === 'manage_frames' && input.action === 'delete') || (name === 'request_archive_action' && ['restore', 'delete'].includes(input.action));
    if (needsConfirm) {
      const key = contextKey(s.context); const version = s.revision;
      if (!await confirm(name, input)) return { cancelled: true, reason: 'User declined confirmation; operation was not executed.' };
      signal?.throwIfAborted(); s = state();
      if (contextKey(s.context) !== key) throw new Error('Tactical context changed');
      check(s, version);
    }
    if (['inspect_board_view', 'inspect_spatial_context'].includes(name)) {
      if (input.playerId && input.location) throw new Error('Choose one of playerId or location');
      const player = input.playerId ? s.workspace.points.find(point => point.kind === 'player' && point.id === input.playerId) : null;
      if (input.playerId && !player) throw new Error('Unknown player ID');
      const focus = player ? s.board.boardToGame(player.position) : input.location ? s.board.boardToGame(resolve(s, input.location)) : null;
      const entities = [
        ...s.workspace.points.filter(point => point.kind === 'player').map(point => ({ kind: 'player', id: point.id, name: point.name, team: point.team, position: s.board.boardToGame(point.position) })),
        ...s.workspace.grenades.map(item => ({ kind: 'effect', id: item.id, name: item.type || item.kind, position: s.board.boardToGame(item.position) })),
        ...s.workspace.collabUtilities.filter(item => Array.isArray(item.position)).map(item => ({ kind: 'utility', id: item.id, name: item.noteName, position: s.board.boardToGame(item.position) })),
      ];
      if (name === 'inspect_spatial_context') {
        if (!focus) throw new Error('Specify a known player or NAV location for local spatial inspection');
        return { mapName: s.context.mapName, frameId: s.context.frameId, revision: s.revision, ...spatialObservation({ nav: s.ports.nav(), references: mapReferences(s), position: focus, radius: input.radius, limit: input.limit, entities }) };
      }
      if (!s.board.observeBoardView) throw new Error('Board view inspection is unavailable');
      if ((input.azimuth != null || input.elevation != null) && input.view !== 'focus') throw new Error('Azimuth/elevation require view: focus and a known player or location');
      if (input.view === 'focus' && !focus) throw new Error('Focus view requires a known player or NAV location');
      const anchors = mapReferences(s).overview().namedAnchors.flatMap(anchor => anchor.candidates.slice(0, 2).map(candidate => ({ kind: 'map_reference', id: anchor.id, name: anchor.name, position: candidate.position, areaId: candidate.areaId, precision: anchor.precision })));
      const result = s.board.observeBoardView({ view: input.view, focus, radius: input.radius, azimuth: input.azimuth, elevation: input.elevation, markers: [...entities, ...anchors], includeImage: allowImages });
      capturedViews.set(result.viewId, { revision: s.revision, context: contextKey(s.context) });
      if (capturedViews.size > 3) capturedViews.delete(capturedViews.keys().next().value);
      return { mapName: s.context.mapName, frameId: s.context.frameId, revision: s.revision, ...result };
    }
    if (name === 'resolve_view_point') {
      const saved = capturedViews.get(input.viewId);
      if (!saved || saved.context !== contextKey(s.context) || saved.revision !== s.revision) throw new Error('View expired or board changed; inspect_board_view again');
      if (!s.board.resolveBoardViewPoint) throw new Error('View point resolution is unavailable');
      return { revision: s.revision, ...s.board.resolveBoardViewPoint(input) };
    }
    if (name === 'list_nav_areas') return listNavAreas(s.ports.nav(), input);
    if (name === 'find_nav_path') return findNavPath(s.ports.nav(), input);
    if (name === 'get_board_state') return summary(s);
    if (name === 'get_map_context') return mapReferences(s).overview(input);
    if (name === 'list_map_places') return mapReferences(s).listPlaces(input);
    if (name === 'find_map_locations') {
      if ([Boolean(input.query?.trim()), Boolean(input.locationId), input.areaId != null].filter(Boolean).length > 1) throw new Error('Choose one of query, locationId or areaId');
      return mapReferences(s).search(input);
    }
    if (name === 'apply_tactical_changes') {
      const next = { points: s.workspace.points.filter(p => p.kind === 'player').map(p => ({ ...p })), grenades: s.workspace.grenades.map(g => ({ ...g })), brushStrokes: s.workspace.brushStrokes.map(b => ({ ...b })), collabUtilities: [...s.workspace.collabUtilities] };
      const created = [];
      const remove = (list, targetId) => { const index = list.findIndex(item => item.id === targetId); if (index < 0) throw new Error('Unknown object ID'); list.splice(index, 1); };
      for (const change of input.changes) {
        if (change.kind === 'add_player' || change.kind === 'update_player') {
          if (change.location) throw Object.assign(new Error('Player placement belongs to player.position or player.areaId; change.location is used only for effects'), { code: 'invalid_arguments', acceptedFields: ['player.position', 'player.areaId', 'player.location (legacy)'], example: { kind: change.kind, ...(change.id ? { id: change.id } : {}), player: { ...change.player, ...(change.location.position ? { position: change.location.position } : { areaId: change.location.areaId }) } } });
          const update = change.player;
          const placement = update?.location || (update?.position ? { position: update.position } : update?.areaId != null ? { areaId: update.areaId } : null);
          if (update && [Boolean(update.location), Boolean(update.position), update.areaId != null].filter(Boolean).length > 1) throw new Error('Player placement: choose exactly one of position, areaId or legacy location');
          if (!update || (change.kind === 'add_player' && (!update.name || !update.team || !placement))) throw new Error('Add player requires name, team and one placement: flat position, areaId or legacy location');
          let point = change.kind === 'update_player' ? next.points.find(p => p.id === change.id) : null;
          if (change.kind === 'update_player' && !point) throw new Error('Unknown player ID');
          if (!point) { point = { id: id('player'), kind: 'player', weapon: 'ak47', crouched: false, rotationY: 0, pitch: 0 }; next.points.push(point); created.push({ kind: 'player', id: point.id }); }
          for (const field of ['name', 'team', 'weapon', 'crouched']) if (update[field] != null) point[field] = update[field];
          if (placement) point.position = resolve(s, placement);
          if (update.yaw != null) point.rotationY = (update.yaw - 180) * Math.PI / 180;
          if (update.pitch != null) point.pitch = update.pitch * Math.PI / 180;
        } else if (change.kind === 'delete_player') remove(next.points, change.id);
        else if (change.kind === 'add_effect' || change.kind === 'update_effect') {
          let effect = next.grenades.find(g => g.id === change.id);
          if (change.kind === 'update_effect' && !effect) throw new Error('Unknown effect ID');
          if (change.kind === 'add_effect') { if (!change.effect || !change.location) throw new Error('Effect type and location required'); effect = { id: id('effect'), range: 1 }; next.grenades.push(effect); created.push({ kind: 'effect', id: effect.id }); }
          if (change.effect) effect.type = change.effect;
          if (change.location) effect.position = resolve(s, change.location);
          if (change.range != null) effect.range = change.range;
        } else if (change.kind === 'delete_effect') remove(next.grenades, change.id);
        else if (change.kind === 'add_line') {
          if (!change.points?.length) throw new Error('Line points required');
          const line = { id: id('brush'), points: change.points.map(p => { const position = resolve(s, p); position[1] += 0.03; return position; }), color: change.color || '#a5e0ff', width: change.width || 3 };
          next.brushStrokes.push(line); created.push({ kind: 'line', id: line.id });
        } else if (change.kind === 'delete_line') remove(next.brushStrokes, change.id);
        else if (change.kind === 'delete_utility') remove(next.collabUtilities, change.id);
      }
      if (next.points.length > 64 || next.grenades.length > 128 || next.brushStrokes.length > 128) throw new Error('Tactical frame object limit reached');
      const names = next.points.map(p => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length || names.some(n => !n)) throw new Error('Player names must be nonempty and unique');
      s.ports.edit(() => { s.board.applyTacticalSnapshot(next); s.ports.flush(); });
      return { created, revision: state().revision, illustrativeEffects: input.changes.some(change => ['add_effect', 'update_effect'].includes(change.kind)), illustrativeEffectCount: input.changes.filter(change => ['add_effect', 'update_effect'].includes(change.kind)).length, effectSemantics: 'Only manually added/updated effects are schematic placeholders, not recorded throws or verified coverage.' };
    }
    if (name === 'search_utilities') {
      const query = (input.query || '').trim().toLowerCase();
      const allNotes = s.ports.notes(); const mapNotes = allNotes.filter(note => note.mapName === s.context.mapName);
      const matches = mapNotes.filter(note => [note.name, note.summary, note.grenadeType, note.startPlace, note.throwPlace, note.thrower].filter(Boolean).join(' ').toLowerCase().includes(query));
      const offset = input.offset || 0; const limit = input.limit || 40;
      const storage = s.ports.notesStatus?.() || { status: 'unknown' };
      return { total: matches.length, query, offset, limit, returnedCount: matches.slice(offset, offset + limit).length, mapName: s.context.mapName, scope: 'local saved throw library; not shared automatically with collaboration room', libraryStatus: storage.status, totalLibraryNotes: allNotes.length, totalMapNotes: mapNotes.length, activeFrameImportedUtilities: s.workspace.collabUtilities.length, emptyReason: matches.length ? null : storage.status === 'loading' ? 'library_loading' : storage.status === 'error' ? 'library_storage_error' : !allNotes.length ? 'local_library_empty' : !mapNotes.length ? 'no_notes_for_current_map' : 'query_has_no_matches', nextOffset: offset + limit < matches.length ? offset + limit : null,
        notes: matches.slice(offset, offset + limit).map(note => ({ id: note.id, name: note.name, summary: note.summary, kind: note.grenadeType,
          startPlace: note.startPlace || '', throwPlace: note.throwPlace || '', thrower: note.thrower || '',
          position: note.position, hasRecordedReplay: Boolean(note.replay),
        })),
      };
    }
    if (name === 'get_utility_details') {
      const note = s.ports.notes().find(note => note.id === input.noteId && note.mapName === s.context.mapName);
      if (!note) throw new Error('Saved throw not found on this map');
      const replay = note.replay;
      const events = Array.isArray(replay?.events) ? replay.events : [];
      const throwEvent = events.find(event => event?.event_name === 'grenade_thrown');
      const effectNames = ['smokegrenade_detonate', 'inferno_startburn', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started'];
      const effectEvent = events.find(event => effectNames.includes(event?.event_name) && (!Number.isFinite(replay?.effectTick) || event.tick === replay.effectTick));
      const point = values => values.every(Number.isFinite) ? values : null;
      const tickRate = Number.isFinite(replay?.tickRate) && replay.tickRate > 0 ? replay.tickRate : null;
      const throwTick = Number.isFinite(throwEvent?.tick) ? throwEvent.tick : Number.isFinite(replay?.throwTick) ? replay.throwTick : null;
      const effectTick = Number.isFinite(effectEvent?.tick) ? effectEvent.tick : null;
      // Never substitute the final trajectory sample for a recorded effect event.
      return {
        id: note.id, mapName: note.mapName, name: note.name, summary: note.summary, kind: note.grenadeType,
        coordinateSystem: 'Source [X,Y,Z], game units; seconds derived from recorded relative ticks',
        startPlace: note.startPlace || '', throwPlace: note.throwPlace || '',
        startPosition: Array.isArray(note.position) && note.position.length === 3 ? point(note.position) : null,
        releasePosition: point([throwEvent?.user_X, throwEvent?.user_Y, throwEvent?.user_Z]),
        observedEffect: effectEvent ? { event: effectEvent.event_name, tick: Number.isFinite(effectEvent.tick) ? effectEvent.tick : null, position: point([effectEvent.x, effectEvent.y, effectEvent.z]) } : null,
        timing: { tickRate, throwTick, effectTick, recordedReplayEffectTick: Number.isFinite(replay?.effectTick) ? replay.effectTick : null, flightSeconds: tickRate && throwTick != null && effectTick != null && effectTick >= throwTick ? (effectTick - throwTick) / tickRate : null },
        hasRecordedTrajectory: Array.isArray(replay?.projectiles) && replay.projectiles.filter(sample => sample && point([sample.x, sample.y, sample.z]) && Number.isFinite(sample.tick)).length >= 2,
        coverageVerified: false, plannedPlayerBinding: false, plannedReleaseOffset: null,
      };
    }
    if (name === 'import_utility') {
      if (input.frameId !== s.context.frameId) throw new Error('Switch to the target frame and reread its revision before importing');
      const note = s.ports.notes().find(note => note.id === input.noteId && note.mapName === s.context.mapName);
      if (!note) throw new Error('Saved throw not found on this map');
      s.ports.edit(() => { s.board.addCollabUtility(note); s.ports.flush(); });
      return { frameId: s.context.frameId, revision: state().revision, utilities: summary(state()).utilities };
    }
    if (name === 'manage_frames') {
      if (input.action === 'switch' && !s.ports.frames().some(f => f.id === input.frameId)) throw new Error('Unknown frame ID');
      if (input.action === 'delete' && s.ports.frames().length <= 1) throw new Error('Cannot delete the last frame');
      s.ports.frameActions[input.action](input.frameId);
      return summary(state());
    }
    if (name === 'control_camera') {
      if (input.action.startsWith('focus_')) {
        const collection = input.action === 'focus_player' ? s.workspace.points : s.workspace.collabUtilities;
        if (!collection.some(item => item.id === input.id)) throw new Error('Unknown focus target');
        (input.action === 'focus_player' ? s.board.focusCollabPlayer : s.board.focusCollabUtility)(input.id);
      } else if (input.action === 'end_preview') s.board.clearCollabUtilityPreview();
      else { if (input.slot == null) throw new Error('Camera slot required'); if (input.action === 'restore_slot' && !s.workspace.cameraSlots?.[input.slot]) throw new Error('Camera slot is empty'); s.ports.cameraActions[input.action](input.slot); }
      return { ok: true };
    }
    if (name === 'edit_history') { if (!(input.action === 'undo' ? s.board.canUndoCollab?.() : s.board.canRedoCollab?.())) throw new Error('No edit available for this history action'); s.ports.edit(() => { (input.action === 'undo' ? s.board.undoCollab : s.board.redoCollab)(); s.ports.flush(); }); return { revision: state().revision }; }
    if (name === 'clear_board') { s.ports.edit(() => { s.board.applyTacticalSnapshot({ points: [], grenades: [], brushStrokes: [], collabUtilities: [] }); s.ports.flush(); }); return { revision: state().revision }; }
    if (name === 'list_archives') return { archives: s.ports.archives().map(({ id, name, mapName }) => ({ id, name, mapName })) };
    if (name === 'manage_archive_folders') {
      const folders = s.ports.folders();
      if (input.action === 'list') return folders.stateRef.current;
      const current = folders.stateRef.current;
      const exists = folderId => folderId === 'root' || current.folders.some(folder => folder.id === folderId);
      let result;
      if (input.action === 'create') {
        if (!input.name?.trim() || !exists(input.parentId || 'root')) throw new Error('Folder name and valid parent required');
        result = await folders.create(input.name, input.parentId || 'root', s.ports.archives());
      } else {
        if (!input.folderId || !exists(input.folderId)) throw new Error('Unknown folder ID');
        if (input.action === 'assign') {
          if (!s.ports.archives().some(a => a.id === input.archiveId)) throw new Error('Unknown archive ID');
          result = await folders.assign(input.archiveId, input.folderId, s.ports.archives());
        } else {
          if (input.folderId === 'root') throw new Error('Root cannot be edited');
          if (input.action === 'delete') result = await folders.remove(input.folderId, s.ports.archives());
          else {
            if (!exists(input.parentId)) throw new Error('Unknown parent folder');
            const visited = new Set([input.folderId]); let ancestor = input.parentId;
            while (ancestor !== 'root') {
              if (visited.has(ancestor)) throw new Error('Folder move would create a cycle');
              visited.add(ancestor); ancestor = current.folders.find(f => f.id === ancestor)?.parentId || 'root';
            }
            result = await folders.move(s.ports.archives(), { type: 'folder', id: input.folderId }, { type: 'folder', id: input.parentId }, 'inside');
          }
        }
      }
      if (!result) throw new Error('Folder persistence failed');
      return folders.stateRef.current;
    }
    if (name === 'request_room_action') {
      const room = s.ports.room();
      if (input.action === 'open' && room.code) throw new Error('A room is already open');
      if (input.action === 'join' && (!input.code || room.code)) throw new Error('Room code required; leave the current room first');
      if (input.action === 'leave' && !room.code) throw new Error('No room to leave');
      s.ports.roomActions[input.action](input.code);
      return { status: 'room_change_requested', action: input.action };
    }
    if (name === 'request_archive_action') {
      if (input.action === 'save') { s.ports.saveArchive(); return { status: 'awaiting_user', saved: false }; }
      if (input.action === 'new') { s.ports.newArchive(); return { status: 'awaiting_user', saved: false }; }
      if (input.action === 'overwrite' || input.action === 'delete') {
        if (!s.ports.archives().some(a => a.id === input.archiveId)) throw new Error('Unknown archive ID');
        if (input.action === 'overwrite') s.ports.overwriteArchive(input.archiveId);
        else await s.ports.deleteArchive(input.archiveId);
        return { status: input.action === 'overwrite' ? 'awaiting_user' : s.ports.archives().some(a => a.id === input.archiveId) ? 'cancelled' : 'deleted' };
      }
      if (s.ports.room().code && !s.ports.room().owner) throw new Error('Guests cannot restore over a shared room');
      const archive = s.ports.archives().find(a => a.id === input.archiveId);
      if (!archive) throw new Error('Unknown archive ID');
      await s.ports.restoreArchive(archive);
      return { status: 'restore_requested' };
    }
    throw new Error('Unsupported tool');
  };
  const readScope = name => {
    if (['get_map_context', 'list_map_places', 'find_map_locations'].includes(name)) return mapReferences(state());
    if (name === 'get_utility_details') return getPorts().notes();
    return null; // Board state and mutable archives must always be read fresh.
  };
  return { definitions: tacticalToolDefinitions, execute, readScope, recordAction, contextKey: () => contextKey(getPorts().context()) };
}
