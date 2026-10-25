import { useEffect, useState } from 'react';
import { WorkspacePanel } from '../components/workspace/WorkspaceSlots.jsx';
import { WorkspaceButton, WorkspacePanelHeading, WorkspaceSection } from '../components/workspace/WorkspaceControls.jsx';
import { translate } from '../i18n.js';
import './utilityCombinations.css';

function CombinationNumber({ value, min, max, step, onCommit, label, integer = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label}<input className="workspace-input" type="number" min={min} max={max} step={step} value={draft}
    onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    onBlur={() => { const parsed = Number(draft); if (!draft.trim() || !Number.isFinite(parsed)) { setDraft(String(value)); return; }
      const next = Math.max(min, Math.min(max, integer ? Math.round(parsed) : parsed)); setDraft(String(next)); if (next !== value) onCommit(next); }} /></label>;
}

const kinds = { smoke: 'smoke', flash: 'flash', fire: 'fire', he: 'he', decoy: 'decoy' };
export default function UtilityCombinationsPanel({ combinations, language, selectedPlayers, utilities, onPreview, previewState, onSaveUtility, saveState, savedIds, batchSave, error }) {
  const text = (key, values) => translate(language, key, values);
  const kind = value => translate(language, `analysis.utilityRecommendationsPanel.${kinds[value]}`);
  const index = new Map(utilities.map(item => [item.id, item]));
  const options = combinations.options;
  const limited = Object.values(combinations.diagnostics || {}).some(value => Number(value) > 0);
  return <WorkspacePanel className="utility-combinations">
    <WorkspacePanelHeading title={text("analysis.combinations.title")} />
    <p>{text("analysis.combinations.description")}</p>
    <WorkspaceSection title={text("analysis.combinations.settings")} collapsible>
      <div className="combination-options">{[['windowSeconds', 2, 20, .5], ['timeTolerance', .25, 5, .25], ['spatialScale', .5, 2, .1], ['areaRadius', 5, 60, 1], ['maxSize', 2, 4, 1]].map(([key, min, max, step]) => <CombinationNumber key={key} label={text(`analysis.combinations.${key}`)} min={min} max={max} step={step} value={options[key]} integer={key === 'maxSize'} onCommit={value => combinations.setOptions(current => ({ ...current, [key]: value }))} />)}</div>
    </WorkspaceSection>
    {!selectedPlayers.length && <p>{text("analysis.combinations.selectPlayers")}</p>}
    {combinations.loading && <p role="status">{text("analysis.combinations.loading")}</p>}
    {(error || combinations.error || combinations.navigation.error) && <p role="alert">{text("analysis.combinations.queryError")}</p>}
    {limited && <p>{text("analysis.combinations.limited")}</p>}
    {!combinations.loading && selectedPlayers.length > 0 && !combinations.groups.length && <p>{text("analysis.combinations.empty")}</p>}
    {combinations.groups.map((group, position) => <WorkspaceSection key={group.id} title={`${position + 1}. ${group.side} · ${group.representative.members.map(member => kind(member.kind)).join(' + ')}`}>
      <strong>{text("analysis.combinations.support", { count: group.count, demos: group.demoCount })}</strong>
      <small>{text("analysis.combinations.representative", { round: group.representative.round })} · {group.representative.fileName}</small>
      <div className="combination-actions"><WorkspaceButton selected={combinations.focusedId === group.id} onClick={() => combinations.setFocusedId(combinations.focusedId === group.id ? '' : group.id)}>{combinations.focusedId === group.id ? text("analysis.combinations.clearFocus") : text("analysis.combinations.focus")}</WorkspaceButton>
        <WorkspaceButton disabled={combinations.navigation.loading} onClick={() => combinations.replay(group.representative)}>{text("analysis.combinations.replay")}</WorkspaceButton>
        <WorkspaceButton variant="primary" disabled={saveState.loading || batchSave.state.loading || batchSave.savedGroups.has(group.id)} onClick={() => batchSave.save(group, text("analysis.combinations.groupName", { index: position + 1, round: group.representative.round }))}>{batchSave.savedGroups.has(group.id) ? text("analysis.combinations.saved") : batchSave.state.loading && batchSave.state.id === group.id ? text("analysis.combinations.saving", { count: batchSave.state.completed, total: group.representative.members.length }) : text("analysis.combinations.saveGroup")}</WorkspaceButton></div>
      {batchSave.state.error && batchSave.state.id === group.id && <p role="alert">{text(`analysis.combinations.${batchSave.state.error}Error`)}</p>}
      <ol className="combination-members">{[...group.representative.members].sort((a, b) => a.effectOffsetSeconds - b.effectOffsetSeconds).map(member => {
        const utility = index.get(member.utilityId);
        return <li key={member.utilityId} onPointerEnter={() => onPreview(member.utilityId)} onPointerLeave={() => onPreview('')} onFocusCapture={() => onPreview(member.utilityId)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview(''); }}>
          <strong>{kind(member.kind)} · {member.thrower}</strong><small>{text("analysis.combinations.timing", { throwTime: member.throwOffsetSeconds.toFixed(1), effectTime: member.effectOffsetSeconds.toFixed(1) })}</small>
          <div className="combination-actions"><WorkspaceButton disabled={!utility} onClick={() => onPreview(member.utilityId)}>{text("analysis.combinations.preview")}</WorkspaceButton><WorkspaceButton disabled={!utility || batchSave.state.loading || saveState.loading || savedIds.has(member.utilityId)} onClick={() => onSaveUtility(utility)}>{savedIds.has(member.utilityId) ? text("analysis.combinations.saved") : text("analysis.combinations.saveOne")}</WorkspaceButton></div>
          {previewState?.utilityId === member.utilityId && previewState.loading && <small role="status">{text("analysis.combinations.loadingPreview")}</small>}
          {(previewState?.utilityId === member.utilityId && previewState.error || saveState.utilityId === member.utilityId && saveState.error) && <small role="alert">{text("analysis.combinations.previewError")}</small>}
        </li>;
      })}</ol>
      <details><summary>{text("analysis.combinations.sourceRounds")}</summary><div className="combination-sources">{group.occurrences.map(occurrence => <WorkspaceButton key={`${occurrence.demoId}:${occurrence.round}`} disabled={combinations.navigation.loading} onClick={() => combinations.replay(occurrence)}>{occurrence.fileName} · R{occurrence.round}</WorkspaceButton>)}</div></details>
    </WorkspaceSection>)}
  </WorkspacePanel>;
}
