import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlatform } from '../platform/index.js';
import { translate, formatBytes, formatDuration } from '../i18n.js';
import './resourcePack.css';
import './desktopManager.css';
import { useDataCleanupConfirmation } from './ConfirmDataCleanup.jsx';
import AnalysisCacheSettings from './AnalysisCacheSettings.jsx';
import DesktopUpdates from './DesktopUpdates.jsx';
import DesktopAppearance from './DesktopAppearance.jsx';
import { ModelQualitySettings, ParsingSettings } from '../settings/ReplaySettings.jsx';

export default function AppSettings({ storageWorking = false, language, onClose, initialTab = 'appearance', modelQuality, setModelQuality, sampleRate, setSampleRate }) {
  const platform = getPlatform(), api = platform.maintenance;
  const { confirm, confirmation } = useDataCleanupConfirmation(language);
  const dialog = useRef(null), mounted = useRef(false), content = useRef(null);
  const jumpTo = id => { const element = content.current?.querySelector(`#settings-${id}`); if (element) { content.current.scrollTo({ top: element.offsetTop, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); setTab(id); } };
  const [status, setStatus] = useState(null), [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [limit, setLimit] = useState('10'), [tab, setTab] = useState(initialTab);
  const bytes = value => formatBytes(value, language);
  const text = (key, values) => translate(language, key, values);
  const refresh = async () => { const value = await api.status(); if (mounted.current) setStatus(value); };
  const run = async action => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true; dialog.current.showModal();
    const scrollFrame = requestAnimationFrame(() => jumpTo(initialTab));
    if (!api) return () => { mounted.current = false; cancelAnimationFrame(scrollFrame); };
    let revision = 0;
    const off = api.onTasks(value => { revision++; if (mounted.current) setTasks(value); });
    api.tasks().then(value => { if (mounted.current && !revision) setTasks(value); }).catch(error => { if (mounted.current) setError(error.message); });
    refresh().catch(error => { if (mounted.current) setError(error.message); });
    return () => { mounted.current = false; cancelAnimationFrame(scrollFrame); off(); };
  }, []);
  const working = storageWorking || tasks.some(task => ['queued', 'running'].includes(task.state));
  const taskState = state => ({ queued: text("settings.appSettings.queued"), running: text("settings.appSettings.running"), completed: text("settings.appSettings.completed"), failed: text("settings.appSettings.failed"), cancelled: text("settings.appSettings.cancelled") })[state] || state;
  const taskLabel = task => task.kind === 'parse' ? task.label : ({
    'analysis.catalog': text("settings.appSettings.loadPlayerDirectory"),
    'analysis.timing': translate(language, "analysis.timing.title"),
    'analysis.combinations': translate(language, "analysis.combinations.title"),
    'analysis.recommendations': text("settings.appSettings.buildUtilityRecommendations"),
    'analysis.utility': text("settings.appSettings.loadUtilityReplay"),
    'analysis.query': text("settings.appSettings.analyzeSelectedDemos"),
    'json.encode': text("settings.appSettings.prepareExport"),
    'json.decode': text("settings.appSettings.readImportedData"),
    'broadcast.encode': text("settings.appSettings.prepareBroadcastData"),
    'broadcast.decode': text("settings.appSettings.readBroadcastData"),
  })[task.label] || text("settings.appSettings.backgroundComputation");
  const clean = async maxBytes => {
    const description = maxBytes == null ? text("settings.appSettings.removeUnreferencedDemoCachesWhileKeepingSavedWorkAndResources") : text("settings.appSettings.removeDemoCacheWhileKeepingSavedWorkAndResourcesSave");
    if (!await confirm(description)) return;
    await api.clean(maxBytes); location.reload();
  };
  return createPortal(<dialog ref={dialog} className="resource-pack-dialog desktop-manager" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="desktop-manager-title">
    <header className="resource-pack-header"><div><small>CSBOARD / SETTINGS</small><h2 id="desktop-manager-title">{text("settings.appSettings.settings")}</h2></div><WorkspaceButton icon className="resource-pack-close" disabled={busy} onClick={onClose} aria-label={text("settings.appSettings.close")}>×</WorkspaceButton></header>
    <div className="settings-layout">
    <nav className="settings-nav" aria-label={text("settings.appSettings.settingsSections")}>
      {[
        ['appearance', text("settings.appSettings.appearance")],
        ['models', text("settings.appSettings.modelSimplification")],
        ...(getPlatform().capabilities.demoParsing ? [['parsing', text("settings.appSettings.demoParsing")]] : []),
        ['storage', text("settings.appSettings.storageBackups")],
        ...(api ? [['tasks', text("settings.appSettings.backgroundTasks")]] : []),
        ...(getPlatform().updates ? [['updates', text("settings.appSettings.updates")]] : []),
      ].map(([id, label]) => <WorkspaceButton type="button" key={id} aria-current={tab === id ? 'location' : undefined} onClick={() => jumpTo(id)}>{label}</WorkspaceButton>)}
    </nav>
    <div ref={content} className="desktop-manager-content" aria-busy={busy} onScroll={() => {
      const nodes = [...content.current.querySelectorAll('[data-settings-section]')];
      const top = content.current.getBoundingClientRect().top;
      const active = nodes.findLast(node => node.getBoundingClientRect().top <= top + 40) || nodes[0];
      if (active) setTab(active.dataset.settingsSection);
    }}>
      {error && <p className="resource-pack-error" role="alert">{error}</p>}{message && <p className="desktop-manager-message" role="status">{text(message)}</p>}
      <section id="settings-appearance" data-settings-section="appearance"><h2>{text("settings.appSettings.appearance")}</h2><DesktopAppearance language={language} /></section>
      <section id="settings-models" data-settings-section="models"><h2>{text("settings.appSettings.modelSimplification")}</h2><ModelQualitySettings language={language} value={modelQuality} onChange={setModelQuality} /></section>
      {getPlatform().capabilities.demoParsing && <section id="settings-parsing" data-settings-section="parsing"><h2>{text("settings.appSettings.demoParsing")}</h2><ParsingSettings language={language} value={sampleRate} onChange={setSampleRate} /></section>}
      {!api && <section id="settings-storage" data-settings-section="storage"><h2>{text("settings.appSettings.storageBackups")}</h2>
        <p>{text("settings.appSettings.dataIsStoredOnThisDeviceCleanupDeletesLocalArchives")}</p>
        <div className="desktop-manager-actions"><WorkspaceButton type="button" disabled={busy || working || !platform.clearData} onClick={async () => {
          if (working) return;
          if (!await confirm(text("settings.appSettings.savedCsboardDataOnThisDeviceWillBePermanentlyDeleted"))) return;
          run(async () => { await platform.clearData(); location.reload(); });
        }}>{text("settings.appSettings.clearLocalData")}</WorkspaceButton></div>
      </section>}
      {api && <section id="settings-storage" data-settings-section="storage"><h2>{text("settings.appSettings.storageBackups")}</h2>
        <div className="desktop-storage-summary">
          {[[text("settings.appSettings.databaseIncludesSavedWork"), status?.databaseBytes], [text("settings.appSettings.demoCache"), status?.cacheBytes], [text("settings.appSettings.analysisCache"), status?.analysisBytes], [text("settings.appSettings.importedResources"), status?.resourceBytes], [text("settings.appSettings.unreferencedCache"), status?.orphanBytes], [text("settings.appSettings.parseStagingFiles"), status?.stagingBytes], [text("settings.appSettings.restoreSafetyCopies"), status?.recoveryBytes]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{status ? bytes(value) : '—'}</strong></div>)}
        </div>
        <section><h3>{text("settings.appSettings.cacheCleanup")}</h3><p>{text("settings.appSettings.removeLeastRecentlyUsedDemoCachesUntilTheSelectedSize")}</p>
          <div className="desktop-manager-actions"><label>{text("settings.appSettings.keepUpTo")} <input className="workspace-input" type="number" min="0" max="100000" step="1" value={limit} onChange={event => setLimit(event.target.value)} /> GB</label><WorkspaceButton disabled={busy || working || !status || limit.trim() === '' || !Number.isFinite(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000} onClick={() => run(() => clean(Math.round(Number(limit) * 1024 ** 3)))}>{text("settings.appSettings.cleanOldCache")}</WorkspaceButton><WorkspaceButton disabled={busy || working || !status?.orphanBytes} onClick={() => run(() => clean(null))}>{text("settings.appSettings.cleanUnreferencedCache")}</WorkspaceButton></div>
        </section>
        <AnalysisCacheSettings api={api} language={language} working={working || busy} />
        <section><h3>{text("settings.appSettings.backupRestore")}</h3><p>{text("settings.appSettings.backupsIncludeNativeSavedWorkDemoCachesAndImportedResources")}</p>
          <div className="desktop-manager-actions"><WorkspaceButton disabled={busy || working} onClick={() => run(async () => { const result = await api.backup(); if (result && mounted.current) setMessage({ key: "settings.appSettings.backupSaved", values: { path: result.path } }); })}>{text("settings.appSettings.createBackup")}</WorkspaceButton><WorkspaceButton disabled={busy || working} onClick={() => run(() => api.restore())}>{text("settings.appSettings.restoreBackup")}</WorkspaceButton><WorkspaceButton disabled={busy} onClick={() => run(() => api.openFolder())}>{text("settings.appSettings.openDataFolder")}</WorkspaceButton></div>
        </section>
      </section>}
      {api && <section id="settings-tasks" data-settings-section="tasks"><h2>{text("settings.appSettings.backgroundTasks")}</h2>
        <label className="desktop-awake"><input type="checkbox" checked={status?.keepAwake || false} disabled={busy || !status} onChange={event => { const checked = event.target.checked; run(async () => { const value = await api.keepAwake(checked); setStatus(current => ({ ...current, keepAwake: value })); }); }} />{text("settings.appSettings.preventAutomaticSleepDuringTasksForThisSession")}</label>
        <p>{text("settings.appSettings.parsingAndComputationUseBoundedQueuesAndContinueWhenMinimized")}</p>
        <ul className="desktop-task-list">{[...tasks].reverse().map(task => <li key={task.id}><div><strong>{taskLabel(task)}</strong><small>{taskState(task.state)}{task.progress != null && task.state === 'running' ? ` · ${Math.round(task.progress)}%` : ''}{task.finishedAt && task.startedAt ? ` · ${formatDuration(task.finishedAt - task.startedAt, language)}` : ''}</small>{task.allocation?.threads && <small className="desktop-task-allocation"> · {task.allocation.threads} {text("settings.appSettings.threads")}{task.metrics?.peakBytes ? ` · ${bytes(task.metrics.peakBytes)}` : ''}</small>}{task.error && <p className="resource-pack-error">{task.error}</p>}</div>{['queued', 'running'].includes(task.state) && <WorkspaceButton onClick={() => run(() => api.cancelTask(task.id))} disabled={busy}>{text("settings.appSettings.cancel")}</WorkspaceButton>}</li>)}</ul>
        {!tasks.length && <p>{text("settings.appSettings.noBackgroundTasksYet")}</p>}
      </section>}
      {getPlatform().updates && <section id="settings-updates" data-settings-section="updates"><h2>{text("settings.appSettings.updates")}</h2><DesktopUpdates language={language} working={working} /></section>}
    </div></div>
    {api && <footer className="resource-pack-footer"><p>{busy ? text("settings.appSettings.working") : working ? text("settings.appSettings.storageMaintenanceWaitsForBackgroundTasks") : text("settings.appSettings.savedWorkIsKeptSeparateFromRebuildableCaches")}</p><WorkspaceButton disabled={busy} onClick={() => run(refresh)}>{text("settings.appSettings.refreshUsage")}</WorkspaceButton></footer>}
  {confirmation}</dialog>, document.body);
}
