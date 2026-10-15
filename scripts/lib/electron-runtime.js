import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const transient = /(?:HTTP(?:Error)?[^\n]*\b(?:408|429|5\d\d)\b|Response code (?:408|429|5\d\d)\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_(?:CONNECT_TIMEOUT|SOCKET)|fetch failed|socket hang up|download timed out)/i;

// Electron 44 downloads lazily at first require(). Prepare explicitly so an
// HTTP failure cannot masquerade as a browser-test failure. Retry only network
// faults; preserve official checksum verification and the package's installer.
// 中文：只重试临时下载错误，不重试校验失败、缺失版本、权限或业务测试失败。
export async function ensureElectronRuntime() {
  const packageFile = require.resolve('electron/package.json');
  const directory = path.dirname(packageFile);
  const { version } = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  async function installed() {
    try {
      const versionFile = await fs.readFile(path.join(directory, 'dist/version'), 'utf8');
      const relative = (await fs.readFile(path.join(directory, 'path.txt'), 'utf8')).trim();
      if (versionFile.trim().replace(/^v/, '') !== version || !relative) return null;
      const executable = path.resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(directory, 'dist'), relative);
      return (await fs.stat(executable)).isFile() ? executable : null;
    } catch { return null; }
  }
  const existing = await installed();
  if (existing) return existing;
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    console.log(`Preparing Electron ${version} (${process.platform}-${process.arch}), attempt ${attempt}/${attempts}`);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(directory, 'install.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, windowsHide: true });
      let output = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 180000);
      for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        stream.on('data', chunk => { target.write(chunk); output = (output + chunk).slice(-16000); });
      }
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, output, timedOut }); });
    });
    const executable = result.code === 0 ? await installed() : null;
    if (executable) return executable;
    const retry = result.timedOut || transient.test(result.output);
    if (!retry || attempt === attempts) {
      throw new Error(`Electron ${version} runtime preparation failed${result.timedOut ? ' (download timed out)' : ''}. ${retry ? `Download still unavailable after ${attempt} attempts; rerun the failed CI job later.` : 'This is not a recognized transient download failure; inspect the installer output above.'} Browser tests have not started.`);
    }
    const delay = [2000, 5000, 10000][attempt - 1];
    console.warn(`Temporary Electron download failure; retrying in ${delay / 1000}s.`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
