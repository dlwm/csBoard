// Analysis filters, display mode controls, and area-phase boundary settings.
import { useState } from 'react';
import { ANALYSIS_AREA_PHASES, ANALYSIS_UTILITY_COLORS, ANALYSIS_UTILITY_ICONS, ANALYSIS_UTILITY_KINDS, ECONOMY_CATEGORIES } from './constants.js';
import { translate } from '../i18n.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export default function AnalysisControls({ language, translate, flags, setFlags, playerName, economyAvailability, onToggleEconomy, onStopPlayback, IconComponent }) {
  const text = (key, values) => translate(language, key, values);
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
    { key: 'early', label: text("analysis.analysisControls.early"), hint: `0–${areaEarlyDraft}s` },
    { key: 'mid', label: text("analysis.analysisControls.mid"), hint: text("analysis.analysisControls.sPlant", { areaEarlyDraft: areaEarlyDraft }) },
    { key: 'post', label: text("analysis.analysisControls.postPlant"), hint: text("analysis.analysisControls.plantEnd") },
  ];

  return <div className="analysis-view-options">
    <section className="analysis-control-section">
      <span>{text("analysis.analysisControls.analysisType")}</span>
      <div className="analysis-mode-tabs analysis-type-tabs">
        <button type="button" className={flags.analysisMetric === 'area' ? 'selected' : ''} onClick={() => { onStopPlayback(); setFlags((current) => ({ ...current, analysisMetric: 'area', heatStyle: 'global' })); }}>{text("analysis.analysisControls.areaTime")}</button>
        <button type="button" className={flags.analysisMetric === 'kd' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, analysisMetric: 'kd' }))}>{text("analysis.analysisControls.kdEvents")}</button>
        <button type="button" className={flags.analysisMetric === 'utility' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, analysisMetric: 'utility', heatStyle: 'points' }))}>{text("analysis.analysisControls.utility")}</button>
      </div>
    </section>
    <section className="analysis-control-section analysis-economy-filter">
      <span>{text("analysis.analysisControls.economyMatchup")}</span>
      <div className="analysis-economy-columns">{[['own', text("analysis.analysisControls.ownSide")], ['opponent', text("analysis.analysisControls.opponent")]].map(([side, label]) => <fieldset key={side}>
        <legend>{label}</legend>
        {ECONOMY_CATEGORIES.map((economy) => <label key={`${side}-${economy}`} className={flags[side === 'own' ? 'economyOwn' : 'economyOpponent'].includes(economy) ? 'selected' : ''}><input type="checkbox" checked={flags[side === 'own' ? 'economyOwn' : 'economyOpponent'].includes(economy)} disabled={!playerName || !economyAvailability[side].has(economy)} onChange={() => onToggleEconomy(side, economy)} /><span>{economy}</span></label>)}
      </fieldset>)}</div>
    </section>
    <section className="analysis-control-section">
      <span>{text("analysis.analysisControls.display")}</span>
      <div className="analysis-mode-tabs"><button type="button" disabled={flags.analysisMetric === 'area'} className={flags.heatStyle === 'points' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, heatStyle: 'points' }))}>{text("analysis.analysisControls.positions")}</button><button type="button" className={flags.heatStyle === 'global' ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, heatStyle: 'global', ...(!current.killerHeat && !current.victimHeat && !current.targetHeat && !current.opponentHeat ? { killerHeat: true, victimHeat: true } : {}) }))}>{text("analysis.analysisControls.heatmap")}</button></div>
    </section>
    {flags.analysisMetric === 'area' && <section className="analysis-control-section analysis-area-phases">
      <span>{text("analysis.analysisControls.roundPhase")}</span>
      <div className="analysis-area-phase-buttons">{phaseOptions.map((phase) => <button type="button" key={phase.key} className={areaPhases.includes(phase.key) ? 'selected' : ''} aria-pressed={areaPhases.includes(phase.key)} onClick={() => setFlags((current) => ({ ...current, areaPhases: (current.areaPhases || ANALYSIS_AREA_PHASES).includes(phase.key) ? (current.areaPhases || ANALYSIS_AREA_PHASES).filter((value) => value !== phase.key) : [...(current.areaPhases || ANALYSIS_AREA_PHASES), phase.key] }))}><strong>{phase.label}</strong><small>{phase.hint}</small></button>)}<button type="button" className={`analysis-area-phase-settings-button${phaseSettingsOpen ? ' selected' : ''}`} title={text("analysis.analysisControls.setEarlyMidBoundary")} aria-label={text("analysis.analysisControls.setEarlyAndMidPhaseBoundary")} aria-expanded={phaseSettingsOpen} onClick={() => setPhaseSettingsOpen((open) => !open)}><span aria-hidden="true">⚙</span></button></div>
      {phaseSettingsOpen && <div className="analysis-area-phase-settings"><label><span>{text("analysis.analysisControls.earlyPhaseEnds")}</span><b>{areaEarlyDraft}s</b></label><input type="range" min="10" max="90" step="1" value={areaEarlyDraft} onChange={(event) => setAreaEarlyDraft(Number(event.target.value))} {...deferredRangeEvents(commitAreaEarlySeconds)} /><small>{text("analysis.analysisControls.measuredFromFreezeEndAPlantAlwaysStartsPostPlant")}</small></div>}
    </section>}
    {(flags.analysisMetric === 'area' || flags.heatStyle === 'global') && <section className="analysis-control-section analysis-heat-radius"><span><i>{text("analysis.analysisControls.heatSpread")}</i><b>{heatRadiusDraft.toFixed(1)} m</b></span><input type="range" min="2" max="24" step="0.5" value={heatRadiusDraft} aria-label={text("analysis.analysisControls.heatSpreadRadius")} onChange={(event) => setHeatRadiusDraft(Number(event.target.value))} {...deferredRangeEvents(commitHeatRadius)} /><div><small>{text("analysis.analysisControls.micro")}</small><small>{text("analysis.analysisControls.macro")}</small></div></section>}
    {flags.analysisMetric === 'kd' && <section className="analysis-control-section analysis-event-filters"><span>{text("analysis.analysisControls.eventPositions")}</span><div><button type="button" className={`heat-killer${flags.killerHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, killerHeat: !current.killerHeat }))}>{translate('killerPosition')}</button><button type="button" className={`heat-victim${flags.victimHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, victimHeat: !current.victimHeat }))}>{translate('victimPosition')}</button><button type="button" className={`heat-target${flags.targetHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, targetHeat: !current.targetHeat }))}>{translate('targetPosition')}</button><button type="button" className={`heat-opponent${flags.opponentHeat ? ' selected' : ''}`} onClick={() => setFlags((current) => ({ ...current, opponentHeat: !current.opponentHeat }))}>{translate('opponentPosition')}</button></div></section>}
    {flags.analysisMetric === 'utility' && <><section className="analysis-control-section analysis-utility-events"><span>{text("analysis.analysisControls.eventPositions")}</span><div><button type="button" disabled={flags.heatStyle === 'global'} className={flags.utilityThrow ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, utilityThrow: !current.utilityThrow }))}>{text("analysis.analysisControls.throw")}</button><button type="button" className={flags.utilityLanding ? 'selected' : ''} onClick={() => setFlags((current) => ({ ...current, utilityLanding: !current.utilityLanding }))}>{text("analysis.analysisControls.landing")}</button></div></section><section className="analysis-control-section analysis-utility-kinds"><span>{text("analysis.analysisControls.utilityType")}</span><div>{ANALYSIS_UTILITY_KINDS.map((kind) => <button type="button" key={kind} title={kind.toUpperCase()} aria-label={kind} className={flags.utilityKinds.includes(kind) ? 'selected' : ''} style={{ '--utility-color': ANALYSIS_UTILITY_COLORS[kind] }} onClick={() => setFlags((current) => ({ ...current, utilityKinds: current.utilityKinds.includes(kind) ? current.utilityKinds.filter((value) => value !== kind) : [...current.utilityKinds, kind] }))}><IconComponent name={ANALYSIS_UTILITY_ICONS[kind]} /></button>)}</div></section></>}
  </div>;
}
