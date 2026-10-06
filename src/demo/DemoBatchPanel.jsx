import { conciseDemoError } from './diagnostics.js';
import { useEffect, useId, useRef, useState } from 'react';
import { formatBytes } from '../components/ModelLoadIndicator.jsx';
import DemoTaskDetails from './DemoTaskDetails.jsx';
import { localize } from '../i18n.js';

const statusCopy = {
  queued: ['等待中', 'QUEUED', 'В ОЧЕРЕДИ'],
  reading: ['读取文件', 'READING', 'ЧТЕНИЕ'],
  parsing: ['解析中', 'PARSING', 'РАЗБОР'],
  caching: ['写入缓存', 'CACHING', 'КЭШИРОВАНИЕ'],
  success: ['完成', 'DONE', 'ГОТОВО'],
  cached: ['已有缓存', 'CACHED', 'В КЭШЕ'],
  failed: ['失败', 'FAILED', 'ОШИБКА'],
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
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
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
    <header><div><span>{text('批量解析', 'BATCH PARSER', 'ПАКЕТНЫЙ РАЗБОР')}</span><strong>{batch.running ? text(`${counts.finished}/${total} 已处理`, `${counts.finished}/${total} processed`, `Обработано: ${counts.finished}/${total}`) : text(`完成 ${counts.completed} · 失败 ${counts.failed}`, `Done ${counts.completed} · Failed ${counts.failed}`, `Готово ${counts.completed} · Ошибок ${counts.failed}`)}</strong></div><button type="button" className="demo-batch-collapse" aria-expanded={!collapsed} aria-controls={listId} onClick={() => setCollapsed(value => !value)}>{collapsed ? text('展开', 'Expand', 'Развернуть') : text('收起', 'Collapse', 'Свернуть')}</button>{!batch.running && <button type="button" onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>×</button>}</header>
    <div className="demo-batch-overall"><i style={{ width: `${overall}%` }} /></div>
    <p>{batch.running ? text(`正在解析 ${batch.tasks.filter(task => ['parsing', 'caching'].includes(task.status)).length} 个任务 · 等待 ${batch.tasks.filter(task => ['queued', 'reading'].includes(task.status)).length} 个`, `${batch.tasks.filter(task => ['parsing', 'caching'].includes(task.status)).length} running · ${batch.tasks.filter(task => ['queued', 'reading'].includes(task.status)).length} waiting`, `В работе: ${batch.tasks.filter(task => ['parsing', 'caching'].includes(task.status)).length} · Ожидают: ${batch.tasks.filter(task => ['queued', 'reading'].includes(task.status)).length}`) : text('本批次已结束', 'Batch finished', 'Пакет завершён')}</p>
    {collapsed && batch.running && <p>{text(`成功 ${counts.completed} · 失败 ${counts.failed}`, `Succeeded ${counts.completed} · Failed ${counts.failed}`, `Успешно ${counts.completed} · Ошибок ${counts.failed}`)}</p>}
    <div className="demo-batch-tasks" id={listId} hidden={collapsed}>{tasks.map((task) => {
      const copy = task.error?.code === 'non_standard_demo' ? ['非常规对局', 'Non-standard match', 'Нестандартный матч'] : statusCopy[task.status] || statusCopy.queued;
      return <article className={task.status} key={task.id}><div className="demo-batch-task-heading"><strong title={task.label}>{task.label}</strong><span>{localize(language, { zh: copy[0], en: copy[1], ru: copy[2] })}</span>{task.status === 'failed' && task.error?.code !== 'non_standard_demo' && onRetry && <button type="button" className="demo-batch-retry" onClick={() => onRetry(task.id)}>{text('重新解析', 'Retry parsing', 'Повторить разбор')}</button>}</div><div className="demo-batch-task-meta"><small>{formatBytes(task.sourceBytes)}{task.fileCount > 1 ? ` · ${task.fileCount} ${text('个分片', 'parts', 'частей')}` : ''}</small><b title={task.estimated ? text('预估进度，保存完成后才计为已处理', 'Estimated progress; counted as done only after saving', 'Оценка прогресса; завершение после сохранения') : undefined}>{task.estimated ? '≈ ' : ''}{Math.floor(task.displayedProgress)}%{task.estimated && ` · ${text('预估', 'estimated', 'оценка')}`}</b></div><i className="demo-batch-task-progress"><b style={{ width: `${task.displayedProgress}%` }} /></i>{task.waitReason === 'memory' && <em>{text('等待当前任务释放内存', 'Waiting for the active task to release memory', 'Ожидание освобождения памяти текущей задачей')}</em>}{task.waitReason === 'cpu' && <em>{text('等待解析线程空闲', 'Waiting for parser threads', 'Ожидание потоков разбора')}</em>}{task.waitReason === 'slots' && <em>{text('等待运行中的解析完成', 'Waiting for an active parser to finish', 'Ожидание завершения разбора')}</em>}{task.cachedRounds > 0 && <em>{text(`已保存 ${task.cachedRounds} 个回合`, `${task.cachedRounds} rounds saved`, `Сохранено раундов: ${task.cachedRounds}`)}</em>}{task.allocation && task.status === 'parsing' && <em>{text(`${task.allocation.threads} 个解析线程`, `${task.allocation.threads} parser threads`, `Потоков разбора: ${task.allocation.threads}`)}</em>}{task.statusText && <em>{task.statusText}</em>}{task.error?.code === 'non_standard_demo' && <div className="demo-recording-continue"><span>{text('该对局为非常规对局 Demo，可继续解析为自制 DEMO。', 'This is a non-standard match Demo. Continue parsing as a custom DEMO.', 'Нестандартная Demo. Продолжите разбор как своей DEMO.')}</span><button type="button" disabled={continuationBusy} onClick={() => onContinueRecording?.(task.id)}>{text('继续解析', 'Continue parsing', 'Продолжить разбор')}</button></div>}{task.error && task.error.code !== 'non_standard_demo' && <em className="error">{conciseDemoError(task.error.message)}</em>}{development && (task.diagnostic || task.summary || task.error) && <DemoTaskDetails task={task} batch={batch} language={language} />}</article>;
    })}</div>
    {!batch.running && !collapsed && <footer>{text(`共 ${total} 个 Demo，成功 ${counts.completed} 个，失败 ${counts.failed} 个。解析结果已保存到本地缓存，未自动开始播放。`, `${total} Demos: ${counts.completed} succeeded, ${counts.failed} failed. Results were cached without starting playback.`, `Demo: ${total}; успешно: ${counts.completed}; ошибок: ${counts.failed}. Результаты сохранены в кэш без запуска воспроизведения.`)}</footer>}
  </aside>;
}
