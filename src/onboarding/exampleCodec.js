import { DEMO_CACHE_SCHEMA_VERSION } from '../demo/cacheSchema.js';

export function adaptGuideExample(payload) {
  const data = payload?.entry?.data;
  const version = data?.cacheSchemaVersion;
  // Cache v35 added flash events. The bundled v34 excerpt can still play
  // with its recorded events; this does not migrate parsed user Demos.
  const compatible = version === DEMO_CACHE_SCHEMA_VERSION || (version === 34 && DEMO_CACHE_SCHEMA_VERSION === 35);
  if (payload?.version !== 1 || !compatible || !payload.rounds?.some(round => round.round === 22)) {
    throw Error('Example replay version is incompatible');
  }
  if (version === DEMO_CACHE_SCHEMA_VERSION) return payload;
  return { ...payload, entry: { ...payload.entry, data: { ...data, cacheSchemaVersion: DEMO_CACHE_SCHEMA_VERSION } } };
}

// Compact column tables are only a distribution format. Restored replay data
// uses the existing player/snapshot schema without another playback path.
// 列表仅用于缩小示例体积，解码后复用正常回放结构和处理流程。
export function packExampleSnapshots(snapshots) {
  const names = new Set();
  for (const snapshot of snapshots) for (const player of snapshot.players) for (const field of Object.keys(player)) names.add(field);
  const fields = [...names];
  return { fields, rows: snapshots.map(snapshot => [snapshot.tick, snapshot.timeSeconds, snapshot.players.map(player => fields.map(field => player[field]))]) };
}
export function unpackExampleSnapshots(table) {
  if (!Array.isArray(table.fields) || !Array.isArray(table.rows)) throw Error('Invalid example snapshot table');
  return table.rows.map(([tick, timeSeconds, players]) => ({ tick, timeSeconds, players: players.map(values => Object.fromEntries(table.fields.map((field, index) => [field, values[index]]))) }));
}
