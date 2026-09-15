// Resource-only extensions: fixed names, no executable plugins, no caller paths
// exposed to the renderer. Models are streamed to disk rather than sent over IPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from './resource-catalog.json' with { type: 'json' };

const aliases = { glock: 'glock18', hegrenade: 'grenade', usp_silencer: 'usp', m4a1_silencer: 'm4a1' };
export function identifyResource(filename) {
  const name = path.basename(filename).toLowerCase();
  if (name.endsWith('.svg')) {
    const key = aliases[name.slice(0, -4)] || name.slice(0, -4);
    if (catalog.icons.includes(key)) return { kind: 'icons', key, name: `${key}.svg` };
  }
  if (name.endsWith('.glb')) {
    const key = name.slice(0, -4);
    if (catalog.maps.includes(key)) return { kind: 'models', key, name };
  }
  return null;
}

export async function validateResource(file, resource) {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Not a file');
  if (resource.kind === 'icons') {
    if (stat.size > 2 * 1024 ** 2) throw new Error('SVG exceeds 2 MB');
    const source = await fs.readFile(file, 'utf8');
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) throw new Error('SVG XML entities are not allowed');
    // Illustrator exports commonly contain a public SVG DTD. It is unnecessary
    // for image rendering; remove it without allowing internal entity expansion.
    const svg = source.replace(/<!DOCTYPE[^>]*>/gi, '');
    if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg)) throw new Error('Invalid SVG');
    // Image-only SVGs: forbid active content, external resources and XML entities.
    if (/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|@import|javascript:/i.test(svg)
      || /(?:href|src)\s*=\s*["'](?!#)[^"']+/i.test(svg)
      || [...svg.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^["']|["']$/g, '').startsWith('#'))) throw new Error('SVG must be self-contained and contain no active content');
    if (svg !== source) await fs.writeFile(file, svg);
    return;
  }
  if (stat.size < 20 || stat.size > 1024 ** 3) throw new Error('GLB size must be between 20 bytes and 1 GB');
  const handle = await fs.open(file, 'r');
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== stat.size
      || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB 2.0 header');
    const length = header.readUInt32LE(12);
    if (length > 32 * 1024 ** 2 || length + 20 > stat.size || length % 4) throw new Error('Invalid GLB JSON chunk');
    const bytes = Buffer.alloc(length);
    await handle.read(bytes, 0, length, 20);
    const json = JSON.parse(bytes.toString('utf8'));
    if (json.asset?.version !== '2.0' || !json.meshes?.length) throw new Error('GLB has no mesh');
    if ([...(json.buffers || []), ...(json.images || [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw new Error('GLB requires external files');
    let offset = 20 + length;
    while (offset < stat.size) {
      const chunk = Buffer.alloc(8);
      if (offset + 8 > stat.size) throw new Error('Truncated GLB chunk');
      await handle.read(chunk, 0, 8, offset);
      const size = chunk.readUInt32LE(0);
      if (size % 4 || offset + 8 + size > stat.size) throw new Error('Truncated GLB data');
      offset += 8 + size;
    }
  } finally { await handle.close(); }
}

export function createResourceStore(root, localModelsRoot = null) {
  const location = resource => path.join(root, resource.kind, resource.name);
  const exists = async file => { try { return (await fs.stat(file)).isFile(); } catch { return false; } };
  async function status() {
    const icons = {}, models = {};
    for (const key of catalog.icons) if (await exists(location({ kind: 'icons', name: `${key}.svg` }))) icons[key] = true;
    for (const key of catalog.maps) {
      if (await exists(location({ kind: 'models', name: `${key}.glb` }))) models[key] = 'imported';
      else if (localModelsRoot && await exists(path.join(localModelsRoot, key, `${key}.glb`))) models[key] = 'local';
    }
    return { icons, models };
  }
  async function importFiles(files) {
    const results = [], seen = new Set();
    for (const file of files) {
      const resource = identifyResource(file);
      const result = { name: path.basename(file), ok: false };
      let temporary;
      try {
        if (!resource) throw new Error('Unknown resource filename');
        if (seen.has(resource.name)) throw new Error('Duplicate target in this selection');
        seen.add(resource.name);
        const sourceStat = await fs.stat(file);
        const maxBytes = resource.kind === 'icons' ? 2 * 1024 ** 2 : 1024 ** 3;
        if (!sourceStat.isFile() || sourceStat.size > maxBytes) throw new Error('File exceeds resource size limit');
        const destination = location(resource);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        temporary = `${destination}.${randomUUID()}.tmp`;
        await fs.copyFile(file, temporary);
        await validateResource(temporary, resource);
        // Rename only a validated copy: failed imports leave the old asset intact.
        await fs.rename(temporary, destination);
        result.ok = true;
        result.target = resource.name;
      } catch (error) { result.error = error.message; }
      finally { if (temporary) await fs.rm(temporary, { force: true }).catch(() => {}); }
      results.push(result);
    }
    return { results, status: await status() };
  }
  async function resolve(kind, key) {
    const names = kind === 'icons' ? catalog.icons : kind === 'models' ? catalog.maps : [];
    if (!names.includes(key)) return null;
    const name = `${key}.${kind === 'icons' ? 'svg' : 'glb'}`;
    const imported = location({ kind, name });
    if (await exists(imported)) return imported;
    if (kind === 'models' && localModelsRoot) {
      const local = path.join(localModelsRoot, key, name);
      if (await exists(local)) return local;
    }
    return null;
  }
  return { status, importFiles, resolve };
}
