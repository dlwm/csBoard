import { useState } from 'react';
import { WorkspaceButton } from '../components/workspace/WorkspaceControls.jsx';
import UtilityRecommendationsPanel from './UtilityRecommendationsPanel.jsx';
import { KD_RECOMMENDATION_POLICY as policy } from './kdHotspots.js';
import { translate } from '../i18n.js';

export default function KDRecommendationsPanel({ language, recommendations: kd, selectedPlayers, datasetLoading, onSelect, onPreview, onSave, onEvidence, previewState, saveState, savedIds, navigation }) {
  const text = (name, values) => translate(language, `analysis.kdRecommendations.${name}`, values);
  const [radiusDraft, setRadiusDraft] = useState(kd.radius);
  const commitRadius = event => kd.setRadius(event.currentTarget.value);
  const diagnostics = kd.diagnostics;
  return <UtilityRecommendationsPanel language={language} title={text('title')} groups={kd.groups} utilities={kd.utilities}
    loading={kd.loading || datasetLoading} error={kd.error || navigation.error} selectedPlayers={selectedPlayers}
    ready={Boolean(kd.hotspot)} emptyMessage={text(kd.totalInteractions ? 'noCandidates' : 'noEvents')}
    focusedId={kd.focusedId} onFocus={kd.setFocusedId} onPreview={onPreview} previewState={previewState}
    onSave={onSave} saveState={saveState} savedIds={savedIds}
    context={<div className="kd-recommendation-context">
      <p>{text(kd.hotspot ? 'selectedHint' : 'selectHint')}</p>
      <label className="kd-radius"><span>{text('radius')}</span><b>{radiusDraft} m</b>
        <input type="range" min={policy.minRadius} max={policy.maxRadius} step="1" aria-label={text('radius')}
          value={radiusDraft} onChange={event => setRadiusDraft(Number(event.target.value))}
          onPointerUp={commitRadius} onPointerCancel={commitRadius} onKeyUp={commitRadius} onBlur={commitRadius} /></label>
      {kd.hotspot ? <div className="kd-selection-summary"><span>{text('events', { count: kd.totalInteractions })}</span>
        <WorkspaceButton variant="quiet" onClick={kd.clear}>{text('clear')}</WorkspaceButton></div>
        : <div className="kd-hotspot-suggestions">{kd.suggestions.map((item, index) => <WorkspaceButton key={item.id} type="button" onClick={() => onSelect(item)}>
          {text('hotspot', { index: index + 1, count: item.count })}</WorkspaceButton>)}</div>}
      {kd.sampledInteractions < kd.totalInteractions && <small>{text('sampled', { count: kd.sampledInteractions, total: kd.totalInteractions })}</small>}
      {Boolean(diagnostics.missingDemos || diagnostics.missingRounds) && <p role="status">{text('missingData')}</p>}
      {Boolean(diagnostics.omittedCandidates || diagnostics.omittedGroups) && <small>{text('bounded')}</small>}
      {diagnostics.missingSmokeVolumes > 0 && <small>{text('missingSmoke')}</small>}
      {diagnostics.missingBlindEvidence > 0 && <small>{text('missingBlind')}</small>}
      <small>{text('limits')}</small>
    </div>}
    renderDetails={group => <div className="kd-match-details">
      <strong>{text('matchScore', { value: group.matchScore.toFixed(1) })}</strong>
      <span>{text(group.confidence)}</span>
      {group.confidence === 'recordedBlind' && <small>{text('blindEvidence', { count: group.blindCount, duration: group.blindDuration.toFixed(1) })}</small>}
      <span>{text('related', { count: group.matchedCount, total: group.relevantCount })}</span>
      <small>{text('originDistance', { value: group.startDistance.toFixed(1) })}</small>
      {kd.focusedId === group.id && <div className="kd-evidence-list">{group.evidence.map(item => <WorkspaceButton key={item.eventId} variant="quiet"
        disabled={navigation.loading} title={item.fileName} onClick={() => onEvidence(item)}>
        {text('openReplay', { round: item.round })} · {item.player}</WorkspaceButton>)}</div>}
    </div>} />;
}
