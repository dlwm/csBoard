import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { collaborationUrl } from '../app/config.js';
import { connectRoom } from './roomConnection.js';

// Reconnect only when the room changes; event callbacks still see current session state.
export default function useRoomConnection(roomCode, getPorts) {
  const latest = useRef(getPorts);
  latest.current = getPorts;
  useEffect(() => {
    if (!roomCode) return;
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(collaborationUrl(), roomCode, doc);
    return connectRoom({ doc, provider, roomCode, getPorts: () => latest.current() });
  }, [roomCode]);
}
