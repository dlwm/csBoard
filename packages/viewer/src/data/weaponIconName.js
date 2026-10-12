// Demo death events can append arbitrary variant tokens; only recognized weapon prefixes map to icons.
// Longest first keeps names such as m4a1_silencer distinct from m4a1.
const WEAPON_PREFIXES = [
  'm4a1_silencer_off', 'usp_silencer_off', 'm4a1_silenceroff', 'usp_silenceroff',
  'm4a1_silencer', 'usp_silencer', 'dualberettas', 'deserteagle', 'r8revolver',
  'zeusx27', 'cz75auto', 'glock18', 'fiveseven', 'hkp2000', 'sawedoff',
  'galilar', 'scar20', 'sg556', 'sg553', 'ssg08', 'xm1014', 'revolver',
  'mp5sd', 'ump45', 'bizon', 'negev', 'm249', 'mac10', 'mag7', 'tec9',
  'm4a4', 'm4a1', 'ak47', 'famas', 'g3sg1', 'glock', 'p2000', 'p250',
  'cz75a', 'cz75', 'deagle', 'elite', 'taser', 'mp9', 'mp7', 'p90',
  'nova', 'aug', 'awp', 'usp', 'usps',
].sort((a, b) => b.length - a.length);

export function normalizeWeaponIconName(value = '') {
  const name = String(value).trim().toLowerCase().replace(/^weapon_/, '');
  return WEAPON_PREFIXES.find((prefix) => name === prefix || name.startsWith(`${prefix}_`)) || name;
}
