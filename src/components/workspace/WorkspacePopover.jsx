import { useLayoutEffect, useRef, useState } from 'react';

// Scene anchors are viewport-local. Keep the entire card within that viewport,
// including after sidebar, footer or card content changes. 坐标不叠加边栏宽度。
export default function WorkspacePopover({ anchor, className = '', children, ...props }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const node = ref.current, viewport = node?.offsetParent;
    if (!node || !viewport) return undefined;
    const update = () => {
      const x = Math.max(12, Math.min(Number(anchor?.x) || 12, viewport.clientWidth - node.offsetWidth - 12));
      const y = Math.max(12, Math.min(Number(anchor?.y) || 12, viewport.clientHeight - node.offsetHeight - 12));
      setPosition(current => current?.x === x && current?.y === y ? current : { x, y });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node); observer.observe(viewport);
    return () => observer.disconnect();
  }, [anchor?.x, anchor?.y]);
  return <div {...props} ref={ref} className={`workspace-popover ${className}`} style={{ left: position?.x ?? anchor?.x ?? 12, top: position?.y ?? anchor?.y ?? 12 }}>{children}</div>;
}
