import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { collaborationUrl } from '../app/config.js';
import { uploadBroadcast, downloadBroadcast } from './transfer.js';

const createRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), value => value.toString(16).padStart(2, '0')).join('').toUpperCase();

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
    const controller = new AbortController();
    const transferState = {};
    let disposed = false;
    let receiving = false;
    let publishing = false;

    const receive = async () => {
      if (session.owner) return;
      if (room.get('closed')) {
        controller.abort();
        setDownload(null);
        setSession((current) => ({ ...current, status: 'closed', error: 'closed' }));
        return;
      }
      if (receiving) return;
      if (room.get('transferError')) {
        setSession(current => ({ ...current, status: 'failed', error: room.get('transferError') }));
        setDownload(current => ({ ...current, progress: current?.progress || 0, status: 'failed' }));
        return;
      }
      const payloadId = String(room.get('archiveId') || '');
      const manifest = room.get('transfer');
      if (!payloadId || processedRef.current === payloadId || room.get('ready') !== true) return;
      if (!manifest) {
        setSession(current => ({ ...current, status: 'failed', error: 'This room uses an older transfer protocol. Ask the host to update and reopen it.' }));
        return;
      }
      receiving = true;
      setDownload({ progress: 4, status: 'downloading', name: room.get('archiveName') || '' });
      try {
        const archive = await downloadBroadcast(collaborationUrl(), session.code, manifest, controller.signal, fraction => {
          if (!disposed) setDownload(current => ({ ...current, progress: 5 + Math.round(fraction * 80), status: fraction === 1 ? 'processing' : 'downloading' }));
        });
        if (disposed || controller.signal.aborted) return;
        setDownload((current) => ({ ...current, progress: 94, status: 'saving' }));
        await receiveRef.current?.(archive, () => disposed || controller.signal.aborted);
        if (disposed || controller.signal.aborted) return;
        processedRef.current = payloadId;
        setDownload((current) => ({ ...current, progress: 100, status: 'complete' }));
        setSession((current) => ({ ...current, status: 'connected', error: '' }));
        setTimeout(() => { if (!disposed) setDownload(null); }, 350);
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          setDownload((current) => ({ ...current, status: 'failed' }));
          setSession((current) => ({ ...current, status: 'failed', error: error?.message || String(error) }));
        }
      } finally { receiving = false; }
    };

    const publish = async () => {
      const archive = seedRef.current;
      if (!session.owner || !archive || publishing || room.get('ready') === true) return;
      publishing = true;
      try {
        doc.transact(() => {
          room.delete('transferError');
          room.set('kind', 'view-broadcast');
          room.set('archiveId', archive.id);
          room.set('archiveName', archive.name);
          room.set('closed', false);
          room.set('ready', false);
        });
        setSession(current => ({ ...current, status: 'publishing', error: '' }));
        const manifest = await uploadBroadcast(collaborationUrl(), session.code, archive, controller.signal, null, transferState);
        if (disposed || controller.signal.aborted) return;
        doc.transact(() => { room.set('transfer', manifest); room.set('ready', true); });
        setSession(current => ({ ...current, status: 'connected', error: '' }));
      } catch (error) {
        if (!disposed) {
          room.set('transferError', error.message);
          setSession(current => ({ ...current, status: 'failed', error: error.message }));
        }
      } finally { publishing = false; }
    };

    const observe = () => receive();
    room.observe(observe);
    provider.on('status', ({ status }) => setSession((current) => current.code === session.code ? { ...current, status } : current));
    provider.on('sync', (synced) => { if (synced) { publish(); receive(); } });
    return () => {
      disposed = true;
      controller.abort();
      if (session.owner && room.get('ready') === true) room.set('closed', true);
      room.unobserve(observe);
      provider.destroy();
      doc.destroy();
    };
  }, [session.code, session.owner]);

  return { session, download, open, join, leave };
}
