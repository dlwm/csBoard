import fs from 'node:fs/promises';
import { MAX_GLB_JSON_BYTES } from './resource-limits.js';
import { modelObjectsFromGltf, modelObjectSignature } from '../shared/map-model-objects.js';

// Inspect only the JSON chunk, not hundreds of megabytes of geometry/textures.
// 按需只读取 GLB 的名称元数据，资源树不重新解码模型或加载贴图。
export async function inspectModelObjects(file) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    const header = Buffer.alloc(20);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 20 || header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== stat.size || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB');
    const length = header.readUInt32LE(12);
    if (length > MAX_GLB_JSON_BYTES || length % 4 || length + 20 > stat.size) throw new Error('Invalid GLB metadata');
    const bytes = Buffer.alloc(length);
    const read = await handle.read(bytes, 0, length, 20);
    if (read.bytesRead !== length) throw new Error('Truncated GLB metadata');
    const objects = modelObjectsFromGltf(JSON.parse(bytes.toString('utf8')));
    return { objects, signature: modelObjectSignature(objects) };
  } finally { await handle.close(); }
}
