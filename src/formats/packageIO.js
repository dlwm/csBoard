import { Zip, ZipDeflate } from 'fflate';
import { PACKAGE_LIMITS, validateFormat, safePath } from '../../packages/viewer/src/formats/packageReader.js';
import { DemoFormatError, requireFormat } from './errors.js';
export { openPackage, PACKAGE_LIMITS, REPLAY_PROFILE_VERSION, validateFormat } from '../../packages/viewer/src/formats/packageReader.js';

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
