const radarModules = import.meta.glob('./map_2d/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const map2dLayers = Object.entries(radarModules).reduce((maps, [path, url]) => {
  const match = path.match(/\/(de_[^/]+?)(?:_(lower))?_radar_psd\.png$/);
  if (!match) return maps;
  const [, mapName, floor] = match;
  if (!maps[mapName]) maps[mapName] = [];
  maps[mapName].push({ id: floor || 'main', url });
  maps[mapName].sort((left) => left.id === 'main' ? -1 : 1);
  return maps;
}, {});
