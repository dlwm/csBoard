import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAPS = ['de_dust2', 'de_mirage', 'de_nuke', 'de_ancient', 'de_anubis', 'de_cache', 'de_inferno', 'de_overpass', 'de_train', 'de_vertigo'];
const PUBLIC_DIR = path.join(projectRoot, 'public', 'maps');

function readLocalEnv(name) {
  for (const filename of ['.env.local', '.env']) {
    const filePath = path.join(projectRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const line = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).find((entry) => entry.match(new RegExp(`^\\s*${name}\\s*=`)));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return '';
}

const configuredBase = process.env.MAP_DOWNLOAD_BASE_URL
  || process.env.VITE_OSS_BASE_URL
  || readLocalEnv('MAP_DOWNLOAD_BASE_URL')
  || readLocalEnv('VITE_OSS_BASE_URL');
if (!configuredBase) {
  console.error('未配置地图下载源。请在 .env.local 中设置 VITE_OSS_BASE_URL，或设置 MAP_DOWNLOAD_BASE_URL 环境变量。');
  process.exit(1);
}
if (!/^https?:\/\//.test(configuredBase)) {
  console.error('地图下载源必须是完整的 HTTP(S) 地址。');
  process.exit(1);
}
const BASE = `${configuredBase.replace(/\/$/, '')}/maps`;

async function ensureFile(map, ext) {
  const dir = path.join(PUBLIC_DIR, map);
  const dest = path.join(dir, `${map}${ext}`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'ok';
  fs.mkdirSync(dir, { recursive: true });
  const url = `${BASE}/${map}/${map}${ext}`;
  const response = await fetch(url);
  if (!response.ok) { console.log(`  ${map}${ext}: 远端缺失 (${response.status})，跳过`); return 'skip'; }
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const out = createWriteStream(dest);
  let received = 0;
  console.log(`  ${map}${ext}: 下载中…`);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise((resolve) => out.once('drain', resolve));
      received += value.length;
      if (total > 0) {
        const percent = Math.min(100, Math.round((received / total) * 100));
        process.stdout.write(`\r     ${map}${ext} ${percent}% (${(received / 1048576).toFixed(1)}MB / ${(total / 1048576).toFixed(1)}MB)`);
      }
    }
    process.stdout.write('\r'.padEnd(90) + '\r');
    console.log(`  ${map}${ext}: 完成 (${(received / 1048576).toFixed(1)}MB)`);
  } finally {
    reader.cancel().catch(() => {});
    out.end();
  }
  return 'downloaded';
}

async function main() {
  console.log('检查本地地图资源…');
  for (const map of MAPS) {
    console.log(`${map}:`);
    await ensureFile(map, '.nav');
    await ensureFile(map, '.glb');
  }
  console.log('地图资源检查完成。');
}

main().catch((error) => { console.error('资源检查失败：', error); process.exit(1); });
