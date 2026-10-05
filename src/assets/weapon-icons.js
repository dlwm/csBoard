import { csIconUrl } from './cs-icon-urls.js';
import { normalizeWeaponIconName } from '../components/weaponIconName.js';

// One identity mapping for UI silhouettes and scene weapon models.
// 界面与三维枪械共用名称与别名，避免消音版、展示名映射不一致。
export const grenadeIconKey = (weapon = '') => {
  const name = String(weapon).toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9]/g, '');
  if (name.includes('smoke')) return 'smoke';
  if (name.includes('flash')) return 'flash';
  if (name.includes('incgrenade') || name.includes('incendiary')) return 'incgrenade';
  if (name.includes('molotov')) return 'molotov';
  if (name.includes('hegrenade') || name.includes('highexplosive')) return 'grenade';
  if (name.includes('decoy')) return 'decoy';
  return null;
};

const KNIFE_WEAPON_KEYS = new Set([
  'knife', 'knifet', 'knifegg', 'bayonet', 'classicknife', 'flipknife', 'gutknife', 'karambit', 'm9bayonet', 'huntsmanknife', 'falchionknife', 'bowieknife', 'butterflyknife', 'shadowdaggers', 'paracordknife', 'survivalknife', 'ursusknife', 'navajaknife', 'nomadknife', 'stilettoknife', 'talonknife', 'skeletonknife', 'kukriknife',
  'knifeflip', 'knifegut', 'knifekarambit', 'knifem9bayonet', 'knifetactical', 'knifefalchion', 'knifesurvivalbowie', 'knifebutterfly', 'knifepush', 'knifecord', 'knifecanis', 'knifeursus', 'knifegypsyjack', 'knifeoutdoor', 'knifestiletto', 'knifewidowmaker', 'knifeskeleton', 'knifekukri',
]);
const DISPLAY_WEAPON_ALIASES = { dualberettas: 'elite', deserteagle: 'deagle', r8revolver: 'revolver', cz75auto: 'cz75', zeusx27: 'taser' };

export const weaponIconKey = (weapon = '', { side = '' } = {}) => {
  const raw = normalizeWeaponIconName(weapon);
  const compact = raw.replace(/[^a-z0-9]/g, '');
  const grenade = grenadeIconKey(raw);
  if (grenade) return grenade;
  if (compact.includes('c4') || compact === 'explosive') return 'c4';
  if (KNIFE_WEAPON_KEYS.has(compact) || compact.includes('knife') || compact.includes('bayonet') || compact.includes('dagger')) return side === 'T' && csIconUrl.knife_t ? 'knife_t' : 'knife_ct';
  if (compact === 'glock') return 'glock18';
  // Demo events and HUD snapshots may use either internal IDs or display names.
  if (DISPLAY_WEAPON_ALIASES[compact]) return DISPLAY_WEAPON_ALIASES[compact];
  if (compact === 'cz75a') return 'cz75';
  if (compact === 'sg556') return 'sg553';
  if (compact === 'm4a1silencer' || compact === 'm4a1silenceroff' || compact === 'm4a1s') return 'm4a1';
  if (compact === 'm4a1') return 'm4a4';
  if (compact === 'uspsilencer' || compact === 'uspsilenceroff' || compact === 'usps') return 'usp';
  return compact;
};

