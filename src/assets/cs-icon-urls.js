const iconModules = import.meta.glob('./icons/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const csIconUrl = Object.fromEntries(
  Object.entries(iconModules).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]),
);
