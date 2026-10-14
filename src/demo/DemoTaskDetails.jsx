import { conciseDemoError } from './diagnostics.js';
import { useState } from 'react';
import { formatBytes as displayBytes, formatDuration } from '../i18n.js';
import { translate } from '../i18n.js';

const phases = {
  source: "replay.demoTaskDetails.readFiles",
  input: "replay.demoTaskDetails.inspectInput",
  parser: "replay.demoTaskDetails.initializeParser",
  wasm: "replay.demoTaskDetails.initializeParser",
  configure: "replay.demoTaskDetails.configureParser",
  grenades: "replay.demoTaskDetails.parseUtilityTrajectories",
  prepareTicks: "replay.demoTaskDetails.preparePlayerData",
  header: "replay.demoTaskDetails.readDemoHeader",
  events: "replay.demoTaskDetails.parseEventsAndUtilities",
  ticks: "replay.demoTaskDetails.parseRoundsAndPlayers",
  analysis: "replay.demoTaskDetails.buildAnalysisData",
};

export default function DemoTaskDetails({ task, batch, language }) {
  const [mode, setMode] = useState('display');
  const text = (key, values) => translate(language, key, values);
  const phaseName = phase => {
    const labels = phases[phase];
    return labels ? text(labels) : text("replay.demoTaskDetails.otherStage");
  };
  const result = task.summary || {};
  const diagnostic = task.diagnostic || {};
  const elapsed = result.elapsedMs ?? diagnostic.elapsedMs ?? (task.finishedAt && task.startedAt ? Date.parse(task.finishedAt) - Date.parse(task.startedAt) : null);
  const seconds = value => formatDuration(value, language);
  const formatBytes = value => displayBytes(value, language);
  const count = value => Array.isArray(value) ? value.length : value;
  const rows = [
    [text("replay.demoTaskDetails.parsingTime"), elapsed == null ? null : seconds(elapsed)],
    [text("replay.demoTaskDetails.map"), result.map],
    [text("replay.demoTaskDetails.sourceSize"), formatBytes(task.sourceBytes)],
    [text("replay.demoTaskDetails.estimatedResultSize"), result.estimatedOutputBytes == null ? null : formatBytes(result.estimatedOutputBytes)],
    [text("replay.demoTaskDetails.samplingRate"), diagnostic.input?.sampleRate == null ? null : `${diagnostic.input.sampleRate} Hz`],
    [text("replay.demoTaskDetails.rounds"), result.rounds],
    [text("replay.demoTaskDetails.players"), count(result.players)],
    [text("replay.demoTaskDetails.killEvents"), result.kills],
    [text("replay.demoTaskDetails.damageEvents"), result.damageEvents],
    [text("replay.demoTaskDetails.roundsSaved"), task.cachedRounds],
    [text("replay.demoTaskDetails.parserThreads"), task.allocation?.threads],
    [text("replay.demoTaskDetails.parserPeakMemory"), result.performance?.nativePeakBytes == null ? null : formatBytes(result.performance.nativePeakBytes)],
    [text("replay.demoTaskDetails.cacheProcessPeakMemory"), result.performance?.workerPeakBytes == null ? null : formatBytes(result.performance.workerPeakBytes)],
  ].filter(([, value]) => value != null && value !== '');
  const failure = diagnostic.failure?.parser || diagnostic.failure;
  const timings = [...(diagnostic.phases || []).filter(phase => phase.elapsedMs != null),
    ...Object.entries(result.performance?.timings || {}).map(([phase, timing]) => ({ phase, ...timing }))];
  const raw = { batchId: batch.id, startedAt: batch.startedAt, finishedAt: batch.finishedAt, concurrency: batch.concurrency, environment: batch.environment,
    task: { id: task.id, label: task.label, status: task.status, attempt: task.attempt || 1, startedAt: task.startedAt, finishedAt: task.finishedAt,
      allocation: task.allocation, error: task.error, diagnostic: task.diagnostic, result: task.summary } };
  return <details className="demo-task-details">
    <summary>{text("replay.demoTaskDetails.parsingDetails")}</summary>
    <div className="demo-detail-modes" aria-label={text("replay.demoTaskDetails.detailsView")}>
      <button type="button" aria-pressed={mode === 'display'} onClick={() => setMode('display')}>{text("replay.demoTaskDetails.display")}</button>
      <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>JSON</button>
    </div>
    {mode === 'json' ? <pre>{JSON.stringify(raw, null, 2)}</pre> : <div className="demo-detail-display">
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {failure?.phase && <p className="error">{text("replay.demoTaskDetails.failedStage")}{phaseName(failure.phase)}</p>}
      {task.error && <p className="error">{conciseDemoError(task.error.message)}</p>}
      {!!result.warnings?.length && <ul>{result.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message || warning.code || text("replay.demoTaskDetails.parserWarning")}</li>)}</ul>}
      {!!timings.length && <section><h4>{text("replay.demoTaskDetails.stageTimings")}</h4><dl>{timings.map((phase, index) => <div key={index}><dt>{phaseName(phase.phase)}</dt><dd>{seconds(phase.elapsedMs)}</dd></div>)}</dl></section>}
    </div>}
  </details>;
}
