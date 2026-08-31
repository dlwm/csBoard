import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { parseEvents, parseHeader, parseTicks } from '@laihoe/demoparser2';
import { createHttpHandler } from './core/http.js';
import { createYjsRoom, handleYjsMessage, removeSocketAwareness, sendSyncStep1 } from './core/yjs.js';

const PORT = Number(process.env.PORT) || 3001;
const ROOM_EXPIRY_MS = 300_000;
const ROOM_PATH = /^\/rooms\/([0-9A-F]{6})$/i;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const LOCAL_MAPS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maps');
const env = { MAP_BASE_URL: process.env.MAP_BASE_URL || '' };
const handleHttp = createHttpHandler({
  parseHeader,
  parseEvents,
  parseTicks: (bytes, props, ticks) => parseTicks(bytes, props, ticks, null, false),
});
const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) {
    const clients = new Set();
    const room = { clients, expiry: null };
    room.yjs = createYjsRoom({
      broadcast: (message, except) => clients.forEach((socket) => {
        if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(message);
      }),
    });
    rooms.set(name, room);
  }
  const room = rooms.get(name);
  if (room.expiry) clearTimeout(room.expiry);
  room.expiry = null;
  return room;
}

function requestFromNode(request) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value != null) headers.set(name, value);
  });
  const init = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = Readable.toWeb(request);
    init.duplex = 'half';
  }
  return new Request(`http://${request.headers.host || `localhost:${PORT}`}${request.url}`, init);
}

async function sendNodeResponse(response, target) {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  if (!response.body) return target.end();
  return Readable.fromWeb(response.body).pipe(target);
}

const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

function localMapResponse(pathname) {
  const relative = pathname.replace(/^\/maps\/+/, '');
  const filePath = path.resolve(LOCAL_MAPS_DIR, relative);
  if (!filePath.startsWith(`${LOCAL_MAPS_DIR}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return new Response('Local map resource not found', { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), { headers: { 'content-length': String(fs.statSync(filePath).size), 'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' } });
}

function staticResponse(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST_DIR, relative);
  if (!filePath.startsWith(`${DIST_DIR}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(filePath)) return new Response('Frontend build not found. Run npm run build.', { status: 503 });
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), { headers: { 'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' } });
}

const server = http.createServer(async (request, response) => {
  try {
    const webRequest = requestFromNode(request);
    const pathname = new URL(webRequest.url).pathname;
    if (request.method === 'GET' && pathname.startsWith('/maps/')) return await sendNodeResponse(localMapResponse(pathname), response);
    const handled = await handleHttp(webRequest, env);
    await sendNodeResponse(handled || staticResponse(pathname), response);
  } catch (error) {
    await sendNodeResponse(Response.json({ error: error.message }, { status: 500 }), response);
  }
});

const sockets = new WebSocketServer({ noServer: true });
sockets.on('connection', (socket, _request, roomName) => {
  const room = getRoom(roomName);
  socket.awarenessMetadata = { awarenessClients: [] };
  room.clients.add(socket);
  sendSyncStep1(room.yjs, socket);
  socket.on('message', (message) => {
    try {
      handleYjsMessage(room.yjs, socket, message, () => socket.awarenessMetadata, (metadata) => { socket.awarenessMetadata = metadata; });
    } catch {
      socket.close(1003, 'Invalid collaboration message');
    }
  });
  socket.on('close', () => {
    removeSocketAwareness(room.yjs, socket, socket.awarenessMetadata);
    room.clients.delete(socket);
    if (!room.clients.size) room.expiry = setTimeout(() => { if (!room.clients.size) { room.yjs.doc.destroy(); rooms.delete(roomName); } }, ROOM_EXPIRY_MS);
  });
});

server.on('upgrade', (request, socket, head) => {
  const match = request.url?.match(ROOM_PATH);
  if (!match) return socket.destroy();
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request, match[1].toUpperCase()));
});

server.listen(PORT, () => console.log(`CSBoard Node server listening on http://localhost:${PORT}`));
