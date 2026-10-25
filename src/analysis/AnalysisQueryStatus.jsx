import { translate } from '../i18n.js';
import { utilityMatchesFilters } from './utilityFilters.js';

export default function AnalysisQueryStatus({ language, loading, error, data, flags, side, enabled }) {
  const text = (key, values) => translate(language, key, values);
  if (!enabled) return null;
  if (flags.analysisMetric === 'utility' && flags.utilityMode === 'timing') {
    if (loading) return <p role="status">{text("analysis.timing.loading")}</p>;
    return !error && data.timing ? <p>{text("analysis.timing.support", { demos: data.timing.demoCount, rounds: data.timing.roundCount })}</p> : null;
  }
  if (loading) return <div className="analysis-status analysis-query-status" role="status" aria-live="polite"><i className="analysis-loading-spinner" aria-hidden="true" />{flags.analysisMetric === 'utility'
    ? text("analysis.analysisQueryStatus.loadingUtilityPositionsAndTrajectories")
    : text("analysis.analysisQueryStatus.updatingAnalysis")}</div>;
  if (error) return null; // The panel already displays the request error.
  if (flags.analysisMetric !== 'utility') return null;
  const utilities = data.utilities || [];
  const visible = utilities.filter(utility => utilityMatchesFilters(utility, flags, side)).length;
  const diagnostics = data.utilityDiagnostics || {};
  let message;
  if (utilities.length) message = visible
    ? text("analysis.analysisQueryStatus.throwsLoadedMatchTheCurrentFilters", { length: utilities.length, visible: visible })
    : text("analysis.analysisQueryStatus.throwsLoadedAllHiddenByTheSideEconomyOrUtility", { length: utilities.length });
  else if (diagnostics.loadedDemos < diagnostics.requestedDemos) message = text("analysis.analysisQueryStatus.analysisCacheIsUnavailableForSomeSelectedDemosReparseThem");
  else if (diagnostics.missingRounds) message = text("analysis.analysisQueryStatus.throwsExistButRoundCachesAreIncompleteReparseTheAffected");
  else if (!diagnostics.throwEvents) message = text("analysis.analysisQueryStatus.noIdentifiableThrowsWereRecordedForTheSelectedPlayersIn");
  else message = text("analysis.analysisQueryStatus.throwsExistButMatchingTrajectoriesPositionsOrTeamDataAre");
  const incomplete = (diagnostics.unmatchedThrows || 0) + (diagnostics.missingPosition || 0) + (diagnostics.missingSide || 0);
  const unknownEconomy = utilities.filter(utility => utility.economyMatchup?.includes('UNKNOWN')).length;
  return <div className="analysis-status analysis-query-status" role="status" aria-live="polite">
    <span>{message}</span>
    {!!diagnostics.missingRounds && <small>{text("analysis.analysisQueryStatus.roundCachesAreMissing", { missingRounds: diagnostics.missingRounds })}</small>}
    {!!incomplete && <small>{text("analysis.analysisQueryStatus.throwsHaveIncompleteDataAndAreNotDisplayed", { incomplete: incomplete })}</small>}
    {!!unknownEconomy && <small>{text("analysis.analysisQueryStatus.throwsLackEconomyDataAndCannotMatchEconomyFilters", { unknownEconomy: unknownEconomy })}</small>}
    {flags.heatStyle === 'global' && flags.utilityLanding === false && <small>{text("analysis.analysisQueryStatus.landingPositionsAreDisabledSoTheHeatmapHasNoPoints")}</small>}
  </div>;
}
