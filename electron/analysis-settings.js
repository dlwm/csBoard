import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createAnalysisSettings(userData) {
  const file = path.join(userData, 'analysis-settings.json');
  const legacy = path.join(userData, 'parse-performance.json');
  let realtime = false;
  const validate = input => {
    if (!input || typeof input.realtime !== 'boolean' || Object.keys(input).some(key => key !== 'realtime')) throw new Error('Invalid analysis settings');
    return { realtime: input.realtime };
  };
  const write = settings => {
    fs.mkdirSync(userData, { recursive: true });
    const staged = `${file}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(staged, JSON.stringify(settings), { mode: 0o600 }); fs.renameSync(staged, file); }
    finally { if (fs.existsSync(staged)) fs.unlinkSync(staged); }
  };
  try {
    realtime = validate(JSON.parse(fs.readFileSync(file, 'utf8'))).realtime;
    try { fs.unlinkSync(legacy); } catch (error) { if (error.code !== 'ENOENT') console.warn('Old parser settings cleanup failed:', error.message); }
  }
  catch (error) {
    if (error.code !== 'ENOENT') console.warn('Ignoring invalid analysis settings:', error.message);
    else {
      // Migrate only the independent analysis toggle, never parser limits.
      // 仅迁移旧配置中的即时分析开关，解析性能限制不再读取或生效。
      try {
        const previous = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        const settings = { realtime: previous.analysisRealtime === true };
        write(settings); realtime = settings.realtime;
        fs.unlinkSync(legacy);
      } catch (error) { if (error.code !== 'ENOENT') console.warn('Analysis settings migration failed:', error.message); }
    }
  }
  return {
    snapshot: () => ({ realtime }),
    save(input) { const next = validate(input); write(next); realtime = next.realtime; return this.snapshot(); },
  };
}
