import { WorkspaceButton, WorkspacePanelHeading } from '../components/workspace/WorkspaceControls.jsx';
import { WorkspacePanel } from '../components/workspace/WorkspaceSlots.jsx';
import RecommendationFormulaEditor from './RecommendationFormulaEditor.jsx';
import { translate } from '../i18n.js';
import { RawIcon } from '../components/CsIcons.jsx';
import { ANALYSIS_UTILITY_ICONS } from './constants.js';
const kinds = { smoke: "analysis.utilityRecommendationsPanel.smoke", flash: "analysis.utilityRecommendationsPanel.flash", fire: "analysis.utilityRecommendationsPanel.fire", he: "analysis.utilityRecommendationsPanel.he", decoy: "analysis.utilityRecommendationsPanel.decoy" };

export default function UtilityRecommendationsPanel({ title, context, renderDetails, ready = true, emptyMessage, language, groups, utilities, loading, error, selectedPlayers, focusedId, onFocus, onPreview, previewState, onSave, saveState, savedIds, development, formulas, onFormulasChange }) {
  const text = (key, values) => translate(language, key, values);
  const index = new Map(utilities.map(utility => [utility.id, utility]));
  return <WorkspacePanel className="utility-recommendations" data-tour="recommendations" aria-busy={loading}>
    <WorkspacePanelHeading title={title || text("analysis.utilityRecommendationsPanel.utilityRecommendations")} actions={focusedId && <WorkspaceButton variant="quiet" onClick={() => onFocus('')}>{text("analysis.utilityRecommendationsPanel.showAll")}</WorkspaceButton>} />
    {context}
    {!selectedPlayers.length && <p>{text("analysis.utilityRecommendationsPanel.selectPlayersAndDemosToSeeRecommendations")}</p>}
    {loading && <p role="status">{text("analysis.utilityRecommendationsPanel.preparingRecommendations")}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && ready && selectedPlayers.length > 0 && !groups.length && <p>{emptyMessage || text("analysis.utilityRecommendationsPanel.noSimilarUtilitiesWithCompleteTrajectoriesOccurAtLeast4")}</p>}
    {development && <RecommendationFormulaEditor language={language} formulas={formulas} onApply={onFormulasChange} />}
    <div className="utility-recommendation-list">{groups.map((group, position) => {
      const utility = index.get(group.representativeId);
      if (!utility) return null;
      const saved = savedIds.has(utility.id);
      const saving = saveState.loading && saveState.utilityId === utility.id;
      return <article key={group.id} data-focused={focusedId === group.id} onPointerEnter={() => onPreview(utility.id)} onPointerLeave={() => onPreview('')}
        onFocusCapture={() => onPreview(utility.id)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview(''); }}>
        <div className="recommendation-title"><RawIcon name={ANALYSIS_UTILITY_ICONS[group.kind]} /><strong>{position + 1}. {text(kinds[group.kind])}</strong><b>{text("analysis.utilityRecommendationsPanel.throws", { count: group.count })}</b></div>
        <small>{text("analysis.utilityRecommendationsPanel.demosRounds", { demoCount: group.demoCount, roundCount: group.roundCount })}</small>
        <span className="recommendation-score" title={text("analysis.utilityRecommendationsPanel.derivedFromThrowsRoundsAndDemosNotASuccessProbability")}>{text("analysis.utilityRecommendationsPanel.frequencyScore", { value1: group.score.toFixed(1) })}</span>
        {renderDetails?.(group, utility)}
        <span className="recommendation-source" title={utility.source.fileName}>{utility.segment.throwEvent.user_name} · R{utility.source.round}</span>
        {previewState?.utilityId === utility.id && previewState.loading && <small role="status">{text("analysis.utilityRecommendationsPanel.loadingRecordedUtilityEffect")}</small>}
        {previewState?.utilityId === utility.id && previewState.error && <p role="alert">{previewState.error}</p>}
        <div className="recommendation-actions"><WorkspaceButton type="button" aria-pressed={focusedId === group.id} onClick={() => onFocus(focusedId === group.id ? '' : group.id)}>{focusedId === group.id ? text("analysis.utilityRecommendationsPanel.unfocus") : text("analysis.utilityRecommendationsPanel.focusGroup")}</WorkspaceButton><WorkspaceButton variant="primary" disabled={saveState.loading || saved} onClick={() => onSave(utility)}>{saved ? text("analysis.utilityRecommendationsPanel.added") : saving ? text("analysis.utilityRecommendationsPanel.loading") : text("analysis.utilityRecommendationsPanel.addRepresentative")}</WorkspaceButton></div>
      </article>;
    })}</div>
    {saveState.error && <p role="alert">{saveState.error}</p>}
  </WorkspacePanel>;
}
