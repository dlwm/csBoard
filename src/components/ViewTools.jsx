import { preferences } from '../platform/preferences.js';
import { useEffect, useId, useState } from 'react';
import { localize } from '../i18n.js';
import useRadarOverlay from '../hooks/useRadarOverlay.js';

// Keep radar polling local: camera motion must not rerender the entire application.
function RadarOverlay({ activePanel, radarSource, boardRef, mapName, navData }) {
  const radarOverlay = useRadarOverlay({ activePanel, radarSource, boardRef, mapName, navData });
  if (!radarOverlay) return null;
  return <svg className="map-radar-overlay" viewBox="0 0 100 100" aria-hidden="true">
    {radarOverlay.players.map((player) => <g className={`map-player-base side-${player.team.toLowerCase()}`} key={`${player.source}-${player.id}`} transform={`translate(${player.x} ${player.y}) rotate(${player.angle})`}><circle r="3.1" /><path d="M2.2 0 5.2-1.6 5.2 1.6Z" /></g>)}
    <g className="map-camera-marker" transform={`translate(${radarOverlay.camera.x} ${radarOverlay.camera.y}) rotate(${radarOverlay.camera.angle})`}><path className="map-camera-fan" d="M0 0 23-10A25 25 0 0 1 23 10Z" /><circle r="2.2" /></g>
  </svg>;
}

const BRUSH_COLORS = ['#a5e0ff', '#ff6b6b', '#7cf29c', '#ffd166', '#ffffff', '#c084fc'];
const BRUSH_WIDTHS = [2, 3, 5, 8];

// Shared camera, radar-floor and drawing controls; mobile collapses the surface.
export default function ViewTools({ mobile = false, touchDrawingEnabled = false, setTouchDrawingEnabled, activePanel, radarSource, mapName, navData, activeCameraSlot, boardRef, brushColor, brushWidth, cameraSlotState, currentLayerUrl, currentMapLayers, cycleMapFloor, eraserEnabled, floorOptions, language, map2dLayer, modelFloor, selectMapFloor, setBrushColor, setBrushWidth, setEraserEnabled, t }) {
  const [open, setOpen] = useState(false);
  const [savingCamera, setSavingCamera] = useState(false);
  const contentId = useId();
  useEffect(() => { setOpen(false); setSavingCamera(false); }, [activePanel, mapName]);
  useEffect(() => {
    if (!mobile || !open) return undefined;
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobile, open]);
  const text = (zh, en, ru) => localize(language, { zh, en, ru });
  return <div className={`view-tools${mobile ? ' mobile-view-tools' : ''}${open ? ' expanded' : ''}`}>
    {mobile && <button type="button" className="mobile-view-tools-toggle" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>{text('地图 / 机位', 'Map / Cameras', 'Карта / Камеры')}{touchDrawingEnabled && <small>{text('绘图', 'Draw', 'Рисование')}</small>} <span aria-hidden="true">{open ? '−' : '+'}</span></button>}
    {(!mobile || open) && <div id={contentId} className="view-tools-content">
    <div className="view-tools-top">
      {currentMapLayers.length ? <button type="button" className="map-preview-slot" aria-label={localize(language, { zh: '切换地图层级', en: 'Switch map floor', ru: 'Переключить этаж карты' })} onClick={cycleMapFloor}>
        <img src={currentLayerUrl} alt="" />
        <RadarOverlay radarSource={radarSource} activePanel={activePanel} boardRef={boardRef} mapName={mapName} navData={navData} />
        {currentMapLayers.length > 1 && <span>{currentMapLayers[map2dLayer]?.id === 'lower' ? t('lowerFloor') : t('upperFloor')}</span>}
      </button> : <div className="map-preview-slot map-preview-empty" aria-hidden="true" />}
      <div className="camera-slots">
        <span>{t('cameraPositions')}</span>
        {cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved && !(mobile && savingCamera)} className={activeCameraSlot === index ? 'active' : ''} aria-label={text(`${savingCamera ? '保存' : '恢复'}机位 ${index + 1}`, `${savingCamera ? 'Save' : 'Restore'} camera ${index + 1}`, `${savingCamera ? 'Сохранить' : 'Восстановить'} камеру ${index + 1}`)} onClick={() => {
          if (mobile && savingCamera) { boardRef.current?.commands?.execute('camera.save', { slot: index }); setSavingCamera(false); }
          else boardRef.current?.commands?.execute('camera.restore', { slot: index });
        }}>{index === 9 ? 0 : index + 1}</button>)}
        <div className="floor-controls">{floorOptions.map(([floor, label]) => <button type="button" key={floor} className={modelFloor === floor ? 'active' : ''} onClick={() => selectMapFloor(floor)}>{label}</button>)}</div>
        {mobile && <button type="button" className="camera-save-toggle" aria-pressed={savingCamera} onClick={() => setSavingCamera(value => !value)}>{savingCamera ? text('选择保存位置', 'Choose a slot', 'Выберите слот') : text('保存机位', 'Save camera', 'Сохранить камеру')}</button>}
        <button type="button" className="camera-reset" onClick={() => boardRef.current?.commands?.execute('camera.reset')}>{t('resetView')}</button>
      </div>
    </div>
    {mobile && <button type="button" className="touch-drawing-toggle" aria-pressed={touchDrawingEnabled} onClick={() => { setTouchDrawingEnabled(value => !value); setOpen(false); }}>{touchDrawingEnabled ? text('关闭绘图，旋转视角', 'Stop drawing; rotate view', 'Выключить рисование') : text('开启绘图', 'Enable drawing', 'Включить рисование')}</button>}
    <div className="brush-controls">
      <div className="brush-swatches">{BRUSH_COLORS.map((color) => <button type="button" key={color} className={`brush-swatch${brushColor.toLowerCase() === color ? ' active' : ''}`} style={{ background: color }} aria-label={color} title={color} onClick={() => { setBrushColor(color); preferences.setItem('csboard-brush-color', color); }} />)}</div>
      <div className="brush-util-row">
        <div className="brush-widths">{BRUSH_WIDTHS.map((width) => <button type="button" key={width} className={`brush-width${brushWidth === width ? ' active' : ''}`} title={`${width}px`} onClick={() => { setBrushWidth(width); preferences.setItem('csboard-brush-width', String(width)); }}><i style={{ width: Math.max(2, width), height: Math.max(2, width) }} /></button>)}</div>
        <button type="button" className={`brush-eraser${eraserEnabled ? ' active' : ''}`} title={t('eraser')} aria-label={t('eraser')} onClick={() => setEraserEnabled((value) => !value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M11 3 14 6l-5 5H5l-3-3z" /><path d="M8 6 11 9" /></svg></button>
      </div>
    </div>
    </div>}
  </div>;
}
