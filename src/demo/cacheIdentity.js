// Stable Demo identity shared by every storage driver.
export function demoCacheId(files, sampleRate = 8, kind = 'match') {
  return `${kind === 'recording' ? 'recording|' : ''}${sampleRate}hz|${[...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })).map((file) => `${file.name}:${file.size}:${/^[a-f0-9]{64}$/.test(file.contentHash || '') ? `sha256-${file.contentHash}` : file.lastModified}`).join('|')}`;
}
