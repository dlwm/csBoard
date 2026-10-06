import os from 'node:os';
import { MAX_DESKTOP_PARSERS } from '../shared/parser-limits.js';

const GiB = 1024 ** 3;
const availableMemory = () => typeof process.availableMemory === 'function' ? process.availableMemory() : os.freemem();

// CPU throughput and memory concurrency are separate budgets. Parsing plus
// final cache serialization owns a slot until the whole task finishes.
// CPU 仍可使用全部核心；解析及最终缓存写入共用有界槽位，不因 Go 退出就提前
// 启动更多大任务。内存紧张时退为串行，而不是限制用户一次选择多少文件。
export function createParserAllocation(hardware = { cores: os.availableParallelism(), totalBytes: os.totalmem(), availableBytes: availableMemory }) {
  const cores = Math.max(1, Math.trunc(hardware.cores));
  const totalBytes = Number(hardware.totalBytes) || os.totalmem();
  const maxDemos = Math.min(cores, totalBytes <= 8 * GiB ? 1 : MAX_DESKTOP_PARSERS);
  const reserve = Math.max(GiB, totalBytes * 0.15);
  const freeBytes = () => Math.max(0, typeof hardware.availableBytes === 'function' ? hardware.availableBytes() : Number(hardware.availableBytes ?? availableMemory()));
  const estimate = task => Math.min(2 * GiB, Math.max(512 * 1024 ** 2, (task.resources?.sourceBytes || 0) * 3 + 256 * 1024 ** 2));
  return {
    admit(task, running) {
      if (task.kind !== 'parse') return {};
      const parsers = running.filter(task => task.kind === 'parse');
      if (parsers.length >= maxDemos) return { waitReason: 'slots' };
      const free = freeBytes();
      // Always allow one task to make progress. Low free-memory readings (e.g.
      // macOS file cache) must not leave an idle batch waiting indefinitely.
      if (parsers.length && free < reserve + estimate(task)) return { waitReason: 'memory' };
      const used = parsers.reduce((sum, task) => sum + (task.metrics?.parserReleased ? 1 : task.allocation.threads), 0);
      const available = cores - used;
      if (available < 1) return { waitReason: 'cpu' };
      const share = Math.max(1, Math.min(maxDemos, task.resources?.batchSize || 1, free >= reserve + estimate(task) * 2 ? maxDemos : 1));
      const perDemo = Math.floor(cores / share) + Number(parsers.length % share < cores % share);
      // Go's limit is a GC target, not an RSS hard cap. Leave room for Electron,
      // textures, worker JSON and SQLite; live parser data can exceed this target.
      // Go 软限制仅控制 GC，不能当作硬性内存上限或 OOM 保证。
      const memoryLimitBytes = Math.floor(Math.min(2 * GiB, Math.max(512 * 1024 ** 2, (free - reserve) / share, totalBytes * 0.06)));
      return { threads: Math.min(256, available, Math.max(1, perDemo)), memoryLimitBytes };
    },
  };
}
