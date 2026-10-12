import { WORKSPACE_PLAYER_SCHEMA } from '../data/workspace.js';
// Discovery describes registered operations only. It does not bypass runtime
// validation or permission policy. 描述只用于发现，不能代替校验/授权。
const string = { type: 'string', minLength: 1 }, bool = { type: 'boolean' }, number = { type: 'number' };
const vec3 = { type: 'array', items: number, minItems: 3, maxItems: 3 };
const object = (properties = {}, required = [], additionalProperties = false) => ({ type: 'object', properties, required, additionalProperties });
const enumeration = values => ({ type: 'string', enum: values });
const definitions = {};
const define = (name, description, properties, required = [], effect = 'view', partial = false) => {
  definitions[name] = { name, description, effect, schemaStatus: partial ? 'partial' : 'complete', parameters: object(properties, required), examples: [] };
};
define('workspace.players', 'Replace only editable players. Read getWorkspace first; scene metres and radians. Other workspace content is preserved.', { players: { type: 'array', maxItems: 256, items: WORKSPACE_PLAYER_SCHEMA } }, ['players'], 'workspace');
define('board.apply', 'Replace the workspace snapshot. Snapshot layout is host-specific; inspect the current profile and workspace first.', { snapshot: { type: 'object', additionalProperties: true } }, ['snapshot'], 'workspace', true);
for (const [name, description] of [['board.clear', 'Clear editable workspace content.'], ['board.undo', 'Undo the latest editable operation.'], ['board.redo', 'Redo an undone editable operation.']]) define(name, description, {}, [], 'workspace');
define('player.rename', 'Rename an existing player.', { id: string, name: string }, ['id', 'name'], 'workspace');
define('player.team', 'Change a player side.', { id: string, team: enumeration(['T', 'CT']) }, ['id', 'team'], 'workspace');
define('player.move', 'Move a player using scene-local metres.', { id: string, position: vec3 }, ['id', 'position'], 'workspace');
for (const name of ['camera.focusPlayer', 'camera.pov', 'map.floor']) define(name, name === 'map.floor' ? 'Select an available floor ID, or all.' : 'Target an existing player by its current host ID.', { id: string }, ['id']);
define('camera.focusPoint', 'Focus scene-local XYZ metres, not Source XYZ inches.', { position: vec3 }, ['position']);
define('camera.mode', 'Choose 2D or 3D view.', { mode: enumeration(['2d', '3d']) }, ['mode']);
define('camera.director', 'Use a recorded director mode; requires a loaded 3D replay.', { mode: enumeration(['follow', 'fixed', 'chase']) }, ['mode']);
define('camera.monitor', 'Select unique current player IDs; an empty list closes monitors.', { playerIds: { type: 'array', items: string, uniqueItems: true, maxItems: 16 } }, ['playerIds']);
for (const [name, description] of [['camera.free', 'Release POV/director and restore the saved free camera.'], ['camera.reset', 'Reset the host camera view.'], ['camera.endPreview', 'Finish a host preview.']]) define(name, description, {});
for (const name of ['camera.save', 'camera.restore']) define(name, 'Use a host camera slot from 0 through 9.', { slot: { type: 'integer', minimum: 0, maximum: 9 } }, ['slot']);
define('camera.focusPlacedUtility', 'Focus an existing placed utility ID.', { id: string }, ['id']);
for (const name of ['camera.focusUtility', 'utility.add']) define(name, 'Use a saved utility record in the application profile. Its fields are host-specific.', { note: { type: 'object', additionalProperties: true } }, ['note'], name === 'utility.add' ? 'workspace' : 'view', true);
define('utility.place', 'Load a host utility reference and place it on this map. Optional position translates the whole recorded effect; it does not prove a valid throw.', { referenceId: string, id: string, position: vec3 }, ['referenceId'], 'workspace');
define('utility.move', 'Translate an existing utility placement using scene-local XYZ metres.', { id: string, position: vec3 }, ['id', 'position'], 'workspace');
define('utility.remove', 'Remove an existing placed utility ID.', { id: string }, ['id'], 'workspace');
define('model.visibility', 'Toggle the optional model; enabling starts lazy loading.', { visible: bool }, ['visible'], 'resource');
define('model.unload', 'Release the loaded model and its resource lease.', {}, [], 'resource');
const unit = { type: 'number', minimum: 0, maximum: 1 };
define('model.style', 'Configure simple model opacity/focus/range.', { opacity: unit, focus: enumeration(['full', 'pointer', 'camera']), range: unit });
define('model.objectsVisibility', 'Set original model-node visibility. Obtain IDs and matching signature from the model catalogue.', { ids: { type: 'array', items: { type: 'integer', minimum: 0 } }, visible: bool, signature: string }, ['ids', 'visible', 'signature']);
define('replay.open', 'Select a segment ID from the host data source.', { segmentId: string }, ['segmentId'], 'playback');
for (const name of ['replay.play', 'replay.pause']) define(name, 'Control the current replay playback.', {}, [], 'playback');
define('replay.seek', 'Seek a tick; the runtime clamps it to the selected segment.', { tick: number }, ['tick'], 'playback');
define('replay.speed', 'Set replay speed; voice follows the same speed.', { speed: { type: 'number', minimum: .1, maximum: 8 } }, ['speed'], 'playback');
define('replay.display', 'Control recorded effects and progressive trajectories.', { effects: bool, trajectories: bool });
define('replay.overlays', 'Control primary-view damage and flash overlays.', { enabled: bool, hurt: bool, flash: bool, reducedEffects: bool, maxFlashOpacity: unit });
define('voice.configure', 'Set voice options. Unmuting does not unlock an audio device; the host must obtain user consent.', { enabled: bool, muted: bool, volume: unit, side: enumeration(['all', 'T', 'CT']) }, [], 'settings');
const events = ['utility.placementsChanged', 'workspace.playersChanged', 'operation.started', 'operation.succeeded', 'operation.failed', 'operation.cancelled', 'lifecycle.ready', 'lifecycle.disposed', 'workspace.changed', 'selection.changed', 'camera.changed', 'camera.follow', 'camera.director', 'equipment.ready', 'equipment.failed', 'map.floor', 'model.visibility', 'model.style', 'model.objectsChanged', 'resource.state', 'playback.source', 'playback.loading', 'playback.ready', 'playback.failed', 'playback.cancelled', 'playback.play', 'playback.pause', 'playback.seek', 'playback.speed', 'playback.time', 'playback.ended', 'playback.display', 'playback.overlays', 'voice.state', 'voice.options'];
export function describeViewerContract({ apiVersion, profile = 'custom', names, queries = [], overrides = {} }) {
  const commands = names.map(name => {
    const descriptor = overrides[name] || definitions[name] || { name, description: 'Host extension; request its schema from the host.', effect: 'extension', schemaStatus: 'unknown', parameters: object({}, [], true), examples: [] };
    if (profile === 'standalone' && name === 'board.apply') return { ...descriptor, name, schemaStatus: 'complete',
      parameters: object({ snapshot: object({ points: { type: 'array', maxItems: 256,
        items: object({ id: string, kind: { const: 'player' }, name: string, team: enumeration(['T', 'CT']), position: vec3,
          rotationY: number, alive: { type: ['boolean', 'null'] }, crouched: bool, baseColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, ['id', 'team', 'position']),
      } }, ['points']) }, ['snapshot']), examples: [{ snapshot: { points: [{ id: 'player-1', team: 'T', position: [0, 0, 0] }] } }] };
    if (profile === 'application' && name === 'camera.reset' && !overrides[name]) return { ...descriptor, name,
      description: 'Reset the host camera view and clear temporary brush strokes.', effect: 'workspace' };
    return { ...descriptor, name };
  });
  return structuredClone({ apiVersion, profile, schemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    coordinates: { scene: { axes: 'XYZ', unit: 'metres', origin: 'getState().coordinates.origin' }, source: { axes: 'XYZ', unit: 'inches', conversion: 'Use sourceToScene/sceneToSource; Source and scene axes differ.' } },
    commands, queries: ['getState', 'getCapabilities', 'getContract', ...queries],
    events: events.map(name => ({ name, support: 'optional', delivery: name === 'playback.time' ? 'sampled' : 'state-change' })),
    eventEnvelope: { fields: ['type', 'revision', 'operationId', 'origin', 'payload'], payloadSchemas: { 'workspace.playersChanged': object({ players: { type: 'array', maxItems: 256, items: WORKSPACE_PLAYER_SCHEMA } }, ['players']), 'utility.placementsChanged': object({ action: enumeration(['placed', 'moved', 'removed']), id: string, placements: { type: 'array', items: object({ id: string, referenceId: { type: ['string', 'null'] }, kind: { type: ['string', 'null'] }, position: vec3, effectPosition: { anyOf: [vec3, { type: 'null' }] } }, ['id', 'referenceId', 'kind', 'position', 'effectPosition']) } }, ['action', 'id', 'placements']), otherTopics: 'not-yet-defined' } },
    operation: { context: ['origin', 'operationId', 'expectedRevision', 'signal'], status: ['succeeded', 'failed', 'cancelled'], errors: 'code/message/details', approval: 'host policy', cancellation: 'AbortSignal' },
  });
}
