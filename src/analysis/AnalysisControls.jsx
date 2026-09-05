// Analysis filters, display mode controls, and area-phase boundary settings.
import { useState } from 'react';
import { ANALYSIS_AREA_PHASES, ANALYSIS_UTILITY_COLORS, ANALYSIS_UTILITY_ICONS, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export default function AnalysisControls({ language, translate, flags, setFlags, playerName, economyAvailability, onToggleEconomy, onStopPlayback, IconComponent }) {
  const zh = language === 'zh';
  const [heatRadiusDraft, setHeatRadiusDraft] = useState(flags.heatRadius || 9);
  const [areaEarlyDraft, setAreaEarlyDraft] = useState(flags.areaEarlySeconds || 30);
  const [phaseSettingsOpen, setPhaseSettingsOpen] = useState(false);
  const areaPhases = flags.areaPhases || ANALYSIS_AREA_PHASES;

  const commitHeatRadius = (value) => {
    const heatRadius = clamp(Number(value) || 9, 2, 24);
    setHeatRadiusDraft(heatRadius);
    setFlags((current) => current.heatRadius === heatRadius ? current : { ...current, heatRadius });
  };
  const commitAreaEarlySeconds = (value) => {
    const seconds = clamp(Math.round(Number(value) || 30), 10, 90);
    setAreaEarlyDraft(seconds);
    setFlags((current) => current.areaEarlySeconds === seconds ? current : { ...current, areaEarlySeconds: seconds });
  };
  // Keep slider feedback local; expensive heat cells are rebuilt only after interaction ends.
  const deferredRangeEvents = (commit) => ({
    onPointerUp: (event) => commit(event.currentTarget.value),
    onPointerCancel: (event) => commit(event.currentTarget.value),
    onKeyUp: (event) => commit(event.currentTarget.value),
    onBlur: (event) => commit(event.currentTarget.value),
  });
  const phaseOptions = [
    { key: 'early', zh: '开局前期', en: 'EARLY', hint: `0–${areaEarlyDraft}s` },
    { key: 'mid', zh: '中期', en: 'MID', hint: zh ? `${areaEarlyDraft}s–下包` : `${areaEarlyDraft}s–plant` },
    { key: 'post', zh: '下包后', en: 'POST-PLANT', hint: zh ? '下包–结束' : 'plant–end' },
  ];

  return <div className="analysis-view-options">
    <section className="analysis-control-section">
      <span>{zh ? '分析类型' : 'ANALYSIS TYPE'}</span>
      <div className="analysis-mode-tabs analysis-type-tabs">
        <button type="button" className={flags.analysisMetric === 'area' ? 'selected' : ''} onClick={() => { onStopPlayback(); setFlags((current) => ({ ...current, analysisMetric: 'area', heatStyle: 'global' })); }}>{zh ? '区域时间' : 'AREA TIME'}</button>
        <button type="button" className={flags.analysisMetric === 'kd' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, analysisMetric: 'kd' }))}>{zh ? 'KD 事件' : 'KD EVENTS'}</button>
        <button type="button" className={flags.analysisMetric === 'utility' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, analysisMetric: 'utility' }))}>{zh ? '道具事件' : 'UTILITY'}</button>
      </div>
    </section>
    <section className="analysis-control-section analysis-economy-filter">
      <span>{zh ? '对局经济对比' : 'ECONOMY MATCHUP'}</span>
      <div className="analysis-economy-columns">{[['own', zh ? '己方' : 'OWN SIDE'], ['opponent', zh ? '对方' : 'OPPONENT']].map(([side, label]) => <fieldset key={side}>
        <legend>{label}</legend>
        {ECONOMY_CATEGORIES.map((economy) => <label key={`${side}-${economy}`} className={flags[side === 'own' ? 'economyOwn' : 'economyOpponent'].includes(economy) ? 'selected' : ''}><input type="checkbox" checked={flags[side === 'own' ? 'economyOwn' : 'economyOpponent'].includes(economy)} disabled={!playerName || !economyAvailability[side].has(economy)} onChange={() => onToggleEconomy(side, economy)} /><span>{economy}</span></label>)}
      </fieldset>)}</div>
    </section>
    <section className="analysis-control-section">
      <span>{zh ? '显示方式' : 'DISPLAY'}</span>
      <div className="analysis-mode-tabs"><button type="button" disabled={flags.analysisMetric === 'area'} className={flags.heatStyle === 'points' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, heatStyle: 'points' }))}>{zh ? '位置' : 'POSITIONS'}</button><button type="button" className={flags.heatStyle === 'global' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, heatStyle: 'global', ...(!current.killerHeat && !current.victimHeat && !current.targetHeat && !current.opponentHeat ? { killerHeat: true, victimHeat: true } : {}) }))}>{zh ? '热力' : 'HEATMAP'}</button></div>
    </section>
    {flags.analysisMetric === 'area' && <section className="analysis-control-section analysis-area-phases">
      <span>{zh ? '回合阶段' : 'ROUND PHASE'}</span>
      <div className="analysis-area-phase-buttons">{phaseOptions.map((phase) => <button type="button" key={phase.key} className={areaPhases.includes(phase.key) ? 'selected' : ''} aria-pressed={areaPhases.includes(phase.key)} onClick={() => setFlags((current) => ({ ...current, areaPhases: (current.areaPhases || ANALYSIS_AREA_PHASES).includes(phase.key) ? (current.areaPhases || ANALYSIS_AREA_PHASES).filter((value) => value !== phase.key) : [...(current.areaPhases || ANALYSIS_AREA_PHASES), phase.key] }))}><strong>{zh ? phase.zh : phase.en}</strong><small>{phase.hint}</small></button>)}<button type="button" className={`analysis-area-phase-settings-button${phaseSettingsOpen ? ' selected' : ''}`} title={zh ? '设置前期与中期分界' : 'Set early/mid boundary'} aria-label={zh ? '设置前期与中期分界' : 'Set early and mid phase boundary'} aria-expanded={phaseSettingsOpen} onClick={() => setPhaseSettingsOpen((open) => !open)}><span aria-hidden="true">⚙</span></button></div>
      {phaseSettingsOpen && <div className="analysis-area-phase-settings"><label><span>{zh ? '前期结束时间' : 'EARLY PHASE ENDS'}</span><b>{areaEarlyDraft}s</b></label><input type="range" min="10" max="90" step="1" value={areaEarlyDraft} onChange={(event) => setAreaEarlyDraft(Number(event.target.value))} {...deferredRangeEvents(commitAreaEarlySeconds)} /><small>{zh ? '从冻结结束开始计算；下包事件始终优先归入下包后。' : 'Measured from freeze end; a plant always starts post-plant.'}</small></div>}
    </section>}
    {(flags.analysisMetric === 'area' || flags.heatStyle === 'global') && <section className="analysis-control-section analysis-heat-radius"><span><i>{zh ? '热力扩散范围' : 'HEAT SPREAD'}</i><b>{heatRadiusDraft.toFixed(1)} m</b></span><input type="range" min="2" max="24" step="0.5" value={heatRadiusDraft} aria-label={zh ? '热力扩散范围' : 'Heat spread radius'} onChange={(event) => setHeatRadiusDraft(Number(event.target.value))} {...deferredRangeEvents(commitHeatRadius)} /><div><small>{zh ? '微观' : 'MICRO'}</small><small>{zh ? '宏观' : 'MACRO'}</small></div></section>}
    {flags.analysisMetric === 'kd' && <section className="analysis-control-section analysis-event-filters"><span>{zh ? '事件位置' : 'EVENT POSITIONS'}</span><div><button type="button" className={`heat-killer${flags.killerHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, killerHeat: !current.killerHeat }))}>{translate('killerPosition')}</button><button type="button" className={`heat-victim${flags.victimHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, victimHeat: !current.victimHeat }))}>{translate('victimPosition')}</button><button type="button" className={`heat-target${flags.targetHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, targetHeat: !current.targetHeat }))}>{translate('targetPosition')}</button><button type="button" className={`heat-opponent${flags.opponentHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, opponentHeat: !current.opponentHeat }))}>{translate('opponentPosition')}</button></div></section>}
    {flags.analysisMetric === 'utility' && <><section className="analysis-control-section analysis-utility-events"><span>{zh ? '事件位置' : 'EVENT POSITIONS'}</span><div><button type="button" disabled={flags.heatStyle === 'global'} className={flags.utilityThrow ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, utilityThrow: !current.utilityThrow }))}>{zh ? '出手位置' : 'THROW'}</button><button type="button" className={flags.utilityLanding ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, utilityLanding: !current.utilityLanding }))}>{zh ? '落地位置' : 'LANDING'}</button></div></section><section className="analysis-control-section analysis-utility-kinds"><span>{zh ? '道具类别' : 'UTILITY TYPE'}</span><div>{ANALYSIS_UTILITY_KINDS.map((kind) => <button type="button" key={kind} title={kind.toUpperCase()} aria-label={kind} className={flags.utilityKinds.includes(kind) ? 'selected' : ''} style={{ '--utility-color': ANALYSIS_UTILITY_COLORS[kind] }} onClick={() => setFlags((current) => ({ ...current, utilityKinds: current.utilityKinds.includes(kind) ? current.utilityKinds.filter((value) => value !== kind) : [...current.utilityKinds, kind] }))}><IconComponent name={ANALYSIS_UTILITY_ICONS[kind]} /></button>)}</div></section></>}
  </div>;
}
