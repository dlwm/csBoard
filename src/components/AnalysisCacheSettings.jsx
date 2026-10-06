import { useEffect, useRef, useState } from 'react';
import { localize } from '../i18n.js';

export default function AnalysisCacheSettings({ api, language, working }) {
  const [settings, setSettings] = useState(null), [pending, setPending] = useState(false), [error, setError] = useState('');
  const mounted = useRef(false);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const inspect = async () => {
    try { const value = await api.analysisSettings(); if (mounted.current) { setSettings(value); setError(''); } }
    catch (error) { if (mounted.current) setError(error.message); }
  };
  useEffect(() => { mounted.current = true; inspect(); return () => { mounted.current = false; }; }, [api]);
  const update = async realtime => {
    setPending(true); setError('');
    try { const value = await api.saveAnalysisSettings({ realtime }); if (mounted.current) setSettings(value); }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { if (mounted.current) setPending(false); }
  };
  return <section className="analysis-cache-settings">
    <h3>{text('分析缓存', 'Analysis cache', 'Кэш анализа')}</h3>
    <label className="desktop-awake"><input type="checkbox" checked={settings?.realtime || false} disabled={!settings || pending || working} onChange={event => update(event.target.checked)} />{text('即时分析（每次查询重新计算）', 'Realtime analysis (recompute each query)', 'Анализ без кэша (пересчёт каждого запроса)')}</label>
    <p>{text('默认关闭，复用本地分析缓存。Demo 更新或应用版本变化时自动重建；设置自动保存。', 'Off by default: reuse local analysis caches. Results rebuild after Demo or app version updates; settings save automatically.', 'По умолчанию выключено: используется локальный кэш анализа. Результаты обновляются при изменении Demo или версии приложения; настройки сохраняются автоматически.')}</p>
    {error && <p role="alert" className="resource-pack-error">{error} {!settings && <button type="button" onClick={inspect}>{text('重试', 'Retry', 'Повторить')}</button>}</p>}
  </section>;
}
