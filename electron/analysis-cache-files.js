import fs from 'node:fs/promises';
import path from 'node:path';

export async function prepareAnalysisCache(directory, version) {
  const current = `v${version}-format2`;
  await fs.mkdir(path.join(directory, current), { recursive: true });
  for (const name of await fs.readdir(directory)) {
    if (name !== current) await fs.rm(path.join(directory, name), { recursive: true, force: true });
  }
  const folder = path.join(directory, current);
  for (const name of await fs.readdir(folder)) {
    if (!name.endsWith('.tmp')) continue;
    const file = path.join(folder, name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > 10 * 60_000) await fs.rm(file, { force: true });
  }
  return folder;
}

