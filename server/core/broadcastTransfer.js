import { digest, TRANSFER_CHUNK_BYTES, validManifest } from '../../shared/broadcast-transfer.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Cache-Control': 'no-store' };
const json = (body, status = 200) => Response.json(body, { status, headers: cors });

async function readBounded(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty transfer body');
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Transfer body too large');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

// One immutable payload per room; each 64 KiB chunk is verified before storage.
// The Yjs document carries only the published manifest, never archive bytes.
export async function handleBroadcastTransfer(request, part, store) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const current = await store.get('transfer-meta');
    if (request.method === 'POST' && !part) {
      const input = JSON.parse(new TextDecoder().decode(await readBounded(request, 160 * 1024)));
      if (!validManifest(input.manifest) || !/^[a-f0-9]{64}$/.test(input.secret)) return json({ error: 'Invalid transfer manifest' }, 400);
      if (current) {
        if (current.secret === input.secret && JSON.stringify(current.manifest) === JSON.stringify(input.manifest)) return json({ ok: true });
        return json({ error: 'Room already has a transfer' }, 409);
      }
      const { version, id, bytes, hashes } = input.manifest;
      await store.put('transfer-meta', { manifest: { version, id, bytes, hashes }, secret: input.secret, complete: false });
      return json({ ok: true }, 201);
    }
    if (!current) return json({ error: 'Transfer unavailable' }, 404);
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      if (id !== current.manifest.id || !current.complete) return json({ error: 'Transfer unavailable' }, 404);
      if (!part) return json(current.manifest);
      if (!/^\d+$/.test(part) || Number(part) >= current.manifest.hashes.length) return json({ error: 'Invalid chunk' }, 400);
      const bytes = await store.get(`transfer-${Number(part)}`);
      return bytes ? new Response(bytes, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } }) : json({ error: 'Missing chunk' }, 404);
    }
    if (request.headers.get('Authorization') !== `Bearer ${current.secret}`) return json({ error: 'Invalid upload token' }, 403);
    if (request.method === 'POST' && part === 'complete') {
      for (let index = 0; index < current.manifest.hashes.length; index++) {
        if (!await store.get(`transfer-${index}`)) return json({ error: 'Incomplete transfer' }, 409);
      }
      await store.put('transfer-meta', { ...current, complete: true });
      return json({ ok: true });
    }
    if (request.method !== 'PUT' || !/^\d+$/.test(part || '') || current.complete) return json({ error: 'Transfer is immutable' }, 409);
    const index = Number(part);
    if (index >= current.manifest.hashes.length) return json({ error: 'Invalid chunk' }, 400);
    const bytes = await readBounded(request, TRANSFER_CHUNK_BYTES);
    const expected = Math.min(TRANSFER_CHUNK_BYTES, current.manifest.bytes - index * TRANSFER_CHUNK_BYTES);
    if (bytes.length !== expected || await digest(bytes) !== current.manifest.hashes[index]) return json({ error: 'Chunk checksum mismatch' }, 400);
    await store.put(`transfer-${index}`, bytes);
    return json({ ok: true });
  } catch (error) { return json({ error: error.message }, 400); }
}
