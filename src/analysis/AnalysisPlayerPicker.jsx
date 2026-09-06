// Searchable multi-player picker with deferred fuzzy matching for large Demo libraries.
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { localize } from '../i18n.js';
import { ANALYSIS_PLAYER_COLORS } from './constants.js';

function fuzzyPlayerScore(name, query) {
  const candidate = String(name).toLocaleLowerCase();
  const needle = String(query).trim().toLocaleLowerCase();
  if (!needle) return 4;
  if (candidate === needle) return 0;
  if (candidate.startsWith(needle)) return 1;
  if (candidate.includes(needle)) return 2;
  let cursor = 0;
  for (const character of candidate) {
    if (character === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return 3;
  }
  return Number.POSITIVE_INFINITY;
}

function AnalysisPlayerPicker({ language, players, loading, values, query, onQueryChange, onToggle, onClear }) {
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const selected = useMemo(() => new Set(values), [values]);
  const matches = useMemo(() => players
    .map((name) => ({ name, score: fuzzyPlayerScore(name, deferredQuery) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || Number(selected.has(right.name)) - Number(selected.has(left.name)) || left.name.localeCompare(right.name))
    .slice(0, 100), [players, deferredQuery, selected]);

  useEffect(() => setActiveIndex(0), [deferredQuery]);

  const choose = (name) => {
    onToggle(name);
    onQueryChange('');
    setOpen(true);
  };

  return <section className="analysis-side analysis-player-picker">
    <header><span>{text('选手', 'PLAYERS', 'ИГРОКИ')} · {values.length}</span>{values.length > 0 && <button type="button" onClick={onClear}>{text('清空', 'CLEAR', 'ОЧИСТИТЬ')}</button>}</header>
    {values.length > 0 && <div className="analysis-player-chips">{values.map((name, index) => <button type="button" key={name} style={{ '--player-color': ANALYSIS_PLAYER_COLORS[index % ANALYSIS_PLAYER_COLORS.length] }} title={text(`移除 ${name}`, `Remove ${name}`, `Удалить ${name}`)} onClick={() => onToggle(name)}><span>{name}</span><b>×</b></button>)}</div>}
    <div className="analysis-player-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input type="search" value={query} disabled={loading} role="combobox" aria-label={text('搜索选手用户名', 'Search player name', 'Поиск игрока')} aria-autocomplete="list" aria-expanded={open} aria-controls="analysis-player-results" placeholder={loading ? text('加载中…', 'Loading…', 'Загрузка…') : text('搜索并添加选手…', 'Search and add players…', 'Найти и добавить игроков…')} onFocus={() => setOpen(true)} onChange={(event) => { onQueryChange(event.target.value); setOpen(true); }} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter' && open && matches[activeIndex]) {
          event.preventDefault();
          choose(matches[activeIndex].name);
        } else if (event.key === 'Escape') {
          setOpen(false);
        }
      }} />
      {query && <button type="button" className="analysis-player-clear" aria-label={text('清除搜索', 'Clear search', 'Очистить поиск')} onClick={() => { onQueryChange(''); setOpen(true); }}>×</button>}
      {open && <div id="analysis-player-results" className="analysis-player-results" role="listbox" aria-multiselectable="true">
        {loading ? <div className="analysis-player-message">{text('选手列表加载中…', 'Loading player list…', 'Загрузка списка игроков…')}</div> : matches.length ? matches.map((item, index) => { const selectedIndex = values.indexOf(item.name); return <button type="button" role="option" aria-selected={selectedIndex >= 0} style={selectedIndex < 0 ? undefined : { '--player-color': ANALYSIS_PLAYER_COLORS[selectedIndex % ANALYSIS_PLAYER_COLORS.length] }} className={`${selectedIndex >= 0 ? 'selected ' : ''}${index === activeIndex ? 'active ' : ''}`.trim()} key={item.name} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item.name)}><span>{item.name}</span><b>{selectedIndex >= 0 ? '✓' : '+'}</b></button>; }) : <div className="analysis-player-message">{players.length ? text('没有匹配的选手', 'No matching players', 'Совпадений нет') : text('当前地图暂无分析用户', 'No analyzed players on this map', 'Нет данных по игрокам на этой карте')}</div>}
        {!loading && matches.length === 100 && <small>{text('仅显示前 100 项，请继续输入以缩小范围', 'Showing the first 100 results. Type more to narrow them.', 'Показаны первые 100 результатов. Уточните запрос.')}</small>}
      </div>}
    </div>
    {loading && <small className="analysis-player-loading">{text('选手列表加载中…', 'Loading player list…', 'Загрузка списка игроков…')}</small>}
  </section>;
}

export default memo(AnalysisPlayerPicker);
