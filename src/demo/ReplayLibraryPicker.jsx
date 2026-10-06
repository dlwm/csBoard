import { localize, localeForLanguage } from '../i18n.js';
import { isRecording } from './recordings.js';
import ArchiveFolderTree from '../components/ArchiveFolderTree.jsx';

// All replay entries share this catalogue. Storage ownership controls deletion;
// it does not create a second custom-recording category or another workspace.
export default function ReplayLibraryPicker({ entries, error, loadingId, activeId, open, language, folders, onToggle, onClose, onOpen, onRemove, onShare, onCreateFolder, onDeleteFolder, onMove }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const title = text('本地 Demo', 'Local Demos', 'Локальные Demo');
  return <div className="demo-cache-picker"><button type="button" onClick={onToggle}>{title} · {entries.length}</button>
    {open && <div className="demo-cache-list replay-library"><header><strong>{title}</strong><button type="button" aria-label={text('关闭', 'Close', 'Закрыть')} onClick={onClose}>×</button></header>
      {loadingId && <p role="status">{text('正在载入录像…', 'Loading recording…', 'Загрузка записи…')}</p>}
      {error && <p role="alert">{error}</p>}
      <ArchiveFolderTree state={folders} items={entries} language={language} onCreate={onCreateFolder} onDelete={onDeleteFolder} onMove={onMove}
        emptyLabel={text('暂无本地 Demo', 'No local Demos', 'Нет локальных Demo')}
        renderItem={entry => <article className={entry.id === activeId ? 'active' : ''} key={entry.id}>
          <button type="button" className="demo-cache-open" onClick={() => onOpen(entry)}><strong>{entry.fileName}{isRecording(entry) && <small className="demo-recording-kind">{text('自制DEMO', 'Custom DEMO', 'Своя DEMO')}</small>}</strong>
            <span>{entry.map} · {entry.rounds} {isRecording(entry) ? text('片段', 'clips', 'фрагментов') : text('回合', 'rounds', 'раундов')}</span>
            {entry.updatedAt && <small>{new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))}</small>}
          </button>
          <div className="replay-library-actions">
            {entry.storage === 'record' && <button type="button" onClick={() => onShare(entry)}>{text('分享', 'Share', 'Поделиться')}</button>}
            <button type="button" aria-label={text('删除录像', 'Delete recording', 'Удалить запись')} onClick={() => onRemove(entry)}>×</button>
          </div>
        </article>} />
    </div>}
  </div>;
}
