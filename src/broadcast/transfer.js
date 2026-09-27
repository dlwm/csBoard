import { digest, MAX_TRANSFER_BYTES, TRANSFER_CHUNK_BYTES, validManifest } from '../../shared/broadcast-transfer.js';
import { getPlatform } from '../platform/index.js';
const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const endpoint = (base, code) => `${base.replace(/^ws/, 'http').replace(/\/$/, '')}/${code}/transfer`;
async function checkedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Archive transfer failed (${response.status})`);
  return response;
}
export async function uploadBroadcast(base, code, archive, signal, progress, state = {}) {
  if (!state.bytes) {
    const encoded = await getPlatform().compute('broadcast.encode', { value: archive }, { signal });
    if (encoded.length > MAX_TRANSFER_BYTES) throw new Error('Broadcast exceeds the 128 MiB transfer limit. Shorten the clip.');
    state.bytes = encoded;
    state.manifest = { version: 1, id: randomHex(16), bytes: state.bytes.length, hashes: [] };
    for (let start = 0; start < state.bytes.length; start += TRANSFER_CHUNK_BYTES) state.manifest.hashes.push(await digest(state.bytes.subarray(start, start + TRANSFER_CHUNK_BYTES)));
    state.secret = randomHex(32);
    state.next = 0;
  }
  const { bytes, manifest, secret } = state;
  const url = endpoint(base, code);
  const headers = { Authorization: `Bearer ${secret}` };
  await checkedFetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manifest, secret }) });
  for (let index = state.next; index < manifest.hashes.length; index++) {
    await checkedFetch(`${url}/${index}`, { method: 'PUT', signal, headers, body: bytes.subarray(index * TRANSFER_CHUNK_BYTES, (index + 1) * TRANSFER_CHUNK_BYTES) });
    state.next = index + 1;
    progress?.((index + 1) / manifest.hashes.length);
  }
  await checkedFetch(`${url}/complete`, { method: 'POST', signal, headers });
  return { version: 1, id: manifest.id, bytes: manifest.bytes, hash: await digest(new TextEncoder().encode(JSON.stringify(manifest))) };
}
export async function downloadBroadcast(base, code, descriptor, signal, progress) {
  if (descriptor?.version !== 1 || !/^[a-f0-9]{32}$/.test(descriptor.id) || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0 || descriptor.bytes > MAX_TRANSFER_BYTES) throw new Error('Invalid broadcast descriptor');
  const url = endpoint(base, code);
  const manifest = await (await checkedFetch(`${url}?id=${descriptor.id}`, { signal })).json();
  if (!validManifest(manifest) || manifest.id !== descriptor.id || manifest.bytes !== descriptor.bytes
    || await digest(new TextEncoder().encode(JSON.stringify(manifest))) !== descriptor.hash) throw new Error('Broadcast manifest changed');
  const bytes = new Uint8Array(manifest.bytes);
  for (let index = 0; index < manifest.hashes.length; index++) {
    const response = await checkedFetch(`${url}/${index}?id=${manifest.id}`, { signal });
    const part = new Uint8Array(await response.arrayBuffer());
    const expected = Math.min(TRANSFER_CHUNK_BYTES, manifest.bytes - index * TRANSFER_CHUNK_BYTES);
    if (part.length !== expected || await digest(part) !== manifest.hashes[index]) throw new Error('Broadcast checksum mismatch');
    bytes.set(part, index * TRANSFER_CHUNK_BYTES);
    progress?.((index + 1) / manifest.hashes.length);
  }
  return getPlatform().compute('broadcast.decode', { bytes }, { signal });
}
