import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build/icons');
await fs.mkdir(output, { recursive: true });
const source = await fs.readFile(path.join(root, 'src/assets/favicon.svg'));
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = new Map(await Promise.all(sizes.map(async size => [size, await sharp(source, { density: 1536 }).resize(size, size).png().toBuffer()])));
await fs.writeFile(path.join(output, 'icon.png'), images.get(1024));
// ICNS PNG elements preserve retina detail without depending on macOS iconutil.
const types = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']];
const chunks = types.map(([size, type]) => {
  const data = images.get(size);
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns');
icnsHeader.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await fs.writeFile(path.join(output, 'icon.icns'), Buffer.concat([icnsHeader, ...chunks]));
// Modern Windows accepts PNG payloads in ICO, including the 256 px shell image.
const icoSizes = sizes.filter(size => size <= 256);
const icoHeader = Buffer.alloc(6 + 16 * icoSizes.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);
let offset = icoHeader.length;
icoSizes.forEach((size, index) => {
  const position = 6 + index * 16;
  icoHeader[position] = icoHeader[position + 1] = size === 256 ? 0 : size;
  icoHeader.writeUInt16LE(1, position + 4);
  icoHeader.writeUInt16LE(32, position + 6);
  icoHeader.writeUInt32LE(images.get(size).length, position + 8);
  icoHeader.writeUInt32LE(offset, position + 12);
  offset += images.get(size).length;
});
await fs.writeFile(path.join(output, 'icon.ico'), Buffer.concat([icoHeader, ...icoSizes.map(size => images.get(size))]));
console.log(`Application icons generated in ${output}`);
