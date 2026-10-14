import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useAppDialogs } from './AppDialogs.jsx';
import { useState } from 'react';
import MarkdownContent from './MarkdownContent.jsx';
import { selectReleaseNotes } from '../../shared/release-notes.js';
import { translate, formatNumber } from '../i18n.js';
import { getPlatform } from '../platform/index.js';
import useDesktopUpdateState from './useDesktopUpdateState.js';

export default function DesktopUpdates({ language, working }) {
  const dialogs = useAppDialogs(language);
  const { api, state, error: statusError } = useDesktopUpdateState();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const text = (key, values) => translate(language, key, values);
  const run = async action => {
    setPending(true); setError('');
    try { await action(); }
    catch (error) { setError(error.message); }
    finally { setPending(false); }
  };
  const notes = selectReleaseNotes(state?.notesByLanguage || { en: state?.notes }, language);
  const phase = state?.phase || 'idle';
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(phase);
  const labels = {
    idle: text("settings.desktopUpdates.updatesHaveNotBeenChecked"),
    checking: text("settings.desktopUpdates.checkingForUpdates"),
    current: text("settings.desktopUpdates.youAreUpToDate"),
    available: text("settings.desktopUpdates.anUpdateIsAvailable"),
    downloading: text("settings.desktopUpdates.downloading"),
    verifying: text("settings.desktopUpdates.verifyingTheDownload"),
    ready: text("settings.desktopUpdates.theUpdateIsReady"),
    installing: text("settings.desktopUpdates.openingTheInstaller"),
    error: text("settings.desktopUpdates.theUpdateCouldNotBeCompletedPleaseRetry"),
  };
  const errorLabels = {
    network: text("settings.desktopUpdates.couldNotReachTheUpdateServiceCheckYourConnectionAnd"),
    metadata: text("settings.desktopUpdates.releaseInformationIsInvalidPleaseTryAgainLater"),
    incomplete: text("settings.desktopUpdates.thisReleaseIsMissingItsInstallerPleaseTryAgainLater"),
    checksum: text("settings.desktopUpdates.verificationFailedDownloadTheUpdateAgain"),
    tasks: text("settings.desktopUpdates.waitForBackgroundTasksBeforeInstalling"),
    install: text("settings.desktopUpdates.couldNotOpenTheInstallerPleaseRetry"),
  };
  return <section className="desktop-updates" aria-busy={busy}>
    <h3>{text("settings.desktopUpdates.applicationUpdates")}</h3>
    <div className="desktop-update-version"><span>{text("settings.desktopUpdates.currentVersion")}</span><strong>{state?.currentVersion || '—'}</strong>{state?.latestVersion && <><span>{text("settings.desktopUpdates.newVersion")}</span><strong>{state.latestVersion}</strong></>}</div>
    <p role="status" aria-live="polite">{labels[phase]}</p>
    {state && !state.enabled && <p>{text("settings.desktopUpdates.updatesAreAvailableInThePackagedDesktopApp")}</p>}
    {(error || statusError || state?.error) && <p className="resource-pack-error" role="alert">{error || statusError || errorLabels[state.error.code] || state.error.message}</p>}
    <label className="desktop-awake"><input type="checkbox" checked={state?.autoCheck ?? true} disabled={!state || pending} onChange={event => { const autoCheck = event.target.checked; run(() => api.preferences({ autoCheck })); }} />{text("settings.desktopUpdates.checkForUpdatesAfterStartup")}</label>
    {['downloading', 'verifying', 'ready'].includes(phase) && <div className="desktop-update-progress"><progress max="100" value={state?.progress || 0} aria-label={text("settings.desktopUpdates.updateDownloadProgress")} /><span>{Math.floor(state?.progress || 0)}% · {formatNumber((state?.transferredBytes || 0) / 1024 ** 2, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / {formatNumber((state?.packageBytes || 0) / 1024 ** 2, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB</span></div>}
    <div className="desktop-manager-actions">
      <WorkspaceButton disabled={!state?.enabled || busy || pending} onClick={() => run(() => api.check())}>{text("settings.desktopUpdates.checkForUpdates")}</WorkspaceButton>
      {state?.latestVersion && ['available', 'error'].includes(phase) && <WorkspaceButton disabled={pending || !state.enabled} onClick={() => run(() => api.download())}>{text("settings.desktopUpdates.downloadUpdate")}</WorkspaceButton>}
      {phase === 'downloading' && <WorkspaceButton onClick={() => { setError(''); api.cancel().catch(error => setError(error.message)); }}>{text("settings.desktopUpdates.cancelDownload")}</WorkspaceButton>}
      {phase === 'ready' && <WorkspaceButton disabled={pending || working} onClick={async () => {
        if (state.platform !== 'darwin' && !await dialogs.confirm(text("settings.desktopUpdates.theAppWillCloseAndOpenTheInstallerSaveYour"))) return;
        run(async () => { await getPlatform().preferences.flush(); await api.install(); });
      }}>{state.platform === 'darwin' ? text("settings.desktopUpdates.openUpdatePackage") : text("settings.desktopUpdates.quitAndInstallUpdate")}</WorkspaceButton>}
    </div>
    <p>{state?.platform === 'darwin' ? text("settings.desktopUpdates.openTheDownloadedDmgQuitCsboardThenDragTheNew") : text("settings.desktopUpdates.onlyPublishedStableReleasesAreOfferedDownloadsAndInstallationRequire")}</p>
    {notes.content && <details className="desktop-update-notes"><summary>{text("settings.desktopUpdates.releaseNotes")}</summary>
      <div className="desktop-update-notes-body">
        {notes.fallback && <p className="desktop-update-notes-fallback">{text("settings.desktopUpdates.releaseNotesAreShownInEnglishBecauseATranslationIs")}</p>}
        <MarkdownContent content={notes.content} language={notes.language} />
      </div>
    </details>}
  </section>;
}
