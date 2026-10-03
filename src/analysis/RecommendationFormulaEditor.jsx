import { useState } from 'react';
import { localize } from '../i18n.js';
import { DEFAULT_RECOMMENDATION_FORMULAS, FORMULA_VARIABLES, validateRecommendationFormulas } from './recommendationFormulas.js';
const labels = {
  startTolerance: ['起点容差（米）', 'Start tolerance (m)', 'Допуск начала (м)'],
  landingTolerance: ['落点容差（米）', 'Landing tolerance (m)', 'Допуск конца (м)'],
  routeMeanTolerance: ['轨迹平均容差（米）', 'Mean trajectory tolerance (m)', 'Средний допуск траектории (м)'],
  routeMaxTolerance: ['轨迹最大容差（米）', 'Max trajectory tolerance (m)', 'Максимальный допуск траектории (м)'],
  flightTolerance: ['飞行时间容差（秒）', 'Flight time tolerance (s)', 'Допуск времени полёта (с)'],
  frequencyScore: ['频次分（0–100）', 'Frequency score (0–100)', 'Оценка частоты (0–100)'],
};
export default function RecommendationFormulaEditor({ language, formulas, onApply }) {
  const [draft, setDraft] = useState(formulas), [error, setError] = useState('');
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <details className="recommendation-formula-editor">
    <summary>{text('开发：推荐公式', 'Dev: recommendation formulas', 'Разработка: формулы рекомендаций')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      try { validateRecommendationFormulas(draft); onApply({ ...draft }); setError(''); }
      catch (error) { setError(error.message); }
    }}>
      {Object.keys(DEFAULT_RECOMMENDATION_FORMULAS).map(name => <label key={name}>
        <span>{text(...labels[name])}</span>
        <textarea rows={2} value={draft[name]} spellCheck={false} onChange={event => setDraft(current => ({ ...current, [name]: event.target.value }))} />
        <small>{FORMULA_VARIABLES[name].map(variable => `{${variable}}`).join(' · ')}</small>
      </label>)}
      {error && <p role="alert">{text('公式无效：', 'Invalid formula: ', 'Ошибка формулы: ')}{error}</p>}
      <div><button type="submit">{text('应用并重新分组', 'Apply and regroup', 'Применить и перегруппировать')}</button><button type="button" onClick={() => {
        setDraft(DEFAULT_RECOMMENDATION_FORMULAS); onApply(DEFAULT_RECOMMENDATION_FORMULAS); setError('');
      }}>{text('恢复默认', 'Reset defaults', 'Восстановить')}</button></div>
    </form>
  </details>;
}
