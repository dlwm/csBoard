// Composes the Analysis sidebar without owning data loading or scene rendering.
import AnalysisPlayerPicker from './AnalysisPlayerPicker.jsx';
import { useState } from 'react';
import AnalysisAiGuide from './AnalysisAiGuide.jsx';
import { isDesktopRuntime } from '../app/runtime.js';
import { localeForLanguage, localize } from '../i18n.js';

export default function AnalysisPanel({
  language,
  translate,
  mapName,
  status,
  players,
  playersLoading,
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
  rowsAvailable,
  playing,
  onTogglePlay,
  time,
  duration,
  onTimeChange,
}) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const hasPlayers = selectedPlayers.length > 0;
  const [aiGuideOpen, setAiGuideOpen] = useState(false);
  const aiEnabled = isDesktopRuntime();
  return <aside className="analysis-panel">
    <div className="collab-heading">
      <div><span>DEMO ANALYSIS</span><h2>{translate('analysis')}</h2></div>
      <button type="button" disabled={!hasPlayers || !rowsAvailable} onClick={onTogglePlay}>{playing ? translate('pause') : translate('play')}</button>
    </div>
    {aiEnabled && <button type="button" className="analysis-ai-help" onClick={() => setAiGuideOpen(true)}>{text('AI 接入教程', 'AI setup guide', 'Подключение ИИ')} <span aria-hidden="true">↗</span></button>}
    {aiEnabled && aiGuideOpen && <AnalysisAiGuide language={language} loading={playersLoading} selectedDemoCount={selectedDemoIds.length} onClose={() => setAiGuideOpen(false)} />}
    <p className="collab-note">{text(`从 ${mapName.toUpperCase()} 已解析的 Demo 中按用户名聚合多名选手。`, `Aggregate selected players across parsed ${mapName.toUpperCase()} Demos.`, `Объединяет выбранных игроков из разобранных Demo на ${mapName.toUpperCase()}.`)}</p>
    {status && <div className="analysis-status">{status}</div>}
    <AnalysisPlayerPicker language={language} players={players} loading={playersLoading} values={selectedPlayers} query={playerQuery} onQueryChange={onPlayerQueryChange} onToggle={onPlayerToggle} onClear={onPlayersClear} />
    {hasPlayers && <section className="analysis-demo-picker">
      <header><span>{text('分析 Demo', 'ANALYSIS DEMOS', 'DEMO ДЛЯ АНАЛИЗА')}</span><b>{selectedDemoIds.length}/{demos.length}</b></header>
      <div>{demos.map((entry, index) => <label key={entry.id} className={selectedDemoIds.includes(entry.id) ? 'selected' : ''}>
        <input type="checkbox" checked={selectedDemoIds.includes(entry.id)} onChange={() => onToggleDemo(entry.id)} />
        <span><strong>{entry.fileName}</strong><small>{new Date(entry.updatedAt).toLocaleString(localeForLanguage(language))} · {entry.data.rounds?.length || entry.rounds || 0} {translate('round')}{index < 3 ? ` · ${text('最近', 'RECENT', 'НЕДАВНЕЕ')}` : ''}</small></span>
      </label>)}</div>
    </section>}
    {hasPlayers && <label className="analysis-side">
      <span>{translate('side').toUpperCase()}</span>
      <select value={side} onChange={(event) => onSideChange(event.target.value)}><option value="ALL">{translate('allRounds')}</option><option value="T">{translate('tRounds')}</option><option value="CT">{translate('ctRounds')}</option></select>
    </label>}
    {hasPlayers && rowsAvailable && <div className="analysis-timeline"><span>{(time / 64).toFixed(1)}s</span><input type="range" min="0" max={duration} value={time} onChange={(event) => onTimeChange(Number(event.target.value))} /><span>{(duration / 64).toFixed(1)}s</span></div>}
  </aside>;
}
