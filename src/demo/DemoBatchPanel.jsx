import { conciseDemoError } from './diagnostics.js';
import { useEffect, useId, useRef, useState } from 'react';
import { formatBytes } from '../components/ModelLoadIndicator.jsx';
import DemoTaskDetails from './DemoTaskDetails.jsx';
import { translate, translateDemoWorkerStatus, translateError } from '../i18n.js';

const statusCopy = {
  queued: "replay.batch.status.queued",
  reading: "replay.batch.status.reading",
  parsing: "replay.batch.status.parsing",
  caching: "replay.batch.status.caching",
  success: "replay.batch.status.success",
  cached: "replay.batch.status.cached",
  failed: "replay.batch.status.failed",
};

export default function DemoBatchPanel({ batch, counts, development, language, onClose, onRetry, onContinueRecording, continuationBusy = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  const [now, setNow] = useState(() => performance.now());
  const progressHistory = useRef(new Map());
  useEffect(() => {
    progressHistory.current.clear();
    setCollapsed(false);
  }, [batch?.id]);
  useEffect(() => {
    if (!batch?.running) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, [batch?.id, batch?.running]);
  if (!batch) return null;
  const text = (key, values) => translate(language, key, values);
  const total = batch.tasks.length;
  const tasks = batch.tasks.map(task => {
    let displayed = task.progress;
    if (task.status === 'parsing' && task.parseStartedAt != null) {
      if (!task.hasTickProgress) {
        // Initialization/events/prepared ticks have no measurable tick progress.
        // Approach a bounded estimate; never imply completion during this phase.
        const elapsed = Math.max(0, now - task.parseStartedAt);
        displayed = Math.max(displayed, 2 + 38 * (1 - Math.exp(-elapsed / 45000)));
      } else {
        const elapsed = Math.max(0, now - (task.progressReceivedAt ?? now));
        const step = task.progressTotal > 0 ? 100 / task.progressTotal : 1;
        displayed = Math.max(displayed, Math.min(99, task.progress + Math.min(step * .9, elapsed / 3000)));
      }
      displayed = Math.max(displayed, progressHistory.current.get(`${task.id}:${task.attempt || 1}`) || 0);
    }
    progressHistory.current.set(`${task.id}:${task.attempt || 1}`, displayed);
    return { ...task, displayedProgress: displayed, estimated: displayed > task.progress + .05 };
  });
  // Stable ties preserve selection order; this changes display, not admission.
  tasks.sort((left, right) => right.displayedProgress - left.displayedProgress);
  const overall = total ? tasks.reduce((sum, task) => sum + task.displayedProgress, 0) / total : 0;
  return <aside className={`demo-batch-panel${batch.running ? ' running' : ' complete'}${collapsed ? ' collapsed' : ''}`} aria-live="polite">
    <header><div><span>{text("replay.demoBatchPanel.batchParser")}</span><strong>{batch.running ? text("replay.demoBatchPanel.processed", { finished: counts.finished, total: total }) : text("replay.demoBatchPanel.doneFailed", { completed: counts.completed, failed: counts.failed })}</strong></div><button type="button" className="demo-batch-collapse" aria-expanded={!collapsed} aria-controls={listId} onClick={() => setCollapsed(value => !value)}>{collapsed ? text("replay.demoBatchPanel.expand") : text("replay.demoBatchPanel.collapse")}</button>{!batch.running && <button type="button" onClick={onClose} aria-label={text("replay.demoBatchPanel.close")}>×</button>}</header>
    <div className="demo-batch-overall"><i style={{ width: `${overall}%` }} /></div>
    <p>{batch.running ? text("replay.demoBatchPanel.runningWaiting", { length: batch.tasks.filter(task => ['parsing', 'caching'].includes(task.status)).length, lengthValue: batch.tasks.filter(task => ['queued', 'reading'].includes(task.status)).length }) : text("replay.demoBatchPanel.batchFinished")}</p>
    {collapsed && batch.running && <p>{text("replay.demoBatchPanel.succeededFailed", { completed: counts.completed, failed: counts.failed })}</p>}
    <div className="demo-batch-tasks" id={listId} hidden={collapsed}>{tasks.map((task) => {
      const copy = task.error?.code === 'non_standard_demo' ? "replay.demoBatchPanel.nonStandardMatch" : statusCopy[task.status] || statusCopy.queued;
      return <article className={task.status} key={task.id}><div className="demo-batch-task-heading"><strong title={task.label}>{task.label}</strong><span>{translate(language, copy)}</span>{task.status === 'failed' && task.error?.code !== 'non_standard_demo' && onRetry && <button type="button" className="demo-batch-retry" onClick={() => onRetry(task.id)}>{text("replay.demoBatchPanel.retryParsing")}</button>}</div><div className="demo-batch-task-meta"><small>{formatBytes(task.sourceBytes, language)}{task.fileCount > 1 ? ` · ${task.fileCount} ${text("replay.demoBatchPanel.parts")}` : ''}</small><b title={task.estimated ? text("replay.demoBatchPanel.estimatedProgressCountedAsDoneOnlyAfterSaving") : undefined}>{task.estimated ? '≈ ' : ''}{Math.floor(task.displayedProgress)}%{task.estimated && ` · ${text("replay.demoBatchPanel.estimated")}`}</b></div><i className="demo-batch-task-progress"><b style={{ width: `${task.displayedProgress}%` }} /></i>{task.waitReason === 'memory' && <em>{text("replay.demoBatchPanel.waitingForTheActiveTaskToReleaseMemory")}</em>}{task.waitReason === 'cpu' && <em>{text("replay.demoBatchPanel.waitingForParserThreads")}</em>}{task.waitReason === 'slots' && <em>{text("replay.demoBatchPanel.waitingForAnActiveParserToFinish")}</em>}{task.cachedRounds > 0 && <em>{text("replay.demoBatchPanel.roundsSaved", { cachedRounds: task.cachedRounds })}</em>}{task.allocation && task.status === 'parsing' && <em>{text("replay.demoBatchPanel.parserThreads", { threads: task.allocation.threads })}</em>}{task.status === "parsing" && (task.statusMessage || task.statusText) && <em>{translateDemoWorkerStatus(language, task.statusMessage || task.statusText)}</em>}{task.error?.code === 'non_standard_demo' && <div className="demo-recording-continue"><span>{text("replay.demoBatchPanel.thisIsANonStandardMatchDemoContinueParsingAs")}</span><button type="button" disabled={continuationBusy} onClick={() => onContinueRecording?.(task.id)}>{text("replay.demoBatchPanel.continueParsing")}</button></div>}{task.error && task.error.code !== 'non_standard_demo' && <em className="error">{conciseDemoError(translateError(language, task.error))}</em>}{development && (task.diagnostic || task.summary || task.error) && <DemoTaskDetails task={task} batch={batch} language={language} />}</article>;
    })}</div>
    {!batch.running && !collapsed && <footer>{text("replay.demoBatchPanel.demosSucceededFailedResultsWereCachedWithoutStartingPlayback", { total: total, completed: counts.completed, failed: counts.failed })}</footer>}
  </aside>;
}
