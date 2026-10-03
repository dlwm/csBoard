import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';

export default function ParserPerformance({ api, language, working }) {
  const [state, setState] = useState(null), [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const inspect = async () => {
    try { const result = await api.performance(); if (mounted.current) { setState(result); setDraft(result.settings); setError(''); } }
    catch (error) { if (mounted.current) setError(error.message); }
  };
  useEffect(() => { mounted.current = true; inspect(); return () => { mounted.current = false; }; }, []);
  const update = patch => { setDraft(value => ({ ...value, ...patch })); setSaved(false); };
  const save = async event => {
    event.preventDefault(); setPending(true); setSaved(false); setError('');
    try { const result = await api.savePerformance(draft); if (mounted.current) { setState(result); setDraft(result.settings); setSaved(true); } }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setPending(false); }
  };
  if (!state || !draft) return <section><p role="status">{error || text('正在读取机器配置…', 'Reading hardware…', 'Определение оборудования…')}</p><button onClick={inspect}>{text('重试', 'Retry', 'Повторить')}</button></section>;
  const disabled = pending || working;
  return <form className="parser-performance" onSubmit={save}>
    <p>{text(`检测到 ${state.hardware.cores} 个逻辑核心 · ${(state.hardware.totalMemory / 1024 ** 3).toFixed(1)} GB 内存`, `${state.hardware.cores} logical cores · ${(state.hardware.totalMemory / 1024 ** 3).toFixed(1)} GB RAM`, `${state.hardware.cores} логических ядер · ${(state.hardware.totalMemory / 1024 ** 3).toFixed(1)} ГБ памяти`)}</p>
    <fieldset disabled={disabled}><legend>{text('解析性能', 'Parser performance', 'Производительность разбора')}</legend>
      <div className="parser-performance-modes">{[
        ['balanced', text('均衡', 'Balanced', 'Баланс'), text('为前台保留算力，内存预算为总量的 50%。', 'Reserve CPU capacity for the UI; memory budget is 50% of RAM.', 'Резерв CPU для интерфейса; бюджет памяти — 50%.')],
        ['fast', text('极速', 'Fast', 'Быстро'), text('允许使用全部逻辑核心，内存预算为总量的 75%。', 'Use all logical cores; memory budget is 75% of RAM.', 'Все логические ядра; бюджет памяти — 75%.')],
        ['custom', text('自定义', 'Custom', 'Настройка'), text('自行设置并行数量、单任务线程上限和内存预算。', 'Set concurrent demos, threads per demo and memory budget.', 'Задайте число Demo, потоков и бюджет памяти.')],
      ].map(([value, label, description]) => <label key={value} data-selected={draft.mode === value}><input type="radio" name="parser-mode" value={value} checked={draft.mode === value} onChange={() => update({ mode: value })} /><strong>{label}</strong><span>{description}</span></label>)}</div>
      {draft.mode === 'custom' && <div className="parser-performance-fields">
        <label>{text('同时解析的 Demo 上限', 'Concurrent Demo limit', 'Максимум Demo')}<input type="number" min="1" max={Math.min(16, state.hardware.cores)} value={draft.maxDemos} onChange={event => update({ maxDemos: Number(event.target.value) })} required /></label>
        <label>{text('每个 Demo 的线程上限', 'Threads per Demo limit', 'Потоков на Demo')}<input type="number" min="1" max={state.hardware.cores} value={draft.threadsPerDemo} onChange={event => update({ threadsPerDemo: Number(event.target.value) })} required /></label>
        <label>{text('解析内存预算（GB）', 'Parser memory budget (GB)', 'Бюджет памяти (ГБ)')}<input type="number" min="0.5" max={Math.max(0.5, Math.floor((state.hardware.totalMemory / 1024 ** 3 - 0.5) * 2) / 2)} step="0.5" value={draft.memoryGB} onChange={event => update({ memoryGB: Number(event.target.value) })} required /></label>
      </div>}
      <label className="desktop-awake"><input type="checkbox" checked={draft.parallelTicks} onChange={event => update({ parallelTicks: event.target.checked })} />{text('允许解析器使用多个线程', 'Allow multiple parser threads', 'Разрешить несколько потоков разбора')}</label>
      <label className="desktop-awake"><input type="checkbox" checked={draft.analysisRealtime ?? false} onChange={event => update({ analysisRealtime: event.target.checked })} />{text('即时分析（每次查询重新计算）', 'Realtime analysis (recompute each query)', 'Анализ без кэша (пересчёт каждого запроса)')}</label>
      <p>{text('默认关闭，复用本地分析缓存。Demo 更新或应用版本变化时自动重建，不影响已保存的道具与存档。', 'Off by default: reuse local analysis caches. Demo updates and app version changes rebuild derived results; saved utilities and archives are kept.', 'По умолчанию выключено: используется локальный кэш анализа. При обновлении Demo или версии приложения результаты создаются заново; сохранённые гранаты и архивы остаются.')}</p>
    </fieldset>
    <p>{text('根据可用内存和运行中任务分配资源，线程总预算不会随 Demo 数量倍增。内存预算用于决定是否启动新任务，并非进程硬性上限；内存不足时等待。事件及烟火状态仍按顺序处理。', 'Resources adapt to available memory and active jobs. Demos share a total thread budget. Memory is an admission budget, not a hard process limit; jobs wait when memory is low. Events and smoke/fire state remain sequential.', 'Ресурсы зависят от свободной памяти и активных задач. Общий бюджет потоков разделяется. Бюджет памяти ограничивает запуск задач, а не память процесса; при нехватке задачи ждут. События, дым и огонь обрабатываются последовательно.')}</p>
    {working && <p>{text('请先完成或取消后台任务，再修改性能设置。', 'Finish or cancel background tasks before changing settings.', 'Завершите или отмените фоновые задачи перед изменением.')}</p>}
    {error && <p className="resource-pack-error" role="alert">{error}</p>}{saved && <p className="desktop-manager-message" role="status">{text('已保存，后续任务使用新设置。', 'Saved for subsequent tasks.', 'Сохранено для следующих задач.')}</p>}
    <button type="submit" className="resource-pack-primary" disabled={disabled}>{pending ? text('保存中…', 'Saving…', 'Сохранение…') : text('保存性能设置', 'Save performance settings', 'Сохранить настройки')}</button>
  </form>;
}
