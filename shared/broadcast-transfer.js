import { digest as fallbackDigest } from 'lib0/hash/sha256';
export const TRANSFER_CHUNK_BYTES = 64 * 1024;
export const MAX_TRANSFER_BYTES = 128 * 1024 * 1024;
export const TRANSFER_PATH = /^\/rooms\/([0-9A-F]{6})\/transfer(?:\/(\d+|complete))?$/i;
export const digest = async bytes => btoa(String.fromCharCode(...(globalThis.crypto?.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)) : fallbackDigest(bytes))));
export function validManifest(value) {
  return value?.version === 1 && /^[a-f0-9]{32}$/.test(value.id) && Number.isSafeInteger(value.bytes)
    && value.bytes > 0 && value.bytes <= MAX_TRANSFER_BYTES && Array.isArray(value.hashes)
    && value.hashes.length === Math.ceil(value.bytes / TRANSFER_CHUNK_BYTES)
    && value.hashes.every(hash => /^[A-Za-z0-9+/]{43}=$/.test(hash));
}
