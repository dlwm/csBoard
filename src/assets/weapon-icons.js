import { csIconUrl } from './cs-icon-urls.js';
import { weaponIconKey as selectWeaponIcon } from '../../packages/viewer/src/data/weaponIcons.js';
export { grenadeIconKey } from '../../packages/viewer/src/data/weaponIcons.js';
export const weaponIconKey = (weapon, options = {}) => selectWeaponIcon(weapon, { ...options, hasTKnife: Boolean(csIconUrl.knife_t) });
