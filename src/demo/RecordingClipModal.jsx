import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { useState } from 'react';
import { translate } from '../i18n.js';
import { FolderSelect } from '../components/ArchiveFolderTree.jsx';
const text = (language, values) => translate(language, values);

export default function RecordingClipModal({ draft, folders, language, round, tickRate, error, onChange, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  if (!round) return null;
  const seconds = (tick) => ((tick - round.startTick) / tickRate).toFixed(1);
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="save-archive-dialog broadcast-clip-dialog">
    <header><strong>{text(language, "replay.recordingClipModal.saveAsCustomDemo")}</strong><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
    <p className="recording-source">{draft.source?.demoData.demo.fileName}</p>
    <label className="collab-utility-search"><span>{text(language, "replay.recordingClipModal.name")}</span><input className="workspace-input" autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
    <label className="collab-utility-search"><span>{text(language, "replay.recordingClipModal.saveToFolder")}</span><FolderSelect state={folders} value={draft.folderId} onChange={(folderId) => onChange({ ...draft, folderId })} language={language} /></label>
    <div className="broadcast-range"><label><span>{text(language, "replay.recordingClipModal.start")} · {seconds(draft.startTick)}s</span><input type="range" min={round.freezeStartTick ?? round.startTick} max={round.endTick} value={draft.startTick} onChange={(event) => onChange({ ...draft, startTick: Math.min(Number(event.target.value), draft.endTick - 1) })} /></label><label><span>{text(language, "replay.recordingClipModal.end")} · {seconds(draft.endTick)}s</span><input type="range" min={round.freezeStartTick ?? round.startTick} max={round.endTick} value={draft.endTick} onChange={(event) => onChange({ ...draft, endTick: Math.max(Number(event.target.value), draft.startTick + 1) })} /></label></div>
    {error && <p role="alert">{text(language, "replay.recordingClipModal.couldNotSavePleaseRetry")} {error}</p>}
    <div className="save-archive-actions"><WorkspaceButton type="button" onClick={onClose}>{text(language, "replay.recordingClipModal.cancel")}</WorkspaceButton><WorkspaceButton type="button" disabled={saving || !draft.name.trim() || draft.endTick <= draft.startTick} onClick={async () => { setSaving(true); try { await onSave(); } finally { setSaving(false); } }}>{text(language, "replay.recordingClipModal.save")}</WorkspaceButton></div>
  </div></div>;
}

