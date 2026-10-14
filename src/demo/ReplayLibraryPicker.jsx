import { translate, localeForLanguage } from '../i18n.js';
import { isRecording } from './recordings.js';
import ArchiveFolderTree from '../components/ArchiveFolderTree.jsx';

// All replay entries share this catalogue. Storage ownership controls deletion;
// it does not create a second custom-recording category or another workspace.
export default function ReplayLibraryPicker({ entries, error, loadingId, activeId, open, language, folders, onToggle, onClose, onOpen, onRemove, onShare, onCreateFolder, onDeleteFolder, onMove }) {
  const text = (key, values) => translate(language, key, values);
  const title = text("replay.replayLibraryPicker.localDemos");
  return <div className="demo-cache-picker"><button type="button" onClick={onToggle}>{title} · {entries.length}</button>
    {open && <div className="demo-cache-list replay-library"><header><strong>{title}</strong><button type="button" aria-label={text("replay.replayLibraryPicker.close")} onClick={onClose}>×</button></header>
      {loadingId && <p role="status">{text("replay.replayLibraryPicker.loadingRecording")}</p>}
      {error && <p role="alert">{error}</p>}
      <ArchiveFolderTree state={folders} items={entries} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove}
        emptyLabel={text("replay.replayLibraryPicker.noLocalDemos")}
        renderItem={entry => <article className={entry.id === activeId ? 'active' : ''} key={entry.id}>
          <button type="button" className="demo-cache-open" onClick={() => onOpen(entry)}><strong>{entry.fileName}{entry.builtinExample && <small className="demo-recording-kind">{text("replay.replayLibraryPicker.exampleReplay")}</small>}{isRecording(entry) && <small className="demo-recording-kind">{text("replay.replayLibraryPicker.customDemo")}</small>}</strong>
            <span>{entry.map} · {entry.rounds} {isRecording(entry) ? text("replay.replayLibraryPicker.clips") : text("replay.replayLibraryPicker.rounds")}</span>
            {entry.updatedAt && <small>{new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))}</small>}
          </button>
          <div className="replay-library-actions">
            {entry.storage === 'record' && <button type="button" onClick={() => onShare(entry)}>{text("replay.replayLibraryPicker.share")}</button>}
            <button type="button" aria-label={text("replay.replayLibraryPicker.deleteRecording")} onClick={() => onRemove(entry)}>×</button>
          </div>
        </article>} />
    </div>}
  </div>;
}
