import { useState } from 'react';
import { localize, localeForLanguage } from '../i18n.js';
import ArchiveFolderTree, { FolderSelect } from '../components/ArchiveFolderTree.jsx';

const text = (language, values) => localize(language, values);

export function BroadcastPanel({ archives, activeId, folders, language, room, onCreateFolder, onDelete, onDeleteFolder, onJoin, onLeave, onMove, onSelect }) {
  const [joinCode, setJoinCode] = useState('');
  return <aside className="broadcast-panel">
    <header><div><span>VIEW BROADCAST</span><h2>{text(language, { zh: '视角演播', en: 'View Broadcast', ru: 'Трансляция ракурсов' })}</h2></div></header>
    <p>{text(language, { zh: '选择一个时间段存档后会自动开放房间。加入者下载完成后，存档会保存在其本地。', en: 'Selecting an interval opens a room. Joined archives are saved locally after download.', ru: 'Выбор отрезка открывает комнату. После загрузки архив сохраняется локально.' })}</p>
    <div className="broadcast-join"><input value={joinCode} maxLength={6} placeholder={text(language, { zh: '6 位房间号', en: '6-digit room code', ru: 'Код из 6 символов' })} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /><button type="button" onClick={() => onJoin(joinCode)}>{text(language, { zh: '进入房间', en: 'Join', ru: 'Войти' })}</button></div>
    {room.code && <div className="broadcast-room"><span>{room.owner ? text(language, { zh: '演播房间', en: 'Broadcast room', ru: 'Комната трансляции' }) : text(language, { zh: '已加入房间', en: 'Joined room', ru: 'Подключено' })}</span><strong>{room.code}</strong><small>{room.status}</small><button type="button" onClick={onLeave}>{text(language, { zh: '关闭', en: 'Close', ru: 'Закрыть' })}</button></div>}
    <ArchiveFolderTree state={folders} items={archives} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove} emptyLabel={text(language, { zh: '暂无时间段存档', en: 'No interval archives', ru: 'Нет архивов отрезков' })} renderItem={(archive) => <article className={`broadcast-list${archive.id === activeId ? ' active' : ''}`} key={archive.id}>
      <button type="button" className="broadcast-open" onClick={() => onSelect(archive)}><strong>{archive.name}</strong><span>{archive.mapName} · R{archive.demoData?.rounds?.[0]?.round || '-'}</span><small>{((archive.endTick - archive.startTick) / (archive.demoData?.demo?.tickRate || 64)).toFixed(1)}s · {new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</small></button>
      <button type="button" className="broadcast-delete" onClick={() => onDelete(archive.id)}>×</button>
    </article>} />
  </aside>;
}

export function BroadcastClipModal({ draft, folders, language, round, tickRate, onChange, onClose, onSave }) {
  if (!round) return null;
  const seconds = (tick) => ((tick - round.startTick) / tickRate).toFixed(1);
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="save-archive-dialog broadcast-clip-dialog">
    <header><strong>{text(language, { zh: '保存演播时间段', en: 'Save broadcast interval', ru: 'Сохранить отрезок' })}</strong><button type="button" onClick={onClose}>×</button></header>
    <label className="collab-utility-search"><span>{text(language, { zh: '名称', en: 'Name', ru: 'Название' })}</span><input autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
    <label className="collab-utility-search"><span>{text(language, { zh: '保存到文件夹', en: 'Save to folder', ru: 'Сохранить в папку' })}</span><FolderSelect state={folders} value={draft.folderId} onChange={(folderId) => onChange({ ...draft, folderId })} language={language} /></label>
    <div className="broadcast-range"><label><span>{text(language, { zh: '开始', en: 'Start', ru: 'Начало' })} · {seconds(draft.startTick)}s</span><input type="range" min={round.startTick} max={round.endTick} value={draft.startTick} onChange={(event) => onChange({ ...draft, startTick: Math.min(Number(event.target.value), draft.endTick - 1) })} /></label><label><span>{text(language, { zh: '结束', en: 'End', ru: 'Конец' })} · {seconds(draft.endTick)}s</span><input type="range" min={round.startTick} max={round.endTick} value={draft.endTick} onChange={(event) => onChange({ ...draft, endTick: Math.max(Number(event.target.value), draft.startTick + 1) })} /></label></div>
    <div className="save-archive-actions"><button type="button" onClick={onClose}>{text(language, { zh: '取消', en: 'Cancel', ru: 'Отмена' })}</button><button type="button" disabled={!draft.name.trim() || draft.endTick <= draft.startTick} onClick={onSave}>{text(language, { zh: '保存', en: 'Save', ru: 'Сохранить' })}</button></div>
  </div></div>;
}

export function BroadcastDownloadOverlay({ download, language, onCancel }) {
  if (!download) return null;
  const labels = {
    connecting: { zh: '正在连接房间…', en: 'Connecting…', ru: 'Подключение…' },
    downloading: { zh: '正在下载演播存档…', en: 'Downloading broadcast archive…', ru: 'Загрузка архива…' },
    processing: { zh: '正在整理回放数据…', en: 'Processing replay data…', ru: 'Обработка данных…' },
    saving: { zh: '正在保存到本地…', en: 'Saving locally…', ru: 'Сохранение…' },
    complete: { zh: '下载完成', en: 'Download complete', ru: 'Загрузка завершена' },
    failed: { zh: '下载失败', en: 'Download failed', ru: 'Ошибка загрузки' },
  };
  return <div className="broadcast-download" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={download.progress}><div><span>{download.name || 'CSBOARD'}</span><strong>{text(language, labels[download.status] || labels.downloading)}</strong><div><i style={{ width: `${download.progress}%` }} /></div><b>{download.progress}%</b>{download.status !== 'complete' && <button type="button" onClick={onCancel}>{text(language, { zh: '取消', en: 'Cancel', ru: 'Отмена' })}</button>}</div></div>;
}
