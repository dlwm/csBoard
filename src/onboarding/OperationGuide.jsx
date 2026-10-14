import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../i18n.js';
import './operationGuide.css';

export function TutorialOffer({ language, onAccept, onDecline }) {
  const dialog = useRef(null), previousFocus = useRef(document.activeElement);
  const text = (key, values) => translate(language, key, values);
  useEffect(() => { dialog.current.showModal(); return () => previousFocus.current?.focus?.(); }, []);
  return createPortal(<dialog ref={dialog} className="operation-offer" onCancel={event => { event.preventDefault(); onDecline(); }} onKeyDown={event => event.stopPropagation()} aria-labelledby="operation-offer-title">
    <small>CSBOARD</small><h2 id="operation-offer-title">{text("onboarding.operationGuide.startTheOperationGuide")}</h2>
    <p>{text("onboarding.operationGuide.learnTheViewsReplayUtilityNotesAndCollaborationInThe")}</p>
    <footer><button type="button" autoFocus onClick={onDecline}>{text("onboarding.operationGuide.notNow")}</button><button type="button" onClick={onAccept}>{text("onboarding.operationGuide.startGuide")}</button></footer>
  </dialog>, document.body);
}

function clippedRect(element) {
  const box = element.getBoundingClientRect();
  let { left, right, top, bottom } = box;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
  }
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}
function visibleTarget(selectors) {
  for (const selector of selectors.split(',')) for (const element of document.querySelectorAll(selector.trim())) {
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
    const rect = clippedRect(element);
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

// The spotlight never captures pointer events. Existing controls, dialogs and
// saves keep their normal behavior; the guide does not edit the user's data.
// 高亮不拦截操作，指引不代替用户保存或编辑；弹窗与真实业务流程保持原样。
export default function OperationGuide({ language, steps, step, mobile, onStep, onFinish, hasDemo, taskProgress, onReturn, exampleAvailable, exampleLoading, exampleProgress, exampleError, onExample }) {
  const current = steps[step], card = useRef(null);
  const [layout, setLayout] = useState(null), [collapsed, setCollapsed] = useState(false);
  const text = (key, values) => translate(language, key, values);
  useEffect(() => { setCollapsed(false); }, [current.id]);
  useLayoutEffect(() => {
    let frame, stopped = false;
    const update = () => {
      if (stopped) return;
      const target = visibleTarget(current.target), rect = target && clippedRect(target);
      const vv = window.visualViewport, width = vv?.width || innerWidth, height = vv?.height || innerHeight;
      const top = vv?.offsetTop || 0, left = vv?.offsetLeft || 0;
      const cardRect = card.current?.getBoundingClientRect(), cw = cardRect?.width || Math.min(mobile ? 340 : 400, width - 24), ch = cardRect?.height || 240;
      const bounds = rect && { left: Math.max(left + 4, rect.left - 4), top: Math.max(top + 4, rect.top - 4), width: Math.min(rect.right + 4, left + width - 4) - Math.max(left + 4, rect.left - 4), height: Math.min(rect.bottom + 4, top + height - 4) - Math.max(top + 4, rect.top - 4) };
      const candidates = rect ? [
        { x: rect.right + 16, y: rect.top }, { x: rect.left - cw - 16, y: rect.top },
        { x: rect.left, y: rect.bottom + 16 }, { x: rect.left, y: rect.top - ch - 16 },
      ] : [];
      const position = candidates.find(p => p.x >= left + 12 && p.x + cw <= left + width - 12 && p.y >= top + 12 && p.y + ch <= top + height - 12)
        || { x: left + width - cw - 12, y: top + 64 };
      const next = { maxHeight: height - 24, bounds: bounds?.width > 0 && bounds?.height > 0 ? bounds : null, x: Math.max(left + 12, Math.min(position.x, left + width - cw - 12)), y: Math.max(top + 12, Math.min(position.y, top + height - ch - 12)) };
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    // Scene labels can mutate every frame. Do not keep cancelling the pending
    // measurement, otherwise an active replay can starve the spotlight update.
    // 回放文字可能每帧更新；已有测量请求只合并，不反复取消，避免高亮一直不出现。
    const schedule = () => { if (frame != null) return; frame = requestAnimationFrame(() => { frame = null; update(); }); };
    const observer = new MutationObserver(schedule), resize = new ResizeObserver(schedule);
    observer.observe(document.querySelector('.workspace-frame'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    resize.observe(document.querySelector('.workspace-frame')); resize.observe(document.querySelector('.workspace-viewport')); if (card.current) resize.observe(card.current);
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    update();
    return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [current.id, current.target, mobile, collapsed]);
  const progress = current.task ? taskProgress[current.task] : null;
  const done = !progress || progress.current >= progress.total;
  return createPortal(<div className={`operation-guide-layer${mobile ? ' is-mobile' : ''}`}>
    {layout?.bounds && <div className="operation-spotlight" style={layout.bounds} aria-hidden="true" />}
    <aside ref={card} className="operation-guide" role="region" aria-label={text("onboarding.operationGuide.operationGuide")} style={{ left: layout?.x ?? 12, top: layout?.y ?? 64, maxHeight: layout?.maxHeight }} onKeyDown={event => event.stopPropagation()}>
      <header><span>{text("onboarding.operationGuide.operationGuide")} · {step + 1}/{steps.length}</span><div><button type="button" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} aria-label={text("onboarding.operationGuide.collapseOrExpandGuide")}>{collapsed ? '+' : '−'}</button><button type="button" onClick={onFinish} aria-label={text("onboarding.operationGuide.closeGuide")}>×</button></div></header>
      <h2 aria-live="polite">{translate(language, current.title)}</h2>
      {!collapsed && <><p>{translate(language, current.body)}</p>
        {current.id === 'import' && exampleAvailable && <div className="operation-example"><button type="button" disabled={exampleLoading} onClick={onExample}>{exampleLoading ? text("onboarding.operationGuide.preparingExample", { value1: Math.round(exampleProgress * 100) }) : text("onboarding.operationGuide.openBuiltInExampleRound22")}</button><small>{text("onboarding.operationGuide.aCompactRealReplayNoRawDemoImportOrParsing")}</small>{exampleError && <p role="alert">{exampleError}</p>}</div>}
        {current.needsDemo && !hasDemo && <p className="operation-notice">{text("onboarding.operationGuide.openAParsedDemoFromTheLocalListToTry")}</p>}
        {progress && <p className="operation-task" role="status">{done ? text("onboarding.operationGuide.completed") : text("onboarding.operationGuide.waitingForYourAction")} · {Math.min(progress.current, progress.total)}/{progress.total}</p>}
        {!layout?.bounds && <button type="button" className="operation-return" onClick={onReturn}>{text("onboarding.operationGuide.showThisStepSControls")}</button>}
        <footer><button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>{text("onboarding.operationGuide.back")}</button>{!done && <button type="button" onClick={() => onStep(step + 1)}>{text("onboarding.operationGuide.skipExercise")}</button>}<button type="button" disabled={!done} onClick={() => step === steps.length - 1 ? onFinish() : onStep(step + 1)}>{step === steps.length - 1 ? text("onboarding.operationGuide.finish") : text("onboarding.operationGuide.next")}</button></footer>
      </>}
    </aside>
  </div>, document.body);
}
