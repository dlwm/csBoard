// Shared equipment class names; no rendering, icon registry or parser fields.
import { weaponIconKey } from './weaponIcons.js';
const meleeNames = ['knife', 'bayonet', 'karambit', 'butterfly', 'flip', 'gut', 'falchion', 'survival_bowie', 'bowie', 'tactical', 'huntsman', 'push', 'dagger', 'gypsy_jackknife', 'navaja', 'ursus', 'widowmaker', 'talon', 'stiletto', 'outdoor', 'nomad', 'skeleton', 'survival', 'cord', 'paracord', 'css', 'classic', 'kukri', 'melee'];
const pistolNames = ['glock', 'hkp2000', 'p2000', 'usp', 'p250', 'deagle', 'elite', 'beretta', 'fiveseven', 'tec9', 'cz75', 'revolver'];
const sniperNames = ['awp', 'ssg08', 'scar20', 'g3sg1'];
const smgNames = ['mp9', 'mac10', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon'];
const shotgunNames = ['nova', 'xm1014', 'mag7', 'sawedoff'];
const machineGunNames = ['negev', 'm249'];
const rifleNames = ['ak47', 'm4a4', 'm4a1', 'aug', 'sg556', 'sg553', 'famas', 'galilar'];
const utilityWeaponNames = ['smoke', 'flash', 'hegrenade', 'molotov', 'incgrenade', 'decoy', 'grenade'];

export const weaponKind = (value = '') => {
  const name = weaponIconKey(value).toLowerCase();
  if (name.includes('c4')) return 'c4';
  if (utilityWeaponNames.some((weapon) => name.includes(weapon))) return 'utility';
  if (meleeNames.some((weapon) => name.includes(weapon))) return 'melee';
  if (pistolNames.some((weapon) => name.includes(weapon))) return 'pistol';
  if (sniperNames.some((weapon) => name.includes(weapon))) return 'sniper';
  if (smgNames.some((weapon) => name.includes(weapon))) return 'smg';
  if (shotgunNames.some((weapon) => name.includes(weapon))) return 'shotgun';
  if (machineGunNames.some((weapon) => name.includes(weapon))) return 'machinegun';
  if (rifleNames.some((weapon) => name.includes(weapon))) return 'rifle';
  return name ? 'rifle' : 'none';
};
