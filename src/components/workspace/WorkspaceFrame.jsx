import { useRef } from 'react';
import { localize } from '../../i18n.js';
import useResponsiveWorkspace from '../../hooks/useResponsiveWorkspace.js';
import { WorkspaceSlots, WorkspaceTarget } from './WorkspaceSlots.jsx';
import { WorkspaceBar, WorkspaceSidebar, WorkspaceMapBar, WorkspaceCorners } from './WorkspaceRegions.jsx';
import './workspace.css';

function SidebarToggle({ side, open, onToggle, language }) {
  const values = side === 'left'
    ? open ? { zh: '收起左栏', en: 'Collapse left sidebar', ru: 'Свернуть левую панель' } : { zh: '展开左栏', en: 'Expand left sidebar', ru: 'Развернуть левую панель' }
    : open ? { zh: '收起右栏', en: 'Collapse right sidebar', ru: 'Свернуть правую панель' } : { zh: '展开右栏', en: 'Expand right sidebar', ru: 'Развернуть правую панель' };
  return <button type="button" className={`workspace-sidebar-toggle workspace-toggle-${side}`} aria-expanded={open} aria-controls={`workspace-${side}`} aria-label={localize(language, values)} onClick={onToggle}>{side === 'left' ? open ? '‹' : '›' : open ? '›' : '‹'}</button>;
}

// This shell owns geometry and sidebar chrome. Menu content only declares slots.
// 框架统一负责尺寸、折叠、滚动和触控布局；菜单只提供槽位内容。
export default function WorkspaceFrame({ panel, mobile, mobileH5, analysisMetric, mapName, navData,
  hasLeft, hasRight, leftOpen, rightOpen, onLeftToggle, onRightToggle, language, children }) {
  const viewportRef = useRef(null), stageRef = useRef(null);
  const leftCollapsed = !hasLeft || !leftOpen, rightCollapsed = !hasRight || !rightOpen;
  useResponsiveWorkspace({ activePanel: panel, leftSidebarOpen: leftOpen, mapName, navData, viewportRef, stageRef });
  return <WorkspaceSlots><main className={`board-shell workspace-frame${mobile ? ' is-mobile' : ''}${mobileH5 ? ' is-mobile-h5' : ''}${leftCollapsed ? ' left-sidebar-collapsed' : ''}${rightCollapsed ? ' right-sidebar-collapsed' : ''}`}
    data-mobile-workspace={mobile || undefined} data-panel={panel} data-analysis-metric={analysisMetric}>
    <WorkspaceBar position="top" />
    <section ref={stageRef} className="board-stage workspace-grid" style={{ '--left-column': leftCollapsed ? '0px' : 'var(--workspace-left-width, var(--map-bar-width, 276px))', '--right-column': rightCollapsed ? '0px' : 'var(--workspace-sidebar-width)' }}>
      <div className={`workspace-left${leftCollapsed ? ' is-collapsed' : ''}`}>
        <WorkspaceMapBar />
        <WorkspaceSidebar side="left" hidden={leftCollapsed} label={localize(language, { zh: '左栏', en: 'Left sidebar', ru: 'Левая панель' })} />
      </div>
      <div ref={viewportRef} className="workspace-viewport">{children}<WorkspaceCorners /></div>
      <WorkspaceSidebar side="right" hidden={rightCollapsed} label={localize(language, { zh: '右栏', en: 'Right sidebar', ru: 'Правая панель' })} />
      <WorkspaceBar position="bottom"><div className="workspace-bottom-transport"><WorkspaceTarget slot="bottom-transport" /></div><div className="workspace-bottom-settings"><WorkspaceTarget slot="bottom-settings" /><WorkspaceTarget slot="bottom-model-controls" /><WorkspaceTarget slot="bottom-mobile-settings" /></div></WorkspaceBar>
      {hasLeft && <SidebarToggle side="left" open={leftOpen} onToggle={onLeftToggle} language={language} />}
      {hasRight && <SidebarToggle side="right" open={rightOpen} onToggle={onRightToggle} language={language} />}
    </section>
  </main></WorkspaceSlots>;
}
