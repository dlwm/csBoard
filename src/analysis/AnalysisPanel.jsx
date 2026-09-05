// Composes the Analysis sidebar without owning data loading or scene rendering.
import AnalysisPlayerPicker from './AnalysisPlayerPicker.jsx';

export default function AnalysisPanel({
  language,
  translate,
  mapName,
  status,
  players,
  playersLoading,
  playerName,
  playerQuery,
  onPlayerQueryChange,
  onPlayerSelect,
  demos,
  selectedDemoIds,
  onToggleDemo,
  side,
  onSideChange,
  rowsAvailable,
  playing,
  onTogglePlay,
  time,
  duration,
  onTimeChange,
}) {
  const zh = language === 'zh';
  return <aside className="analysis-panel">
    <div className="collab-heading">
      <div><span>DEMO ANALYSIS</span><h2>{translate('analysis')}</h2></div>
      <button type="button" disabled={!playerName || !rowsAvailable} onClick={onTogglePlay}>{playing ? translate('pause') : translate('play')}</button>
    </div>
    <p className="collab-note">{zh ? `从 ${mapName.toUpperCase()} 已解析的 Demo 中按用户名聚合分析。` : `Aggregate a player across parsed ${mapName.toUpperCase()} Demos.`}</p>
    {status && <div className="analysis-status">{status}</div>}
    <AnalysisPlayerPicker language={language} players={players} loading={playersLoading} value={playerName} query={playerQuery} onQueryChange={onPlayerQueryChange} onSelect={onPlayerSelect} />
    {playerName && <section className="analysis-demo-picker">
      <header><span>{zh ? '分析 Demo' : 'ANALYSIS DEMOS'}</span><b>{selectedDemoIds.length}/{demos.length}</b></header>
      <div>{demos.map((entry, index) => <label key={entry.id} className={selectedDemoIds.includes(entry.id) ? 'selected' : ''}>
        <input type="checkbox" checked={selectedDemoIds.includes(entry.id)} onChange={() => onToggleDemo(entry.id)} />
        <span><strong>{entry.fileName}</strong><small>{new Date(entry.updatedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')} · {entry.data.rounds?.length || entry.rounds || 0} {translate('round')}{index < 3 ? ` · ${zh ? '最近' : 'RECENT'}` : ''}</small></span>
      </label>)}</div>
    </section>}
    {playerName && <label className="analysis-side">
      <span>{translate('side').toUpperCase()}</span>
      <select value={side} onChange={(event) => onSideChange(event.target.value)}><option value="ALL">{translate('allRounds')}</option><option value="T">{translate('tRounds')}</option><option value="CT">{translate('ctRounds')}</option></select>
    </label>}
    {playerName && rowsAvailable && <div className="analysis-timeline"><span>{(time / 64).toFixed(1)}s</span><input type="range" min="0" max={duration} value={time} onChange={(event) => onTimeChange(Number(event.target.value))} /><span>{(duration / 64).toFixed(1)}s</span></div>}
  </aside>;
}
