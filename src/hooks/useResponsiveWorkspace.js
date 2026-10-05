import { useEffect } from 'react';
import * as THREE from 'three';

// Keep viewport observation and its CSS sizing contract outside application business state.
export default function useResponsiveWorkspace({ activePanel, leftSidebarOpen, mapName, navData, viewportRef, stageRef }) {
  useEffect(() => {
    const query = window.matchMedia?.('(orientation: landscape) and (max-height: 600px)');
    if (!query) return undefined;
    const update = () => document.documentElement.toggleAttribute('data-compact-landscape', query.matches);
    update();
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); document.documentElement.removeAttribute('data-compact-landscape'); };
  }, []);

  useEffect(() => {
    const target = viewportRef.current;
    if (!target || !window.ResizeObserver) return undefined;
    let frame;
    const stage = stageRef.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      target.style.setProperty('--workspace-viewport-width', `${width}px`);
      target.style.setProperty('--workspace-viewport-height', `${height}px`);
      // Sidebar width is a frame token, not a function of viewport height:
      // starting playback must not resize the sidebar when the footer gains a row.
      // 左栏宽度不随底栏行数变化；地图控件按内容撑高，避免挤压业务列表。
      stage?.style.setProperty('--status-bar-height', `${Math.round(THREE.MathUtils.clamp(height * 0.56, 250, 360))}px`);
      stage?.style.setProperty('--frame-window-width', `${Math.round(THREE.MathUtils.clamp(width * 0.44, 180, 520))}px`);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const mapBar = stage?.querySelector('.view-tools');
        const leftStatus = stage?.querySelector('.team-roster-t');
        const mapBounds = mapBar?.getBoundingClientRect(), rosterBounds = leftStatus?.getBoundingClientRect();
        stage?.toggleAttribute('data-map-status-overlap', Boolean(mapBounds && rosterBounds
          && mapBounds.left < rosterBounds.right && mapBounds.right > rosterBounds.left
          && mapBounds.top < rosterBounds.bottom && mapBounds.bottom > rosterBounds.top));
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      target.style.removeProperty('--workspace-viewport-width');
      target.style.removeProperty('--workspace-viewport-height');
      window.cancelAnimationFrame(frame);
      stage?.removeAttribute('data-map-status-overlap');
      ['--map-bar-height', '--map-bar-width', '--status-bar-height', '--frame-window-width'].forEach((property) => stage?.style.removeProperty(property));
    };
  }, [activePanel, leftSidebarOpen, mapName, navData, viewportRef, stageRef]);

}
