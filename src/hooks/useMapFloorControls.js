import { useEffect, useRef } from 'react';
import { map2dLayers } from '../assets/map-2d-urls.js';

// Keep 2D radar floors and 3D model clipping synchronized through the shared floor event.
export default function useMapFloorControls({ map2dLayer, mapName, modelFloor, setMap2dLayer, setModelFloor, t }) {
  const initialMapRef = useRef(true);
  const layers = map2dLayers[mapName] || [];

  useEffect(() => {
    if (initialMapRef.current) {
      initialMapRef.current = false;
      return;
    }
    setMap2dLayer(0);
    setModelFloor('all');
  }, [mapName, setMap2dLayer, setModelFloor]);

  const selectFloor = (floor) => {
    const next = modelFloor === floor ? 'all' : floor;
    setModelFloor(next);
    if (next !== 'all') {
      const layer = layers.findIndex((item) => item.id === next);
      if (layer >= 0) setMap2dLayer(layer);
    }
    window.dispatchEvent(new CustomEvent('csboard-map-floor', { detail: { mapName, floor: next } }));
  };
  const cycleFloor = () => {
    if (layers.length <= 1) {
      selectFloor('main');
      return;
    }
    const nextLayer = (map2dLayer + 1) % layers.length;
    const floor = layers[nextLayer].id;
    setMap2dLayer(nextLayer);
    setModelFloor(floor);
    window.dispatchEvent(new CustomEvent('csboard-map-floor', { detail: { mapName, floor } }));
  };

  return {
    currentLayerUrl: layers[map2dLayer]?.url,
    cycleFloor,
    floorOptions: layers.length > 1 ? [['main', t('upperFloor')], ['lower', t('lowerFloor')]] : [['main', t('layerSelection')]],
    layers,
    selectFloor,
  };
}
