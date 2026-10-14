import { useId } from 'react';
import './controls.css';

// Shared visual primitives own hierarchy, focus and sizing, never feature state.
// 中文：组件负责视觉层级与键盘焦点；业务值、权限和事件仍由调用方传入。
export function WorkspaceButton({ variant = 'secondary', selected, compact = false, icon = false, className = '', children, ...props }) {
  return <button type="button" aria-pressed={selected} {...props} className={`workspace-button workspace-button-${variant}${compact ? ' workspace-button-compact' : ''}${icon ? ' workspace-button-icon' : ''}${selected ? ' selected' : ''} ${className}`}>{children}</button>;
}
export function WorkspacePanelHeading({ title, subtitle, actions }) {
  return <header className="workspace-panel-heading"><div className="workspace-panel-title">{subtitle && <span className="workspace-context-tag">{subtitle}</span>}<h2>{title}</h2></div>{actions && <div className="workspace-panel-actions">{actions}</div>}</header>;
}
export function WorkspaceSection({ title, children, collapsible = false, defaultOpen = false, hint, className = '' }) {
  const id = useId();
  const content = <div className="workspace-section-content">{children}</div>;
  if (collapsible) return <details className={`workspace-section ${className}`} open={defaultOpen || undefined}><summary>{title}<span className="workspace-section-meta">{hint && <small>{hint}</small>}<span className="workspace-section-chevron" aria-hidden="true">⌄</span></span></summary>{content}</details>;
  return <section className={`workspace-section ${className}`} aria-labelledby={id}><h3 id={id}>{title}</h3>{content}</section>;
}
