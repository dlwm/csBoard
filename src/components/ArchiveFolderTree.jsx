import { useState } from 'react';
import { localize } from '../i18n.js';
import { folderChildren, folderOptions, ROOT_FOLDER_ID } from '../app/archiveFolders.js';

const label = (language, zh, en, ru) => localize(language, { zh, en, ru });
const DRAG_TYPE = 'application/x-csboard-archive-node';

export function FolderSelect({ state, value, onChange, language }) {
  return <select value={value || ROOT_FOLDER_ID} onChange={(event) => onChange(event.target.value)}>
    {folderOptions(state).map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.id === ROOT_FOLDER_ID ? 'Root' : folder.label}</option>)}
  </select>;
}

export default function ArchiveFolderTree({ state, items, language, onCreate, onDelete, onMove, renderItem, emptyLabel }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(ROOT_FOLDER_ID);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropTarget, setDropTarget] = useState('');
  const toggle = (id) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const startDrag = (event, type, id) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type, id }));
    event.dataTransfer.setData('text/plain', id);
  };
  const allowDrop = (event, type, id) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(`${type}:${id}`);
  };
  const drop = (event, type, id) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget('');
    try {
      const source = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
      if (!['folder', 'item'].includes(source.type) || !source.id) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const fraction = (event.clientY - bounds.top) / Math.max(1, bounds.height);
      const position = id === ROOT_FOLDER_ID ? 'inside' : type === 'item'
        ? fraction < 0.5 ? 'before' : 'after'
        : fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside';
      onMove(source, { type, id }, position);
      if (type === 'folder' && position === 'inside') setCollapsed((current) => new Set([...current].filter((item) => item !== id)));
    } catch { /* Ignore unrelated external drags. */ }
  };
  const submitFolder = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (await onCreate(name, parentId)) { setName(''); setParentId(ROOT_FOLDER_ID); setCreating(false); }
  };
  const deleteFolder = (id) => {
    if (!window.confirm(label(language, '删除文件夹？里面的内容会移到上一级，不会删除存档。', 'Delete folder? Its contents will move to the parent without deleting archives.', 'Удалить папку? Содержимое переместится на уровень выше, архивы сохранятся.'))) return;
    onDelete(id);
  };
  const children = (parent, depth, ancestors = new Set()) => folderChildren(state, items, parent).map((entry) => {
    if (entry.type === 'item') return <div key={`item-${entry.id}`} className={`folder-tree-item${dropTarget === `item:${entry.id}` ? ' drop-target' : ''}`} style={{ '--folder-depth': depth }} draggable onDragStart={(event) => startDrag(event, 'item', entry.id)} onDragOver={(event) => allowDrop(event, 'item', entry.id)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'item', entry.id)}>{renderItem(entry.value)}</div>;
    if (ancestors.has(entry.id)) return null;
    const closed = collapsed.has(entry.id);
    return <div key={`folder-${entry.id}`} className="folder-tree-branch">
      <div className={`folder-tree-row${dropTarget === `folder:${entry.id}` ? ' drop-target' : ''}`} style={{ '--folder-depth': depth }} draggable onDragStart={(event) => startDrag(event, 'folder', entry.id)} onDragOver={(event) => allowDrop(event, 'folder', entry.id)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'folder', entry.id)}>
        <button type="button" className="folder-tree-toggle" aria-label={closed ? label(language, '展开', 'Expand', 'Развернуть') : label(language, '收起', 'Collapse', 'Свернуть')} onClick={() => toggle(entry.id)}>{closed ? '▸' : '▾'}</button>
        <span className="folder-tree-name" title={entry.value.name}>▣ {entry.value.name}</span>
        <button type="button" className="folder-tree-delete" aria-label={label(language, '删除文件夹', 'Delete folder', 'Удалить папку')} onClick={() => deleteFolder(entry.id)}>×</button>
      </div>
      {!closed && children(entry.id, depth + 1, new Set([...ancestors, entry.id]))}
    </div>;
  });

  return <div className="folder-tree">
    <div className="folder-tree-heading"><strong>{label(language, '目录', 'Folders', 'Папки')}</strong><button type="button" onClick={() => setCreating(true)}>＋ {label(language, '新建文件夹', 'New folder', 'Новая папка')}</button></div>
    <div className="folder-tree-scroll">
      <div className={`folder-tree-row root${dropTarget === `folder:${ROOT_FOLDER_ID}` ? ' drop-target' : ''}`} onDragOver={(event) => allowDrop(event, 'folder', ROOT_FOLDER_ID)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'folder', ROOT_FOLDER_ID)}><span className="folder-tree-name">▣ Root</span><small>{items.length}</small></div>
      {items.length || state.folders.length ? children(ROOT_FOLDER_ID, 0) : <div className="archive-empty">{emptyLabel}</div>}
    </div>
    {creating && <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><form className="save-archive-dialog folder-create-dialog" onSubmit={submitFolder}>
      <header><strong>{label(language, '新建文件夹', 'New folder', 'Новая папка')}</strong><button type="button" onClick={() => setCreating(false)}>×</button></header>
      <label className="collab-utility-search"><span>{label(language, '上级目录', 'Parent folder', 'Родительская папка')}</span><FolderSelect state={state} value={parentId} onChange={setParentId} language={language} /></label>
      <label className="collab-utility-search"><span>{label(language, '名称', 'Name', 'Название')}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="save-archive-actions"><button type="button" onClick={() => setCreating(false)}>{label(language, '取消', 'Cancel', 'Отмена')}</button><button type="submit" disabled={!name.trim()}>{label(language, '创建', 'Create', 'Создать')}</button></div>
    </form></div>}
  </div>;
}
