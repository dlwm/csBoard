import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { translate, localeForLanguage } from '../i18n.js';
import { FolderSelect } from './ArchiveFolderTree.jsx';

const folderLabel = (language) => translate(language, "common.workspaceModals.saveToFolder");

export function SaveArchiveModal({ archives, draftName, folderState, folderId, language, mapName, mode = 'select', onClose, onDraftNameChange, onFolderChange, onSave, onSelectedChange, selected, t }) {
  const isOverwrite = mode === 'overwrite';
  const isNew = mode === 'new';
  const selectedArchive = archives.find((archive) => archive.id === selected);
  const canSave = isOverwrite ? Boolean(selectedArchive) : Boolean(selected || draftName.trim());

  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="save-archive-dialog" onKeyDown={(event) => { if (event.key === 'Enter' && canSave) onSave(selected, draftName); else if (event.key === 'Escape') onClose(); }}>
      <header><strong>{t(isOverwrite ? "collaboration.overwriteArchive" : isNew ? "collaboration.saveNewArchive" : "collaboration.saveFrame")}</strong><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
      {isOverwrite
        ? <div className="save-archive-warning"><strong>{selectedArchive?.name || selectedArchive?.mapName?.toUpperCase()}</strong><span>{t("collaboration.overwriteArchiveWarning")}</span></div>
        : !isNew && <label className="collab-utility-search"><span>{t("collaboration.saveToArchive")}</span><select className="workspace-input" value={selected} onChange={(event) => onSelectedChange(event.target.value)}>{archives.filter((archive) => archive.mapName === mapName).map((archive) => <option key={archive.id} value={archive.id}>{archive.name || archive.mapName.toUpperCase()} · {new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</option>)}<option value="">{t("collaboration.newArchive")}</option></select></label>}
      {!isOverwrite && (isNew || selected === '') && <label className="collab-utility-search"><span>{t("collaboration.archiveName")}</span><input className="workspace-input" autoFocus value={draftName} placeholder={t("collaboration.newArchive")} onChange={(event) => onDraftNameChange(event.target.value)} /></label>}
      <label className="collab-utility-search"><span>{folderLabel(language)}</span><FolderSelect state={folderState} value={folderId} onChange={onFolderChange} language={language} /></label>
      <div className="save-archive-actions"><WorkspaceButton type="button" onClick={onClose}>{t("common.cancel")}</WorkspaceButton><WorkspaceButton type="button" onClick={() => onSave(selected, draftName)} disabled={!canSave}>{t(isOverwrite ? "collaboration.confirmOverwrite" : "common.save")}</WorkspaceButton></div>
    </div>
  </div>;
}

export function RenamePointModal({ draft, onClose, onConfirm, onDraftChange, t }) {
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="save-archive-dialog">
      <header><strong>{t("common.rename")}</strong><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
      <label className="collab-utility-search"><span>{t("common.name")}</span><input className="workspace-input" autoFocus value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onConfirm(); else if (event.key === 'Escape') onClose(); }} /></label>
      <div className="save-archive-actions"><WorkspaceButton type="button" onClick={onClose}>{t("common.cancel")}</WorkspaceButton><WorkspaceButton type="button" onClick={onConfirm} disabled={!draft.trim()}>{t("common.save")}</WorkspaceButton></div>
    </div>
  </div>;
}

export function SaveAnonymousUtilityModal({ draft, error, folderState, folderId, kind, language, onClose, onDraftChange, onFolderChange, onSubmit, t }) {
  const complete = Boolean(draft.name.trim() && draft.summary.trim());
  return <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="utility-modal" onSubmit={onSubmit}>
      <header><div><span>{String(kind || 'utility').toUpperCase()}</span><h2>{t("utility.completeUtilityInfo")}</h2></div><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
      <p className="anonymous-utility-hint">{t("utility.completeUtilityHint")}</p>
      <label><span>{t("utility.utilityName")}</span><input className="workspace-input" autoFocus required value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
      <label><span>{t("utility.throwSummary")}</span><textarea className="workspace-input" required value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} /></label>
      <label><span>{folderLabel(language)}</span><FolderSelect state={folderState} value={folderId} onChange={onFolderChange} language={language} /></label>
      {error && <div className="utility-error">{error}</div>}
      <footer><WorkspaceButton type="button" onClick={onClose}>{t("common.cancel")}</WorkspaceButton><WorkspaceButton type="submit" disabled={!complete}>{t("common.save")}</WorkspaceButton></footer>
    </form>
  </div>;
}

export function UtilityNoteModal({ draft, error, folderState, folderId, language, onClose, onDraftChange, onFolderChange, onSubmit, t }) {
  return <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="utility-modal" onSubmit={onSubmit}>
      <header><div><span>GETPOS</span><h2>{t("common.addUtilityNote")}</h2></div><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
      <label><span>{t("utility.getposOutput")}</span><textarea className="workspace-input" required value={draft.getpos} placeholder={t("utility.getposPlaceholder")} onChange={(event) => onDraftChange({ ...draft, getpos: event.target.value })} /></label>
      <label><span>{t("utility.utilityName")}</span><input className="workspace-input" required value={draft.name} placeholder={t("utility.utilityNamePlaceholder")} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
      <label><span>{t("utility.throwSummary")}</span><textarea className="workspace-input" required value={draft.summary} placeholder={t("utility.throwSummaryPlaceholder")} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} /></label>
      <label><span>{folderLabel(language)}</span><FolderSelect state={folderState} value={folderId} onChange={onFolderChange} language={language} /></label>
      {error && <div className="utility-error">{error}</div>}
      <footer><WorkspaceButton type="button" onClick={onClose}>{t("common.cancel")}</WorkspaceButton><WorkspaceButton type="submit">{t("common.add")}</WorkspaceButton></footer>
    </form>
  </div>;
}

export function UtilityFolderModal({ note, folderState, folderId, language, onClose, onFolderChange, onSave, t }) {
  if (!note) return null;
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="save-archive-dialog">
    <header><strong>{t("utility.saveUtility")}</strong><WorkspaceButton icon variant="quiet" type="button" onClick={onClose}>×</WorkspaceButton></header>
    <p className="folder-save-name">{note.name}</p>
    <label className="collab-utility-search"><span>{folderLabel(language)}</span><FolderSelect state={folderState} value={folderId} onChange={onFolderChange} language={language} /></label>
    <div className="save-archive-actions"><WorkspaceButton type="button" onClick={onClose}>{t("common.cancel")}</WorkspaceButton><WorkspaceButton type="button" onClick={onSave}>{t("common.save")}</WorkspaceButton></div>
  </div></div>;
}
