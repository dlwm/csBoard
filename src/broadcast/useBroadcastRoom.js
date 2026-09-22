import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { collaborationUrl } from '../app/config.js';
import { deserializeBroadcastArchive, serializeBroadcastArchive, splitBroadcastPayload } from './archive.js';

const createRoomCode = () => Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

// Broadcast rooms transfer one immutable archive; they do not share editable scene state.
export default function useBroadcastRoom({ onArchiveReceived }) {
  const receiveRef = useRef(onArchiveReceived);
  const seedRef = useRef(null);
  const processedRef = useRef('');
  const [session, setSession] = useState({ code: '', owner: false, status: '', error: '' });
  const [download, setDownload] = useState(null);
  receiveRef.current = onArchiveReceived;

  const open = (archive) => {
    seedRef.current = archive;
    processedRef.current = '';
    setSession({ code: createRoomCode(), owner: true, status: 'connecting', error: '' });
  };
  const join = (value) => {
    const code = String(value || '').trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(code)) return false;
    seedRef.current = null;
    processedRef.current = '';
    setDownload({ progress: 0, status: 'connecting' });
    setSession({ code, owner: false, status: 'connecting', error: '' });
    return true;
  };
  const leave = () => { setDownload(null); setSession((current) => ({ ...current, code: '', owner: false, status: '' })); };

  useEffect(() => {
    if (!session.code) return undefined;
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(collaborationUrl(), session.code, doc);
    const room = doc.getMap('broadcast-room');
    const chunks = doc.getMap('broadcast-chunks');
    let disposed = false;
    let receiving = false;
    let publishing = false;

    const receive = async () => {
      if (session.owner || receiving) return;
      if (room.get('closed')) {
        setDownload(null);
        setSession((current) => ({ ...current, status: 'closed', error: 'closed' }));
        return;
      }
      const payloadId = String(room.get('archiveId') || '');
      const total = Number(room.get('chunkCount') || 0);
      if (!payloadId || !total || processedRef.current === payloadId) return;
      if (chunks.size < total || room.get('ready') !== true) {
        setDownload((current) => ({ ...current, name: room.get('archiveName') || '', status: 'downloading', progress: 4 + Math.round(Math.min(chunks.size, total) / total * 76) }));
        return;
      }
      receiving = true;
      setDownload({ progress: 4, status: 'downloading', name: room.get('archiveName') || '' });
      try {
        const parts = [];
        for (let index = 0; index < total; index += 1) {
          const part = chunks.get(String(index));
          if (typeof part !== 'string') throw new Error(`missing chunk ${index}`);
          parts.push(part);
          if (index % 4 === 0 || index === total - 1) {
            setDownload((current) => ({ ...current, progress: 5 + Math.round((index + 1) / total * 75) }));
            await yieldToUi();
          }
        }
        setDownload((current) => ({ ...current, progress: 86, status: 'processing' }));
        const archive = deserializeBroadcastArchive(parts.join(''));
        setDownload((current) => ({ ...current, progress: 94, status: 'saving' }));
        if (disposed) return;
        await receiveRef.current?.(archive, () => disposed);
        if (disposed) return;
        processedRef.current = payloadId;
        setDownload((current) => ({ ...current, progress: 100, status: 'complete' }));
        setSession((current) => ({ ...current, status: 'connected', error: '' }));
        setTimeout(() => { if (!disposed) setDownload(null); }, 350);
      } catch (error) {
        if (!disposed) {
          setDownload((current) => ({ ...current, status: 'failed' }));
          setSession((current) => ({ ...current, status: 'failed', error: error?.message || String(error) }));
        }
      } finally { receiving = false; }
    };

    const publish = async () => {
      const archive = seedRef.current;
      if (!session.owner || !archive || publishing || room.get('ready') === true) return;
      publishing = true;
      const serialized = serializeBroadcastArchive(archive);
      const parts = splitBroadcastPayload(serialized);
      doc.transact(() => {
        room.set('kind', 'view-broadcast');
        room.set('archiveId', archive.id);
        room.set('archiveName', archive.name);
        room.set('chunkCount', parts.length);
        room.set('bytes', serialized.length);
        room.set('closed', false);
        room.set('ready', false);
        chunks.clear();
      });
      // Each chunk must be its own Yjs update. Putting all chunks in one
      // transaction recreates the large message that chunking is meant to avoid.
      for (let index = 0; index < parts.length; index += 1) {
        if (disposed) return;
        chunks.set(String(index), parts[index]);
        await yieldToUi();
      }
      if (disposed) return;
      room.set('ready', true);
      publishing = false;
      setSession((current) => ({ ...current, status: 'connected', error: '' }));
    };

    const observe = () => receive();
    room.observe(observe);
    chunks.observe(observe);
    provider.on('status', ({ status }) => setSession((current) => current.code === session.code ? { ...current, status } : current));
    provider.on('sync', (synced) => { if (synced) { publish(); receive(); } });
    return () => {
      disposed = true;
      if (session.owner && room.get('ready') === true) room.set('closed', true);
      room.unobserve(observe);
      chunks.unobserve(observe);
      provider.destroy();
      doc.destroy();
    };
  }, [session.code, session.owner]);

  return { session, download, open, join, leave };
}
