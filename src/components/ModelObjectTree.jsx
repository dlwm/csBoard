import { useEffect, useMemo, useRef, useState } from 'react';
import { localize } from '../i18n.js';
import { buildModelObjectTree, isModelObjectLeaf } from '../../shared/map-model-objects.js';
import { setModelVisibility, useModelVisibility } from '../resources/modelVisibility.js';

function VisibilityCheck({ ids, hidden, onChange, label, disabled }) {
  const ref = useRef(null);
  const count = ids.reduce((count, id) => count + Number(!hidden.has(id)), 0);
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < ids.length; }, [count, ids.length]);
  return <input ref={ref} type="checkbox" checked={count === ids.length} disabled={disabled} aria-label={label}
    onClick={event => event.stopPropagation()} onChange={event => onChange(ids, event.target.checked)} />;
}
function ObjectBranch({ branch, hidden, onChange, text, disabled, root = false }) {
  const [open, setOpen] = useState(root);
  if (!root && isModelObjectLeaf(branch)) {
    const object = branch.objects[0];
    return <label className="model-object-leaf"><VisibilityCheck ids={[object.id]} hidden={hidden} onChange={onChange} disabled={disabled} label={text(`显示 ${object.name}`, `Show ${object.name}`, `Показать ${object.name}`)} /><span title={object.name}>{branch.label}</span></label>;
  }
  return <details className="model-object-branch" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}><VisibilityCheck ids={branch.ids} hidden={hidden} onChange={onChange} disabled={disabled} label={text(`显示 ${branch.label}`, `Show ${branch.label}`, `Показать ${branch.label}`)} /><span title={branch.label}>{branch.label}</span><small>{branch.ids.length}</small></summary>
    {open && <div className="model-object-children">
      {branch.children.map(child => <ObjectBranch key={child.key} branch={child} hidden={hidden} onChange={onChange} text={text} disabled={disabled} />)}
      {branch.objects.map(object => <label className="model-object-leaf" key={object.id}><VisibilityCheck ids={[object.id]} hidden={hidden} onChange={onChange} disabled={disabled} label={text(`显示 ${object.name}`, `Show ${object.name}`, `Показать ${object.name}`)} /><span title={object.name}>{object.name}</span></label>)}
    </div>}
  </details>;
}
export default function ModelObjectTree({ mapName, api, language, disabled }) {
  const [open, setOpen] = useState(false), [metadata, setMetadata] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const record = useModelVisibility(mapName);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  useEffect(() => {
    if (!open || metadata) return undefined;
    let cancelled = false;
    setError('');
    api.modelObjects(mapName).then(result => { if (!cancelled) setMetadata(result); }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [open, metadata, api, mapName, attempt]);
  const hidden = useMemo(() => new Set(record.signature === metadata?.signature ? record.hidden : []), [record, metadata]);
  const tree = useMemo(() => buildModelObjectTree(metadata?.objects || [], query), [metadata, query]);
  const [saveError, setSaveError] = useState('');
  const toggle = (ids, visible) => {
    const next = new Set(hidden);
    for (const id of ids) { if (visible) next.delete(id); else next.add(id); }
    try { setModelVisibility(mapName, metadata.signature, [...next]); setSaveError(''); }
    catch (error) { setSaveError(error.message); }
  };
  return <details className="model-object-tree" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}>{text('模型对象', 'Model objects', 'Объекты модели')}{metadata && <small>{metadata.objects.length - hidden.size} / {metadata.objects.length}</small>}</summary>
    {open && <div className="model-object-tree-content">
      <p>{text('按名称分组，立即应用并保存。仅控制模型显示，NAV 与碰撞不变。', 'Grouped by name; changes apply and save immediately. NAV and collisions stay unchanged.', 'Группировка по имени; изменения применяются и сохраняются сразу. NAV и столкновения не меняются.')}</p>
      {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>{text('重试', 'Retry', 'Повторить')}</button></p> : !metadata ? <p role="status">{text('正在读取对象名称…', 'Reading object names…', 'Чтение имён объектов…')}</p> : <>
        <div className="model-object-tree-actions"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text('搜索对象名称…', 'Search objects…', 'Поиск объектов…')} aria-label={text('搜索模型对象', 'Search model objects', 'Поиск объектов модели')} /><button type="button" disabled={disabled} onClick={() => toggle(metadata.objects.map(object => object.id), true)}>{text('全部显示', 'Show all', 'Показать всё')}</button></div>
        {saveError && <p role="alert">{saveError}</p>}
        {!tree.ids.length && <p>{text('没有匹配的对象', 'No matching objects', 'Нет подходящих объектов')}</p>}
        <div className="model-object-tree-branches">{tree.ids.length > 0 && <ObjectBranch key={query} root branch={{ ...tree, label: 'root' }} hidden={hidden} onChange={toggle} text={text} disabled={disabled} />}</div>
      </>}
    </div>}
  </details>;
}
