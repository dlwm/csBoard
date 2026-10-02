import { useEffect } from 'react';
import * as THREE from 'three';

// Keep viewport observation and its CSS sizing contract outside application business state.
export default function useResponsiveWorkspace({ activePanel, leftSidebarOpen, mapName, navData }) {
  useEffect(() => {
    const query = window.matchMedia?.('(orientation: landscape) and (max-height: 600px)');
    if (!query) return undefined;
    const update = () => document.documentElement.toggleAttribute('data-compact-landscape', query.matches);
    update();
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); document.documentElement.removeAttribute('data-compact-landscape'); };
  }, []);

  useEffect(() => {
    const target = document.querySelector('.three-board');
    if (!target || !window.ResizeObserver) return undefined;
    let frame;
    const stage = target.closest('.board-stage');
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const mapBarHeight = Math.round(THREE.MathUtils.clamp(height * 0.34, 185, 250));
      stage?.style.setProperty('--map-bar-height', `${mapBarHeight}px`);
      stage?.style.setProperty('--map-bar-width', `${Math.round(mapBarHeight * 1.2)}px`);
      stage?.style.setProperty('--status-bar-height', `${Math.round(THREE.MathUtils.clamp(height * 0.56, 250, 360))}px`);
      stage?.style.setProperty('--frame-window-width', `${Math.round(THREE.MathUtils.clamp(width * 0.44, 180, 520))}px`);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const mapBar = stage?.querySelector('.view-tools');
        const leftStatus = stage?.querySelector('.team-roster-t');
        stage?.toggleAttribute('data-map-status-overlap', Boolean(mapBar && leftStatus && mapBar.getBoundingClientRect().bottom > leftStatus.getBoundingClientRect().top));
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      stage?.removeAttribute('data-map-status-overlap');
      ['--map-bar-height', '--map-bar-width', '--status-bar-height', '--frame-window-width'].forEach((property) => stage?.style.removeProperty(property));
    };
  }, [activePanel, leftSidebarOpen, mapName, navData]);

}
