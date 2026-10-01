import { ipcMain, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeAiConfig, openChatResponse, readChatResponse } from '../shared/ai-protocol.js';

export function registerAiService({ app, authorize }) {
  const file = path.join(app.getPath('userData'), 'ai-config.json');
  const requests = new Map();
  let configQueue = Promise.resolve();
  const read = async () => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  const publicConfig = data => ({ endpoint: data.endpoint || 'https://api.openai.com/v1', model: data.model || '', hasKey: Boolean(data.secret), imageInput: data.imageInput === true });
  ipcMain.handle('ai:config', async event => { authorize(event); await configQueue; return publicConfig(await read()); });
  ipcMain.handle('ai:save', (event, input) => {
    authorize(event);
    const job = configQueue.catch(() => {}).then(async () => {
      const previous = await read();
      const normalized = normalizeAiConfig(input);
      let secret = previous.secret;
      if (previous.endpoint !== normalized.endpoint && !normalized.apiKey) secret = undefined;
      if (input.clearKey) secret = undefined;
      if (normalized.apiKey) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('System credential encryption is unavailable');
        secret = safeStorage.encryptString(normalized.apiKey).toString('base64');
      }
      const data = { endpoint: normalized.endpoint, model: normalized.model, imageInput: normalized.imageInput, ...(secret ? { secret } : {}) };
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await fs.rename(temporary, file);
      return publicConfig(data);
    });
    configQueue = job.catch(() => {}); return job;
  });
  ipcMain.handle('ai:cancel', (event, id) => { authorize(event); requests.get(id)?.abort(); });
  ipcMain.handle('ai:complete', async (event, id, payload) => {
    authorize(event);
    if (typeof id !== 'string' || id.length > 100 || requests.size || requests.has(id)) throw new Error('AI request already running');
    const controller = new AbortController(); requests.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      await configQueue; const data = await read();
      const apiKey = data.secret ? safeStorage.decryptString(Buffer.from(data.secret, 'base64')) : '';
      const response = await openChatResponse({ ...data, apiKey }, payload, { signal: controller.signal });
      return await readChatResponse(response, { signal: controller.signal, onDelta: text => { if (!event.sender.isDestroyed()) event.sender.send('ai:delta', { id, text }); } });
    } finally { clearTimeout(timeout); requests.delete(id); }
  });
  app.on('will-quit', () => { for (const controller of requests.values()) controller.abort(); });
  return { cancelAll: () => { for (const controller of requests.values()) controller.abort(); } };
}
