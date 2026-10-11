import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { navFingerprint, validatePlaceRegions } from '../src/data/mapPlaceRegions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const navRoot = path.join(root, 'src/data/nav'), outputRoot = path.join(root, 'src/data/mapPlaces');
const maps = (await fs.readdir(navRoot)).filter(file => /^[a-z0-9_]+\.json$/.test(file)).map(file => file.slice(0, -5));
const port = Number(process.env.NAV_LABEL_PORT || 5176);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid NAV_LABEL_PORT');
const origin = `http://127.0.0.1:${port}`;
const nav = map => fs.readFile(path.join(navRoot, `${map}.json`), 'utf8').then(JSON.parse);
const server = await createServer({ root, configFile: false, publicDir: false, server: { host: '127.0.0.1', port, strictPort: true, open: '/tools/nav-labels/', fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] } }, plugins: [{ name: 'nav-region-editor', configureServer(server) {
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url, origin);
    if (!url.pathname.startsWith('/__nav-labels/')) return next();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (request.method === 'GET' && url.pathname === '/__nav-labels/maps') { response.end(JSON.stringify(maps)); return; }
      const map = url.searchParams.get('map');
      if (!maps.includes(map)) throw new Error('Unknown map');
      const geometry = await nav(map), file = path.join(outputRoot, `${map}.json`);
      if (request.method === 'GET' && url.pathname === '/__nav-labels/document') {
        let document;
        try { document = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; document = { version: 1, mapName: map, navFingerprint: navFingerprint(geometry), regions: [] }; }
        response.end(JSON.stringify(validatePlaceRegions(document, geometry, map))); return;
      }
      if (request.method !== 'POST' || url.pathname !== '/__nav-labels/save' || request.headers.origin !== origin || !String(request.headers['content-type']).startsWith('application/json')) throw new Error('Invalid editor request');
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) throw new Error('Annotation file is too large'); chunks.push(chunk); }
      const document = validatePlaceRegions(JSON.parse(Buffer.concat(chunks).toString('utf8')), geometry, map);
      document.regions = document.regions.filter(region => region.areaIds.length);
      await fs.mkdir(outputRoot, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify(document, null, 2) + '\n'); await fs.rename(temporary, file); }
      finally { await fs.rm(temporary, { force: true }); }
      response.end(JSON.stringify({ saved: true, regions: document.regions.length, spawnPoints: document.spawnPoints.length, file: `src/data/mapPlaces/${map}.json` }));
    } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error.message })); }
  });
} }] });
await server.listen();
console.log(`NAV 区域标注 / NAV region editor: ${origin}/tools/nav-labels/`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
