import { localize } from '../i18n.js';
import { utilityMatchesFilters } from './utilityFilters.js';

export default function AnalysisQueryStatus({ language, loading, error, data, flags, side, enabled }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  if (!enabled) return null;
  if (loading) return <div className="analysis-status analysis-query-status" role="status" aria-live="polite"><i className="analysis-loading-spinner" aria-hidden="true" />{flags.analysisMetric === 'utility'
    ? text('正在读取道具点位与轨迹…', 'Loading utility positions and trajectories…', 'Загрузка позиций и траекторий гранат…')
    : text('正在更新分析…', 'Updating analysis…', 'Обновление анализа…')}</div>;
  if (error) return null; // The panel already displays the request error.
  if (flags.analysisMetric !== 'utility') return null;
  const utilities = data.utilities || [];
  const visible = utilities.filter(utility => utilityMatchesFilters(utility, flags, side)).length;
  const diagnostics = data.utilityDiagnostics || {};
  let message;
  if (utilities.length) message = visible
    ? text(`已加载 ${utilities.length} 次投掷，当前筛选 ${visible} 次。`, `${utilities.length} throws loaded; ${visible} match the current filters.`, `Загружено бросков: ${utilities.length}; по фильтрам: ${visible}.`)
    : text(`已加载 ${utilities.length} 次投掷，均被当前阵营、经济或道具类别筛选隐藏。`, `${utilities.length} throws loaded, all hidden by the side, economy or utility filters.`, `Загружено ${utilities.length} бросков; все скрыты фильтрами стороны, экономики или типа.`);
  else if (diagnostics.loadedDemos < diagnostics.requestedDemos) message = text('部分所选 Demo 的分析缓存不可用，请重新解析。', 'Analysis cache is unavailable for some selected Demos. Reparse them.', 'Кэш анализа некоторых выбранных Demo недоступен. Повторите разбор.');
  else if (diagnostics.missingRounds) message = text('投掷事件存在，但回合缓存不完整，请重新解析相关 Demo。', 'Throws exist, but round caches are incomplete. Reparse the affected Demos.', 'Броски есть, но кэш раундов неполон. Повторите разбор Demo.');
  else if (!diagnostics.throwEvents) message = text('所选选手在这些 Demo 中没有可识别的投掷记录。', 'No identifiable throws were recorded for the selected players in these Demos.', 'Для выбранных игроков в этих Demo нет распознаваемых бросков.');
  else message = text('投掷事件存在，但缺少可配对的轨迹、坐标或阵营数据。', 'Throws exist, but matching trajectories, positions or team data are missing.', 'Броски есть, но отсутствуют подходящие траектории, координаты или данные стороны.');
  const incomplete = (diagnostics.unmatchedThrows || 0) + (diagnostics.missingPosition || 0) + (diagnostics.missingSide || 0);
  const unknownEconomy = utilities.filter(utility => utility.economyMatchup?.includes('UNKNOWN')).length;
  return <div className="analysis-status analysis-query-status" role="status" aria-live="polite">
    <span>{message}</span>
    {!!diagnostics.missingRounds && <small>{text(`缺少 ${diagnostics.missingRounds} 个回合缓存。`, `${diagnostics.missingRounds} round caches are missing.`, `Отсутствует кэш ${diagnostics.missingRounds} раундов.`)}</small>}
    {!!incomplete && <small>{text(`${incomplete} 次投掷数据不完整，未显示。`, `${incomplete} throws have incomplete data and are not displayed.`, `${incomplete} бросков с неполными данными не показаны.`)}</small>}
    {!!unknownEconomy && <small>{text(`${unknownEconomy} 次投掷缺少经济数据，无法匹配经济筛选。`, `${unknownEconomy} throws lack economy data and cannot match economy filters.`, `${unknownEconomy} бросков без данных экономики не соответствуют фильтрам экономики.`)}</small>}
    {flags.heatStyle === 'global' && flags.utilityLanding === false && <small>{text('落地位置已关闭，热力图没有可显示的点位。', 'Landing positions are disabled, so the heatmap has no points to display.', 'Позиции попаданий отключены; на тепловой карте нет точек.')}</small>}
  </div>;
}
