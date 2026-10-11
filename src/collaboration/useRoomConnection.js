import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { collaborationUrl } from '../app/config.js';
import { connectRoom } from './roomConnection.js';
import { createRoomProvider, roomConnectionMessage } from './roomProvider.js';

// Reconnect only when the room changes; event callbacks still see current session state.
export default function useRoomConnection(roomCode, getPorts) {
  const latest = useRef(getPorts);
  latest.current = getPorts;
  useEffect(() => {
    if (!roomCode) return;
    let endpoint;
    try { endpoint = collaborationUrl(); }
    catch {
      const ports = latest.current();
      ports.events.status(roomConnectionMessage(ports.context().language, 'configuration'));
      return;
    }
    const doc = new Y.Doc();
    const connection = createRoomProvider(endpoint, roomCode, doc, () => {
      const ports = latest.current();
      ports.events.status(roomConnectionMessage(ports.context().language));
    });
    const disconnect = connectRoom({ doc, provider: connection.provider, roomCode, getPorts: () => latest.current() });
    connection.start();
    return () => { connection.dispose(); disconnect(); };
  }, [roomCode]);
}
