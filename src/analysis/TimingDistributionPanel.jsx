import { useRef } from 'react';
import { WorkspacePanel } from '../components/workspace/WorkspaceSlots.jsx';
import { WorkspaceButton, WorkspacePanelHeading, WorkspaceSection } from '../components/workspace/WorkspaceControls.jsx';
import { translate } from '../i18n.js';
import './timingDistribution.css';

export default function TimingDistributionPanel({ timing, language, selectedPlayers, chartOnly = false }) {
  const text = (key, values) => translate(language, key, values);
  const tableRef = useRef(null);
  const { result, options, measure, selected } = timing;
  const rowLabel = row => row.kind ? text('analysis.timing.utilityRow', {
    kind: text(`analysis.utilityRecommendationsPanel.${row.kind}`), phase: text(row.id.startsWith('throw:') ? 'analysis.timing.throw' : 'analysis.timing.effect') }) : text(`analysis.timing.${row.id}`);
  const valueOf = bin => measure === 'rounds' ? bin.rounds : bin.count;
  const maximum = Math.max(1, ...result.rows.flatMap(row => row.bins.map(valueOf)));
  const warnings = result.diagnostics;
  const moveFocus = event => {
    const button = event.target.closest?.('button[data-timing-row]');
    if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    let row = Number(button.dataset.timingRow), column = Number(button.dataset.timingColumn);
    if (event.key === 'ArrowLeft') column--; else if (event.key === 'ArrowRight') column++;
    else if (event.key === 'ArrowUp') row--; else if (event.key === 'ArrowDown') row++;
    else column = event.key === 'Home' ? 0 : result.rows[row].bins.length - 1;
    row = Math.max(0, Math.min(result.rows.length - 1, row)); column = Math.max(0, Math.min(result.rows[row].bins.length - 1, column));
    tableRef.current?.querySelector(`[data-timing-row="${row}"][data-timing-column="${column}"]`)?.focus();
  };
  const chart = result.rows.length > 0 && <>
      <small>{text('analysis.timing.support', { demos: result.demoCount, rounds: result.roundCount })}</small>
      <small>{text('analysis.timing.navigationHint')}</small>
      <div className="timing-table-scroll" ref={tableRef} onKeyDown={moveFocus}><table className="timing-table"><caption>{text('analysis.timing.chart')}</caption>
        <thead><tr><th scope="col">{text('analysis.timing.event')}</th>{result.rows[0].bins.map(bin => <th scope="col" key={bin.index}>{bin.start}–{bin.end}s</th>)}</tr></thead>
        <tbody>{result.rows.map((row, rowIndex) => <tr key={row.id}><th scope="row">{rowLabel(row)}</th>{row.bins.map(bin => {
          const value = valueOf(bin), intensity = value ? Math.log1p(value) / Math.log1p(maximum) : 0;
          const active = selected?.row.id === row.id && selected.bin.index === bin.index;
          const label = text('analysis.timing.cell', { event: rowLabel(row), start: bin.start, end: bin.end, count: bin.count, rounds: bin.rounds });
          return <td key={bin.index}><WorkspaceButton compact selected={active} tabIndex={active || !selected && rowIndex === 0 && bin.index === 0 ? 0 : -1}
            title={label} aria-label={label} onFocus={() => timing.select(row.id, bin.index)} data-timing-row={rowIndex} data-timing-column={bin.index} style={{ '--timing-intensity': intensity }} onClick={() => timing.select(row.id, bin.index)}>{value || '·'}</WorkspaceButton></td>;
        })}</tr>)}</tbody></table></div>
      <small>{text('analysis.timing.legend')}</small>
    </>;
  if (chartOnly) return <WorkspacePanel className="timing-distribution timing-distribution-chart" aria-busy={timing.loading}>
    <WorkspacePanelHeading title={text('analysis.timing.chart')} />
    {timing.loading && <p role="status">{text('analysis.timing.loading')}</p>}
    {timing.error && <p role="alert">{text('analysis.timing.error')}</p>}
    {chart}
    {!timing.loading && !timing.error && !result.rows.length && <p>{text(timing.ready ? 'analysis.timing.empty' : 'analysis.timing.selectPlayers')}</p>}
  </WorkspacePanel>;
  return <WorkspacePanel className="timing-distribution" aria-busy={timing.loading}>
    <WorkspacePanelHeading title={text('analysis.timing.title')} />
    <p>{text('analysis.timing.description')}</p>
    <div className="timing-options">
      <label>{text('analysis.timing.bin')}<select className="workspace-input" value={options.binSeconds} onChange={event => timing.setOptions(current => ({ ...current, binSeconds: Number(event.target.value) }))}>{[5, 10, 15].map(value => <option key={value} value={value}>{text('analysis.timing.seconds', { count: value })}</option>)}</select></label>
      <label>{text('analysis.timing.range')}<select className="workspace-input" value={options.endSeconds} onChange={event => timing.setOptions(current => ({ ...current, endSeconds: Number(event.target.value) }))}>{[60, 120, 180, 300].map(value => <option key={value} value={value}>0–{value}s</option>)}</select></label>
      <label>{text('analysis.timing.measure')}<select className="workspace-input" value={measure} onChange={event => timing.setMeasure(event.target.value)}><option value="events">{text('analysis.timing.eventCount')}</option><option value="rounds">{text('analysis.timing.roundCount')}</option></select></label>
    </div>
    {!timing.ready && <p>{text('analysis.timing.selectPlayers')}</p>}
    {timing.loading && <p role="status">{text('analysis.timing.loading')}</p>}
    {(timing.error || timing.navigation.error) && <p role="alert">{text('analysis.timing.error')}</p>}
    {timing.error && <WorkspaceButton disabled={timing.loading} onClick={timing.retry}>{text('analysis.timing.retry')}</WorkspaceButton>}
    {warnings.missingDemos > 0 && <p>{text('analysis.timing.missingDemos', { count: warnings.missingDemos })}</p>}
    {warnings.outsideRange > 0 && <p>{text('analysis.timing.outside')}</p>}
    {(warnings.eventBudget || warnings.missingTeams > 0 || warnings.missingEconomy > 0 || warnings.unknownOpener > 0) && <p>{text('analysis.timing.incomplete')}</p>}
    {result.rows.length > 0 && <small>{text('analysis.timing.support', { demos: result.demoCount, rounds: result.roundCount })}</small>}

    {!timing.loading && !timing.error && timing.ready && !result.rows.length && <p>{text('analysis.timing.empty')}</p>}
    {selected && <WorkspaceSection title={`${rowLabel(selected.row)} · ${selected.bin.start}–${selected.bin.end}s`}>
      <p>{text('analysis.timing.cellSummary', { count: selected.bin.count, rounds: selected.bin.rounds })}</p>
      {selected.bin.evidence.length < selected.bin.count && <small>{text('analysis.timing.limitedEvidence', { count: selected.bin.evidence.length })}</small>}
      <div className="timing-evidence">{selected.bin.evidence.map((item, index) => <WorkspaceButton key={`${item.demoId}:${item.tick}:${item.player}:${index}`} disabled={timing.navigation.loading} onClick={() => timing.replay(item)}>
        <strong>{item.player} · {item.seconds.toFixed(1)}s · {item.side}</strong><span>{item.fileName} · R{item.round}</span>
      </WorkspaceButton>)}</div>
    </WorkspaceSection>}
  </WorkspacePanel>;
}
