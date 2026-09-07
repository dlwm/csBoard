import { localize } from '../i18n.js';

const BRUSH_COLORS = ['#a5e0ff', '#ff6b6b', '#7cf29c', '#ffd166', '#ffffff', '#c084fc'];
const BRUSH_WIDTHS = [2, 3, 5, 8];

// Desktop camera, radar-floor, and drawing controls surrounding the Three.js viewport.
export default function ViewTools({ activeCameraSlot, boardRef, brushColor, brushWidth, cameraSlotState, currentLayerUrl, currentMapLayers, cycleMapFloor, eraserEnabled, floorOptions, language, map2dLayer, modelFloor, radarOverlay, selectMapFloor, setBrushColor, setBrushWidth, setEraserEnabled, t }) {
  return <div className="view-tools">
    <div className="view-tools-top">
      {currentMapLayers.length ? <button type="button" className="map-preview-slot" aria-label={localize(language, { zh: '切换地图层级', en: 'Switch map floor', ru: 'Переключить этаж карты' })} onClick={cycleMapFloor}>
        <img src={currentLayerUrl} alt="" />
        {radarOverlay && <svg className="map-radar-overlay" viewBox="0 0 100 100" aria-hidden="true">
          {radarOverlay.players.map((player) => <g className={`map-player-base side-${player.team.toLowerCase()}`} key={`${player.source}-${player.id}`} transform={`translate(${player.x} ${player.y}) rotate(${player.angle})`}><circle r="3.1" /><path d="M2.2 0 5.2-1.6 5.2 1.6Z" /></g>)}
          <g className="map-camera-marker" transform={`translate(${radarOverlay.camera.x} ${radarOverlay.camera.y}) rotate(${radarOverlay.camera.angle})`}><path className="map-camera-fan" d="M0 0 23-10A25 25 0 0 1 23 10Z" /><circle r="2.2" /></g>
        </svg>}
        {currentMapLayers.length > 1 && <span>{currentMapLayers[map2dLayer]?.id === 'lower' ? t('lowerFloor') : t('upperFloor')}</span>}
      </button> : <div className="map-preview-slot map-preview-empty" aria-hidden="true" />}
      <div className="camera-slots">
        <span>{t('cameraPositions')}</span>
        {cameraSlotState.map((saved, index) => <button type="button" key={index} disabled={!saved} className={activeCameraSlot === index ? 'active' : ''} onClick={() => boardRef.current?.restoreCameraSlot?.(index)}>{index === 9 ? 0 : index + 1}</button>)}
        <div className="floor-controls">{floorOptions.map(([floor, label]) => <button type="button" key={floor} className={modelFloor === floor ? 'active' : ''} onClick={() => selectMapFloor(floor)}>{label}</button>)}</div>
        <button type="button" className="camera-reset" onClick={() => boardRef.current?.reset()}>{t('resetView')}</button>
      </div>
    </div>
    <div className="brush-controls">
      <div className="brush-swatches">{BRUSH_COLORS.map((color) => <button type="button" key={color} className={`brush-swatch${brushColor.toLowerCase() === color ? ' active' : ''}`} style={{ background: color }} aria-label={color} title={color} onClick={() => { setBrushColor(color); localStorage.setItem('csboard-brush-color', color); }} />)}</div>
      <div className="brush-util-row">
        <div className="brush-widths">{BRUSH_WIDTHS.map((width) => <button type="button" key={width} className={`brush-width${brushWidth === width ? ' active' : ''}`} title={`${width}px`} onClick={() => { setBrushWidth(width); localStorage.setItem('csboard-brush-width', String(width)); }}><i style={{ width: Math.max(2, width), height: Math.max(2, width) }} /></button>)}</div>
        <button type="button" className={`brush-eraser${eraserEnabled ? ' active' : ''}`} title={t('eraser')} aria-label={t('eraser')} onClick={() => setEraserEnabled((value) => !value)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><path d="M11 3 14 6l-5 5H5l-3-3z" /><path d="M8 6 11 9" /></svg></button>
      </div>
    </div>
  </div>;
}
