import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlatform } from '../platform/index.js';
import { localize } from '../i18n.js';
import './resourcePack.css';
import './desktopManager.css';
import { useDataCleanupConfirmation } from './ConfirmDataCleanup.jsx';
import AnalysisCacheSettings from './AnalysisCacheSettings.jsx';
import DesktopUpdates from './DesktopUpdates.jsx';
import DesktopAppearance from './DesktopAppearance.jsx';
import { ModelQualitySettings, ParsingSettings } from '../settings/ReplaySettings.jsx';

const bytes = value => {
  const size = value || 0;
  const unit = size >= 1024 ** 3 ? 'GB' : size >= 1024 ** 2 ? 'MB' : size >= 1024 ? 'KB' : 'B';
  const divisor = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[unit];
  return `${(size / divisor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
};
export default function AppSettings({ storageWorking = false, language, onClose, initialTab = 'appearance', modelQuality, setModelQuality, sampleRate, setSampleRate }) {
  const platform = getPlatform(), api = platform.maintenance;
  const { confirm, confirmation } = useDataCleanupConfirmation(language);
  const dialog = useRef(null), mounted = useRef(false), content = useRef(null);
  const jumpTo = id => { const element = content.current?.querySelector(`#settings-${id}`); if (element) { content.current.scrollTo({ top: element.offsetTop, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); setTab(id); } };
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
    const scrollFrame = requestAnimationFrame(() => jumpTo(initialTab));
    if (!api) return () => { mounted.current = false; cancelAnimationFrame(scrollFrame); };
    let revision = 0;
    const off = api.onTasks(value => { revision++; if (mounted.current) setTasks(value); });
    api.tasks().then(value => { if (mounted.current && !revision) setTasks(value); }).catch(error => { if (mounted.current) setError(error.message); });
    refresh().catch(error => { if (mounted.current) setError(error.message); });
    return () => { mounted.current = false; cancelAnimationFrame(scrollFrame); off(); };
  }, []);
  const working = storageWorking || tasks.some(task => ['queued', 'running'].includes(task.state));
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
    const description = maxBytes == null ? text('将删除未引用的 Demo 缓存，保留存档和资源包。清理后页面会重新加载。', 'Remove unreferenced Demo caches while keeping saved work and resources. The page will reload.', 'Удалить неиспользуемый кэш Demo, сохранив архивы и ресурсы. Страница перезагрузится.') : text('将删除 Demo 缓存，保留用户存档和资源包。请先保存当前编辑内容；清理后页面会重新加载。继续？', 'Remove Demo cache while keeping saved work and resources? Save your edits first; the page will reload.', 'Удалить кэш Demo, сохранив архивы и ресурсы? Сохраните изменения: страница перезагрузится.');
    if (!await confirm(description)) return;
    await api.clean(maxBytes); location.reload();
  };
  return createPortal(<dialog ref={dialog} className="resource-pack-dialog desktop-manager" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="desktop-manager-title">
    <header className="resource-pack-header"><div><small>CSBOARD / SETTINGS</small><h2 id="desktop-manager-title">{text('设置', 'Settings', 'Настройки')}</h2></div><button className="resource-pack-close" disabled={busy} onClick={onClose} aria-label={text('关闭', 'Close', 'Закрыть')}>×</button></header>
    <div className="settings-layout">
    <nav className="settings-nav" aria-label={text('设置目录', 'Settings sections', 'Разделы настроек')}>
      {[
        ['appearance', text('界面显示', 'Appearance', 'Интерфейс')],
        ['models', text('模型面简化', 'Model simplification', 'Упрощение модели')],
        ...(getPlatform().capabilities.demoParsing ? [['parsing', text('Demo 解析', 'Demo parsing', 'Разбор Demo')]] : []),
        ['storage', text('存储与备份', 'Storage & backups', 'Хранилище и копии')],
        ...(api ? [['tasks', text('后台任务', 'Background tasks', 'Фоновые задачи')]] : []),
        ...(getPlatform().updates ? [['updates', text('应用更新', 'Updates', 'Обновления')]] : []),
      ].map(([id, label]) => <button type="button" key={id} aria-current={tab === id ? 'location' : undefined} onClick={() => jumpTo(id)}>{label}</button>)}
    </nav>
    <div ref={content} className="desktop-manager-content" aria-busy={busy} onScroll={() => {
      const nodes = [...content.current.querySelectorAll('[data-settings-section]')];
      const top = content.current.getBoundingClientRect().top;
      const active = nodes.findLast(node => node.getBoundingClientRect().top <= top + 40) || nodes[0];
      if (active) setTab(active.dataset.settingsSection);
    }}>
      {error && <p className="resource-pack-error" role="alert">{error}</p>}{message && <p className="desktop-manager-message" role="status">{message}</p>}
      <section id="settings-appearance" data-settings-section="appearance"><h2>{text('界面显示', 'Appearance', 'Интерфейс')}</h2><DesktopAppearance language={language} /></section>
      <section id="settings-models" data-settings-section="models"><h2>{text('模型面简化', 'Model simplification', 'Упрощение модели')}</h2><ModelQualitySettings language={language} value={modelQuality} onChange={setModelQuality} /></section>
      {getPlatform().capabilities.demoParsing && <section id="settings-parsing" data-settings-section="parsing"><h2>{text('Demo 解析', 'Demo parsing', 'Разбор Demo')}</h2><ParsingSettings language={language} value={sampleRate} onChange={setSampleRate} /></section>}
      {!api && <section id="settings-storage" data-settings-section="storage"><h2>{text('存储与备份', 'Storage & backups', 'Хранилище и копии')}</h2>
        <p>{text('数据保存在当前设备。清空会删除本地存档、道具速记、Demo 缓存、助手会话及设置；服务器中的协作房间不受影响。请先导出需要保留的内容。', 'Data is stored on this device. Cleanup deletes local archives, utility notes, Demo caches, assistant sessions and settings. Server collaboration rooms are unaffected. Export anything you want to keep first.', 'Данные хранятся на устройстве. Очистка удалит локальные архивы, заметки гранат, кэш Demo, диалоги помощника и настройки. Комнаты на сервере не затрагиваются. Сначала экспортируйте нужные данные.')}</p>
        <div className="desktop-manager-actions"><button type="button" disabled={busy || working || !platform.clearData} onClick={async () => {
          if (working) return;
          if (!await confirm(text('本设备中保存的 CSBoard 数据将被永久删除，完成后页面会重新加载。此操作无法撤销。', 'Saved CSBoard data on this device will be permanently deleted and the page will reload. This cannot be undone.', 'Сохранённые данные CSBoard на устройстве будут удалены без возможности отмены. Страница перезагрузится.'))) return;
          run(async () => { await platform.clearData(); location.reload(); });
        }}>{text('清空本地数据', 'Clear local data', 'Очистить локальные данные')}</button></div>
      </section>}
      {api && <section id="settings-storage" data-settings-section="storage"><h2>{text('存储与备份', 'Storage & backups', 'Хранилище и копии')}</h2>
        <div className="desktop-storage-summary">
          {[[text('数据库（包含存档）', 'Database (includes saved work)', 'База данных (с архивами)'), status?.databaseBytes], [text('Demo 缓存', 'Demo cache', 'Кэш Demo'), status?.cacheBytes], [text('分析缓存', 'Analysis cache', 'Кэш анализа'), status?.analysisBytes], [text('已导入资源', 'Imported resources', 'Импортированные ресурсы'), status?.resourceBytes], [text('未引用缓存', 'Unreferenced cache', 'Неиспользуемый кэш'), status?.orphanBytes], [text('解析临时文件', 'Parse staging files', 'Временные файлы'), status?.stagingBytes], [text('恢复前的数据副本', 'Restore safety copies', 'Копии до восстановления'), status?.recoveryBytes]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{status ? bytes(value) : '—'}</strong></div>)}
        </div>
        <section><h3>{text('缓存清理', 'Cache cleanup', 'Очистка кэша')}</h3><p>{text('按最近使用顺序删除旧 Demo 缓存，直到不超过指定容量。不会删除道具记录或战术存档。', 'Remove least recently used Demo caches until the selected size is reached. Saved notes and tactics are kept.', 'Удаляет старый кэш Demo до указанного размера. Заметки и тактики сохраняются.')}</p>
          <div className="desktop-manager-actions"><label>{text('保留容量', 'Keep up to', 'Оставить до')} <input type="number" min="0" max="100000" step="1" value={limit} onChange={event => setLimit(event.target.value)} /> GB</label><button disabled={busy || working || !status || limit.trim() === '' || !Number.isFinite(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000} onClick={() => run(() => clean(Math.round(Number(limit) * 1024 ** 3)))}>{text('清理旧缓存', 'Clean old cache', 'Очистить старый кэш')}</button><button disabled={busy || working || !status?.orphanBytes} onClick={() => run(() => clean(null))}>{text('清理未引用缓存', 'Clean unreferenced cache', 'Очистить неиспользуемый кэш')}</button></div>
        </section>
        <AnalysisCacheSettings api={api} language={language} working={working || busy} />
        <section><h3>{text('备份与恢复', 'Backup & restore', 'Копирование и восстановление')}</h3><p>{text('备份包含原生存档、Demo 缓存及导入资源，不包含原始 .dem 文件、未保存内容和浏览器偏好。恢复会重启应用；恢复前的数据保留在数据目录的 restores 文件夹。', 'Backups include native saved work, Demo caches and imported resources. Original .dem files, unsaved edits and browser preferences are excluded. Restore restarts the app and keeps previous data in the restores folder.', 'Копия включает нативные архивы, кэш Demo и ресурсы. Исходные .dem, несохранённые изменения и настройки браузера не входят. Восстановление перезапускает приложение; прежние данные остаются в restores.')}</p>
          <div className="desktop-manager-actions"><button disabled={busy || working} onClick={() => run(async () => { const result = await api.backup(); if (result && mounted.current) setMessage(text(`备份已保存：${result.path}`, `Backup saved: ${result.path}`, `Копия сохранена: ${result.path}`)); })}>{text('创建备份', 'Create backup', 'Создать копию')}</button><button disabled={busy || working} onClick={() => run(() => api.restore())}>{text('从备份恢复…', 'Restore backup…', 'Восстановить…')}</button><button disabled={busy} onClick={() => run(() => api.openFolder())}>{text('打开数据目录', 'Open data folder', 'Открыть папку данных')}</button></div>
        </section>
      </section>}
      {api && <section id="settings-tasks" data-settings-section="tasks"><h2>{text('后台任务', 'Background tasks', 'Фоновые задачи')}</h2>
        <label className="desktop-awake"><input type="checkbox" checked={status?.keepAwake || false} disabled={busy || !status} onChange={event => { const checked = event.target.checked; run(async () => { const value = await api.keepAwake(checked); setStatus(current => ({ ...current, keepAwake: value })); }); }} />{text('本次运行期间，有后台任务时防止自动休眠', 'Prevent automatic sleep during tasks for this session', 'Запретить автоматический сон во время задач в этом сеансе')}</label>
        <p>{text('解析和计算分别限流；最小化后继续处理。失败任务可从原入口重试。', 'Parsing and computation use bounded queues and continue when minimized. Retry failed work from its original entry point.', 'Очереди разбора и вычислений ограничены; работа продолжается при сворачивании. Повторите ошибочную задачу из исходного интерфейса.')}</p>
        <ul className="desktop-task-list">{[...tasks].reverse().map(task => <li key={task.id}><div><strong>{taskLabel(task)}</strong><small>{taskState(task.state)}{task.progress != null && task.state === 'running' ? ` · ${Math.round(task.progress)}%` : ''}{task.finishedAt && task.startedAt ? ` · ${((task.finishedAt - task.startedAt) / 1000).toFixed(1)}s` : ''}</small>{task.allocation?.threads && <small className="desktop-task-allocation"> · {task.allocation.threads} {text('线程', 'threads', 'потоков')}{task.metrics?.peakBytes ? ` · ${bytes(task.metrics.peakBytes)}` : ''}</small>}{task.error && <p className="resource-pack-error">{task.error}</p>}</div>{['queued', 'running'].includes(task.state) && <button onClick={() => run(() => api.cancelTask(task.id))} disabled={busy}>{text('取消', 'Cancel', 'Отменить')}</button>}</li>)}</ul>
        {!tasks.length && <p>{text('当前没有后台任务。', 'No background tasks yet.', 'Фоновых задач пока нет.')}</p>}
      </section>}
      {getPlatform().updates && <section id="settings-updates" data-settings-section="updates"><h2>{text('应用更新', 'Updates', 'Обновления')}</h2><DesktopUpdates language={language} working={working} /></section>}
    </div></div>
    {api && <footer className="resource-pack-footer"><p>{busy ? text('正在处理，请稍候…', 'Working…', 'Обработка…') : working ? text('任务运行期间暂不进行存储维护。', 'Storage maintenance waits for background tasks.', 'Обслуживание хранилища доступно после завершения задач.') : text('存档与可重建缓存分别管理。', 'Saved work is kept separate from rebuildable caches.', 'Архивы и восстанавливаемый кэш разделены.')}</p><button disabled={busy} onClick={() => run(refresh)}>{text('刷新占用', 'Refresh usage', 'Обновить размер')}</button></footer>}
  {confirmation}</dialog>, document.body);
}
