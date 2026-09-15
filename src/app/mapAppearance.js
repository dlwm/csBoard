// Primary emblem colors, applied to localized text rather than a second wordmark.
export const MAP_LABEL_PALETTES = {
  cs_tutorial: ['#e0ffab', '#a5df63', '#57ba98'],
  de_ancient: ['#fff0bc', '#dfcc85', '#a89650'],
  de_anubis: ['#f1f4f5', '#c1c6c9', '#929296'],
  de_cache: ['#f0d98e', '#df787b', '#76a1b9'],
  de_dust2: ['#f0e9cf', '#d1c8a5', '#a5a285'],
  de_inferno: ['#fff1eb', '#ed6865', '#c92830'],
  de_mirage: ['#3fcee0', '#e35856', '#ead177'],
  de_nuke: ['#94d5ef', '#cbe7ed', '#f0ec35'],
  de_overpass: ['#d8f6e9', '#8ad6bb', '#ffae32'],
  de_train: ['#ecdfb4', '#76b4c2', '#cfac5e'],
  de_vertigo: ['#e4e7ff', '#a3abe4', '#6877c8'],
};

export const MAP_LABEL_TONES = Object.fromEntries(
  Object.entries(MAP_LABEL_PALETTES).map(([id, colors]) => [id, colors[1]]),
);

export function mapLabelStyle(id) {
  const colors = MAP_LABEL_PALETTES[id] || MAP_LABEL_PALETTES.cs_tutorial;
  return {
    '--map-label-color': colors[1],
    '--map-label-gradient': `linear-gradient(125deg, ${colors[0]} 5%, ${colors[1]} 52%, ${colors[2]} 100%)`,
  };
}
