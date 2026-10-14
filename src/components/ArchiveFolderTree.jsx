import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useAppDialogs } from './AppDialogs.jsx';
import { useId, useState } from 'react';
import { translate } from '../i18n.js';
import { folderChildren, folderOptions, ROOT_FOLDER_ID } from '../app/archiveFolders.js';

const DRAG_TYPE = 'application/x-csboard-archive-node';

export function FolderSelect({ state, value, onChange, language }) {
  return <select className="workspace-input" value={value || ROOT_FOLDER_ID} onChange={(event) => onChange(event.target.value)}>
    {folderOptions(state).map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.id === ROOT_FOLDER_ID ? translate(language, 'common.folders.root') : folder.label}</option>)}
  </select>;
}

export default function ArchiveFolderTree({ state, items, language, onCreate, onDelete, onMove, renderItem, emptyLabel, toolbarActions, compareItems }) {
  const dialogs = useAppDialogs(language);
  const rootContentId = useId();
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
  const deleteFolder = async (id) => {
    if (!await dialogs.confirm(translate(language, "common.folders.deleteFolderItsContentsWillMoveToThe"))) return;
    onDelete(id);
  };
  const children = (parent, depth, ancestors = new Set()) => {
    const entries=folderChildren(state, items, parent);
    entries.sort((a,b)=>a.type!==b.type ? (a.type==='folder' ? -1 : 1) : a.type==='item' && compareItems ? compareItems(a.value,b.value) : a.order-b.order);
    return entries.map((entry) => {
    if (entry.type === 'item') return <div key={`item-${entry.id}`} className={`folder-tree-item${dropTarget === `item:${entry.id}` ? ' drop-target' : ''}`} style={{ '--folder-depth': depth }} draggable onDragStart={(event) => startDrag(event, 'item', entry.id)} onDragOver={(event) => allowDrop(event, 'item', entry.id)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'item', entry.id)}>{renderItem(entry.value)}</div>;
    if (ancestors.has(entry.id)) return null;
    const closed = collapsed.has(entry.id);
    return <div key={`folder-${entry.id}`} className="folder-tree-branch">
      <div className={`folder-tree-row${dropTarget === `folder:${entry.id}` ? ' drop-target' : ''}`} style={{ '--folder-depth': depth }} draggable onDragStart={(event) => startDrag(event, 'folder', entry.id)} onDragOver={(event) => allowDrop(event, 'folder', entry.id)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'folder', entry.id)}>
        <WorkspaceButton compact type="button" className="folder-tree-toggle" aria-label={closed ? translate(language, "common.folders.expand") : translate(language, "common.folders.collapse")} onClick={() => toggle(entry.id)}>{closed ? '▸' : '▾'}</WorkspaceButton>
        <span className="folder-tree-name" title={entry.value.name}>▣ {entry.value.name}</span>
        <WorkspaceButton compact icon variant="quiet" type="button" className="folder-tree-delete" aria-label={translate(language, "common.folders.deleteFolder")} onClick={() => deleteFolder(entry.id)}>×</WorkspaceButton>
      </div>
      {!closed && children(entry.id, depth + 1, new Set([...ancestors, entry.id]))}
    </div>;
  });
  };

  return <div className="folder-tree">
    <div className="folder-tree-heading"><strong>{translate(language, "common.folders.folders")}</strong><div className="folder-tree-actions">{toolbarActions}<WorkspaceButton compact type="button" onClick={() => setCreating(true)}>＋ {translate(language, "common.folders.newFolder")}</WorkspaceButton></div></div>
    <div className="folder-tree-scroll">
      <div className={`folder-tree-row root${dropTarget === `folder:${ROOT_FOLDER_ID}` ? ' drop-target' : ''}`} onDragOver={(event) => allowDrop(event, 'folder', ROOT_FOLDER_ID)} onDragLeave={() => setDropTarget('')} onDrop={(event) => drop(event, 'folder', ROOT_FOLDER_ID)}><WorkspaceButton compact variant="entry" className="folder-tree-root-toggle" aria-expanded={!collapsed.has(ROOT_FOLDER_ID)} aria-controls={rootContentId} onClick={() => toggle(ROOT_FOLDER_ID)}><span aria-hidden="true">{collapsed.has(ROOT_FOLDER_ID) ? '▸' : '▾'}</span><span className="folder-tree-name">▣ {translate(language, 'common.folders.root')}</span><small>{items.length}</small></WorkspaceButton></div>
      <div id={rootContentId} hidden={collapsed.has(ROOT_FOLDER_ID)}>{items.length || state.folders.length ? children(ROOT_FOLDER_ID, 0) : <div className="archive-empty">{emptyLabel}</div>}</div>
    </div>
    {creating && <div className="save-archive-modal" onClick={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><form className="save-archive-dialog folder-create-dialog" onSubmit={submitFolder}>
      <header><strong>{translate(language, "common.folders.newFolder")}</strong><WorkspaceButton compact icon variant="quiet" type="button" onClick={() => setCreating(false)}>×</WorkspaceButton></header>
      <label className="collab-utility-search"><span>{translate(language, "common.folders.parentFolder")}</span><FolderSelect state={state} value={parentId} onChange={setParentId} language={language} /></label>
      <label className="collab-utility-search"><span>{translate(language, "common.folders.name")}</span><input className="workspace-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="save-archive-actions"><WorkspaceButton compact type="button" onClick={() => setCreating(false)}>{translate(language, "common.folders.cancel")}</WorkspaceButton><WorkspaceButton compact type="submit" disabled={!name.trim()}>{translate(language, "common.folders.create")}</WorkspaceButton></div>
    </form></div>}
  </div>;
}
