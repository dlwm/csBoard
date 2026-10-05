import { WorkspaceTarget } from './WorkspaceSlots.jsx';

// Regions own chrome; registered content owns menu-specific controls.
// 区域组件只负责外框，菜单内部的按钮和业务状态由注册内容负责。
export function WorkspaceBar({ position, children }) {
  const Element = position === 'bottom' ? 'footer' : 'div';
  return <Element className={position === 'bottom' ? 'workspace-bottom-bar' : 'workspace-top'}>
    <WorkspaceTarget slot={position} />{children}
  </Element>;
}

export function WorkspaceSidebar({ side, hidden, label }) {
  return <aside id={`workspace-${side}`} className={side === 'left' ? 'workspace-left-content' : 'workspace-sidebar workspace-right'} hidden={hidden} aria-label={label}>
    <WorkspaceTarget slot={side} />
  </aside>;
}

export function WorkspaceMapBar() {
  return <div className="workspace-map"><WorkspaceTarget slot="map" /></div>;
}

// Corners are relative to the 3D viewport, not the window or sidebar widths.
// 四角槽位统一处理边距、堆叠与点击穿透；业务组件只注册内容，不计算坐标。
export function WorkspaceCorners() {
  return <div className="workspace-corners">{['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner =>
    <WorkspaceTarget key={corner} slot={`viewport-${corner}`} className={`workspace-corner workspace-corner-${corner}`} />
  )}</div>;
}
