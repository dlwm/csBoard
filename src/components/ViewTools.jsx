import { WorkspaceButton } from './workspace/WorkspaceControls.jsx';
import { getMapPlaceRegions } from '../data/mapPlaceData.js';
import { preferences } from '../platform/preferences.js';
import { useEffect, useId, useState } from 'react';
import { translate } from '../i18n.js';
import useRadarOverlay from '../hooks/useRadarOverlay.js';

// Keep radar polling local: camera motion must not rerender the entire application.
function RadarOverlay({ activePanel, radarSource, boardRef, mapName, navData }) {
  const radarOverlay = useRadarOverlay({ activePanel, radarSource, boardRef, mapName, navData });
  if (!radarOverlay) return null;
  return <svg className="map-radar-overlay" viewBox="0 0 100 100" aria-hidden="true">
    {radarOverlay.players.map((player) => <g className={`map-player-base side-${player.team.toLowerCase()}`} key={`${player.source}-${player.id}`} transform={`translate(${player.x} ${player.y}) rotate(${player.angle})`}><circle r="3.1" /><path d="M2.2 0 5.2-1.6 5.2 1.6Z" /></g>)}
    <g className="map-camera-marker" transform={`translate(${radarOverlay.camera.x} ${radarOverlay.camera.y}) rotate(${radarOverlay.camera.angle})`}>{radarOverlay.camera.planView ? <path className="map-camera-heading" d="M2.5-2.5 6 0 2.5 2.5Z" /> : <path className="map-camera-fan" d="M0 0 23-10A25 25 0 0 1 23 10Z" />}<circle r="2.2" /></g>
  </svg>;
}

const BRUSH_COLORS = ['#a5e0ff', '#ff6b6b', '#7cf29c', '#ffd166', '#ffffff', '#c084fc'];
const BRUSH_WIDTHS = [2, 3, 5, 8];

// Shared camera, radar-floor and drawing controls; mobile collapses the surface.
export default function ViewTools({ guideControlsOpen = false, boardViewMode, map2dStyle, setMap2dStyle, mobile = false, touchDrawingEnabled = false, setTouchDrawingEnabled, activePanel, radarSource, mapName, navData, activeCameraSlot, boardRef, brushColor, brushWidth, cameraSlotState, currentLayerUrl, currentMapLayers, cycleMapFloor, eraserEnabled, floorOptions, language, map2dLayer, modelFloor, selectMapFloor, setBrushColor, setBrushWidth, setEraserEnabled, t }) {
  const [open, setOpen] = useState(false);
  const [savingCamera, setSavingCamera] = useState(false);
  const contentId = useId();
  useEffect(() => { setOpen(false); setSavingCamera(false); }, [activePanel, mapName]);
  useEffect(() => { if (guideControlsOpen) setOpen(true); }, [guideControlsOpen, activePanel, mapName]);
  useEffect(() => {
    if (!mobile || !open) return undefined;
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    const resize = () => { if ((window.visualViewport?.height ?? window.innerHeight) < 320) setOpen(false); };
    resize();
    window.addEventListener('keydown', close);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); };
  }, [mobile, open]);
  const text = (key, values) => translate(language, key, values);
  return <div className={`view-tools${mobile ? ' mobile-view-tools' : ''}${open ? ' expanded' : ''}`}>
    {mobile && <WorkspaceButton compact type="button" className="mobile-view-tools-toggle" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>{text("view.viewTools.mapCameras")}{touchDrawingEnabled && <small>{text("view.viewTools.draw")}</small>} <span aria-hidden="true">{open ? '−' : '+'}</span></WorkspaceButton>}
    {(!mobile || open) && <div id={contentId} className="view-tools-content">
    <div className="view-tools-top">
      <div className="map-preview-stack">
      {currentMapLayers.length ? <button type="button" className="map-preview-slot" aria-label={translate(language, "view.viewTools.switchMapFloor")} onClick={cycleMapFloor}>
        <img src={currentLayerUrl} alt="" />
        <RadarOverlay radarSource={radarSource} activePanel={activePanel} boardRef={boardRef} mapName={mapName} navData={navData} />
        {currentMapLayers.length > 1 && <span>{currentMapLayers[map2dLayer]?.id === 'lower' ? t("view.lowerFloor") : t("view.upperFloor")}</span>}
      </button> : <div className="map-preview-slot map-preview-empty" aria-hidden="true" />}
    {getMapPlaceRegions(navData,mapName).some(region=>region.kind==='place') && <div className="map-style-controls" role="group" aria-label={text("view.viewTools.2dMapStyle")}>{[['plain',text("view.viewTools.map")],['places',text("view.viewTools.callouts")]].map(([value,label])=><WorkspaceButton compact type="button" key={value} aria-pressed={map2dStyle===value} onClick={()=>setMap2dStyle(value)}><span>{label}</span></WorkspaceButton>)}</div>}
      </div>
      <div className="camera-slots">
        <span>{t("view.cameraPositions")}</span>
        {cameraSlotState.map((saved, index) => <WorkspaceButton compact type="button" key={index} disabled={!saved && !(mobile && savingCamera)} className={activeCameraSlot === index ? 'active' : ''} aria-label={text(savingCamera ? 'view.camera.saveSlot' : 'view.camera.restoreSlot', { slot: index + 1 })} onClick={() => {
          if (mobile && savingCamera) { boardRef.current?.commands?.execute('camera.save', { slot: index }); setSavingCamera(false); }
          else boardRef.current?.commands?.execute('camera.restore', { slot: index });
        }}>{index === 9 ? 0 : index + 1}</WorkspaceButton>)}
        {boardViewMode !== '2d' && <div className="floor-controls">{floorOptions.map(([floor, label]) => <WorkspaceButton compact type="button" key={floor} className={modelFloor === floor ? 'active' : ''} onClick={() => selectMapFloor(floor)}>{label}</WorkspaceButton>)}</div>}
        {mobile && <WorkspaceButton compact type="button" className="camera-save-toggle" aria-pressed={savingCamera} onClick={() => setSavingCamera(value => !value)}>{savingCamera ? text("view.viewTools.chooseASlot") : text("view.viewTools.saveCamera")}</WorkspaceButton>}
        <WorkspaceButton compact type="button" className="camera-reset" onClick={() => boardRef.current?.commands?.execute('camera.reset')}>{t("view.resetView")}</WorkspaceButton>
      </div>
    </div>
    {mobile && <WorkspaceButton compact type="button" className="touch-drawing-toggle" aria-pressed={touchDrawingEnabled} onClick={() => { setTouchDrawingEnabled(value => !value); setOpen(false); }}>{touchDrawingEnabled ? text("view.viewTools.stopDrawingRotateView") : text("view.viewTools.enableDrawing")}</WorkspaceButton>}
    <div className="brush-controls">
      <div className="brush-swatches">{BRUSH_COLORS.map((color) => <button type="button" key={color} className={`brush-swatch${brushColor.toLowerCase() === color ? ' active' : ''}`} style={{ '--brush-color': color }} aria-label={color} title={color} onClick={() => { setBrushColor(color); preferences.setItem('csboard-brush-color', color); }} />)}</div>
      <div className="brush-util-row">
        <div className="brush-widths">{BRUSH_WIDTHS.map((width) => <button type="button" key={width} className={`brush-width${brushWidth === width ? ' active' : ''}`} title={`${width}px`} onClick={() => { setBrushWidth(width); preferences.setItem('csboard-brush-width', String(width)); }}><i style={{ width: Math.max(2, width), height: Math.max(2, width) }} /></button>)}</div>
        <button type="button" className={`brush-eraser${eraserEnabled ? ' active' : ''}`} title={t("common.eraser")} aria-label={t("common.eraser")} onClick={() => setEraserEnabled((value) => !value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M11 3 14 6l-5 5H5l-3-3z" /><path d="M8 6 11 9" /></svg></button>
      </div>
    </div>
    </div>}
  </div>;
}
