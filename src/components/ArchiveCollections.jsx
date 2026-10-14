import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { localeForLanguage } from '../i18n.js';
import ArchiveFolderTree from './ArchiveFolderTree.jsx';

export function WorkspaceArchiveTree({ archives, folders, language, roomCode, roomOwner, onCreateFolder, onDeleteArchive, onDeleteFolder, onMove, onNewArchive, onOverwrite, onRestore, t }) {
  return <div className="archive-list"><ArchiveFolderTree state={folders} items={archives} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove} emptyLabel={t("common.noArchives")} renderItem={(archive) => <div className="archive-item" key={archive.id}>
    <WorkspaceButton variant="entry" type="button" className="archive-restore" disabled={Boolean(roomCode && !roomOwner)} title={roomCode && !roomOwner ? t("collaboration.guestNoArchive") : t("collaboration.restoreArchive")} onClick={() => onRestore(archive)}><strong>{archive.name || archive.mapName.toUpperCase()}</strong><span>{new Date(archive.savedAt).toLocaleString(localeForLanguage(language))}</span><small>{archive.mapName} · {archive.frames?.length ? `${archive.frames.length} ${t("collaboration.frames")}${archive.demo ? ` · ${t("collaboration.manualEdit")}` : ''}` : archive.demo ? `ROUND ${archive.demo.round || '-'} · TICK ${Math.round(archive.demo.tick)}` : t("collaboration.manualEdit")}</small></WorkspaceButton>
    <WorkspaceButton type="button" className="archive-save" aria-label={t("collaboration.overwriteArchive")} title={t("collaboration.overwriteArchive")} onClick={() => onOverwrite(archive.id)}>{t("common.save")}</WorkspaceButton>
    <WorkspaceButton variant="danger" icon type="button" className="archive-delete" aria-label={t("collaboration.deleteArchive")} title={t("collaboration.deleteArchive")} onClick={() => onDeleteArchive(archive.id)}>×</WorkspaceButton>
  </div>} /><WorkspaceButton variant="primary" type="button" className="archive-new-save" onClick={onNewArchive}>＋ {t("collaboration.saveNewArchive")}</WorkspaceButton></div>;
}

export function UtilityArchiveTree({ notes, folders, language, onCreateFolder, onDeleteFolder, onMove, onFocus, onClearFocus, onOpen, t, toolbarActions, compareItems }) {
  const clearOutsideEntries = (event) => {
    // Moving directly to another entry keeps the original camera restore point.
    if (!event.relatedTarget?.closest?.('.utility-folder-entry')) onClearFocus();
  };
  return <ArchiveFolderTree state={folders} items={notes} compareItems={compareItems} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove} emptyLabel={t("utility.utilityEmpty")} toolbarActions={toolbarActions} renderItem={(note) => <WorkspaceButton variant="entry" type="button" className={`utility-folder-entry${note.replay ? ' replayable' : ''}`} onPointerEnter={() => onFocus(note)} onPointerLeave={clearOutsideEntries} onFocus={() => onFocus(note)} onBlur={clearOutsideEntries} onClick={() => onOpen(note)}><b>{note.name}</b><small title={`${t("utility.landingPlace")}: ${note.landingPlace || t("utility.landingPlaceUnknown")}`}>{note.landingPlace || t("utility.landingPlaceUnknown")}</small></WorkspaceButton>} />;
}
