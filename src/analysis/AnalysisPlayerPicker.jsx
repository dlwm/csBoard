// Searchable player picker with lightweight ordered-character fuzzy matching.
import { useEffect, useMemo, useState } from 'react';

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

export default function AnalysisPlayerPicker({ language, players, loading, value, query, onQueryChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchQuery = open && query === value ? '' : query;
  const matches = useMemo(() => players
    .map((name) => ({ name, score: fuzzyPlayerScore(name, searchQuery) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))
    .slice(0, 100), [players, searchQuery]);

  useEffect(() => setActiveIndex(0), [searchQuery]);

  const choose = (name) => {
    onQueryChange(name);
    onSelect(name);
    setOpen(false);
  };

  return <label className="analysis-side analysis-player-picker">
    <span>{language === 'zh' ? '用户名' : 'PLAYER NAME'}</span>
    <div className="analysis-player-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input type="search" value={query} disabled={loading} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="analysis-player-results" placeholder={loading ? (language === 'zh' ? '加载中…' : 'Loading…') : (language === 'zh' ? '搜索选手用户名…' : 'Search player name…')} onFocus={(event) => { event.currentTarget.select(); setOpen(true); }} onChange={(event) => { onQueryChange(event.target.value); setOpen(true); }} onKeyDown={(event) => {
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
      {query && <button type="button" className="analysis-player-clear" aria-label={language === 'zh' ? '清除选手' : 'Clear player'} onClick={() => { onQueryChange(''); onSelect(''); setOpen(true); }}>×</button>}
      {open && <div id="analysis-player-results" className="analysis-player-results" role="listbox">
        {loading ? <div className="analysis-player-message">{language === 'zh' ? '选手列表加载中…' : 'Loading player list…'}</div> : matches.length ? matches.map((item, index) => <button type="button" role="option" aria-selected={item.name === value} className={`${item.name === value ? 'selected ' : ''}${index === activeIndex ? 'active' : ''}`.trim()} key={item.name} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item.name)}>{item.name}</button>) : <div className="analysis-player-message">{players.length ? (language === 'zh' ? '没有匹配的选手' : 'No matching players') : (language === 'zh' ? '当前地图暂无分析用户' : 'No analyzed players on this map')}</div>}
        {!loading && matches.length === 100 && <small>{language === 'zh' ? '仅显示前 100 项，请继续输入以缩小范围' : 'Showing the first 100 results. Type more to narrow them.'}</small>}
      </div>}
    </div>
    {loading && <small className="analysis-player-loading">{language === 'zh' ? '选手列表加载中…' : 'Loading player list…'}</small>}
  </label>;
}
