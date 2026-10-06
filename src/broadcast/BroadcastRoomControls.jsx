import { useState } from 'react';
import { localize } from '../i18n.js';

// Sharing is optional and belongs to replay, not a separate playback mode.
export default function BroadcastRoomControls({ room, language, onJoin, onLeave }) {
  const [code, setCode] = useState('');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const statuses = {
    connecting: text('连接中', 'Connecting', 'Подключение'),
    connected: text('已连接', 'Connected', 'Подключено'),
    disconnected: text('连接中断', 'Disconnected', 'Отключено'),
    publishing: text('上传中', 'Uploading', 'Загрузка'),
    failed: text('传输失败', 'Transfer failed', 'Ошибка передачи'),
    closed: text('房间已关闭', 'Room closed', 'Комната закрыта'),
  };
  return <details className="replay-sharing">
    <summary>{text('共享回放', 'Shared replay', 'Общий просмотр')}{room.code && ` · ${room.code}`}</summary>
    <div>
      {room.code ? <><strong>{room.code}</strong><span>{statuses[room.status] || room.status}</span><button type="button" onClick={onLeave}>{text('离开', 'Leave', 'Выйти')}</button></>
        : <form onSubmit={event => { event.preventDefault(); onJoin(code); }}><input value={code} maxLength={6} aria-label={text('房间号', 'Room code', 'Код комнаты')} placeholder={text('6 位房间号', '6-digit room code', 'Код из 6 символов')} onChange={event => setCode(event.target.value.toUpperCase())} /><button type="submit" disabled={!/^[0-9A-F]{6}$/.test(code)}>{text('进入', 'Join', 'Войти')}</button></form>}
      {room.error && <p role="alert">{room.error}</p>}
    </div>
  </details>;
}
