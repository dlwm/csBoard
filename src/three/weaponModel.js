// The host chooses asset URLs; geometry generation and lifecycle live in the library.
import { csIconUrl } from '../assets/cs-icon-urls.js';
import { weaponIconKey } from '../assets/weapon-icons.js';
import { createWeaponModel as create, updateWeaponModel, isFirearm } from '../../packages/viewer/src/three/weaponModel.js';
const resolveIcon = (weapon, { side }) => { const key = weaponIconKey(weapon, { side }); return { key, url: csIconUrl[key] }; };
export function createWeaponModel(weapon, options = {}) { return create(weapon, { ...options, resolveIcon }); }
export { updateWeaponModel, isFirearm };
