import fs from 'node:fs/promises';
import { MAX_GLB_BYTES, MAX_GLB_JSON_BYTES } from './resource-limits.js';
import { isMapModelOverlay } from '../shared/map-model-materials.js';

// Chromium's ordinary response ArrayBuffer allocation is below 2 GiB. Leave
// alignment headroom; this is a transport limit, not a machine RAM budget.
// 单块响应缓冲的容量限制与机器内存不同；只校验最终无贴图资源，不限制源贴图体积。
const MAX_RENDER_BYTES = 2 * 1024 ** 3 - 4 * 1024 ** 2;
const align = size => Math.ceil(size / 4) * 4;
const textureExtension = name => /^(?:KHR_materials_|KHR_texture_|EXT_texture_|MSFT_texture_)/.test(name);
async function readExact(handle, size, position) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, size - offset, position + offset);
    if (!bytesRead) throw new Error('Truncated GLB data');
    offset += bytesRead;
  }
  return bytes;
}
async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
    if (!bytesWritten) throw new Error('Unable to write map resource');
    offset += bytesWritten;
  }
}
async function metadata(handle) {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.size < 20 || stat.size > MAX_GLB_BYTES) throw new Error('Invalid GLB size');
  const header = await readExact(handle, 20, 0), jsonLength = header.readUInt32LE(12);
  if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== stat.size || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB 2.0 header');
  if (jsonLength % 4 || jsonLength > MAX_GLB_JSON_BYTES || 20 + jsonLength > stat.size) throw new Error('Invalid GLB metadata');
  const model = JSON.parse((await readExact(handle, jsonLength, 20)).toString('utf8'));
  if (model.asset?.version !== '2.0' || !model.meshes?.length) throw new Error('GLB has no mesh');
  let binaryOffset = 0, binaryLength = 0, foundBinary = false;
  for (let offset = 20 + jsonLength; offset < stat.size;) {
    if (offset + 8 > stat.size) throw new Error('Truncated GLB chunk');
    const chunk = await readExact(handle, 8, offset), length = chunk.readUInt32LE(0), type = chunk.readUInt32LE(4);
    if (length % 4 || offset + 8 + length > stat.size) throw new Error('Invalid GLB chunk');
    if (type === 0x004e4942) {
      if (foundBinary) throw new Error('Duplicate GLB binary chunk');
      foundBinary = true; binaryOffset = offset + 8; binaryLength = length;
    } else if (type === 0x4e4f534a) throw new Error('Duplicate GLB JSON chunk');
    offset += 8 + length;
  }
  if (model.buffers?.length > 1 || model.buffers?.some(buffer => buffer.uri)) throw new Error('Map geometry must use one embedded buffer');
  const declared = model.buffers?.[0]?.byteLength || 0;
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > binaryLength) throw new Error('Invalid GLB geometry buffer');
  for (const view of model.bufferViews || []) {
    const offset = view.byteOffset || 0;
    if (view.buffer !== 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength < 1 || offset + view.byteLength > declared) throw new Error('Invalid GLB buffer view');
  }
  return { stat, model, binaryOffset, binaryLength };
}
const hasTextures = model => Boolean(model.images?.length || model.textures?.length || model.samplers?.length);
export async function mapHasTextures(file) {
  const input = await fs.open(file, 'r');
  try { return hasTextures((await metadata(input)).model); }
  finally { await input.close(); }
}

// Write a derived GLB; never modify the selected original. Keep node IDs,
// transforms, meshes, accessors and geometry bytes, then pack retained views.
// 原生分块复制实际几何，不读取、解码或嵌入贴图，也不量化坐标或改变对象层级。
export async function writeTexturelessMap(file, destination, { signal } = {}) {
  let input, output;
  try {
    signal?.throwIfAborted();
    input = await fs.open(file, 'r');
    const { stat, model, binaryOffset } = await metadata(input);
    if (!hasTextures(model)) {
      if (stat.size > MAX_RENDER_BYTES) throw new Error('Geometry-only map exceeds the renderer buffer limit; simplify its geometry before importing');
      await fs.copyFile(file, destination);
      signal?.throwIfAborted();
      return { sourceBytes: stat.size, outputBytes: stat.size, texturesRemoved: 0 };
    }
    const texturesRemoved = model.images?.length || 0;
    const imageViews = new Set((model.images || []).filter(image => Number.isInteger(image.bufferView)).map(image => image.bufferView));
    const referencedViews = new Set();
    const visitReferences = object => {
      if (!object || typeof object !== 'object') return;
      for (const [key, value] of Object.entries(object)) {
        if (key === 'extras') continue;
        if (key === 'bufferView' && Number.isInteger(value)) referencedViews.add(value);
        else visitReferences(value);
      }
    };
    delete model.images; delete model.textures; delete model.samplers;
    model.materials = (model.materials || []).map(material => ({ ...(material.name ? { name: material.name } : {}), ...(isMapModelOverlay(material) ? { extras: { csboardMapOverlay: true } } : {}) }));
    for (const field of ['extensionsUsed', 'extensionsRequired']) if (model[field]) {
      model[field] = model[field].filter(name => !textureExtension(name));
      if (!model[field].length) delete model[field];
    }
    if (model.extensions) for (const name of Object.keys(model.extensions)) if (textureExtension(name)) delete model.extensions[name];
    visitReferences(model);
    const oldViews = model.bufferViews || [], mapping = new Map(), ranges = [], retained = [];
    let length = 0;
    const pack = (offset, size) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1 || offset + size > model.buffers[0].byteLength) throw new Error('Invalid compressed geometry range');
      const next = length; ranges.push({ offset, size, padding: align(size) - size }); length += align(size); return next;
    };
    oldViews.forEach((view, index) => {
      if (imageViews.has(index) && !referencedViews.has(index)) return;
      const next = { ...view, buffer: 0, byteOffset: pack(view.byteOffset || 0, view.byteLength) };
      const compressed = next.extensions?.EXT_meshopt_compression;
      if (compressed) {
        if (compressed.buffer !== 0) throw new Error('Unsupported compressed map buffer');
        compressed.byteOffset = pack(compressed.byteOffset || 0, compressed.byteLength);
      }
      mapping.set(index, retained.length); retained.push(next);
    });
    const remap = object => {
      if (!object || typeof object !== 'object') return;
      for (const [key, value] of Object.entries(object)) {
        if (key === 'extras') continue;
        if (key === 'bufferView' && Number.isInteger(value)) {
          if (!mapping.has(value)) throw new Error('Map geometry references a missing buffer view');
          object[key] = mapping.get(value);
        } else remap(value);
      }
    };
    model.bufferViews = retained; remap(model);
    if (length) model.buffers = [{ byteLength: length }]; else delete model.buffers;
    model.asset.extras = { ...model.asset.extras, csboardMapFormat: 'textureless-v1' };
    const bytes = Buffer.from(JSON.stringify(model));
    if (align(bytes.length) > MAX_GLB_JSON_BYTES) throw new Error('Map metadata exceeds size limit');
    const json = Buffer.alloc(align(bytes.length), 32); bytes.copy(json);
    const total = 20 + json.length + (length ? 8 + length : 0);
    if (total > MAX_RENDER_BYTES) throw new Error('Geometry-only map exceeds the renderer buffer limit; simplify its geometry before importing');
    output = await fs.open(destination, 'wx');
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    await writeAll(output, header); await writeAll(output, json);
    if (length) {
      const bin = Buffer.alloc(8); bin.writeUInt32LE(length, 0); bin.writeUInt32LE(0x004e4942, 4); await writeAll(output, bin);
      const chunk = Buffer.alloc(1024 ** 2);
      for (const range of ranges) {
        for (let offset = 0; offset < range.size;) {
          signal?.throwIfAborted();
          const { bytesRead } = await input.read(chunk, 0, Math.min(chunk.length, range.size - offset), binaryOffset + range.offset + offset);
          if (!bytesRead) throw new Error('Resource changed during conversion');
          await writeAll(output, chunk.subarray(0, bytesRead)); offset += bytesRead;
        }
        if (range.padding) await writeAll(output, Buffer.alloc(range.padding));
      }
    }
    const after = await input.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('Resource changed during conversion');
    signal?.throwIfAborted();
    return { sourceBytes: stat.size, outputBytes: total, texturesRemoved };
  } finally { await output?.close(); await input?.close(); }
}
