import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createYjsRoom, handleYjsMessage, removeSocketAwareness, sendSyncStep1 } from '../../server/core/yjs.js';

// Real collaboration protocol, bound only to loopback. No production rooms or
// simulated presence: both screenshot participants run the actual application.
// 复用实际 Yjs 协议；房间只在本机存在，截图结束后销毁。
export async function startScreenshotRooms() {
  const rooms = new Map();
  const server = http.createServer((_request, response) => { response.writeHead(404); response.end(); });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const match = request.url?.match(/^\/rooms\/([0-9A-F]{6})$/i);
    if (!match) return socket.destroy();
    sockets.handleUpgrade(request, socket, head, client => {
      const code = match[1].toUpperCase();
      if (!rooms.has(code)) {
        const clients = new Set();
        rooms.set(code, { clients, yjs: createYjsRoom({ broadcast: (message, except) => {
          for (const peer of clients) if (peer !== except && peer.readyState === WebSocket.OPEN) peer.send(message);
        } }) });
      }
      const room = rooms.get(code);
      let metadata = { awarenessClients: [] };
      room.clients.add(client);
      sendSyncStep1(room.yjs, client);
      client.on('message', message => {
        try { handleYjsMessage(room.yjs, client, message, () => metadata, value => { metadata = value; }); }
        catch { client.close(1003, 'Invalid collaboration message'); }
      });
      client.on('close', () => { removeSocketAwareness(room.yjs, client, metadata); room.clients.delete(client); });
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const client of sockets.clients) client.terminate();
      await new Promise(resolve => sockets.close(resolve));
      await new Promise(resolve => server.close(resolve));
      for (const room of rooms.values()) { room.yjs.awareness.destroy(); room.yjs.doc.destroy(); }
    },
  };
}
