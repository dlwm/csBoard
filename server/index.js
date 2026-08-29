import parserModule from '../src/wasm/demoparser2_bg.wasm';
import { initSync, parseEvents, parseHeader, parseTicks } from '../src/wasm/demoparser2.js';
import { createHttpHandler } from './core/http.js';
import { createYjsRoom, handleYjsMessage, removeSocketAwareness, sendSyncStep1 } from './core/yjs.js';

initSync({ module: parserModule });

const ROOM_EXPIRY_MS = 300_000;
const ROOM_PATH = /^\/rooms\/([0-9A-F]{6})$/i;
const json = (body, status = 200) => Response.json(body, { status });
const handleHttp = createHttpHandler({
  parseHeader,
  parseEvents,
  parseTicks: (bytes, props, ticks) => parseTicks(bytes, props, new Int32Array(ticks), null, false),
});

export class RoomDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get('document');
      this.initializeRoom(stored);
    });
  }

  initializeRoom(initialUpdate) {
    this.room?.doc.destroy();
    this.room = createYjsRoom({
      initialUpdate,
      broadcast: (message, except) => {
        this.ctx.getWebSockets().forEach((socket) => {
          if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(message);
        });
      },
      persist: (update) => this.ctx.waitUntil(this.ctx.storage.put('document', update)),
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: '需要 WebSocket 连接' }, 426);
    await this.ctx.storage.deleteAlarm();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ awarenessClients: [] });
    sendSyncStep1(this.room, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    try {
      handleYjsMessage(this.room, socket, message, () => socket.deserializeAttachment(), (metadata) => socket.serializeAttachment(metadata));
    } catch {
      socket.close(1003, 'Invalid collaboration message');
    }
  }

  webSocketClose(socket) {
    removeSocketAwareness(this.room, socket, socket.deserializeAttachment());
    if (!this.ctx.getWebSockets().some((client) => client.readyState === WebSocket.OPEN)) this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRY_MS));
  }

  webSocketError(socket) {
    this.webSocketClose(socket);
  }

  async alarm() {
    if (this.ctx.getWebSockets().some((socket) => socket.readyState === WebSocket.OPEN)) return;
    await this.ctx.storage.deleteAll();
    this.initializeRoom();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.pathname.match(ROOM_PATH);
    if (room) {
      const id = env.ROOMS.idFromName(room[1].toUpperCase());
      return env.ROOMS.get(id).fetch(request);
    }
    if (url.pathname.startsWith('/rooms/')) return json({ error: '房间号无效' }, 404);
    const response = await handleHttp(request, env);
    return response || (env.ASSETS ? env.ASSETS.fetch(request) : json({ error: '接口不存在' }, 404));
  },
};
