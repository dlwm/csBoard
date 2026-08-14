export function parseNavBuffer(buffer) {
  const view = new DataView(buffer);
  const length = buffer.byteLength;
  let offset = 0;
  const uint32 = () => { if (offset + 4 > length) return 0; const value = view.getUint32(offset, true); offset += 4; return value; };
  const int64 = () => { offset += 8; };
  const byte = () => view.getUint8(offset++);
  const uint16 = () => { if (offset + 2 > length) return 0; const value = view.getUint16(offset, true); offset += 2; return value; };
  const float = () => { if (offset + 4 > length) return 0; const value = view.getFloat32(offset, true); offset += 4; return value; };
  const string = () => { const start = offset; while (offset < length && view.getUint8(offset) !== 0) offset += 1; const bytes = new Uint8Array(buffer, start, offset - start); const value = new TextDecoder('utf-8').decode(bytes); offset += 1; return value; };
  const skipKv3 = () => {
    offset = (offset + 7) & ~7;
    const magic = uint32();
    if ((magic & 0xffffff00) !== 0x4b563300) throw new Error('无效 KV3 数据');
    const version = magic & 0xff;
    offset += 16;
    const compression = uint32();
    if (version >= 2) offset += 4;
    const readInt = () => uint32();
    const bytes1 = readInt();
    const bytes4 = readInt();
    const bytes8 = readInt();
    readInt();
    let sizeUncompressed = 0;
    let sizeCompressed = 0;
    let blockCount = 0;
    let binaryBlobBytes = 0;
    if (version >= 2) {
      uint16(); uint16();
      sizeUncompressed = readInt(); sizeCompressed = readInt(); blockCount = readInt(); binaryBlobBytes = readInt();
    }
    if (version >= 4) { readInt(); readInt(); }
    const v5 = [];
    if (version >= 5) { for (let index = 0; index < 12; index += 1) v5.push(readInt()); }
    if (version >= 5) {
      const buffer1 = v5[0];
      const compressedBuffer1 = v5[1];
      const buffer2 = v5[2];
      const compressedBuffer2 = v5[3];
      offset += compression === 0 ? buffer1 : compressedBuffer1;
      offset += compression === 0 ? buffer2 : compressedBuffer2;
      if (blockCount) offset += binaryBlobBytes + 4;
    } else {
      offset += compression === 0 ? sizeUncompressed : sizeCompressed;
    }
    return offset;
  };
  if (uint32() !== 0xfeedface) throw new Error('无效 NAV 文件');
  const version = uint32();
  const subVersion = uint32();
  const analyzedFlags = uint32();
  if (version >= 36) skipKv3();
  const corners = [];
  const polygons = [];
  const cornerCount = uint32();
  if (cornerCount > 100000) throw new Error('NAV v36 KV3 偏移无法识别');
  for (let index = 0; index < cornerCount; index += 1) corners.push({ x: float(), y: float(), z: float() });
  const polygonCount = uint32();
  if (polygonCount > 100000) throw new Error('NAV v36 多边形数量异常');
  for (let index = 0; index < polygonCount; index += 1) {
    const polygon = [];
    const pointCount = byte();
    for (let point = 0; point < pointCount; point += 1) polygon.push(corners[uint32()]);
    if (version >= 35) uint32();
    polygons.push(polygon);
  }
  if (version >= 32) uint32();
  if (version >= 35) {
    const unknownCount = uint32();
    for (let index = 0; index < unknownCount; index += 1) { string(); offset += 48; }
  }
  if (version >= 36) skipKv3();
  const areas = {};
  const areaCount = uint32();
  if (areaCount > 20000) throw new Error('NAV v36 KV3 偏移无法识别');
  for (let index = 0; index < areaCount; index += 1) {
    const areaId = uint32();
    const dynamicFlags = int64();
    const hullIndex = byte();
    const points = polygons[uint32()] || [];
    uint32();
    const connections = [];
    for (let point = 0; point < points.length; point += 1) {
      const count = uint32();
      for (let connection = 0; connection < count; connection += 1) { connections.push(uint32()); uint32(); }
    }
    offset += 5;
    const above = [];
    for (let ladder = 0, count = uint32(); ladder < count; ladder += 1) above.push(uint32());
    const below = [];
    for (let ladder = 0, count = uint32(); ladder < count; ladder += 1) below.push(uint32());
    areas[areaId] = { area_id: areaId, hull_index: hullIndex, dynamic_attribute_flags: Number(dynamicFlags), corners: points, connections, ladders_above: above, ladders_below: below };
  }
  return { version, sub_version: subVersion, is_analyzed: Boolean(analyzedFlags & 1), areas };
}

export function fetchAndParseNav(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`NAV 加载失败：${response.status}`);
    return response.arrayBuffer();
  }).then(parseNavBuffer);
}
