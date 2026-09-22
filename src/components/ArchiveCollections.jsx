import { localeForLanguage } from '../i18n.js';
import ArchiveFolderTree from './ArchiveFolderTree.jsx';

export function WorkspaceArchiveTree({ archives, folders, language, roomCode, roomOwner, onCreateFolder, onDeleteArchive, onDeleteFolder, onMove, onNewArchive, onOverwrite, onRestore, t }) {
  return <div className="archive-list"><ArchiveFolderTree state={folders} items={archives} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove} emptyLabel={t('noArchives')} renderItem={(archive) => <div className="archive-item" key={archive.id}>
    <button type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t('guestNoArchive') : t('restoreArchive')} onClick={() => onRestore(archive)}><strong>{archive.name || archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</span><small>{archive.mapName} · {archive.frames?.length ? `${archive.frames.length} ${t('frames')}${archive.demo ? ` · ${t('manualEdit')}` : ''}` : archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t('manualEdit')}</small></button>
    <button type="button" className="archive-save" aria-label={t('overwriteArchive')} title={t('overwriteArchive')} onClick={() => onOverwrite(archive.id)}>{t('save')}</button>
    <button type="button" className="archive-delete" aria-label={t('deleteArchive')} title={t('deleteArchive')} onClick={() => onDeleteArchive(archive.id)}>×</button>
  </div>} /><button type="button" className="archive-new-save" onClick={onNewArchive}>＋ {t('saveNewArchive')}</button></div>;
}

export function UtilityArchiveTree({ notes, folders, language, onCreateFolder, onDeleteFolder, onMove, onFocus, onClearFocus, onOpen, t }) {
  const clearOutsideEntries = (event) => {
    // Moving directly to another entry keeps the original camera restore point.
    if (!event.relatedTarget?.closest?.('.utility-folder-entry')) onClearFocus();
  };
  return <ArchiveFolderTree state={folders} items={notes} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove} emptyLabel={t('utilityEmpty')} renderItem={(note) => <button type="button" className={`utility-folder-entry${note.replay ? ' replayable' : ''}`} onPointerEnter={() => onFocus(note)} onPointerLeave={clearOutsideEntries} onFocus={() => onFocus(note)} onBlur={clearOutsideEntries} onClick={() => onOpen(note)}><b>{note.name}</b><small>{note.startPlace || note.throwPlace || note.thrower || note.grenadeType || t('customUtility')}</small></button>} />;
}
