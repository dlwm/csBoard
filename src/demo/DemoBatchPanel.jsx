import { formatBytes } from '../components/ModelLoadIndicator.jsx';
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

export default function DemoBatchPanel({ batch, counts, development, language, onClose }) {
  if (!batch) return null;
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const total = batch.tasks.length;
  const overall = total ? batch.tasks.reduce((sum, task) => sum + task.progress, 0) / total : 0;
  const details = { batchId: batch.id, startedAt: batch.startedAt, finishedAt: batch.finishedAt, concurrency: batch.concurrency, environment: batch.environment };
  return <aside className={`demo-batch-panel${batch.running ? ' running' : ' complete'}`} aria-live="polite">
    <header><div><span>{text('批量解析', 'BATCH PARSER', 'ПАКЕТНЫЙ РАЗБОР')}</span><strong>{batch.running ? text(`${counts.finished}/${total} 已处理`, `${counts.finished}/${total} processed`, `Обработано: ${counts.finished}/${total}`) : text(`完成 ${counts.completed} · 失败 ${counts.failed}`, `Done ${counts.completed} · Failed ${counts.failed}`, `Готово ${counts.completed} · Ошибок ${counts.failed}`)}</strong></div>{!batch.running && <button type="button" onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>×</button>}</header>
    <div className="demo-batch-overall"><i style={{ width: `${overall}%` }} /></div>
    <p>{batch.concurrency > 1 ? text(`正在并行解析 ${batch.concurrency} 个任务`, `Parsing ${batch.concurrency} jobs in parallel`, `Параллельных задач: ${batch.concurrency}`) : text('当前设备按顺序解析', 'Parsing sequentially on this device', 'Последовательный разбор на этом устройстве')}</p>
    <div className="demo-batch-tasks">{batch.tasks.map((task) => {
      const copy = statusCopy[task.status] || statusCopy.queued;
      return <article className={task.status} key={task.id}><div className="demo-batch-task-heading"><strong title={task.label}>{task.label}</strong><span>{localize(language, { zh: copy[0], en: copy[1], ru: copy[2] })}</span></div><div className="demo-batch-task-meta"><small>{formatBytes(task.sourceBytes)}{task.fileCount > 1 ? ` · ${task.fileCount} ${text('个分片', 'parts', 'частей')}` : ''}</small><b>{Math.floor(task.progress)}%</b></div><i className="demo-batch-task-progress"><b style={{ width: `${task.progress}%` }} /></i>{task.statusText && <em>{task.statusText}</em>}{task.error && <em className="error">{task.error.message}</em>}{development && (task.diagnostic || task.summary || task.error) && <details><summary>{text('开发者详情', 'Developer details', 'Данные для разработчика')}</summary><pre>{JSON.stringify({ ...details, task: { id: task.id, label: task.label, status: task.status, error: task.error, diagnostic: task.diagnostic, result: task.summary } }, null, 2)}</pre></details>}</article>;
    })}</div>
    {!batch.running && <footer>{text(`共 ${total} 个 Demo，成功 ${counts.completed} 个，失败 ${counts.failed} 个。解析结果已保存到本地缓存，未自动开始播放。`, `${total} Demos: ${counts.completed} succeeded, ${counts.failed} failed. Results were cached without starting playback.`, `Demo: ${total}; успешно: ${counts.completed}; ошибок: ${counts.failed}. Результаты сохранены в кэш без запуска воспроизведения.`)}</footer>}
  </aside>;
}
