import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

function awarenessClientIds(update) {
  const decoder = decoding.createDecoder(update);
  const clients = [];
  for (let index = 0, count = decoding.readVarUint(decoder); index < count; index += 1) {
    clients.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
  }
  return clients;
}

export function createYjsRoom({ initialUpdate, broadcast, persist }) {
  const doc = new Y.Doc();
  if (initialUpdate) Y.applyUpdate(doc, new Uint8Array(initialUpdate));
  const awareness = new awarenessProtocol.Awareness(doc);
  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(encoding.toUint8Array(encoder), origin);
    persist?.(Y.encodeStateAsUpdate(doc));
  });
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    broadcast(encoding.toUint8Array(encoder), origin);
  });
  return { doc, awareness };
}

export function sendSyncStep1(room, socket) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  socket.send(encoding.toUint8Array(encoder));
}

export function handleYjsMessage(room, socket, message, getMetadata, setMetadata) {
  const data = typeof message === 'string' ? new TextEncoder().encode(message) : new Uint8Array(message);
  const decoder = decoding.createDecoder(data);
  const type = decoding.readVarUint(decoder);
  if (type === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
    if (encoding.length(encoder) > 1) socket.send(encoding.toUint8Array(encoder));
  } else if (type === MESSAGE_AWARENESS) {
    const update = decoding.readVarUint8Array(decoder);
    const metadata = getMetadata() || { awarenessClients: [] };
    metadata.awarenessClients = [...new Set([...metadata.awarenessClients, ...awarenessClientIds(update)])];
    setMetadata(metadata);
    awarenessProtocol.applyAwarenessUpdate(room.awareness, update, socket);
  }
}

export function removeSocketAwareness(room, socket, metadata) {
  const clients = metadata?.awarenessClients || [];
  if (clients.length) awarenessProtocol.removeAwarenessStates(room.awareness, clients, socket);
}
