import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function cacheBlobPath(root, name) {
  if (!/^[a-f0-9]{64}\.json\.gz$/.test(name)) throw new Error('Invalid cache blob reference');
  return path.join(root, 'blobs', name);
}
export async function readCacheFile(file) {
  const chunks = [];
  const digest = createHash('sha256');
  await pipeline(fs.createReadStream(file), createGunzip(), new Writable({
    write(chunk, _encoding, done) { chunks.push(chunk); digest.update(chunk); done(); },
  }));
  if (`${digest.digest('hex')}.json.gz` !== path.basename(file)) throw new Error('Stored data checksum mismatch');
  return Buffer.concat(chunks).toString('utf8');
}

export function createCacheTransfers(root) {
  const tickets = new Map();
  return {
    issue(reference) {
      if (!reference) return null;
      const now = Date.now();
      for (const [id, value] of tickets) if (value.expires < now) tickets.delete(id);
      if (tickets.size >= 256) tickets.delete(tickets.keys().next().value);
      const id = randomUUID();
      tickets.set(id, { file: cacheBlobPath(root, reference.name), expires: now + 60_000 });
      return `/native-cache/${id}`;
    },
    async serve(request, response, pathname) {
      const id = pathname.slice('/native-cache/'.length);
      const ticket = tickets.get(id);
      tickets.delete(id);
      if (!ticket || ticket.expires < Date.now() || request.method !== 'GET') { response.writeHead(404).end(); return; }
      const digest = createHash('sha256');
      const verify = new Transform({
        transform(chunk, _encoding, done) { digest.update(chunk); done(null, chunk); },
        flush(done) { done(`${digest.digest('hex')}.json.gz` === path.basename(ticket.file) ? null : new Error('Stored data checksum mismatch')); },
      });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
      try { await pipeline(fs.createReadStream(ticket.file), createGunzip(), verify, response); }
      catch { response.destroy(); }
    },
    clear() { tickets.clear(); },
  };
}
