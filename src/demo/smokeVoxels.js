// Decodes the compact smoke journal carried by CSmokeGrenadeProjectile entities.
// Occupancy entries are packed into 15 bits (5 bits per axis) to keep round caches small.
const RECORD_HEADER_BYTES = 4;
const OCCUPANCY_ENTRY_BYTES = 8;
const OCCUPANCY_SECTION = 1;

export function packSmokeVoxel(x, y, z) {
  return (x & 31) | ((y & 31) << 5) | ((z & 31) << 10);
}

export function unpackSmokeVoxel(value) {
  return [value & 31, (value >> 5) & 31, (value >> 10) & 31];
}

export function decodeSmokeVoxelChunk(source = []) {
  const bytes = source instanceof Uint8Array ? source : Uint8Array.from(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = [];
  let offset = 0;
  while (offset + RECORD_HEADER_BYTES <= bytes.length) {
    const seq = view.getUint16(offset, true);
    const payloadLength = view.getUint16(offset + 2, true);
    const payloadStart = offset + RECORD_HEADER_BYTES;
    const payloadEnd = payloadStart + payloadLength;
    // Ignore an incomplete tail instead of allowing a damaged Demo to break all parsing.
    if (payloadEnd > bytes.length) break;
    const payload = bytes.subarray(payloadStart, payloadEnd);
    if (payload.length >= 3 && (payload[1] & OCCUPANCY_SECTION)) {
      const requestedCount = payload[2];
      const availableCount = Math.floor((payload.length - 3) / OCCUPANCY_ENTRY_BYTES);
      const count = Math.min(requestedCount, availableCount);
      const voxels = new Uint16Array(count);
      for (let index = 0; index < count; index += 1) {
        const entryOffset = 3 + index * OCCUPANCY_ENTRY_BYTES;
        // The journal stores axes in z/y/x order before five client state bytes.
        voxels[index] = packSmokeVoxel(payload[entryOffset + 2], payload[entryOffset + 1], payload[entryOffset]);
      }
      frames.push({ seq, voxels });
    }
    offset = payloadEnd;
  }
  return frames;
}

export function smokeVoxelFramesFromRow(row, readProp = (name) => row?.[name]) {
  const chunk = readProp('m_VoxelFrameData');
  const detonationPosition = readProp('m_vSmokeDetonationPos');
  const detonationCoordinates = Array.isArray(detonationPosition) || ArrayBuffer.isView(detonationPosition)
    ? Array.from(detonationPosition).slice(0, 3)
    : [];
  const projectileCoordinates = [row?.x, row?.y, row?.z];
  const hasDetonationCoordinates = detonationCoordinates.length === 3 && detonationCoordinates.every(Number.isFinite);
  if (!chunk?.length || (!hasDetonationCoordinates && !projectileCoordinates.every(Number.isFinite))) return [];
  // The dedicated smoke centre is stable after detonation; projectile X/Y/Z is
  // retained as a compatibility fallback for older parsers and cached rounds.
  const origin = hasDetonationCoordinates
    ? detonationCoordinates.map(Number)
    : projectileCoordinates.map(Number);
  return decodeSmokeVoxelChunk(chunk).map((frame) => ({
    tick: Number(row.tick),
    entityId: Number(row.entity_id ?? row.grenade_entity_id),
    origin,
    seq: frame.seq,
    voxels: frame.voxels,
  }));
}
