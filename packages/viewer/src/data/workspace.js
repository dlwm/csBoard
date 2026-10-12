// Common editable layout, independent of renderer and host archive formats.
// 坐标为场景米、朝向为弧度；此布局不携带道具体素、相机或宿主存档。
export const WORKSPACE_LAYOUT_VERSION = '0.1';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const text = { type: 'string', minLength: 1 };
export const WORKSPACE_PLAYER_SCHEMA = freeze({ type: 'object', additionalProperties: false,
  properties: { id: text, name: text, team: { type: 'string', enum: ['T', 'CT'] }, position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, rotationY: { type: 'number' }, crouched: { type: 'boolean' }, baseColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['id', 'team', 'position'] });
const invalid = message => { const error = new TypeError(message); error.code = 'invalid_workspace'; throw error; };
export function normalizeWorkspacePlayers(players) {
  if (!Array.isArray(players) || players.length > 256) invalid('players must contain at most 256 entries');
  const ids = new Set(), keys = Object.keys(WORKSPACE_PLAYER_SCHEMA.properties);
  return players.map((p, index) => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(key => !keys.includes(key))) invalid(`players[${index}] has unsupported fields`);
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id)) invalid(`players[${index}] requires a unique ID`);
    ids.add(p.id);
    if (!['T', 'CT'].includes(p.team) || !Array.isArray(p.position) || p.position.length !== 3 || !p.position.every(Number.isFinite)) invalid(`players[${index}] requires T/CT and finite XYZ metres`);
    if (Object.hasOwn(p, 'name') && (typeof p.name !== 'string' || !p.name.trim())) invalid(`players[${index}].name must be nonempty`);
    if (Object.hasOwn(p, 'rotationY') && !Number.isFinite(p.rotationY)) invalid(`players[${index}].rotationY must be finite radians`);
    if (Object.hasOwn(p, 'crouched') && typeof p.crouched !== 'boolean') invalid(`players[${index}].crouched must be boolean`);
    if (Object.hasOwn(p, 'baseColor') && (typeof p.baseColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.baseColor))) invalid(`players[${index}].baseColor must be a six-digit hex color`);
    return { id: p.id, name: p.name?.trim() || p.id, team: p.team, position: [...p.position], rotationY: p.rotationY ?? 0, crouched: p.crouched ?? false, ...(p.baseColor != null ? { baseColor: p.baseColor } : {}) };
  });
}
export function createWorkspaceLayout({ players, utilities = [], effects = [], mapName = null, origin = null }) {
  return { version: WORKSPACE_LAYOUT_VERSION, mapName, coordinates: { space: 'scene-local', unit: 'metres', rotation: 'radians', origin: origin ? [...origin] : null },
    players: normalizeWorkspacePlayers(players), utilities: structuredClone(utilities), effects: structuredClone(effects) };
}
