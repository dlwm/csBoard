// A tiny real GLB for packaged resource loading checks. This is deliberately
// not a substitute for map visual QA. 中文：只验证加载/节点控制，不替代地图视觉验收。
export function createModelFixture() {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'qa_world', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: positions.length }],
    bufferViews: [{ buffer: 0, byteLength: positions.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [2, 2, 0] }],
  }));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const result = Buffer.alloc(12 + 8 + padded.length + 8 + positions.length);
  result.write('glTF'); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
  const offset = 20 + padded.length;
  result.writeUInt32LE(positions.length, offset); result.writeUInt32LE(0x004e4942, offset + 4); positions.copy(result, offset + 8);
  return result;
}
