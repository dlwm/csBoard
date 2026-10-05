import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlatform } from '../platform/index.js';
import { localize } from '../i18n.js';
import './resourcePack.css';
import './desktopManager.css';
import ParserPerformance from './ParserPerformance.jsx';
import DesktopUpdates from './DesktopUpdates.jsx';

const bytes = value => {
  const size = value || 0;
  const unit = size >= 1024 ** 3 ? 'GB' : size >= 1024 ** 2 ? 'MB' : size >= 1024 ? 'KB' : 'B';
  const divisor = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[unit];
  return `${(size / divisor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
};
export default function DesktopManager({ language, onClose, initialTab = 'storage' }) {
  const api = getPlatform().maintenance;
  const dialog = useRef(null), mounted = useRef(false);
  const [status, setStatus] = useState(null), [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [limit, setLimit] = useState('10'), [tab, setTab] = useState(initialTab);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const refresh = async () => { const value = await api.status(); if (mounted.current) setStatus(value); };
  const run = async action => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true; dialog.current.showModal();
    let revision = 0;
    const off = api.onTasks(value => { revision++; if (mounted.current) setTasks(value); });
    api.tasks().then(value => { if (mounted.current && !revision) setTasks(value); }).catch(error => { if (mounted.current) setError(error.message); });
    refresh().catch(error => { if (mounted.current) setError(error.message); });
    return () => { mounted.current = false; off(); };
  }, []);
  const working = tasks.some(task => ['queued', 'running'].includes(task.state));
  const taskState = state => ({ queued: text('排队中', 'Queued', 'В очереди'), running: text('运行中', 'Running', 'В работе'), completed: text('已完成', 'Completed', 'Готово'), failed: text('失败', 'Failed', 'Ошибка'), cancelled: text('已取消', 'Cancelled', 'Отменено') })[state] || state;
  const taskLabel = task => task.kind === 'parse' ? task.label : ({
    'analysis.catalog': text('读取选手目录', 'Load player directory', 'Загрузка списка игроков'),
    'analysis.recommendations': text('生成道具推荐', 'Build utility recommendations', 'Подготовка рекомендаций гранат'),
    'analysis.utility': text('读取道具回放', 'Load utility replay', 'Загрузка повтора гранаты'),
    'analysis.query': text('计算分析结果', 'Analyze selected demos', 'Анализ выбранных Demo'),
    'json.encode': text('准备导出文件', 'Prepare export', 'Подготовка экспорта'),
    'json.decode': text('读取导入内容', 'Read imported data', 'Чтение импорта'),
    'broadcast.encode': text('准备演播数据', 'Prepare broadcast data', 'Подготовка трансляции'),
    'broadcast.decode': text('读取演播数据', 'Read broadcast data', 'Чтение трансляции'),
  })[task.label] || text('后台计算', 'Background computation', 'Фоновые вычисления');
  const clean = async maxBytes => {
    if (!window.confirm(text('将删除 Demo 缓存，保留用户存档和资源包。请先保存当前编辑内容；清理后页面会重新加载。继续？', 'Remove Demo cache while keeping saved work and resources? Save your edits first; the page will reload.', 'Удалить кэш Demo, сохранив архивы и ресурсы? Сохраните изменения: страница перезагрузится.'))) return;
    await api.clean(maxBytes); location.reload();
  };
  return createPortal(<dialog ref={dialog} className="resource-pack-dialog desktop-manager" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="desktop-manager-title">
    <header className="resource-pack-header"><div><small>CSBOARD / DESKTOP</small><h2 id="desktop-manager-title">{text('桌面管理', 'Desktop manager', 'Управление приложением')}</h2></div><button className="resource-pack-close" disabled={busy} onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>×</button></header>
    <div className="desktop-manager-tabs">{['storage', 'tasks', 'performance', ...(getPlatform().updates ? ['updates'] : [])].map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === 'storage' ? text('存储与备份', 'Storage & backups', 'Хранилище и копии') : value === 'tasks' ? text('后台任务', 'Background tasks', 'Фоновые задачи') : value === 'updates' ? text('应用更新', 'Updates', 'Обновления') : text('解析性能', 'Performance', 'Производительность')}</button>)}</div>
    <div className="desktop-manager-content" aria-busy={busy}>
      {error && <p className="resource-pack-error" role="alert">{error}</p>}{message && <p className="desktop-manager-message" role="status">{message}</p>}
      {tab === 'storage' ? <>
        <div className="desktop-storage-summary">
          {[[text('数据库（包含存档）', 'Database (includes saved work)', 'База данных (с архивами)'), status?.databaseBytes], [text('Demo 缓存', 'Demo cache', 'Кэш Demo'), status?.cacheBytes], [text('分析缓存', 'Analysis cache', 'Кэш анализа'), status?.analysisBytes], [text('已导入资源', 'Imported resources', 'Импортированные ресурсы'), status?.resourceBytes], [text('未引用缓存', 'Unreferenced cache', 'Неиспользуемый кэш'), status?.orphanBytes], [text('解析临时文件', 'Parse staging files', 'Временные файлы'), status?.stagingBytes], [text('恢复前的数据副本', 'Restore safety copies', 'Копии до восстановления'), status?.recoveryBytes]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{status ? bytes(value) : '—'}</strong></div>)}
        </div>
        <section><h3>{text('缓存清理', 'Cache cleanup', 'Очистка кэша')}</h3><p>{text('按最近使用顺序删除旧 Demo 缓存，直到不超过指定容量。不会删除道具记录或战术存档。', 'Remove least recently used Demo caches until the selected size is reached. Saved notes and tactics are kept.', 'Удаляет старый кэш Demo до указанного размера. Заметки и тактики сохраняются.')}</p>
          <div className="desktop-manager-actions"><label>{text('保留容量', 'Keep up to', 'Оставить до')} <input type="number" min="0" max="100000" step="1" value={limit} onChange={event => setLimit(event.target.value)} /> GB</label><button disabled={busy || working || !status || limit.trim() === '' || !Number.isFinite(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000} onClick={() => run(() => clean(Math.round(Number(limit) * 1024 ** 3)))}>{text('清理旧缓存', 'Clean old cache', 'Очистить старый кэш')}</button><button disabled={busy || working || !status?.orphanBytes} onClick={() => run(() => clean(null))}>{text('清理未引用缓存', 'Clean unreferenced cache', 'Очистить неиспользуемый кэш')}</button></div>
        </section>
        <section><h3>{text('备份与恢复', 'Backup & restore', 'Копирование и восстановление')}</h3><p>{text('备份包含原生存档、Demo 缓存及导入资源，不包含原始 .dem 文件、未保存内容和浏览器偏好。恢复会重启应用；恢复前的数据保留在数据目录的 restores 文件夹。', 'Backups include native saved work, Demo caches and imported resources. Original .dem files, unsaved edits and browser preferences are excluded. Restore restarts the app and keeps previous data in the restores folder.', 'Копия включает нативные архивы, кэш Demo и ресурсы. Исходные .dem, несохранённые изменения и настройки браузера не входят. Восстановление перезапускает приложение; прежние данные остаются в restores.')}</p>
          <div className="desktop-manager-actions"><button disabled={busy || working} onClick={() => run(async () => { const result = await api.backup(); if (result && mounted.current) setMessage(text(`备份已保存：${result.path}`, `Backup saved: ${result.path}`, `Копия сохранена: ${result.path}`)); })}>{text('创建备份', 'Create backup', 'Создать копию')}</button><button disabled={busy || working} onClick={() => run(() => api.restore())}>{text('从备份恢复…', 'Restore backup…', 'Восстановить…')}</button><button disabled={busy} onClick={() => run(() => api.openFolder())}>{text('打开数据目录', 'Open data folder', 'Открыть папку данных')}</button></div>
        </section>
      </> : tab === 'performance' ? <ParserPerformance api={api} language={language} working={working} /> : tab === 'updates' ? <DesktopUpdates language={language} working={working} /> : <>
        <label className="desktop-awake"><input type="checkbox" checked={status?.keepAwake || false} disabled={busy || !status} onChange={event => { const checked = event.target.checked; run(async () => { const value = await api.keepAwake(checked); setStatus(current => ({ ...current, keepAwake: value })); }); }} />{text('本次运行期间，有后台任务时防止自动休眠', 'Prevent automatic sleep during tasks for this session', 'Запретить автоматический сон во время задач в этом сеансе')}</label>
        <p>{text('解析和计算分别限流；最小化后继续处理。失败任务可从原入口重试。', 'Parsing and computation use bounded queues and continue when minimized. Retry failed work from its original entry point.', 'Очереди разбора и вычислений ограничены; работа продолжается при сворачивании. Повторите ошибочную задачу из исходного интерфейса.')}</p>
        <ul className="desktop-task-list">{[...tasks].reverse().map(task => <li key={task.id}><div><strong>{taskLabel(task)}</strong><small>{taskState(task.state)}{task.progress != null && task.state === 'running' ? ` · ${Math.round(task.progress)}%` : ''}{task.finishedAt && task.startedAt ? ` · ${((task.finishedAt - task.startedAt) / 1000).toFixed(1)}s` : ''}</small>{task.allocation?.threads && <small className="desktop-task-budget"> · {task.allocation.threads} {text('线程', 'threads', 'потоков')}{task.metrics?.peakBytes ? ` · ${bytes(task.metrics.peakBytes)}` : ''}</small>}{task.waitReason === 'memory' && <p>{text('等待可用内存', 'Waiting for available memory', 'Ожидание свободной памяти')}</p>}{task.error && <p className="resource-pack-error">{task.error}</p>}</div>{['queued', 'running'].includes(task.state) && <button onClick={() => run(() => api.cancelTask(task.id))} disabled={busy}>{text('取消', 'Cancel', 'Отменить')}</button>}</li>)}</ul>
        {!tasks.length && <p>{text('当前没有后台任务。', 'No background tasks yet.', 'Фоновых задач пока нет.')}</p>}
      </>}
    </div>
    {tab !== 'updates' && <footer className="resource-pack-footer"><p>{busy ? text('正在处理，请稍候…', 'Working…', 'Обработка…') : working ? text('任务运行期间暂不进行存储维护。', 'Storage maintenance waits for background tasks.', 'Обслуживание хранилища доступно после завершения задач.') : text('存档与可重建缓存分别管理。', 'Saved work is kept separate from rebuildable caches.', 'Архивы и восстанавливаемый кэш разделены.')}</p><button disabled={busy} onClick={() => run(refresh)}>{text('刷新占用', 'Refresh usage', 'Обновить размер')}</button></footer>}
  </dialog>, document.body);
}
