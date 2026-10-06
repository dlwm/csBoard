import { useState } from 'react';
import { localize } from '../i18n.js';
import { FolderSelect } from '../components/ArchiveFolderTree.jsx';
const text = (language, values) => localize(language, values);

export default function RecordingClipModal({ draft, folders, language, round, tickRate, error, onChange, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  if (!round) return null;
  const seconds = (tick) => ((tick - round.startTick) / tickRate).toFixed(1);
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="save-archive-dialog broadcast-clip-dialog">
    <header><strong>{text(language, { zh: '保存为自制 DEMO', en: 'Save as custom DEMO', ru: 'Сохранить свою DEMO' })}</strong><button type="button" onClick={onClose}>×</button></header>
    <p className="recording-source">{draft.source?.demoData.demo.fileName}</p>
    <label className="collab-utility-search"><span>{text(language, { zh: '名称', en: 'Name', ru: 'Название' })}</span><input autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
    <label className="collab-utility-search"><span>{text(language, { zh: '保存到文件夹', en: 'Save to folder', ru: 'Сохранить в папку' })}</span><FolderSelect state={folders} value={draft.folderId} onChange={(folderId) => onChange({ ...draft, folderId })} language={language} /></label>
    <div className="broadcast-range"><label><span>{text(language, { zh: '开始', en: 'Start', ru: 'Начало' })} · {seconds(draft.startTick)}s</span><input type="range" min={round.freezeStartTick ?? round.startTick} max={round.endTick} value={draft.startTick} onChange={(event) => onChange({ ...draft, startTick: Math.min(Number(event.target.value), draft.endTick - 1) })} /></label><label><span>{text(language, { zh: '结束', en: 'End', ru: 'Конец' })} · {seconds(draft.endTick)}s</span><input type="range" min={round.freezeStartTick ?? round.startTick} max={round.endTick} value={draft.endTick} onChange={(event) => onChange({ ...draft, endTick: Math.max(Number(event.target.value), draft.startTick + 1) })} /></label></div>
    {error && <p role="alert">{text(language, { zh: '保存未完成，请重试。', en: 'Could not save. Please retry.', ru: 'Не удалось сохранить. Повторите попытку.' })} {error}</p>}
    <div className="save-archive-actions"><button type="button" onClick={onClose}>{text(language, { zh: '取消', en: 'Cancel', ru: 'Отмена' })}</button><button type="button" disabled={saving || !draft.name.trim() || draft.endTick <= draft.startTick} onClick={async () => { setSaving(true); try { await onSave(); } finally { setSaving(false); } }}>{text(language, { zh: '保存', en: 'Save', ru: 'Сохранить' })}</button></div>
  </div></div>;
}

