import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 1024 ** 3;
const padded = bytes => Math.ceil(bytes / 4) * 4;

// Source 2 Viewer writes satellite PNGs even for GLB. Embed those images before
// moving the model out of staging; application resource packs remain one file.
// 转换器的 GLB 仍引用独立贴图；将其内嵌后再入库，资源包无需保留临时目录。
export async function embedGlbImages(file) {
  const stat = await fs.stat(file);
  if (stat.size > MAX_BYTES) throw new Error('GLB exceeds resource size limit');
  const source = await fs.readFile(file);
  if (source.length < 20 || source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length) throw new Error('Invalid exported GLB');
  let json, binary = Buffer.alloc(0);
  for (let offset = 12; offset < source.length;) {
    if (offset + 8 > source.length) throw new Error('Truncated GLB chunk');
    const length = source.readUInt32LE(offset), type = source.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > source.length) throw new Error('Invalid GLB chunk size');
    const bytes = source.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8'));
    else if (type === 0x004e4942) binary = bytes;
    offset += 8 + length;
  }
  if (!json || (json.buffers || []).some(buffer => buffer.uri) || (json.buffers || []).length > 1) throw new Error('Exported GLB must have one embedded geometry buffer');
  const external = (json.images || []).filter(image => image.uri && !image.uri.startsWith('data:'));
  if (!external.length) return;
  const root = await fs.realpath(path.dirname(file));
  const pieces = [binary]; let total = binary.length;
  json.bufferViews ||= [];
  for (const image of external) {
    const uri = decodeURIComponent(image.uri);
    if (/[\\\0]/.test(uri) || path.isAbsolute(uri) || /^[a-z][a-z0-9+.-]*:/i.test(uri)) throw new Error('Unsupported texture address');
    const target = await fs.realpath(path.resolve(root, uri));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Texture is outside the conversion directory');
    const size = await fs.stat(target);
    if (!size.isFile() || total + padded(size.size) > MAX_BYTES) throw new Error('Embedded textures exceed resource size limit');
    const bytes = await fs.readFile(target);
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new Error('Unsupported exported texture format');
    image.bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: total, byteLength: bytes.length });
    image.mimeType = png ? 'image/png' : 'image/jpeg';
    delete image.uri;
    pieces.push(bytes, Buffer.alloc(padded(bytes.length) - bytes.length)); total += padded(bytes.length);
  }
  json.buffers = [{ byteLength: total }];
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(padded(jsonBytes.length), 32); jsonBytes.copy(jsonChunk);
  const length = 12 + 8 + jsonChunk.length + 8 + total;
  if (length > MAX_BYTES) throw new Error('Embedded GLB exceeds resource size limit');
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(total, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  await fs.writeFile(file, Buffer.concat([header, jsonChunk, binHeader, ...pieces], length));
}
