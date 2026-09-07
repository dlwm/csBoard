// Groups obvious numbered fragments while keeping unrelated selected demos as separate jobs.
export function groupDemoFiles(files) {
  const sorted = [...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const numbered = new Map();
  const standalone = [];
  sorted.forEach((file) => {
    // Platform exports commonly use `_0/_1`, while tournament downloads often use `-p1/-p2`.
    const match = file.name.match(/^(.*?)(?:[_-](p(?:art)?)(\d+)|[_-](\d+))\.dem$/i);
    if (!match) { standalone.push([file]); return; }
    const oneBased = Boolean(match[2]);
    const key = `${match[1].toLowerCase()}|${oneBased ? 'p' : 'n'}`;
    if (!numbered.has(key)) numbered.set(key, []);
    numbered.get(key).push({ file, index: Number(match[3] || match[4]), firstIndex: oneBased ? 1 : 0 });
  });
  numbered.forEach((parts) => {
    parts.sort((left, right) => left.index - right.index);
    const firstIndex = parts[0].firstIndex;
    const consecutive = parts.length > 1 && parts[0].index === firstIndex && parts.every((part, index) => part.index === index + firstIndex);
    if (consecutive) standalone.push(parts.map((part) => part.file));
    else parts.forEach((part) => standalone.push([part.file]));
  });
  return standalone.sort((left, right) => left[0].name.localeCompare(right[0].name, undefined, { numeric: true }));
}

export function recommendedDemoParseConcurrency(jobCount, jobs) {
  if (jobCount < 2 || typeof Worker === 'undefined') return 1;
  const cores = Number(navigator.hardwareConcurrency) || 1;
  const memory = Number(navigator.deviceMemory) || null;
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
  const largestSource = Math.max(0, ...jobs.map((job) => job.files.reduce((sum, file) => sum + file.size, 0)));
  // Two WASM parsers can consume substantial memory, so conservative devices stay sequential.
  if (mobile || cores < 4 || (memory != null && memory < 8) || largestSource > 400 * 1024 * 1024) return 1;
  return Math.min(2, jobCount);
}

export function batchTaskLabel(files) {
  if (files.length === 1) return files[0].name;
  const base = files[0].name.replace(/[_-](?:p(?:art)?)?\d+\.dem$/i, '');
  return `${base} (${files.length} parts)`;
}
