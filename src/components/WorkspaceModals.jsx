import { localeForLanguage } from '../i18n.js';

export function SaveArchiveModal({ archives, draftName, language, mapName, mode = 'select', onClose, onDraftNameChange, onSave, onSelectedChange, selected, t }) {
  const isOverwrite = mode === 'overwrite';
  const isNew = mode === 'new';
  const selectedArchive = archives.find((archive) => archive.id === selected);
  const canSave = isOverwrite ? Boolean(selectedArchive) : Boolean(selected || draftName.trim());

  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="save-archive-dialog" onKeyDown={(event) => { if (event.key === 'Enter' && canSave) onSave(selected, draftName); else if (event.key === 'Escape') onClose(); }}>
      <header><strong>{t(isOverwrite ? 'overwriteArchive' : isNew ? 'saveNewArchive' : 'saveFrame')}</strong><button type="button" onClick={onClose}>×</button></header>
      {isOverwrite
        ? <div className="save-archive-warning"><strong>{selectedArchive?.name || selectedArchive?.mapName?.toUpperCase()}</strong><span>{t('overwriteArchiveWarning')}</span></div>
        : !isNew && <label className="collab-utility-search"><span>{t('saveToArchive')}</span><select value={selected} onChange={(event) => onSelectedChange(event.target.value)}>{archives.filter((archive) => archive.mapName === mapName).map((archive) => <option key={archive.id} value={archive.id}>{archive.name || archive.mapName.toUpperCase()} · {new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</option>)}<option value="">{t('newArchive')}</option></select></label>}
      {!isOverwrite && (isNew || selected === '') && <label className="collab-utility-search"><span>{t('archiveName')}</span><input autoFocus value={draftName} placeholder={t('newArchive')} onChange={(event) => onDraftNameChange(event.target.value)} /></label>}
      <div className="save-archive-actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="button" onClick={() => onSave(selected, draftName)} disabled={!canSave}>{t(isOverwrite ? 'confirmOverwrite' : 'save')}</button></div>
    </div>
  </div>;
}

export function RenamePointModal({ draft, onClose, onConfirm, onDraftChange, t }) {
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="save-archive-dialog">
      <header><strong>{t('rename')}</strong><button type="button" onClick={onClose}>×</button></header>
      <label className="collab-utility-search"><span>{t('name')}</span><input autoFocus value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onConfirm(); else if (event.key === 'Escape') onClose(); }} /></label>
      <div className="save-archive-actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="button" onClick={onConfirm} disabled={!draft.trim()}>{t('save')}</button></div>
    </div>
  </div>;
}

export function SaveAnonymousUtilityModal({ draft, error, kind, onClose, onDraftChange, onSubmit, t }) {
  const complete = Boolean(draft.name.trim() && draft.summary.trim());
  return <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="utility-modal" onSubmit={onSubmit}>
      <header><div><span>{String(kind || 'utility').toUpperCase()}</span><h2>{t('completeUtilityInfo')}</h2></div><button type="button" onClick={onClose}>×</button></header>
      <p className="anonymous-utility-hint">{t('completeUtilityHint')}</p>
      <label><span>{t('utilityName')}</span><input autoFocus required value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
      <label><span>{t('throwSummary')}</span><textarea required value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} /></label>
      {error && <div className="utility-error">{error}</div>}
      <footer><button type="button" onClick={onClose}>{t('cancel')}</button><button type="submit" disabled={!complete}>{t('save')}</button></footer>
    </form>
  </div>;
}

export function UtilityNoteModal({ draft, error, onClose, onDraftChange, onSubmit, t }) {
  return <div className="utility-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="utility-modal" onSubmit={onSubmit}>
      <header><div><span>GETPOS</span><h2>{t('addUtilityNote')}</h2></div><button type="button" onClick={onClose}>×</button></header>
      <label><span>{t('getposOutput')}</span><textarea required value={draft.getpos} placeholder={t('getposPlaceholder')} onChange={(event) => onDraftChange({ ...draft, getpos: event.target.value })} /></label>
      <label><span>{t('utilityName')}</span><input required value={draft.name} placeholder={t('utilityNamePlaceholder')} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
      <label><span>{t('throwSummary')}</span><textarea required value={draft.summary} placeholder={t('throwSummaryPlaceholder')} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} /></label>
      {error && <div className="utility-error">{error}</div>}
      <footer><button type="button" onClick={onClose}>{t('cancel')}</button><button type="submit">{t('add')}</button></footer>
    </form>
  </div>;
}
