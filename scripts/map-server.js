import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maps');
const port = Number(process.env.LOCAL_MAP_PORT) || 3002;
const contentTypes = { '.glb': 'model/gltf-binary', '.nav': 'application/octet-stream' };

const server = http.createServer((request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  if (request.method === 'OPTIONS') return response.writeHead(204).end();
  if (!['GET', 'HEAD'].includes(request.method || '')) return response.writeHead(405).end();

  const pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
  const relative = pathname.replace(/^\/maps\/+/, '');
  const filePath = path.resolve(root, relative);
  if (!pathname.startsWith('/maps/') || !filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return response.writeHead(404).end();

  const size = fs.statSync(filePath).size;
  response.writeHead(200, {
    'content-length': size,
    'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
  });
  if (request.method === 'HEAD') return response.end();
  return fs.createReadStream(filePath).pipe(response);
});

server.listen(port, () => console.log(`CSBoard local maps listening on http://localhost:${port}/maps`));
