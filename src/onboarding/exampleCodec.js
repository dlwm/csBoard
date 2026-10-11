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
