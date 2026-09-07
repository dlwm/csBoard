import { localeForLanguage } from '../i18n.js';

export function SaveArchiveModal({ archives, draftName, language, mapName, onClose, onDraftNameChange, onSave, onSelectedChange, selected, t }) {
  return <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="save-archive-dialog" onKeyDown={(event) => { if (event.key === 'Enter' && (selected || draftName.trim())) onSave(selected, draftName); else if (event.key === 'Escape') onClose(); }}>
      <header><strong>{t('saveFrame')}</strong><button type="button" onClick={onClose}>×</button></header>
      <label className="collab-utility-search"><span>{t('saveToArchive')}</span><select value={selected} onChange={(event) => onSelectedChange(event.target.value)}>{archives.filter((archive) => archive.mapName === mapName).map((archive) => <option key={archive.id} value={archive.id}>{archive.name || archive.mapName.toUpperCase()} · {new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</option>)}<option value="">{t('newArchive')}</option></select></label>
      {selected === '' && <label className="collab-utility-search"><span>{t('archiveName')}</span><input autoFocus value={draftName} placeholder={t('newArchive')} onChange={(event) => onDraftNameChange(event.target.value)} /></label>}
      <div className="save-archive-actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="button" onClick={() => onSave(selected, draftName)} disabled={!selected && !draftName.trim()}>{t('save')}</button></div>
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
