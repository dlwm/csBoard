import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { syncAppVersion } from './lib/app-version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bumps = ['major', 'minor', 'patch'];

function bumpedVersion(current, bump) {
  if (!bumps.includes(bump)) throw new Error('BUMP must be major, minor or patch');
  const parts = current.split('.').map(Number);
  const index = bumps.indexOf(bump);
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  return parts.join('.');
}

async function main() {
  const [bump = '', custom = '', ...extra] = process.argv.slice(2);
  if (extra.length || (bump && custom)) throw new Error('Use make version, make version BUMP=patch, or make version VERSION=1.20.1');
  const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let version;
  if (custom) version = custom;
  else if (bump) version = bumpedVersion(current, bump);
  else {
    if (!process.stdin.isTTY) throw new Error('Interactive version selection needs a terminal; use BUMP=major|minor|patch or VERSION=x.y.z');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(`当前版本 / Current version: ${current}`);
      console.log(`1. 大版本 / Major → ${bumpedVersion(current, 'major')}`);
      console.log(`2. 次版本 / Minor → ${bumpedVersion(current, 'minor')}`);
      console.log(`3. 补丁版本 / Patch → ${bumpedVersion(current, 'patch')}`);
      console.log('4. 自定义 / Custom\n0. 取消 / Cancel');
      let choice;
      do {
        choice = (await prompt.question('请选择 / Select [0–4]: ')).trim();
      } while (!['0', '1', '2', '3', '4'].includes(choice));
      if (choice === '0') { console.log('已取消 / Cancelled'); return; }
      version = choice === '4'
        ? (await prompt.question('版本号 / Version (major.minor.patch): ')).trim()
        : bumpedVersion(current, bumps[Number(choice) - 1]);
    } finally { prompt.close(); }
  }
  // The shared synchronizer validates every destination before writing versions.
  const result = syncAppVersion(root, { version });
  console.log(`${current} → ${result.version}; mobile build ${result.buildNumber}`);
  console.log('版本已同步；未创建提交或标签 / Versions synchronized; no commit or tag created.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
