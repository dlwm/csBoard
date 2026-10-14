import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { useEffect, useRef, useState } from 'react';
import { BUILD_VERSION, MAPS } from '../app/config.js';
import { MAP_LABEL_TONES, mapLabelStyle } from '../app/mapAppearance.js';
import { languageLabel, translate, nextLanguage, mapDisplayName } from '../i18n.js';
import ChangelogModal from './ChangelogModal.jsx';
import ResourcePackModal from './ResourcePackModal.jsx';
import AppSettings from './AppSettings.jsx';
import VoiceControl from './VoiceControl.jsx';
import { getPlatform } from '../platform/index.js';
import useDesktopUpdateState from './useDesktopUpdateState.js';

import { availableWorkspaceMenus } from './workspace/menuRegistry.js';

// Global navigation owns locale cycling and the mini-game launcher, independent of panel content.
export default function BoardHeader({ onVoiceChange, storageWorking, modelQuality, setModelQuality, sampleRate, setSampleRate, boardViewMode, onBoardViewModeChange, activePanel, language, mapName, parseGameState, setLanguage, setMapName, setParseGameManual, setParseGameState, switchPanel, t }) {
  const navRef = useRef(null);
  useEffect(() => {
    if (getPlatform().capabilities.mobile) navRef.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePanel, language]);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const { state: updateState } = useDesktopUpdateState();
  const hasUpdate = Boolean(updateState?.latestVersion);
  const nextLanguageName = languageLabel(nextLanguage(language));
  const mapLabel = (map) => mapDisplayName(language, map);
  const selectedMap = MAPS.find((map) => map.id === mapName);
  const languageSwitchTitle = translate(language, { key: "common.boardHeader.switchTo", values: { nextLanguageName: nextLanguageName } });
  const toggleGames = () => {
    const visible = parseGameState !== 'hidden';
    setParseGameManual(!visible);
    setParseGameState(visible ? 'hidden' : 'visible');
  };
  return <header className="board-header">
    <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>CS<span>BOARD</span></span>{BUILD_VERSION && <button type="button" className="build-version" title={translate(language, "common.boardHeader.viewChangelog")} onClick={() => setChangelogOpen(true)}>{BUILD_VERSION}</button>}</div>
    <nav ref={navRef} className="topbar-panels">{availableWorkspaceMenus(getPlatform().capabilities).map(({ id: panel, label }) => <WorkspaceButton variant="quiet" type="button" key={panel} aria-current={activePanel === panel ? 'page' : undefined} className={activePanel === panel ? 'active' : ''} onClick={() => switchPanel(panel)}>{t(label)}</WorkspaceButton>)}</nav>
    <div className="header-right">
      {<WorkspaceButton type="button" className="desktop-manager-button" title={translate(language, "common.boardHeader.settings")} aria-label={translate(language, "common.boardHeader.settings")} onClick={() => setDesktopOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.5 2-2 1-2-.6-2 3.5 1.5 1.4v2.4L2.5 14l2 3.5 2-.6 2 1 .5 2.1h4l.5-2.1 2-1 2 .6 2-3.5-1.5-1.3v-2.4l1.5-1.4-2-3.5-2 .6-2-1L13.5 3Z"/><circle cx="11" cy="11.5" r="3"/></svg><span className="header-action-label">{translate(language, "common.boardHeader.settings")}</span>{hasUpdate && <span className="desktop-update-badge" title={translate(language, "common.boardHeader.updateAvailable")} aria-label={translate(language, "common.boardHeader.updateAvailable")}>↑</span>}</WorkspaceButton>}
      {getPlatform().capabilities.resourceImport && <WorkspaceButton type="button" className="resource-pack-button" title={translate(language, "common.boardHeader.resources")} aria-label={translate(language, "common.boardHeader.resources")} onClick={() => setResourcesOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v8M8 5l9 5"/></svg><span className="header-action-label">{translate(language, "common.boardHeader.resources")}</span></WorkspaceButton>}
      <label className="map-select header-map-select" style={mapLabelStyle(mapName)}>
        <span>MAP</span>
        <span className="header-map-value">
          {/* Native selects cannot reliably paint gradient text across platforms.
              The single visible label overlays the native keyboard/touch control. */}
          <span className="header-map-label" aria-hidden="true">{selectedMap ? mapLabel(selectedMap) : mapName}</span>
          <select value={mapName} onChange={(event) => setMapName(event.target.value)}>
            {MAPS.map((map) => <option key={map.id} value={map.id} style={{ color: MAP_LABEL_TONES[map.id] }}>{mapLabel(map)}</option>)}
          </select>
        </span>
      </label>
      {getPlatform().capabilities.releaseDownload && <a className="release-download workspace-button workspace-button-quiet" href="https://github.com/dlwm/csBoard/releases/latest" target="_blank" rel="noopener noreferrer"
        title={translate(language, "common.boardHeader.downloadDesktopApp")}
        aria-label={translate(language, "common.boardHeader.downloadDesktopApp")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
        <span>{translate(language, "common.boardHeader.downloadDesktopApp")}</span>
      </a>}
      <a className="github-link workspace-button workspace-button-quiet workspace-button-icon" href="https://github.com/dlwm/csBoard" target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.06c-3.1.67-3.76-1.31-3.76-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.7 1.15 1.7 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.48-.28-5.08-1.24-5.08-5.51 0-1.22.43-2.21 1.14-2.99-.12-.28-.49-1.42.1-2.95 0 0 .93-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.59 1.53.22 2.67.11 2.95.7.78 1.14 1.77 1.14 2.99 0 4.28-2.61 5.22-5.1 5.5.4.35.75 1.02.75 2.06v3.07c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg></a>
      <WorkspaceButton icon type="button" className="board-view-toggle" aria-pressed={boardViewMode === "2d"} title={translate(language, boardViewMode === "2d" ? "view.mode.switchTo3d" : "view.mode.switchTo2d")} onClick={() => onBoardViewModeChange(boardViewMode === "2d" ? "3d" : "2d")}>{boardViewMode === "2d" ? "2D" : "3D"}</WorkspaceButton>{getPlatform().capabilities.demoParsing && <VoiceControl language={language} onChange={onVoiceChange} />}
      <WorkspaceButton icon type="button" className={`game-switch${parseGameState !== 'hidden' ? ' active' : ''}`} title={translate(language, "common.boardHeader.miniGames")} aria-label={translate(language, "common.boardHeader.openMiniGames")} aria-pressed={parseGameState !== 'hidden'} onClick={toggleGames}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8h9.6a4 4 0 0 1 3.8 5.2l-1.2 3.7a2.2 2.2 0 0 1-3.5 1.1l-2.1-1.7h-3.6L8.1 18a2.2 2.2 0 0 1-3.5-1.1l-1.2-3.7A4 4 0 0 1 7.2 8Z"/><path d="M8 11v4M6 13h4M16.5 11.5h.01M18 14h.01"/></svg></WorkspaceButton>
      <WorkspaceButton icon type="button" className="language-switch" title={languageSwitchTitle} aria-label={languageSwitchTitle} onClick={() => setLanguage(nextLanguage)}>{language === 'zh' ? '中' : languageLabel(language)}</WorkspaceButton>
    </div>
    {changelogOpen && <ChangelogModal buildVersion={BUILD_VERSION} language={language} onClose={() => setChangelogOpen(false)} />}
    {resourcesOpen && <ResourcePackModal language={language} onClose={() => setResourcesOpen(false)} />}
    {desktopOpen && <AppSettings storageWorking={storageWorking} modelQuality={modelQuality} setModelQuality={setModelQuality} sampleRate={sampleRate} setSampleRate={setSampleRate} language={language} initialTab={hasUpdate ? 'updates' : 'appearance'} onClose={() => setDesktopOpen(false)} />}
  </header>;
}
