// Marks scrollable panels whose hidden content needs a top/bottom fade hint.
import { useEffect } from 'react';

const SCROLL_EDGE_SELECTOR = [
  '.analysis-panel', '.utility-notes-panel', '.collab-panel', '.utility-location-groups', '.utility-hover-list',
  '.demo-cache-list', '.demo-round-list', '.collab-imported-list', '.analysis-player-list', '.analysis-demo-picker>div',
  '.analysis-player-results', '.analysis-player-chips', '.board-shell.is-mobile .demo-kills', '.board-shell.is-mobile .demo-panel',
  '.board-shell.is-mobile .team-roster', '.board-shell.is-mobile .parse-game-layer', '.board-shell.is-mobile .side-games',
].join(',');

export default function useScrollEdgeIndicators() {
  useEffect(() => {
    const observed = new Set();
    const update = (element) => {
      if (!(element instanceof HTMLElement)) return;
      const scrollable = element.scrollHeight > element.clientHeight + 2;
      element.toggleAttribute('data-scroll-above', scrollable && element.scrollTop > 2);
      element.toggleAttribute('data-scroll-below', scrollable && element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach((entry) => update(entry.target))) : null;
    const register = (element) => {
      if (!(element instanceof HTMLElement) || observed.has(element)) return;
      observed.add(element);
      resizeObserver?.observe(element);
      update(element);
    };
    const unregister = (root) => {
      if (!(root instanceof HTMLElement)) return;
      [root, ...root.querySelectorAll(SCROLL_EDGE_SELECTOR)].forEach((element) => {
        if (!observed.has(element)) return;
        observed.delete(element);
        resizeObserver?.unobserve(element);
      });
    };
    const scan = (root = document) => {
      if (root instanceof HTMLElement && root.matches(SCROLL_EDGE_SELECTOR)) register(root);
      root.querySelectorAll?.(SCROLL_EDGE_SELECTOR).forEach(register);
    };
    const onScroll = (event) => { if (event.target instanceof HTMLElement && event.target.matches(SCROLL_EDGE_SELECTOR)) update(event.target); };
    const mutationObserver = new MutationObserver((records) => records.forEach((record) => {
      record.addedNodes.forEach((node) => { if (node instanceof HTMLElement) scan(node); });
      record.removedNodes.forEach(unregister);
      const container = record.target instanceof HTMLElement ? record.target.closest(SCROLL_EDGE_SELECTOR) : null;
      if (container) update(container);
    }));
    const onResize = () => { scan(); observed.forEach(update); };

    scan();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      observed.forEach((element) => { element.removeAttribute('data-scroll-above'); element.removeAttribute('data-scroll-below'); });
    };
  }, []);
}
