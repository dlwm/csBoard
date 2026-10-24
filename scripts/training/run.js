import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { STUDY_SCHEMA, createStudyEncoder } from './dataset.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('make study [ARGS="--prepare | --config path"]\nWindows: double-click tools/training/Start.cmd\nDefault input: .local/utility-study/demos; results: .local/utility-study/results');
  process.exit(0);
}
if (args.some((arg, i) => !['--prepare', '--config'].includes(arg) && args[i - 1] !== '--config')) throw Error('Unknown option; use --help');
if (args.includes('--config') && (!args[args.indexOf('--config') + 1] || args[args.indexOf('--config') + 1].startsWith('--'))) throw Error('--config requires a file');
process.chdir(root);
const resolve = value => path.resolve(root, value);
const defaultConfig = 'config/training/utility-study.example.json';
const config = JSON.parse(await fs.readFile(resolve(args.includes('--config') ? args[args.indexOf('--config') + 1] : defaultConfig), 'utf8'));
const range = (name, min, max) => { if (!Number.isFinite(config[name]) || config[name] < min || config[name] > max) throw Error(`Invalid config: ${name}`); };
for (const [key, min, max] of [['threads', 1, 16], ['goMemoryMiB', 512, 8192], ['nodeMemoryMiB', 1024, 8192], ['windowSeconds', 1, 30], ['timeoutMinutes', 1, 240], ['maxDemoMiB', 1, 8192]]) range(key, min, max);
if (!Number.isInteger(config.threads) || ![1, 2, 4, 8].includes(config.sampleRate) || !Array.isArray(config.maps) || !config.maps.every(value => typeof value === 'string') || !Array.isArray(config.horizonsSeconds) || !config.horizonsSeconds.length || !config.horizonsSeconds.every(value => Number.isFinite(value) && value >= 1 && value <= 60)) throw Error('Invalid map, sampling or horizon configuration');
if (!config.matchGroups || typeof config.matchGroups !== 'object' || Array.isArray(config.matchGroups) || !Object.values(config.matchGroups).every(value => typeof value === 'string' && value.length)) throw Error('matchGroups must map relative Demo paths to nonempty series/group names');
if (typeof config.input !== 'string' || !config.input || typeof config.output !== 'string' || !config.output) throw Error('Input and output directories are required');
const base = resolve('.local/utility-study'), input = resolve(config.input), output = resolve(config.output);
if (input === output || input.startsWith(`${output}${path.sep}`) || output.startsWith(`${input}${path.sep}`)) throw Error('Demo input and results must be separate directories');
await fs.mkdir(input, { recursive: true }); await fs.mkdir(output, { recursive: true }); await fs.mkdir(base, { recursive: true });
const binaryPlatform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform;
const binary = resolve(`build/go-parser/native/${binaryPlatform}-${process.arch}/csboard-go-parser${process.platform === 'win32' ? '.exe' : ''}`);
const exists = async file => fs.access(file).then(() => true, () => false);
function command(program, argv) {
  const result = spawnSync(program, argv, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw Error(`Command failed: ${program}. ${result.error?.message || `Exit ${result.status}`}`);
}
if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Install Node.js 24 or newer, then restart this tool.');
if (args.includes('--prepare')) {
  command('git', ['--version']); command('go', ['version']); command('tar', ['--version']);
  command(process.execPath, ['scripts/build-go-parser.js']);
  console.log(`\nEnvironment prepared. Put match .dem files in:\n${input}\nThen run make study, or double-click Start.cmd again.`);
  process.exit(0);
}
if (!await exists(binary)) throw Error('Native parser is missing. Run make study ARGS=--prepare (Windows: Start.cmd offers preparation).');
command('tar', ['--version']);
async function* files(directory) {
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) yield* files(file);
    else if (item.isFile()) yield file;
  }
}
async function digest(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
const sourceFiles = []; for (const directory of ['src/demo', 'src/formats', 'packages/viewer/src/data', 'shared', 'scripts/training']) for await (const file of files(resolve(directory))) if (file.endsWith('.js')) sourceFiles.push(file);
sourceFiles.push(resolve('electron/native-client.js'));
const code = createHash('sha256'); for (const file of sourceFiles.sort()) code.update(path.relative(root, file).replaceAll('\\', '/')).update(await fs.readFile(file));
const sourceFingerprint = createHash('sha256').update(JSON.stringify({ schema: STUDY_SCHEMA, config, code: code.digest('hex'), binary: await digest(binary) })).digest('hex');
const lockPath = path.join(base, 'running.lock');
let lock;
try { lock = await fs.open(lockPath, 'wx'); await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
catch { throw Error(`Another study may be running. If the previous run was interrupted, confirm it has exited before removing ${lockPath}.`); }
let child, stopping = false;
function stopChild() {
  if (!child) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
}
process.on('SIGINT', () => { stopping = true; stopChild(); });
process.on('SIGTERM', () => { stopping = true; stopChild(); });
try {
  const keyFile = path.join(base, 'identity.key');
  if (!await exists(keyFile)) await fs.writeFile(keyFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  const salt = (await fs.readFile(keyFile, 'utf8')).trim(), encode = createStudyEncoder(salt);
  const fingerprint = createHash('sha256').update(sourceFingerprint).update(salt).digest('hex');
  const exportDir = path.join(output, 'export', fingerprint.slice(0, 16));
  const scratch = path.join(output, 'work');
  await fs.mkdir(exportDir, { recursive: true }); await fs.mkdir(scratch, { recursive: true });
  const demos = []; for await (const file of files(input)) if (/\.dem$/i.test(file)) demos.push(file);
  if (!demos.length) { console.log(`No Demo files yet. Put match .dem files here:\n${input}`); process.exitCode = 0; }
  else {
    console.log(`Found ${demos.length} Demo(s). Sequential parsing; ${config.threads} parser threads; voice disabled.`);
    console.log('Memory values are soft targets, not hard caps. Close the application and other heavy tasks while collecting.');
    const reports = [], failures = [], seen = new Set();
    for (let i = 0; i < demos.length && !stopping; i++) {
      const file = demos[i], sourceBytes = (await fs.stat(file)).size;
      console.log(`\n[${i + 1}/${demos.length}] ${path.basename(file)} (${Math.round(sourceBytes / 1048576)} MiB)`);
      if (sourceBytes > config.maxDemoMiB * 1048576) { failures.push({ item: i + 1, reason: 'source-exceeds-configured-size-limit' }); continue; }
      const space = await fs.statfs(output);
      if (Number(space.bavail) * Number(space.bsize) < Math.max(5 * 1024 ** 3, sourceBytes * 4)) throw Error('Insufficient free disk space. Free space and rerun; completed Demo outputs are retained.');
      const sourceHash = await digest(file), demoId = sourceHash.slice(0, 24);
      if (seen.has(sourceHash)) { console.log('Duplicate content; skipped.'); continue; } seen.add(sourceHash);
      const relative = path.relative(input, file).replaceAll('\\', '/');
      const groupId = encode.token(`group:${config.matchGroups[relative] || sourceHash}`);
      const bucket = parseInt(groupId.slice(0, 8), 16) % 10;
      const split = bucket < 8 ? 'train' : bucket === 8 ? 'validation' : 'test';
      const target = path.join(exportDir, demoId), staging = path.join(scratch, demoId);
      const completeFile = path.join(target, 'complete.json');
      let cached = false;
      if (await exists(completeFile)) {
        try {
          const complete = JSON.parse(await fs.readFile(completeFile, 'utf8'));
          cached = complete.fingerprint === fingerprint;
          for (const [name, checksum] of Object.entries(complete.files)) if (await digest(path.join(target, name)) !== checksum) cached = false;
          if (cached) reports.push(JSON.parse(await fs.readFile(path.join(target, 'report.json'), 'utf8')));
        } catch { cached = false; }
      }
      if (cached) { console.log('Completed output verified; resumed.'); continue; }
      await fs.rm(staging, { recursive: true, force: true }); await fs.mkdir(staging, { recursive: true });
      const jobFile = path.join(scratch, `${demoId}.job.json`);
      await fs.writeFile(jobFile, JSON.stringify({ file, binary, sourceHash, sourceBytes, demoId, groupId, split, staging, salt, config }), { mode: 0o600 });
      let status;
      try {
        status = await new Promise((resolveJob, reject) => {
          child = spawn(process.execPath, [`--max-old-space-size=${config.nodeMemoryMiB}`, resolve('scripts/training/parse-demo.js'), jobFile],
            { cwd: root, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32' });
          const timeout = setTimeout(stopChild, config.timeoutMinutes * 60_000);
          child.once('error', error => { clearTimeout(timeout); child = null; reject(error); });
          child.once('close', (code, signal) => { clearTimeout(timeout); child = null; resolveJob({ code, signal }); });
        });
      } finally { await fs.rm(jobFile, { force: true }); }
      if (status.code !== 0) { failures.push({ demoId, reason: stopping ? 'cancelled' : `worker-exit-${status.code ?? status.signal}` }); continue; }
      const report = JSON.parse(await fs.readFile(path.join(staging, 'report.json'), 'utf8'));
      const checksums = {}; for (const name of await fs.readdir(staging)) checksums[name] = await digest(path.join(staging, name));
      await fs.writeFile(path.join(staging, 'complete.json'), JSON.stringify({ fingerprint, files: checksums }, null, 2));
      await fs.rm(target, { recursive: true, force: true }); await fs.rename(staging, target); reports.push(report);
    }
    const gpu = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'], { encoding: 'utf8', windowsHide: true });
    const manifest = { schemaVersion: STUDY_SCHEMA, createdAt: new Date().toISOString(), fingerprint,
      purpose: 'observational utility study data collection; no trained model or causal claims',
      machine: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), memoryGiB: Math.round(os.totalmem() / 1024 ** 3), gpu: gpu.status === 0 ? gpu.stdout.trim() : null },
      settings: Object.fromEntries(Object.entries(config).filter(([key]) => !['input', 'output', 'matchGroups'].includes(key))),
      completed: reports.map(report => report.demoId), failures,
      qualityWarnings: reports.flatMap(report => (report.qualityWarnings || []).map(code => ({ demoId: report.demoId, code }))),
      totals: { demos: reports.length, rounds: reports.reduce((n, report) => n + report.rounds.length, 0), windows: reports.reduce((n, report) => n + report.windows, 0) },
      splits: Object.fromEntries(['train', 'validation', 'test'].map(split => [split, reports.filter(report => report.split === split).length])),
      warnings: ['Demo-group split only. Configure matchGroups for maps from the same match/series.', 'No visibility knowledge reconstruction or measured causal labels.', 'Player identifiers are pseudonymized; coordinates and play patterns remain identifiable. Share only with intended recipients.'] };
    await fs.writeFile(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(exportDir, 'SUMMARY.txt'), `CSBoard utility study\nCompleted demos: ${manifest.totals.demos}\nRounds: ${manifest.totals.rounds}\nDecision windows: ${manifest.totals.windows}\nFailed/skipped items: ${failures.length}\nSplits: ${JSON.stringify(manifest.splits)}\n\nThis is a data preparation bundle, not a trained model or evidence of causal benefit.\nKeep originals locally for follow-up. Do not share identity.key or work/*.job.json.\n`);
    const archive = path.join(output, `csboard-study-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.tar.gz`);
    if (reports.length && !stopping) {
      const listFile = path.join(scratch, 'archive-files.txt');
      await fs.writeFile(listFile, ['manifest.json', 'SUMMARY.txt', ...reports.map(report => report.demoId)].join('\n') + '\n');
      command('tar', ['-czf', archive, '-C', exportDir, '-T', listFile]);
      await fs.writeFile(`${archive}.sha256`, `${await digest(archive)}  ${path.basename(archive)}\n`);
      console.log(`\nSend this bundle and its .sha256 file:\n${archive}`);
    }
    console.log(`\nCompleted ${reports.length}; failed/skipped ${failures.length}. Rerunning resumes completed Demo outputs.`);
    if (failures.length || stopping) process.exitCode = stopping ? 130 : 2;
  }
} finally { stopChild(); await lock.close(); await fs.rm(lockPath, { force: true }); }
