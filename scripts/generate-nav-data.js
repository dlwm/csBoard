// Converts local CS2 NAV binaries into deterministic JSON bundled by the frontend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNavBuffer } from '../src/navParser.js';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(projectRoot, '.local', 'official', 'maps');
const outputRoot = path.join(projectRoot, 'src', 'data', 'nav');
const maps = ['de_dust2', 'de_mirage', 'de_nuke', 'de_ancient', 'de_anubis', 'de_cache', 'de_inferno', 'de_overpass', 'de_train', 'de_vertigo'];

fs.mkdirSync(outputRoot, { recursive: true });
for (const mapName of maps) {
  const source = path.join(sourceRoot, mapName, `${mapName}.nav`);
  if (!fs.existsSync(source)) throw new Error(`Missing NAV source: ${path.relative(projectRoot, source)}`);
  const bytes = fs.readFileSync(source);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const output = path.join(outputRoot, `${mapName}.json`);
  fs.writeFileSync(output, `${JSON.stringify(parseNavBuffer(buffer))}\n`);
  console.log(`generated ${path.relative(projectRoot, output)}`);
}
