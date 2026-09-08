// Converts CInferno's fixed network arrays into compact, change-only replay frames.
const MAX_FIRE_CELLS = 64;
const bitsView = new Uint32Array(1);
const floatView = new Float32Array(bitsView.buffer);

const floatFromBits = (value) => {
  bitsView[0] = Number(value) >>> 0;
  return floatView[0];
};

const frameSignature = (positions, burning, normals, count) => {
  let hash = 2166136261;
  const mix = (value) => { hash = Math.imul(hash ^ (Number(value) >>> 0), 16777619); };
  mix(count);
  for (let index = 0; index < count; index += 1) {
    mix(burning[index]);
    if (!burning[index]) continue;
    mix(positions[index * 3]);
    mix(positions[index * 3 + 1]);
    mix(positions[index * 3 + 2]);
    if (normals?.length >= index * 3 + 3) {
      mix(normals[index * 3]);
      mix(normals[index * 3 + 1]);
      mix(normals[index * 3 + 2]);
    }
  }
  return hash >>> 0;
};

export function infernoFrameFromRow(row, readProp = (name) => row?.[name]) {
  if (!String(row?.grenade_type || '').includes('Inferno')) return null;
  const positions = readProp('m_firePositions');
  const burning = readProp('m_bFireIsBurning');
  const normals = readProp('m_BurnNormal');
  if (!positions?.length || !burning?.length) return null;
  const requestedCount = Number(readProp('m_fireCount'));
  const count = Math.min(
    MAX_FIRE_CELLS,
    Math.floor(positions.length / 3),
    burning.length,
    Number.isFinite(requestedCount) ? Math.max(0, requestedCount) : MAX_FIRE_CELLS,
  );
  const values = [];
  for (let index = 0; index < count; index += 1) {
    if (!burning[index]) continue;
    const position = [0, 1, 2].map((axis) => floatFromBits(positions[index * 3 + axis]));
    if (!position.every(Number.isFinite) || position.every((value) => value === 0)) continue;
    const normal = normals?.length >= index * 3 + 3
      ? [0, 1, 2].map((axis) => floatFromBits(normals[index * 3 + axis]))
      : [0, 0, 1];
    values.push(...position, ...(normal.every(Number.isFinite) ? normal : [0, 0, 1]));
  }
  return {
    tick: Number(row.tick),
    entityId: Number(row.entity_id ?? row.grenade_entity_id),
    seq: frameSignature(positions, burning, normals, count),
    lifetime: Number(readProp('m_nFireLifetime')) || 0,
    cells: Float32Array.from(values),
  };
}

export function appendChangedInfernoFrame(frames, latestByEntity, row, readProp) {
  const frame = infernoFrameFromRow(row, readProp);
  if (!frame || !Number.isFinite(frame.tick) || !Number.isFinite(frame.entityId)) return;
  const previous = latestByEntity.get(frame.entityId);
  if (previous?.seq === frame.seq && previous.cells.length === frame.cells.length) return;
  latestByEntity.set(frame.entityId, frame);
  frames.push(frame);
}
