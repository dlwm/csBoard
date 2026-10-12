import JSZip from 'jszip';
import { Zip, ZipDeflate } from 'fflate';
import * as validators from './generated/validators.js';
import { DemoFormatError, requireFormat } from './errors.js';

// Bounds apply before decompression and again during streamed reads. One
// segment is decoded at a time; validation uses compiled functions, not eval.
export const PACKAGE_LIMITS = Object.freeze({ compressed: 256 * 1024 ** 2, expanded: 512 * 1024 ** 2, file: 64 * 1024 ** 2, entries: 2048 });
export const REPLAY_PROFILE_VERSION = validators.REPLAY_PROFILE_VERSION;
const safePath = name => typeof name === 'string' && name.length <= 256 && !name.startsWith('/') && !name.includes('\\') && !name.split('/').some(part => ['.', '..', ''].includes(part)) && !name.includes(':');
export function validateFormat(name, value) {
  const validate = validators[name];
  requireFormat(validate, 'unsupported_contract', `Unknown data contract ${name}`);
  if (!validate(value)) throw new DemoFormatError('invalid_schema', `Invalid ${name}: ${validate.errors?.[0]?.instancePath || '/'} ${validate.errors?.[0]?.message || ''}`, { issues: validate.errors });
  return value;
}

function inspectZip(bytes) {
  requireFormat(bytes.byteLength <= PACKAGE_LIMITS.compressed, 'package_too_large', 'Compressed package exceeds 256 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.byteLength - 22;
  for (; end >= Math.max(0, bytes.byteLength - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.byteLength) break;
  }
  requireFormat(end >= Math.max(0, bytes.byteLength - 65557), 'invalid_zip', 'ZIP central directory is missing');
  requireFormat(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0, 'unsupported_zip', 'Multi-disk packages are not supported');
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  requireFormat(count > 0 && count <= PACKAGE_LIMITS.entries && offset + directorySize <= end, 'invalid_zip', 'ZIP directory bounds are invalid');
  const seen = new Set(), decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < count; index++) {
    requireFormat(offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50, 'invalid_zip', 'Invalid ZIP directory entry');
    const flags = view.getUint16(offset + 8, true), size = view.getUint32(offset + 24, true), length = view.getUint16(offset + 28, true);
    const next = offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    requireFormat(next <= end && !(flags & 1), 'unsupported_zip', 'Encrypted or malformed ZIP entries are not supported');
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + length));
    const canonical = name.endsWith('/') ? name.slice(0, -1) : name;
    requireFormat(safePath(canonical) && !seen.has(name), 'invalid_zip_path', 'ZIP has unsafe or duplicate file paths');
    seen.add(name); total += size;
    requireFormat(size <= PACKAGE_LIMITS.file && total <= PACKAGE_LIMITS.expanded, 'package_too_large', 'Expanded package exceeds its file or total limit');
    offset = next;
  }
  requireFormat(offset <= end, 'invalid_zip', 'ZIP directory is truncated');
}

export async function openPackage(bytes, { signal } = {}) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  inspectZip(bytes); signal?.throwIfAborted();
  const zip = await JSZip.loadAsync(bytes);
  const readJSON = async (name, contract) => {
    signal?.throwIfAborted(); requireFormat(safePath(name), 'invalid_zip_path', 'Invalid package file name');
    const entry = zip.file(name);
    requireFormat(entry, 'missing_file', `Package is missing ${name}`);
    const chunks = []; let size = 0;
    await new Promise((resolve, reject) => {
      const stream = entry.internalStream('uint8array');
      const abort = () => { stream.pause(); reject(signal.reason); };
      const failed = error => { signal?.removeEventListener('abort', abort); reject(error); };
      signal?.addEventListener('abort', abort, { once: true });
      stream.on('data', chunk => {
        size += chunk.byteLength;
        if (size > PACKAGE_LIMITS.file || signal?.aborted) { stream.pause(); failed(new DemoFormatError('package_too_large', 'Package entry exceeds 64 MiB')); return; }
        chunks.push(chunk);
      }).on('error', failed).on('end', () => { signal?.removeEventListener('abort', abort); resolve(); }).resume();
    });
    const content = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
    catch { throw new DemoFormatError('invalid_json', `Package file ${name} contains invalid JSON`); }
    return contract ? validateFormat(contract, value) : value;
  };
  const manifest = await readJSON('manifest.json');
  if (manifest.schemaVersion === REPLAY_PROFILE_VERSION) validateFormat('replayManifest', manifest);
  else if (manifest.schemaVersion === 'cs2-demo-format/3.0') validateFormat('manifest', manifest);
  else throw new DemoFormatError('unsupported_version', `Unsupported package contract ${String(manifest.schemaVersion)}`);
  const paths = [...Object.values(manifest.files), ...(manifest.segments || []).map(segment => segment.file)];
  requireFormat(new Set(paths).size === paths.length && paths.every(safePath), 'invalid_manifest', 'Manifest has duplicate or unsafe file paths');
  requireFormat(paths.every(name => Boolean(zip.file(name))), 'missing_file', 'A file declared in the manifest is missing');
  return { manifest, readJSON };
}

export function createPackageWriter({ signal } = {}) {
  let expanded = 0, compressed = 0, failure;
  const chunks = [], paths = new Set();
  const zip = new Zip((error, chunk) => {
    if (error) { failure = error; return; }
    compressed += chunk.byteLength;
    if (compressed > PACKAGE_LIMITS.compressed) { failure = new DemoFormatError('package_too_large', 'Compressed package exceeds 256 MiB'); return; }
    chunks.push(chunk);
  });
  return {
    add(name, value, contract) {
      signal?.throwIfAborted();
      requireFormat(safePath(name) && !paths.has(name), 'invalid_manifest', 'Duplicate or unsafe output file');
      paths.add(name); requireFormat(paths.size <= PACKAGE_LIMITS.entries, 'package_too_large', 'Package has too many files');
      if (contract) validateFormat(contract, value);
      const bytes = new TextEncoder().encode(JSON.stringify(value)); expanded += bytes.byteLength;
      requireFormat(bytes.byteLength <= PACKAGE_LIMITS.file && expanded <= PACKAGE_LIMITS.expanded, 'package_too_large', 'Expanded package exceeds its file or total limit');
      const file = new ZipDeflate(name, { level: 3 }); zip.add(file); file.push(bytes, true);
      if (failure) throw failure;
    },
    finish() {
      signal?.throwIfAborted(); zip.end(); if (failure) throw failure;
      const result = new Uint8Array(compressed); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
      chunks.length = 0; return result;
    },
  };
}
