import { useState } from 'react';
import { BUILD_VERSION, MAPS } from '../app/config.js';
import { languageLabel, localize, nextLanguage } from '../i18n.js';
import ChangelogModal from './ChangelogModal.jsx';
import { MapIcon } from './CsIcons.jsx';

const PANELS = [['demo', 'rounds'], ['analysis', 'analysis'], ['utility', 'utilityNotes'], ['collab', 'collab']];

// Global navigation owns locale cycling and the mini-game launcher, independent of panel content.
export default function BoardHeader({ activePanel, language, mapName, parseGameState, setLanguage, setMapName, setParseGameManual, setParseGameState, switchPanel, t }) {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const nextLanguageName = languageLabel(nextLanguage(language));
  const languageSwitchTitle = localize(language, { zh: `切换到 ${nextLanguageName}`, en: `Switch to ${nextLanguageName}`, ru: `Переключить на ${nextLanguageName}` });
  const toggleGames = () => {
    const visible = parseGameState !== 'hidden';
    setParseGameManual(!visible);
    setParseGameState(visible ? 'hidden' : 'visible');
  };
  return <header className="board-header">
    <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>CS<span>BOARD</span></span>{BUILD_VERSION && <button type="button" className="build-version" title={localize(language, { zh: '查看更新日志', en: 'View changelog', ru: 'Открыть список изменений' })} onClick={() => setChangelogOpen(true)}>{BUILD_VERSION}</button>}</div>
    <nav className="topbar-panels">{PANELS.map(([panel, label]) => <button type="button" key={panel} className={activePanel === panel ? 'active' : ''} onClick={() => switchPanel(panel)}>{t(label)}</button>)}</nav>
    <div className="header-right">
      <label className="map-select header-map-select"><span>MAP</span><select value={mapName} onChange={(event) => setMapName(event.target.value)}>{MAPS.map((map) => <option key={map.id} value={map.id}>{map.label}</option>)}</select><MapIcon map={mapName} /></label>
      <a className="github-link" href="https://github.com/dlwm/csBoard" target="_blank" rel="noreferrer">GITHUB</a>
      <button type="button" className={`game-switch${parseGameState !== 'hidden' ? ' active' : ''}`} title={localize(language, { zh: '小游戏', en: 'Mini games', ru: 'Мини-игры' })} aria-label={localize(language, { zh: '打开小游戏', en: 'Open mini games', ru: 'Открыть мини-игры' })} aria-pressed={parseGameState !== 'hidden'} onClick={toggleGames}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8h9.6a4 4 0 0 1 3.8 5.2l-1.2 3.7a2.2 2.2 0 0 1-3.5 1.1l-2.1-1.7h-3.6L8.1 18a2.2 2.2 0 0 1-3.5-1.1l-1.2-3.7A4 4 0 0 1 7.2 8Z"/><path d="M8 11v4M6 13h4M16.5 11.5h.01M18 14h.01"/></svg></button>
      <button type="button" className="language-switch" title={languageSwitchTitle} aria-label={languageSwitchTitle} onClick={() => setLanguage(nextLanguage)}>{languageLabel(language)}</button>
    </div>
    {changelogOpen && <ChangelogModal buildVersion={BUILD_VERSION} language={language} onClose={() => setChangelogOpen(false)} />}
  </header>;
}
