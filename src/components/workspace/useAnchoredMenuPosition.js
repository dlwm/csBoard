import { useLayoutEffect, useRef, useState } from 'react';

// Anchor menus inside the visible workspace, including narrow/short windows.
// 菜单跟随触发器，按工作区与可视窗口交集限制位置；空间不足时内部滚动。
export default function useAnchoredMenuPosition(open, anchorRef) {
  const menuRef = useRef(null);
  const [style, setStyle] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return undefined;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    const workspace = anchor.closest('.workspace-grid');
    const update = () => {
      const viewport = window.visualViewport;
      const screen = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0 };
      screen.right = screen.left + (viewport?.width || window.innerWidth);
      screen.bottom = screen.top + (viewport?.height || window.innerHeight);
      const area = workspace?.getBoundingClientRect() || screen;
      const bounds = {
        left: Math.max(screen.left, area.left) + 8,
        right: Math.min(screen.right, area.right) - 8,
        top: Math.max(screen.top, area.top) + 8,
        bottom: Math.min(screen.bottom, area.bottom) - 8,
      };
      const rect = anchor.getBoundingClientRect();
      const width = Math.max(1, Math.min(250, bounds.right - bounds.left));
      const above = Math.max(0, rect.top - bounds.top - 8);
      const below = Math.max(0, bounds.bottom - rect.bottom - 8);
      const up = above >= below;
      const maxHeight = Math.max(1, Math.min(360, up ? above : below));
      const height = Math.min(menu.scrollHeight + 2, maxHeight);
      const left = Math.max(bounds.left, Math.min(rect.left, bounds.right - width));
      const top = up ? rect.top - 8 - height : rect.bottom + 8;
      // Absolute coordinates stay in the picker so outside-click handling and
      // workspace stacking remain intact; include the anchor's border offset.
      const next = { position: 'absolute', left: left - rect.left - anchor.clientLeft, top: top - rect.top - anchor.clientTop, right: 'auto', bottom: 'auto', width, maxHeight, boxSizing: 'border-box' };
      setStyle(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    [anchor, menu, workspace].filter(Boolean).forEach(node => observer.observe(node));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, anchorRef]);
  return { menuRef, style };
}
