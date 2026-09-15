// Weapon files remain easy to preview, while the UI recolors their black
// silhouettes through masks; compact interface symbols stay code-built.
// SVG cutout masks keep grip/stock openings transparent where body parts overlap.
import { importedIconUrl } from '../app/resourcePacks.js';
const weaponModules = import.meta.glob('./icons/Equip/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const weaponUrls = Object.fromEntries(Object.entries(weaponModules).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));

const svgUrl = (body, viewBox = '0 0 96 32') => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
)}`;

const solid = (body, viewBox) => svgUrl(`<g fill="#fff">${body}</g>`, viewBox);
const stroked = (body, viewBox = '0 0 32 32') => svgUrl(
  `<g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
  viewBox,
);

const equipment = {
  kevlar: stroked('<path d="M10 4l6 4 6-4 6 8-5 4v14H9V16l-5-4z"/><path d="M16 8v22"/>'),
  helmet: stroked('<path d="M5 17a11 11 0 0122 0v5H16l-5 7H5z"/><path d="M16 22v7h9"/>'),
};

const hud = {
  blind_kill: stroked('<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><path d="M8 5l-3-3m19 3l3-3M16 4V1"/><circle cx="16" cy="16" r="4"/><path d="M4 28L28 4"/>'),
  bullets: stroked('<path d="M8 27V9l4-6 4 6v18zM19 27V12l4-6 4 6v15z"/>'),
  health_cross: solid('<path d="M11 2h10v9h9v10h-9v9H11v-9H2V11h9z"/>', '0 0 32 32'),
  icon_headshot: stroked('<circle cx="16" cy="12" r="8"/><path d="M8 29v-4c0-4 3-7 8-7s8 3 8 7v4M24 5l5-3m-3 7h5M23 12l5 3"/>'),
  inairkill: stroked('<circle cx="16" cy="7" r="4"/><path d="M16 11l-5 8-7 3m12-11l6 7 7 1M11 19l5 4-4 7m4-7l7 6"/>'),
  inferno: stroked('<path d="M16 30C8 30 5 25 7 19c1-4 5-6 5-13 5 3 5 7 4 10 3-2 5-5 5-9 6 5 7 11 4 17-2 4-5 6-9 6z"/><path d="M16 27c-3 0-5-2-4-5 1-2 3-3 3-6 4 3 6 7 3 11z"/>'),
  noscope: stroked('<circle cx="16" cy="16" r="10"/><path d="M16 2v8m0 12v8M2 16h8m12 0h8M5 5l22 22"/>'),
  penetrate: stroked('<path d="M3 16h20M18 10l6 6-6 6M27 7v18M30 7v18"/>'),
  smoke_kill: stroked('<path d="M7 23a6 6 0 014-11 7 7 0 0113 3 5 5 0 011 10H8"/><path d="M5 28h22M3 18h8"/>'),
};

const sideIcons = {
  t_logo: svgUrl('<circle cx="16" cy="16" r="12" fill="none" stroke="#ffb347" stroke-width="2.5"/>', '0 0 32 32'),
  ct_logo: svgUrl('<path d="M16 3L27 8v8q0 8-11 13Q5 24 5 16V8z" fill="none" stroke="#5da9ff" stroke-width="2.5" stroke-linejoin="round"/>', '0 0 32 32'),
};

export const csIconUrl = new Proxy({ ...equipment, ...weaponUrls, ...hud, ...sideIcons }, {
  get: (defaults, name) => importedIconUrl(name) || defaults[name],
});

// Raw HUD consumers also tint file-backed silhouettes; source SVGs stay black.
export const csSilhouetteNames = new Set(Object.keys(weaponUrls));
export const csIconTint = { grenade: '#ffb36b', flash: '#f2edcf', smoke: '#9ba9a1', decoy: '#72d4ff', molotov: '#ff6b45', incgrenade: '#ff7a45' };
