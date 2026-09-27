import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serialize, deserialize } from 'node:v8';
import { randomUUID } from 'node:crypto';

export function createTransferStore() {
  let directory;
  let pending = Promise.resolve();
  return {
    async get(key) {
      if (!directory) return undefined;
      try { return deserialize(await fs.readFile(path.join(await directory, key))); }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    },
    async put(key, value) {
      directory ||= fs.mkdtemp(path.join(os.tmpdir(), 'csboard-transfer-'));
      const root = await directory;
      const temporary = path.join(root, `${key}.${randomUUID()}.tmp`);
      await fs.writeFile(temporary, serialize(value));
      await fs.rename(temporary, path.join(root, key));
    },
    run(action) {
      const next = pending.catch(() => {}).then(action);
      pending = next;
      return next;
    },
    async dispose() { await pending.catch(() => {}); if (directory) await fs.rm(await directory, { recursive: true, force: true }); },
  };
}
