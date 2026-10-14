import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import { useId } from 'react';
import { translate } from '../i18n.js';
import { DEMO_SAMPLE_RATES } from '../demo/sampling.js';
export function ModelQualitySettings({ language, value, onChange }) {
  const id=useId();
  const text = (key, values) => translate(language, key, values);
  return <>
    <p>{text("settings.replaySettings.surfaceSimplificationIsAppliedAutomaticallyPerViewZeroPreservesThe")}</p>
    {[
      ['monitor', text("settings.replaySettings.monitorViews")],
      ['firstPerson', text("settings.replaySettings.firstPersonView")],
      ['free', text("settings.replaySettings.freeCamera")],
    ].map(([key, label]) => <div key={key} className="settings-range settings-quality-range"><label htmlFor={`${id}-${key}`}>{label}</label><div className="settings-range-track"><input id={`${id}-${key}`} type="range" min="0" max="100" step="1" value={value[key]} style={{'--range-fill':`${value[key]}%`}} onChange={event => onChange({ [key]: Number(event.target.value) })} /><i className="settings-range-recommended" aria-hidden="true" /></div><output htmlFor={`${id}-${key}`}>{value[key]}</output><WorkspaceButton type="button" className="settings-recommendation" onClick={()=>onChange({[key]:60})}>{text("settings.replaySettings.suggested60")}</WorkspaceButton></div>)}
    <small>{text("settings.replaySettings.experimentalTheFirstApplicationNeedsComputationBuildingBordersAndError")}</small>
    <div className="desktop-manager-actions"><WorkspaceButton onClick={() => onChange({ monitor: 0, firstPerson: 0, free: 0 })}>{text("settings.replaySettings.useOriginalGeometry")}</WorkspaceButton></div>
  </>;
}
export function ParsingSettings({ language, value, onChange }) {
  const text = (key, values) => translate(language, key, values);
  return <>
    <label className="settings-range"><span>{text("settings.replaySettings.tickSampling")}</span><select className="workspace-input" value={value} onChange={event => onChange(Number(event.target.value))}>{DEMO_SAMPLE_RATES.map(rate => <option key={rate} value={rate}>{rate} / s</option>)}</select></label>
    <p>{text("settings.replaySettings.oneReplaySampleEveryTicksAppliesToFutureParsingExisting", { value1: 64 / value })}</p>
    {value >= 16 && <small>{text("settings.replaySettings.higherSamplingRatesIncreaseProcessingTimeMemoryAndStorageUse")}</small>}
  </>;
}
