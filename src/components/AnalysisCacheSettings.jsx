import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n.js';

export default function AnalysisCacheSettings({ api, language, working }) {
  const [settings, setSettings] = useState(null), [pending, setPending] = useState(false), [error, setError] = useState('');
  const mounted = useRef(false);
  const text = (key, values) => translate(language, key, values);
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
    <h3>{text("settings.analysisCacheSettings.analysisCache")}</h3>
    <label className="desktop-awake"><input type="checkbox" checked={settings?.realtime || false} disabled={!settings || pending || working} onChange={event => update(event.target.checked)} />{text("settings.analysisCacheSettings.realtimeAnalysisRecomputeEachQuery")}</label>
    <p>{text("settings.analysisCacheSettings.offByDefaultReuseLocalAnalysisCachesResultsRebuildAfter")}</p>
    {error && <p role="alert" className="resource-pack-error">{error} {!settings && <button type="button" onClick={inspect}>{text("settings.analysisCacheSettings.retry")}</button>}</p>}
  </section>;
}
