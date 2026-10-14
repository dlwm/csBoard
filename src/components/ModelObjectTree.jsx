import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '../i18n.js';
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
    return <label className="model-object-leaf"><VisibilityCheck ids={[object.id]} hidden={hidden} onChange={onChange} disabled={disabled} label={text("view.modelObjectTree.show", { name: object.name })} /><span title={object.name}>{branch.label}</span></label>;
  }
  return <details className="model-object-branch" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}><VisibilityCheck ids={branch.ids} hidden={hidden} onChange={onChange} disabled={disabled} label={text("view.modelObjectTree.show2", { label: branch.label })} /><span title={branch.label}>{branch.label}</span><small>{branch.ids.length}</small></summary>
    {open && <div className="model-object-children">
      {branch.children.map(child => <ObjectBranch key={child.key} branch={child} hidden={hidden} onChange={onChange} text={text} disabled={disabled} />)}
      {branch.objects.map(object => <label className="model-object-leaf" key={object.id}><VisibilityCheck ids={[object.id]} hidden={hidden} onChange={onChange} disabled={disabled} label={text("view.modelObjectTree.show", { name: object.name })} /><span title={object.name}>{object.name}</span></label>)}
    </div>}
  </details>;
}
export default function ModelObjectTree({ mapName, api, language, disabled }) {
  const [open, setOpen] = useState(false), [metadata, setMetadata] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const record = useModelVisibility(mapName);
  const text = (key, values) => translate(language, key, values);
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
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}>{text("view.modelObjectTree.modelObjects")}{metadata && <small>{metadata.objects.length - hidden.size} / {metadata.objects.length}</small>}</summary>
    {open && <div className="model-object-tree-content">
      <p>{text("view.modelObjectTree.groupedByNameChangesApplyAndSaveImmediatelyNavAnd")}</p>
      {error ? <p role="alert">{error} <WorkspaceButton type="button" onClick={() => setAttempt(value => value + 1)}>{text("view.modelObjectTree.retry")}</WorkspaceButton></p> : !metadata ? <p role="status">{text("view.modelObjectTree.readingObjectNames")}</p> : <>
        <div className="model-object-tree-actions"><input className="workspace-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text("view.modelObjectTree.searchObjects")} aria-label={text("view.modelObjectTree.searchModelObjects")} /><WorkspaceButton type="button" disabled={disabled} onClick={() => toggle(metadata.objects.map(object => object.id), true)}>{text("view.modelObjectTree.showAll")}</WorkspaceButton></div>
        {saveError && <p role="alert">{saveError}</p>}
        {!tree.ids.length && <p>{text("view.modelObjectTree.noMatchingObjects")}</p>}
        <div className="model-object-tree-branches">{tree.ids.length > 0 && <ObjectBranch key={query} root branch={{ ...tree, label: 'root' }} hidden={hidden} onChange={toggle} text={text} disabled={disabled} />}</div>
      </>}
    </div>}
  </details>;
}
