import RecommendationFormulaEditor from './RecommendationFormulaEditor.jsx';
import { localize } from '../i18n.js';
import { RawIcon } from '../components/CsIcons.jsx';
import { ANALYSIS_UTILITY_ICONS } from './constants.js';
const kinds = { smoke: ['烟雾弹', 'Smoke', 'Дым'], flash: ['闪光弹', 'Flash', 'Световая'], fire: ['燃烧弹', 'Fire', 'Огонь'], he: ['高爆手雷', 'HE', 'Осколочная'], decoy: ['诱饵弹', 'Decoy', 'Ложная'] };

export default function UtilityRecommendationsPanel({ language, groups, utilities, loading, error, selectedPlayers, focusedId, onFocus, onPreview, onSave, saveState, savedIds, development, formulas, onFormulasChange }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const index = new Map(utilities.map(utility => [utility.id, utility]));
  return <aside className="utility-recommendations" aria-busy={loading}>
    <header><h2>{text('道具推荐', 'Utility recommendations', 'Рекомендуемые гранаты')}</h2>{focusedId && <button type="button" onClick={() => onFocus('')}>{text('显示全部', 'Show all', 'Показать все')}</button>}</header>
    {!selectedPlayers.length && <p>{text('选择选手与 Demo 后显示推荐。', 'Select players and Demos to see recommendations.', 'Выберите игроков и Demo для рекомендаций.')}</p>}
    {loading && <p role="status">{text('正在准备推荐…', 'Preparing recommendations…', 'Подготовка рекомендаций…')}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && selectedPlayers.length > 0 && !groups.length && <p>{text('当前范围内没有至少出现 4 次且轨迹完整的相似道具。', 'No similar utilities with complete trajectories occur at least 4 times in this selection.', 'Нет похожих гранат с полной траекторией и минимум 4 бросками.')}</p>}
    {development && <RecommendationFormulaEditor language={language} formulas={formulas} onApply={onFormulasChange} />}
    <div className="utility-recommendation-list">{groups.map((group, position) => {
      const utility = index.get(group.representativeId);
      if (!utility) return null;
      const saved = savedIds.has(utility.id);
      const saving = saveState.loading && saveState.utilityId === utility.id;
      return <article key={group.id} data-focused={focusedId === group.id} onPointerEnter={() => onPreview(utility.id)} onPointerLeave={() => onPreview('')}
        onFocusCapture={() => onPreview(utility.id)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onPreview(''); }}>
        <div className="recommendation-title"><RawIcon name={ANALYSIS_UTILITY_ICONS[group.kind]} /><strong>{position + 1}. {text(...kinds[group.kind])}</strong><b>{text(`${group.count} 次`, `${group.count} throws`, `${group.count} бросков`)}</b></div>
        <small>{text(`${group.demoCount} 个 Demo · ${group.roundCount} 个回合`, `${group.demoCount} Demos · ${group.roundCount} rounds`, `${group.demoCount} Demo · ${group.roundCount} раундов`)}</small>
        <span className="recommendation-score" title={text('由投掷次数、回合数及 Demo 数换算；不是成功率。', 'Derived from throws, rounds and Demos; not a success probability.', 'Учитывает броски, раунды и Demo; это не вероятность успеха.')}>{text(`频次分 ${group.score.toFixed(1)}`, `Frequency score ${group.score.toFixed(1)}`, `Оценка частоты ${group.score.toFixed(1)}`)}</span>
        <span className="recommendation-source" title={utility.source.fileName}>{utility.segment.throwEvent.user_name} · R{utility.source.round}</span>
        <div className="recommendation-actions"><button type="button" aria-pressed={focusedId === group.id} onClick={() => onFocus(focusedId === group.id ? '' : group.id)}>{focusedId === group.id ? text('取消聚焦', 'Unfocus', 'Снять фокус') : text('聚焦同组', 'Focus group', 'Фокус группы')}</button><button type="button" disabled={saveState.loading || saved} onClick={() => onSave(utility)}>{saved ? text('已添加', 'Added', 'Добавлено') : saving ? text('读取中…', 'Loading…', 'Загрузка…') : text('添加代表道具', 'Add representative', 'Добавить образец')}</button></div>
      </article>;
    })}</div>
    {saveState.error && <p role="alert">{saveState.error}</p>}
  </aside>;
}
