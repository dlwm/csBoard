import { TUTORIAL_MAP_ID } from '../three/tutorialMap.js';

const OSS_BASE = String(import.meta.env.VITE_OSS_BASE_URL || '').replace(/\/$/, '');
const BACKEND_BASE = String(import.meta.env.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');
const USE_LOCAL_MAPS = import.meta.env.DEV || import.meta.env.VITE_USE_LOCAL_MAPS === 'true';

export const IS_DEVELOPMENT_RUNTIME = import.meta.env.DEV || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
export const MAP_BASE = USE_LOCAL_MAPS || !OSS_BASE ? '/maps' : `${OSS_BASE}/maps`;
export const BUILD_VERSION = String(import.meta.env.VITE_BUILD_VERSION || '').trim();

export const VIEW_PREFERENCES_KEY = 'csboard-view-preferences';
export const MODEL_VIEW_RANGE_EVENT = 'csboard-model-view-range';
export const ANALYSIS_HEAT_DATA_EVENT = 'csboard-analysis-heat-data';
export const UTILITY_THROW_VIEW_HOLD_SECONDS = 0.3;

// Zone volumes stay disabled until a clearer replacement visualization is ready.
export const MAP_ZONE_MODELS_ENABLED = false;
// Anubis contains non-playable bottom geometry, so its orbit height follows playable NAV instead.
export const NAV_TOP_CAMERA_TARGET_MAPS = new Set(['de_anubis']);

export const MAPS = [
  { id: TUTORIAL_MAP_ID, label: 'Training Ground' },
  { id: 'de_dust2', label: 'Dust II' },
  { id: 'de_mirage', label: 'Mirage' },
  { id: 'de_nuke', label: 'Nuke' },
  { id: 'de_ancient', label: 'Ancient' },
  { id: 'de_anubis', label: 'Anubis' },
  { id: 'de_cache', label: 'Cache' },
  { id: 'de_inferno', label: 'Inferno' },
  { id: 'de_overpass', label: 'Overpass' },
  { id: 'de_train', label: 'Train' },
  { id: 'de_vertigo', label: 'Vertigo' },
];

export const MAP_LABELS_ZH = {
  [TUTORIAL_MAP_ID]: '训练场',
  de_dust2: '炙热沙城 II',
  de_mirage: '荒漠迷城',
  de_nuke: '核子危机',
  de_ancient: '远古遗迹',
  de_anubis: '阿努比斯',
  de_cache: '死城之谜',
  de_inferno: '炼狱小镇',
  de_overpass: '死亡游乐园',
  de_train: '列车停放站',
  de_vertigo: '殒命大厦',
};

export function loadViewPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PREFERENCES_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function collaborationUrl() {
  const url = new URL(BACKEND_BASE || location.origin, location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/rooms';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}
