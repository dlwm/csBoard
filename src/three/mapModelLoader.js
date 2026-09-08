// Tries model sources in priority order. Electron uses this to prefer its
// packaged GLB while retaining OSS as a per-file recovery path.
export function loadMapModel(loader, bases, relativePath, onLoad, onProgress, onError, onFallback) {
  const candidates = [...new Set((bases || []).filter(Boolean))];
  const failures = [];

  const attempt = (index) => {
    if (index >= candidates.length) {
      const lastError = failures.at(-1)?.error || new Error(`No model source for ${relativePath}`);
      onError?.(lastError, failures);
      return;
    }
    const base = candidates[index].replace(/\/$/, '');
    const url = `${base}/${relativePath.replace(/^\/+/, '')}`;
    loader.load(url, onLoad, onProgress, (error) => {
      failures.push({ url, error });
      if (index + 1 < candidates.length) {
        onFallback?.({ failedUrl: url, nextBase: candidates[index + 1], error });
        attempt(index + 1);
      } else onError?.(error, failures);
    });
  };

  attempt(0);
}
