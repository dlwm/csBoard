import { useState } from 'react';
import { translate } from '../i18n.js';
import { DEFAULT_RECOMMENDATION_FORMULAS, FORMULA_VARIABLES, validateRecommendationFormulas } from './recommendationFormulas.js';
const labels = {
  startTolerance: "analysis.recommendationFormulaEditor.startToleranceM",
  landingTolerance: "analysis.recommendationFormulaEditor.landingToleranceM",
  routeMeanTolerance: "analysis.recommendationFormulaEditor.meanTrajectoryToleranceM",
  routeMaxTolerance: "analysis.recommendationFormulaEditor.maxTrajectoryToleranceM",
  flightTolerance: "analysis.recommendationFormulaEditor.flightTimeToleranceS",
  frequencyScore: "analysis.recommendationFormulaEditor.frequencyScore0100",
};
export default function RecommendationFormulaEditor({ language, formulas, onApply }) {
  const [draft, setDraft] = useState(formulas), [error, setError] = useState('');
  const text = (key, values) => translate(language, key, values);
  return <details className="recommendation-formula-editor">
    <summary>{text("analysis.recommendationFormulaEditor.devRecommendationFormulas")}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      try { validateRecommendationFormulas(draft); onApply({ ...draft }); setError(''); }
      catch (error) { setError(error.message); }
    }}>
      {Object.keys(DEFAULT_RECOMMENDATION_FORMULAS).map(name => <label key={name}>
        <span>{text(labels[name])}</span>
        <textarea rows={2} value={draft[name]} spellCheck={false} onChange={event => setDraft(current => ({ ...current, [name]: event.target.value }))} />
        <small>{FORMULA_VARIABLES[name].map(variable => `{${variable}}`).join(' · ')}</small>
      </label>)}
      {error && <p role="alert">{text("analysis.recommendationFormulaEditor.invalidFormula")}{error}</p>}
      <div><button type="submit">{text("analysis.recommendationFormulaEditor.applyAndRegroup")}</button><button type="button" onClick={() => {
        setDraft(DEFAULT_RECOMMENDATION_FORMULAS); onApply(DEFAULT_RECOMMENDATION_FORMULAS); setError('');
      }}>{text("analysis.recommendationFormulaEditor.resetDefaults")}</button></div>
    </form>
  </details>;
}
