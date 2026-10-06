import os from 'node:os';

// Use the complete logical-core budget. A batch shares it across decoders and
// cache writers; RAM estimates never prevent a Demo from starting.
// 使用全部逻辑核心；批量任务共享线程，不再按内存估算阻止启动解析。
export function createParserAllocation(hardware = { cores: os.availableParallelism() }) {
  // The native configure protocol accepts at most 256 threads per process.
  const cores = Math.max(1, Math.trunc(hardware.cores));
  const maxDemos = Math.min(16, cores);
  return {
    admit(task, running) {
      if (task.kind !== 'parse') return {};
      const parsers = running.filter(task => task.kind === 'parse');
      const decoding = parsers.filter(task => !task.metrics?.parserReleased);
      if (decoding.length >= maxDemos) return { waitReason: 'slots' };
      const used = decoding.reduce((sum, task) => sum + task.allocation.threads, 0) + parsers.length - decoding.length;
      const available = cores - used;
      if (available < 1) return { waitReason: 'cpu' };
      const share = Math.max(1, Math.min(maxDemos, task.resources.batchSize || 1));
      const perDemo = Math.floor(cores / share) + Number(decoding.length % share < cores % share);
      return { threads: Math.min(256, available, Math.max(1, perDemo)) };
    },
  };
}
