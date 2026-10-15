import { useRef } from 'react';
import useAnchoredMenuPosition from '../components/workspace/useAnchoredMenuPosition.js';
import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { translate, localeForLanguage } from '../i18n.js';
import { isRecording } from './recordings.js';
import ArchiveFolderTree from '../components/ArchiveFolderTree.jsx';

// All replay entries share this catalogue. Storage ownership controls deletion;
// it does not create a second custom-recording category or another workspace.
export default function ReplayLibraryPicker({ entries, error, loadingId, activeId, open, language, folders, onToggle, onClose, onOpen, onRemove, onShare, onCreateFolder, onDeleteFolder, onMove }) {
  const pickerRef = useRef(null);
  const { menuRef, style } = useAnchoredMenuPosition(open, pickerRef, 440);
  const text = (key, values) => translate(language, key, values);
  const title = text("replay.replayLibraryPicker.localDemos");
  return <div ref={pickerRef} className="demo-cache-picker"><WorkspaceButton type="button" onClick={onToggle} aria-expanded={open}>{title} · {entries.length}</WorkspaceButton>
    {open && <div ref={menuRef} popover="manual" style={style} className="demo-cache-list replay-library"><header><strong>{title}</strong><WorkspaceButton icon variant="quiet" type="button" aria-label={text("replay.replayLibraryPicker.close")} onClick={onClose}>×</WorkspaceButton></header>
      {loadingId && <p role="status">{text("replay.replayLibraryPicker.loadingRecording")}</p>}
      {error && <p role="alert">{error}</p>}
      <ArchiveFolderTree state={folders} items={entries} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove}
        emptyLabel={text("replay.replayLibraryPicker.noLocalDemos")}
        renderItem={entry => <article className={entry.id === activeId ? 'active' : ''} key={entry.id}>
          <WorkspaceButton variant="entry" type="button" className="demo-cache-open" onClick={() => onOpen(entry)}><strong>{entry.fileName}{entry.builtinExample && <small className="demo-recording-kind">{text("replay.replayLibraryPicker.exampleReplay")}</small>}{isRecording(entry) && <small className="demo-recording-kind">{text("replay.replayLibraryPicker.customDemo")}</small>}</strong>
            <span>{entry.map} · {entry.rounds} {isRecording(entry) ? text("replay.replayLibraryPicker.clips") : text("replay.replayLibraryPicker.rounds")}</span>
            {entry.updatedAt && <small>{new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))}</small>}
          </WorkspaceButton>
          <div className="replay-library-actions">
            {entry.storage === 'record' && <WorkspaceButton type="button" onClick={() => onShare(entry)}>{text("replay.replayLibraryPicker.share")}</WorkspaceButton>}
            <WorkspaceButton icon variant="quiet" type="button" aria-label={text("replay.replayLibraryPicker.deleteRecording")} onClick={() => onRemove(entry)}>×</WorkspaceButton>
          </div>
        </article>} />
    </div>}
  </div>;
}
