import { WorkspacePanelHeading } from '../components/workspace/WorkspaceControls.jsx';
import './analysis.css';
import { WorkspacePanel, WorkspaceTarget } from '../components/workspace/WorkspaceSlots.jsx';
// Composes the Analysis sidebar without owning data loading or scene rendering.
import AnalysisQueryStatus from './AnalysisQueryStatus.jsx';
import AnalysisPlayerPicker from './AnalysisPlayerPicker.jsx';
import { localeForLanguage, translate as translateMessage } from '../i18n.js';

export default function AnalysisPanel({
  language,
  translate,
  mapName,
  status,
  players,
  playersLoading,
  queryLoading,
  queryError,
  analysisData,
  flags,
  selectedPlayers,
  playerQuery,
  onPlayerQueryChange,
  onPlayerToggle,
  onPlayersClear,
  demos,
  selectedDemoIds,
  onToggleDemo,
  side,
  onSideChange,
}) {
  const text = (key, values) => translateMessage(language, key, values);
  const hasPlayers = selectedPlayers.length > 0;
  return <WorkspacePanel className="analysis-panel" data-tour="analysis" aria-busy={queryLoading}>
    <WorkspacePanelHeading title={translate('analysis')} subtitle={mapName.replace(/^de_/, '').toUpperCase()} />
    <p className="collab-note">{text("analysis.analysisPanel.aggregateSelectedPlayersAcrossParsedDemos", { value1: mapName.toUpperCase() })}</p>
    <AnalysisQueryStatus language={language} loading={queryLoading} error={queryError} data={analysisData} flags={flags} side={side} enabled={hasPlayers && selectedDemoIds.length > 0} />
    {status && <div className="analysis-status">{status}</div>}
    <AnalysisPlayerPicker language={language} players={players} loading={playersLoading} values={selectedPlayers} query={playerQuery} onQueryChange={onPlayerQueryChange} onToggle={onPlayerToggle} onClear={onPlayersClear} />
    {hasPlayers && <section className="analysis-demo-picker">
      <header><span>{text("analysis.analysisPanel.analysisDemos")}</span><b>{selectedDemoIds.length}/{demos.length}</b></header>
      <div>{demos.map((entry, index) => <label key={entry.id} className={selectedDemoIds.includes(entry.id) ? 'selected' : ''}>
        <input type="checkbox" checked={selectedDemoIds.includes(entry.id)} onChange={() => onToggleDemo(entry.id)} />
        <span><strong>{entry.fileName}</strong><small>{new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))} · {entry.data?.rounds?.length || entry.rounds || 0} {translate('round')}{index < 3 ? ` · ${text("analysis.analysisPanel.recent")}` : ''}</small></span>
      </label>)}</div>
    </section>}
    {hasPlayers && <label className="analysis-side">
      <span>{translate('side').toUpperCase()}</span>
      <select value={side} onChange={(event) => onSideChange(event.target.value)}><option value="ALL">{translate('allRounds')}</option><option value="T">{translate('tRounds')}</option><option value="CT">{translate('ctRounds')}</option></select>
    </label>}
    <WorkspaceTarget slot="analysis-options" />
  </WorkspacePanel>;
}
