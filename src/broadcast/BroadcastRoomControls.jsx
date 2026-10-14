import { useState } from 'react';
import { translate } from '../i18n.js';

// Sharing is optional and belongs to replay, not a separate playback mode.
export default function BroadcastRoomControls({ room, language, onJoin, onLeave }) {
  const [code, setCode] = useState('');
  const text = (key, values) => translate(language, key, values);
  const statuses = {
    connecting: text("broadcast.broadcastRoomControls.connecting"),
    connected: text("broadcast.broadcastRoomControls.connected"),
    disconnected: text("broadcast.broadcastRoomControls.disconnected"),
    publishing: text("broadcast.broadcastRoomControls.uploading"),
    failed: text("broadcast.broadcastRoomControls.transferFailed"),
    closed: text("broadcast.broadcastRoomControls.roomClosed"),
  };
  return <details className="replay-sharing">
    <summary>{text("broadcast.broadcastRoomControls.sharedReplay")}{room.code && ` · ${room.code}`}</summary>
    <div>
      {room.code ? <><strong>{room.code}</strong><span>{statuses[room.status] || room.status}</span><button type="button" onClick={onLeave}>{text("broadcast.broadcastRoomControls.leave")}</button></>
        : <form onSubmit={event => { event.preventDefault(); onJoin(code); }}><input value={code} maxLength={6} aria-label={text("broadcast.broadcastRoomControls.roomCode")} placeholder={text("broadcast.broadcastRoomControls.6DigitRoomCode")} onChange={event => setCode(event.target.value.toUpperCase())} /><button type="submit" disabled={!/^[0-9A-F]{6}$/.test(code)}>{text("broadcast.broadcastRoomControls.join")}</button></form>}
      {room.error && <p role="alert">{room.error}</p>}
    </div>
  </details>;
}
