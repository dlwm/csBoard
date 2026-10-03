import { useId, useRef } from 'react';
import { localize } from '../i18n.js';
import { ModelControlsPortal } from './Portals.jsx';
import ModelLoadIndicator from './ModelLoadIndicator.jsx';
import { DEMO_SAMPLE_RATES } from '../demo/DemoParseSettings.jsx';

// A modal keeps touch settings out of the timeline while preserving keyboard focus.
export default function MobileViewSettings({ selector, language, t, showGrid, setShowGrid,
  trackpadDetection, setTrackpadDetection, showNav, setShowNav, hasNav, hasModel,
  modelOpacity, onModelOpacity, modelViewRange, setModelViewRange, selectedMode,
  modeOptions, onModelMode, modelLoadState, sampleRate, setSampleRate, canParse, onReset }) {
  const dialog = useRef(null);
  const titleId = useId();
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  const title = text('视图设置', 'View settings', 'Настройки вида');
  return <>
    <ModelControlsPortal selector={selector}><button type="button" className="mobile-view-settings-toggle" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{title}</button></ModelControlsPortal>
    <dialog ref={dialog} className="mobile-view-dialog" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{title}</h2><button type="button" autoFocus onClick={() => dialog.current?.close()}>{text('关闭', 'Close', 'Закрыть')}</button></header>
      <div className="mobile-view-settings-body">
        <div className="mobile-view-switches">
          <button type="button" aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>{t('grid')} · {showGrid ? t('on') : t('off')}</button>
          {hasNav && <button type="button" aria-pressed={showNav} onClick={() => setShowNav(value => !value)}>{t('navGround')} · {showNav ? t('on') : t('off')}</button>}
          <button type="button" aria-pressed={trackpadDetection} onClick={() => setTrackpadDetection(value => !value)}>{t('trackpad')} · {trackpadDetection ? t('on') : t('off')}</button>
          <button type="button" onClick={() => { onReset(); dialog.current?.close(); }}>{t('resetView')}</button>
        </div>
        {hasModel && <section className="mobile-model-settings">
          <ModelLoadIndicator state={modelLoadState} language={language} />
          <label><span>{t('model')}</span><input type="range" min="0" max="1" step="0.01" value={modelOpacity} onChange={event => onModelOpacity(Number(event.target.value))} /><output>{Math.round(modelOpacity * 100)}%</output></label>
          <label><span>{t('viewRange')}</span><input type="range" min="0" max="1" step="0.01" value={modelViewRange} onChange={event => setModelViewRange(Number(event.target.value))} /><output>{Math.round(modelViewRange * 100)}%</output></label>
          <label><span>{text('模型视图', 'Model view', 'Вид модели')}</span><select value={selectedMode} onChange={event => onModelMode(Number(event.target.value))}>{modeOptions.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
        </section>}
        {canParse && <section className="mobile-sampling-settings"><label><span>{text('回放采样率', 'Replay sample rate', 'Частота сэмплов повтора')}</span><select value={sampleRate} onChange={event => setSampleRate(Number(event.target.value))}>{DEMO_SAMPLE_RATES.map(rate => <option key={rate} value={rate}>{rate}/s</option>)}</select></label><p>{text('仅影响之后导入的 Demo；高采样率需要更多时间和内存。', 'Applies to future Demo imports. Higher rates require more time and memory.', 'Для следующих импортов Demo. Высокая частота требует больше времени и памяти.')}</p></section>}
      </div>
    </dialog>
  </>;
}
