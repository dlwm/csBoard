import { useAppDialogs } from './AppDialogs.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import catalog from '../resources/catalog.json';
import { getPlatform } from '../platform/index.js';
import { markResourcesChanged, resourceReloadPending } from '../app/resourcePacks.js';
import { translate } from '../i18n.js';
import './resourcePack.css';
import GameResourceImport from './GameResourceImport.jsx';
import ModelObjectTree from './ModelObjectTree.jsx';

export default function ResourcePackModal({ language, onClose }) {
  const dialogs = useAppDialogs(language);
  const ref = useRef(null);
  const mounted = useRef(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [kind, setKind] = useState('models');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(resourceReloadPending);
  const [gameOpen, setGameOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const text = (key, values) => translate(language, key, values);
  const resources = getPlatform().resources;
  const inspect = async () => {
    setChecking(true);
    setError('');
    try { const value = await resources.status(); if (mounted.current) { setStatus(value); setRevision(value => value + 1); } }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setChecking(false); }
  };
  useEffect(() => {
    mounted.current = true;
    ref.current.showModal();
    inspect();
    return () => { mounted.current = false; };
  }, []);
  const importFiles = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await resources.importFiles();
      if (!mounted.current) return;
      setStatus(result.status); setRevision(value => value + 1);
      setResults(result.results);
      if (result.results.some(item => item.ok)) { markResourcesChanged(); setChanged(true); }
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const removeResource = async key => {
    if (!await dialogs.confirm(text("resources.resourcePackModal.removeReloadToUseTheDefaultIconOrNavMap", { key: key }))) return;
    setBusy(true); setError('');
    try {
      const result = await resources.remove(kind, key);
      if (!mounted.current) return;
      setStatus(result.status); setRevision(value => value + 1);
      markResourcesChanged(); setChanged(true);
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const keys = catalog[kind === 'icons' ? 'icons' : 'maps'];
  const entries = useMemo(() => keys.filter(key => {
    const installed = Boolean(status?.[kind]?.[key]);
    return key.includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'installed' ? installed : !installed));
  }), [keys, kind, status, query, filter]);
  const installedCount = keys.filter(key => status?.[kind]?.[key]).length;
  const succeeded = results.filter(item => item.ok).length;
  const reload = async () => {
    if (await dialogs.confirm(text("resources.resourcePackModal.reloadToApplyResourcesSaveUnsavedCollaborationWorkFirst"))) location.reload();
  };
  return createPortal(<dialog ref={ref} className="resource-pack-dialog" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="resource-pack-title">
    <header className="resource-pack-header">
      <div><small>CSBOARD / RESOURCES</small><h2 id="resource-pack-title">{text("resources.resourcePackModal.resourceLibrary")}</h2></div>
      <button className="resource-pack-close" type="button" disabled={busy} onClick={onClose} aria-label={text("resources.resourcePackModal.close")}>×</button>
    </header>
    <div className="resource-pack-body">
      <nav className="resource-pack-nav" aria-label={text("resources.resourcePackModal.resourceType")}>
        {['models', 'icons'].map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setQuery(''); }}>
          <span>{value === 'models' ? text("resources.resourcePackModal.mapModels") : text("resources.resourcePackModal.uiIcons")}</span>
          <b>{status ? catalog[value === 'models' ? 'maps' : 'icons'].filter(key => status[value]?.[key]).length : '—'}<small> / {catalog[value === 'models' ? 'maps' : 'icons'].length}</small></b>
          <i>{value === 'models' ? 'GLB' : 'SVG'}</i>
        </button>)}
        <p>{text("resources.resourcePackModal.addResourcesAsYouNeedThem")}</p>
      </nav>
      <section className="resource-pack-content" aria-busy={busy || checking}>
        <div className="resource-pack-section-heading"><h3>{kind === 'models' ? text("resources.resourcePackModal.mapModels") : text("resources.resourcePackModal.uiIcons")}</h3><span>{status ? `${installedCount} / ${keys.length}` : '—'}</span></div>
        <p className="resource-pack-hint">{kind === 'models'
          ? text("resources.resourcePackModal.importsRemoveTexturesForASimplifiedMapOriginalsStayUnchanged")
          : text("resources.resourcePackModal.missingIconsUseTheDefaultStyleMatchFilenamesToThe")}</p>
        {changed && <div className="resource-pack-apply-notice" role="status">
          <div><strong>{text("resources.resourcePackModal.resourcesChangedNotYetApplied")}</strong><p>{text("resources.resourcePackModal.restartTheAppOrReloadToApplyNowSaveUnsaved")}</p></div>
          <button type="button" disabled={busy} onClick={reload}>{text("resources.resourcePackModal.reloadAndApply")}</button>
        </div>}
        {gameOpen && <GameResourceImport api={resources.game} language={language} onBusy={setBusy} onImported={result => {
          setStatus(result.status); setRevision(value => value + 1); setResults(result.results);
          if (result.results.some(item => item.ok)) { markResourcesChanged(); setChanged(true); }
        }} />}
        <div className="resource-pack-toolbar">
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text("resources.resourcePackModal.searchFilenames")} aria-label={text("resources.resourcePackModal.searchResources")} />
          <select value={filter} onChange={event => setFilter(event.target.value)} aria-label={text("resources.resourcePackModal.importStatus")}>
            <option value="all">{text("resources.resourcePackModal.all")}</option><option value="installed">{text("resources.resourcePackModal.ready")}</option><option value="missing">{text("resources.resourcePackModal.missing")}</option>
          </select>
          <button type="button" disabled={busy || checking} onClick={inspect}>{text("resources.resourcePackModal.refresh")}</button>
        </div>
        {error && <p className="resource-pack-error" role="alert">{error}</p>}
        <div className="resource-pack-scroll">
          {!status ? <p className="resource-pack-empty">{checking ? text("resources.resourcePackModal.loadingResources") : text("resources.resourcePackModal.unableToLoadResourcesTryAgain")}</p> : <ul className={`resource-pack-list resource-pack-${kind}`}>
            {entries.map(key => <li className="resource-pack-entry" key={key} data-installed={Boolean(status[kind]?.[key])}>
              <div className="resource-pack-entry-heading"><span className="resource-pack-mark" aria-hidden="true">{kind === 'icons' && status.icons[key] ? <img src={`/resource-pack/icons/${key}.svg`} alt="" /> : kind === 'models' ? '◇' : '◈'}</span>
              <div><strong>{key}</strong><small>{key}.{kind === 'icons' ? 'svg' : 'glb'}</small></div>
              <span className="resource-pack-badge">{status[kind]?.[key] === 'local' ? text("resources.resourcePackModal.localTest") : status[kind]?.[key] ? text("resources.resourcePackModal.ready") : text("resources.resourcePackModal.missing")}</span>
              {resources.remove && status[kind]?.[key] && status[kind][key] !== 'local' && <button className="resource-pack-remove" type="button" disabled={busy || checking} aria-label={text("resources.resourcePackModal.remove", { key: key })} onClick={() => removeResource(key)}>{text("resources.resourcePackModal.remove2")}</button>}
              </div>
              {kind === 'models' && status.models[key] && resources.modelObjects && <ModelObjectTree key={`${key}:${revision}`} mapName={key} api={resources} language={language} disabled={busy || checking} />}
            </li>)}
          </ul>}
          {status && !entries.length && <p className="resource-pack-empty">{text("resources.resourcePackModal.noMatchingResources")}</p>}
        </div>
        {results.length > 0 && <details className="resource-pack-results" open={succeeded !== results.length}>
          <summary>{text("resources.resourcePackModal.importResults")} · {text("resources.resourcePackModal.importedSkipped", { succeeded: succeeded, value2: results.length - succeeded })}</summary>
          <ul>{results.map((item, index) => <li key={index} data-success={item.ok}><b>{item.ok ? text("resources.resourcePackModal.imported") : text("resources.resourcePackModal.skipped")}</b><span>{item.name}{item.target && item.target !== item.name ? ` → ${item.target}` : ''}{item.error ? ` — ${item.error}` : ''}</span></li>)}</ul>
        </details>}
      </section>
    </div>
    <footer className="resource-pack-footer">
      <p role="status">{changed ? text("resources.resourcePackModal.resourcesChangedReloadToApply") : text("resources.resourcePackModal.validatedFilesReplaceMatchingNamesSelectMultipleSvgGlbFiles")}</p>
      <div>{changed && <button type="button" disabled={busy} onClick={reload}>{text("resources.resourcePackModal.reloadAndApply")}</button>}{resources.game && <button type="button" disabled={busy || checking} aria-expanded={gameOpen} onClick={() => setGameOpen(value => !value)}>{text("resources.resourcePackModal.importGameResources")}</button>}<button className="resource-pack-primary" type="button" disabled={busy || checking} onClick={importFiles}>{busy ? text("resources.resourcePackModal.importing") : text("resources.resourcePackModal.importResources")}</button></div>
    </footer>
  </dialog>, document.body);
}
