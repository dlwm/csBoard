import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const GiB = 1024 ** 3, MiB = 1024 ** 2;
export function createParsePerformance(userData, hardware = { cores: Math.min(128, os.availableParallelism()), totalMemory: os.totalmem(), freeMemory: os.freemem }) {
  const file = path.join(userData, 'parse-performance.json');
  const defaults = { mode: 'balanced', maxDemos: Math.min(4, hardware.cores), threadsPerDemo: Math.min(4, hardware.cores), memoryGB: Math.max(0.5, Math.floor(hardware.totalMemory / GiB / 2)), parallelTicks: true, analysisRealtime: false };
  const validate = input => {
    if (!input || !['balanced', 'fast', 'custom'].includes(input.mode) || typeof input.parallelTicks !== 'boolean' || (input.analysisRealtime != null && typeof input.analysisRealtime !== 'boolean')
      || !Number.isInteger(input.maxDemos) || input.maxDemos < 1 || input.maxDemos > Math.min(16, hardware.cores)
      || !Number.isInteger(input.threadsPerDemo) || input.threadsPerDemo < 1 || input.threadsPerDemo > hardware.cores
      || !Number.isFinite(input.memoryGB) || input.memoryGB < 0.5 || input.memoryGB > Math.max(0.5, hardware.totalMemory / GiB - 0.5)) throw new Error('Invalid parser performance settings');
    return { mode: input.mode, maxDemos: input.maxDemos, threadsPerDemo: input.threadsPerDemo, memoryGB: input.memoryGB, parallelTicks: input.parallelTicks, analysisRealtime: input.analysisRealtime ?? false };
  };
  let settings = defaults;
  let memorySample = null;
  const availableMemory = () => memorySample && Date.now() - memorySample.at < 5000 ? Math.min(memorySample.bytes, hardware.totalMemory) : hardware.freeMemory();
  try { settings = validate(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') console.warn('Ignoring invalid parser performance settings:', error.message); }
  function budget() {
    const fast = settings.mode === 'fast', custom = settings.mode === 'custom';
    return {
      cpu: Math.max(1, hardware.cores - (fast || custom ? 0 : 2)),
      maxDemos: custom ? settings.maxDemos : Math.min(fast ? 16 : 8, hardware.cores),
      maxThreads: settings.parallelTicks ? custom ? settings.threadsPerDemo : fast ? hardware.cores : Math.min(4, hardware.cores) : 1,
      memory: custom ? settings.memoryGB * GiB : hardware.totalMemory * (fast ? 0.75 : 0.5),
      reserve: Math.min(hardware.totalMemory * 0.1, (fast ? 256 : 512) * MiB),
    };
  }
  function admit(task, running, queued) {
    if (task.kind !== 'parse') return {};
    const policy = budget();
    const parsers = running.filter(task => task.kind === 'parse');
    const decoding = parsers.filter(task => !task.metrics?.parserReleased);
    if (decoding.length >= policy.maxDemos) return { waitReason: 'slots' };
    // A caching JS worker still needs one CPU share after Go has exited.
    const cpuUsed = decoding.reduce((sum, task) => sum + task.allocation.threads, 0) + parsers.length - decoding.length;
    const cpuLeft = policy.cpu - cpuUsed;
    if (cpuLeft < 1) return { waitReason: 'cpu' };
    const reservation = task => task.metrics?.parserReleased
      ? Math.max(256 * MiB, (task.metrics.workerPeakBytes || 0) * 1.2)
      : Math.max(task.allocation.memoryBytes, (task.metrics?.peakBytes || 0) * 1.2);
    const resident = task => task.metrics?.parserReleased ? task.metrics.workerPeakBytes || 0 : task.metrics?.peakBytes || 0;
    const reserved = parsers.reduce((sum, task) => sum + reservation(task), 0);
    // Subtract only the unallocated part of reservations: observed RSS already
    // reduces OS free memory. The budget controls admission, not an OS hard limit.
    const unallocated = parsers.reduce((sum, task) => sum + Math.max(0, reservation(task) - resident(task)), 0);
    const available = Math.max(0, Math.min(policy.memory - reserved, availableMemory() - policy.reserve - unallocated));
    const sourceBytes = task.resources.sourceBytes;
    const base = 1.5 * GiB + sourceBytes * (task.resources.sampleRate >= 16 ? 12 : 8);
    const minimum = base + 96 * MiB;
    if (minimum > policy.memory) return { error: new Error('This Demo exceeds the parser memory budget. Increase the budget in Desktop → Performance, or use a lower sampling rate.') };
    const fairShare = Math.max(1, Math.min(policy.maxDemos, task.resources.batchSize || 1, Math.floor((available + reserved) / minimum)));
    const fairMemoryThreads = Math.max(1, Math.floor(((available + reserved) / fairShare - base) / (96 * MiB)));
    let threads = Math.min(policy.maxThreads, cpuLeft, Math.max(1, Math.floor(policy.cpu / fairShare)), fairMemoryThreads);
    while (threads > 1 && base + threads * 96 * MiB > available) threads--;
    const memoryBytes = base + threads * 96 * MiB;
    if (memoryBytes > available) return { waitReason: 'memory' };
    return { threads, memoryBytes, parallelTicks: settings.parallelTicks };
  }
  return {
    admit,
    sampleMemory(bytes) { if (Number.isFinite(bytes) && bytes > 0) memorySample = { bytes, at: Date.now() }; },
    snapshot: () => ({ settings, hardware: { cores: hardware.cores, totalMemory: hardware.totalMemory, freeMemory: availableMemory() }, budget: budget() }),
    save(input) {
      const next = validate(input);
      fs.mkdirSync(userData, { recursive: true });
      const staged = `${file}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(staged, JSON.stringify(next), { mode: 0o600 }); fs.renameSync(staged, file); }
      finally { if (fs.existsSync(staged)) fs.unlinkSync(staged); }
      settings = next;
      return this.snapshot();
    },
  };
}
