import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n.js';

const formatBytes = value => `${((value || 0) / 1024 ** 3).toFixed(1)} GB`;
const runningPhases = new Set(['preparing', 'extracting', 'converting', 'importing', 'cleaning']);
export default function GameResourceImport({ api, language, onBusy, onImported }) {
  const [installations, setInstallations] = useState([]);
  const [selected, setSelected] = useState('');
  const [maps, setMaps] = useState([]);
  const [icons, setIcons] = useState(true);
  const [estimate, setEstimate] = useState(null);
  const [progress, setProgress] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false), seenCompletion = useRef(-1);
  const text = (key, values) => translate(language, key, values);
  const installation = installations.find(item => item.id === selected);
  const active = runningPhases.has(progress?.phase);
  const importedCallback = useRef(onImported); importedCallback.current = onImported;
  const setInstallation = item => { setSelected(item.id); setMaps(item.maps.map(map => map.key)); setEstimate(null); };
  const detect = async () => {
    setChecking(true); setError('');
    try {
      const items = await api.detect();
      if (!alive.current) return;
      setInstallations(items);
      if (items.length) setInstallation(items[0]);
      else { setSelected(''); setMaps([]); }
    } catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  useEffect(() => {
    alive.current = true;
    const accept = (value, notify = true) => {
      if (!alive.current) return;
      setProgress(previous => !previous || value.revision >= previous.revision ? value : previous);
      if (notify && ['complete', 'cancelled', 'failed'].includes(value.phase) && value.status && seenCompletion.current < value.revision) {
        seenCompletion.current = value.revision;
        importedCallback.current({ status: value.status, results: value.results });
      }
    };
    const off = api.subscribe(accept);
    api.status().then(value => { accept(value, false); if (!runningPhases.has(value.phase)) detect(); }).catch(error => { if (alive.current) setError(error.message); });
    return () => { alive.current = false; off(); };
  }, [api]);
  useEffect(() => { onBusy(active); return () => onBusy(false); }, [active, onBusy]);
  const selectionKey = JSON.stringify({ installationId: selected, maps, icons });
  useEffect(() => {
    let current = true;
    setEstimate(null);
    if (active || !selected || (!maps.length && !icons)) return undefined;
    api.estimate(JSON.parse(selectionKey)).then(value => { if (current) setEstimate({ ...value, key: selectionKey }); }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [api, selectionKey, active]);
  const choose = async () => {
    setChecking(true); setError('');
    try {
      const item = await api.choose();
      if (item && alive.current) { setInstallations(current => [...current.filter(value => value.id !== item.id), item]); setInstallation(item); }
    } catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  const start = async () => {
    setError(''); setChecking(true);
    try { await api.start(JSON.parse(selectionKey)); }
    catch (error) { if (alive.current) setError(error.message); }
    finally { if (alive.current) setChecking(false); }
  };
  const phases = {
    preparing: text("resources.gameResourceImport.preparingImport"),
    extracting: text("resources.gameResourceImport.extracting"),
    converting: text("resources.gameResourceImport.converting"),
    importing: text("resources.gameResourceImport.validatingAndSaving"),
    cleaning: text("resources.gameResourceImport.cleaningTemporaryFiles"),
    complete: text("resources.gameResourceImport.importFinished"),
    cancelled: text("resources.gameResourceImport.cancelledImportedResourcesAreKept"),
    failed: text("resources.gameResourceImport.importDidNotFinish"),
  };
  const phaseErrors = {
    space: text("resources.gameResourceImport.freeMoreDiskSpaceAndRetry"),
    timeout: text("resources.gameResourceImport.conversionTimedOutSelectFewerMapsAndRetry"),
  };
  return <section className="game-resource-import" aria-busy={active || checking}>
    <header><h3>{text("resources.gameResourceImport.importGameResources")}</h3><div><button disabled={active || checking} onClick={detect}>{text("resources.gameResourceImport.detectAgain")}</button><button disabled={active || checking} onClick={choose}>{text("resources.gameResourceImport.chooseGameFolder")}</button></div></header>
    <p>{text("resources.gameResourceImport.readsSteamInstallationInformationAndCs2ResourcesWithoutChangingGame")}</p>
    {checking && !active && <p role="status">{text("resources.gameResourceImport.checking")}</p>}
    {!checking && !installations.length && !active && <p>{text("resources.gameResourceImport.noCs2ResourcesFoundChooseAGameFolderManuallyOn")}</p>}
    {installations.length > 0 && <>
      <label className="game-installation-select">{text("resources.gameResourceImport.sourceFolder")}<select disabled={active || checking} value={selected} onChange={event => setInstallation(installations.find(item => item.id === event.target.value))}>{installations.map(item => <option key={item.id} value={item.id}>{item.directory}</option>)}</select></label>
      <fieldset disabled={active || checking}><legend>{text("resources.gameResourceImport.selectResources")}</legend><label><input type="checkbox" checked={icons} onChange={event => setIcons(event.target.checked)} />{text("resources.gameResourceImport.uiIcons")}</label><div className="game-map-selection">{installation?.maps.map(item => <label key={item.key}><input type="checkbox" checked={maps.includes(item.key)} onChange={event => setMaps(current => event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key))} />{item.key}</label>)}</div></fieldset>
      {estimate && <div className="game-import-space"><span>{text("resources.gameResourceImport.recommendedFreeSpace")}: <b>{formatBytes(estimate.requiredBytes, language)}</b></span><span>{text("resources.gameResourceImport.availableOnDataDisk")}: <b>{formatBytes(estimate.availableBytes, language)}</b></span><small>{text("resources.gameResourceImport.includesTemporaryConversionFilesFinalSizeMayDiffer")}</small></div>}
      {estimate && estimate.availableBytes < estimate.requiredBytes && <p className="resource-pack-error">{phaseErrors.space}</p>}
    </>}
    {(active || progress?.total > 0) && <div className="game-import-progress" role="status" aria-live="polite"><div><strong>{phases[progress.phase]}</strong><span>{progress.current === 'icons' ? text("resources.gameResourceImport.uiIcons") : progress.current} · {progress.completed} / {progress.total}</span></div><progress max={progress.total || 1} value={progress.completed || 0} aria-label={text("resources.gameResourceImport.overallProgress")} />{active && <div className="game-import-current"><progress aria-label={text("resources.gameResourceImport.currentStep")} />{progress.filesTotal > 1 && <span>{progress.filesCompleted} / {progress.filesTotal} {text("resources.gameResourceImport.files")}</span>}</div>}</div>}
    {(error || progress?.error) && <p className="resource-pack-error" role="alert">{error || phaseErrors[progress.error.code] || progress.error.message}</p>}
    <div className="game-import-actions">{active ? <button onClick={() => api.cancel().catch(error => setError(error.message))}>{text("resources.gameResourceImport.cancelImport")}</button> : <button className="resource-pack-primary" disabled={checking || !estimate || estimate.key !== selectionKey || estimate.availableBytes < estimate.requiredBytes} onClick={start}>{text("resources.gameResourceImport.startImport")}</button>}</div>
  </section>;
}
