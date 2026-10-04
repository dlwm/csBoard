import { prepareAnalysisCache } from './analysis-cache-files.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { encodeStoredValue, decodeStoredValue } from '../shared/storage-codec.js';
const compress = promisify(gzip), decompress = promisify(gunzip);
const LIMIT = 512 * 1024 ** 2;

// Derived results are disposable, separate from Demo caches and saved notes.
export async function withAnalysisCache({ directory, version, realtime }, args, cache, compute) {
  if (realtime) return compute();
  const folder = await prepareAnalysisCache(directory, version);
  const metadata = await cache.listCachedDemos();
  const index = new Map(metadata.map(entry => [entry.id, entry]));
  const inputs = args.ids.map(id => {
    const entry = index.get(id);
    return [id, entry?.updatedAt, entry?.parserRevision, entry?.cacheSchemaVersion, entry?.dataBytes];
  });
  const key = createHash('sha256').update(JSON.stringify([args, inputs])).digest('hex');
  const file = path.join(folder, `${key}.json.gz`);
  try {
    const result = decodeStoredValue((await decompress(await fs.readFile(file))).toString('utf8'));
    if (!['rows', 'deaths', 'utilities'].every(field => Array.isArray(result?.[field]))) throw new Error('Invalid analysis cache');
    await fs.utimes(file, new Date(), new Date()).catch(() => {});
    return result;
  } catch (error) {
    if (error.code !== 'ENOENT') await fs.rm(file, { force: true });
  }
  const result = await compute();
  const diagnostics = result.utilityDiagnostics;
  if (diagnostics?.missingRounds || diagnostics?.loadedDemos !== diagnostics?.requestedDemos) return result;
  const staged = `${file}.${randomUUID()}.tmp`;
  try {
    const bytes = await compress(encodeStoredValue(result));
    if (bytes.length > LIMIT) return result;
    await fs.writeFile(staged, bytes, { mode: 0o600 });
    await fs.rename(staged, file);
    const entries = await Promise.all((await fs.readdir(folder)).filter(name => name.endsWith('.json.gz')).map(async name => {
      const location = path.join(folder, name), stat = await fs.stat(location);
      return { location, bytes: stat.size, used: stat.mtimeMs };
    }));
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of entries.sort((a, b) => a.used - b.used)) {
      if (total <= LIMIT) break;
      await fs.rm(entry.location, { force: true }); total -= entry.bytes;
    }
  } catch (error) { console.warn('Analysis cache write failed:', error.message); }
  finally { await fs.rm(staged, { force: true }); }
  return result;
}
