import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_GLB_BYTES, MAX_GLB_JSON_BYTES } from './resource-limits.js';

const padded = bytes => Math.ceil(bytes / 4) * 4;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const abort = signal => signal?.throwIfAborted();
async function readExact(handle, length, position) {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = await handle.read(bytes, offset, length - offset, position + offset);
    if (!read.bytesRead) throw new Error('Truncated GLB data');
    offset += read.bytesRead;
  }
  return bytes;
}
async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await handle.write(bytes, offset, bytes.length - offset);
    if (!written.bytesWritten) throw new Error('Unable to write embedded GLB');
    offset += written.bytesWritten;
  }
}
async function copyRange(source, output, position, length, signal) {
  // Reuse a bounded buffer rather than retaining every texture and concatenating
  // another full GLB. 按 1 MiB 分块复制，避免原模型、贴图和输出同时驻留内存。
  const bytes = Buffer.alloc(Math.min(1024 ** 2, length));
  let offset = 0;
  while (offset < length) {
    abort(signal);
    const read = await source.read(bytes, 0, Math.min(bytes.length, length - offset), position + offset);
    if (!read.bytesRead) throw new Error('Resource changed during embedding');
    await writeAll(output, bytes.subarray(0, read.bytesRead));
    offset += read.bytesRead;
  }
}

// Embed satellite PNG/JPEG files without changing their quality. Only publish
// the completed file; cancelled/failed conversion preserves the original.
// 贴图保持原字节，输出完成后才替换源文件；失败或取消不留下半成品。
export async function embedGlbImages(file, { signal } = {}) {
  let source, output, temporary;
  try {
    abort(signal);
    source = await fs.open(file, 'r');
    const stat = await source.stat();
    if (!stat.isFile() || stat.size < 20 || stat.size > MAX_GLB_BYTES) throw new Error('GLB exceeds the format size limit (4 GiB)');
    const header = await readExact(source, 20, 0);
    if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== stat.size || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid exported GLB');
    const jsonLength = header.readUInt32LE(12);
    if (jsonLength % 4 || jsonLength > MAX_GLB_JSON_BYTES || jsonLength + 20 > stat.size) throw new Error('Invalid GLB JSON chunk');
    const json = JSON.parse((await readExact(source, jsonLength, 20)).toString('utf8'));
    if (json?.asset?.version !== '2.0') throw new Error('Invalid exported GLB metadata');
    const extraChunks = [];
    let binaryOffset = 0, binaryLength = 0, hasBinary = false;
    for (let offset = 20 + jsonLength; offset < stat.size;) {
      if (offset + 8 > stat.size) throw new Error('Truncated GLB chunk');
      const chunk = await readExact(source, 8, offset);
      const length = chunk.readUInt32LE(0), type = chunk.readUInt32LE(4);
      if (length % 4 || offset + 8 + length > stat.size) throw new Error('Invalid GLB chunk size');
      if (type === 0x004e4942) {
        if (hasBinary) throw new Error('Duplicate GLB binary chunk');
        hasBinary = true; binaryOffset = offset + 8; binaryLength = length;
      } else if (type === 0x4e4f534a) throw new Error('Duplicate GLB JSON chunk');
      else extraChunks.push({ offset, length: length + 8 });
      offset += 8 + length;
    }
    if (!json || (json.buffers || []).some(buffer => buffer.uri) || (json.buffers || []).length > 1) throw new Error('Exported GLB must have one embedded geometry buffer');
    if (json.buffers?.[0] && (!Number.isSafeInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength < 0 || json.buffers[0].byteLength > binaryLength)) throw new Error('Invalid GLB geometry buffer');
    const external = (json.images || []).filter(image => image.uri && !image.uri.startsWith('data:'));
    if (!external.length) return;
    const root = await fs.realpath(path.dirname(file));
    const textures = new Map();
    let total = binaryLength;
    json.bufferViews ||= [];
    for (const image of external) {
      abort(signal);
      const uri = decodeURIComponent(image.uri);
      if (/[\\\0]/.test(uri) || path.isAbsolute(uri) || /^[a-z][a-z0-9+.-]*:/i.test(uri)) throw new Error('Unsupported texture address');
      const target = await fs.realpath(path.resolve(root, uri));
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Texture is outside the conversion directory');
      let texture = textures.get(target);
      if (!texture) {
        const handle = await fs.open(target, 'r');
        try {
          const size = await handle.stat();
          if (!size.isFile() || size.size < 3 || total + padded(size.size) > MAX_GLB_BYTES) throw new Error('Embedded textures exceed the GLB format size limit (4 GiB)');
          const signature = await readExact(handle, Math.min(8, size.size), 0);
          const png = signature.length === 8 && signature.equals(PNG);
          const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
          if (!png && !jpeg) throw new Error('Unsupported exported texture format');
          texture = { file: target, length: size.size, view: json.bufferViews.length, mimeType: png ? 'image/png' : 'image/jpeg' };
          json.bufferViews.push({ buffer: 0, byteOffset: total, byteLength: size.size });
          textures.set(target, texture); total += padded(size.size);
        } finally { await handle.close(); }
      }
      // Multiple image records can reference the same exported file.
      // 多个材质引用相同贴图时复用 bufferView，不重复内嵌。
      image.bufferView = texture.view; image.mimeType = texture.mimeType;
      delete image.uri;
    }
    json.buffers = [{ byteLength: total }];
    const jsonBytes = Buffer.from(JSON.stringify(json));
    if (padded(jsonBytes.length) > MAX_GLB_JSON_BYTES) throw new Error('Embedded GLB metadata exceeds size limit');
    const jsonChunk = Buffer.alloc(padded(jsonBytes.length), 32); jsonBytes.copy(jsonChunk);
    const length = 28 + jsonChunk.length + total + extraChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (length > MAX_GLB_BYTES) throw new Error('Embedded GLB exceeds the format size limit (4 GiB)');
    const nextHeader = Buffer.alloc(20), binHeader = Buffer.alloc(8);
    nextHeader.writeUInt32LE(0x46546c67, 0); nextHeader.writeUInt32LE(2, 4); nextHeader.writeUInt32LE(length, 8);
    nextHeader.writeUInt32LE(jsonChunk.length, 12); nextHeader.writeUInt32LE(0x4e4f534a, 16);
    binHeader.writeUInt32LE(total, 0); binHeader.writeUInt32LE(0x004e4942, 4);
    temporary = `${file}.${randomUUID()}.tmp`;
    output = await fs.open(temporary, 'wx');
    await writeAll(output, nextHeader); await writeAll(output, jsonChunk); await writeAll(output, binHeader);
    await copyRange(source, output, binaryOffset, binaryLength, signal);
    for (const texture of textures.values()) {
      const handle = await fs.open(texture.file, 'r');
      try {
        if ((await handle.stat()).size !== texture.length) throw new Error('Texture changed during embedding');
        await copyRange(handle, output, 0, texture.length, signal);
        await writeAll(output, Buffer.alloc(padded(texture.length) - texture.length));
      } finally { await handle.close(); }
    }
    // Unknown extension chunks remain intact after the standard JSON/BIN chunks.
    for (const chunk of extraChunks) await copyRange(source, output, chunk.offset, chunk.length, signal);
    await output.sync(); await output.close(); output = null;
    await source.close(); source = null;
    abort(signal);
    await fs.rename(temporary, file);
    temporary = null;
  } finally {
    await Promise.allSettled([output?.close(), source?.close()]);
    if (temporary) await fs.rm(temporary, { force: true });
  }
}
