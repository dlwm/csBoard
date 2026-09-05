// Shared CS2 icon adapters with compact SVG fallbacks for missing assets.
import { csIconUrl } from '../assets/cs-icon-urls.js';
import { demoWeaponKind } from '../demo/playerState.js';

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

export function RawIcon({ name, className }) {
  const src = csIconUrl[name];
  if (!src) return null;
  return <span className={className || ''} aria-hidden="true"><img className="cs-icon-image" src={src} alt="" /></span>;
}

export function MaskIcon({ name, className }) {
  const src = csIconUrl[name];
  if (!src) return null;
  return <span className={`cs-icon-mask${className ? ` ${className}` : ''}`} style={{ '--cs-icon-url': `url("${src}")` }} aria-hidden="true" />;
}

export function MapIcon({ map }) {
  const src = csIconUrl[`map_icon_${map}`];
  if (!src) return null;
  return <img className="map-icon" src={src} alt="" aria-hidden="true" />;
}

export function SideLogo({ side }) {
  const src = csIconUrl[side === 'CT' ? 'ct_logo' : 't_logo'];
  if (!src) return <span>{side === 'CT' ? 'CT' : 'T'}</span>;
  return <span className={`side-logo side-${side.toLowerCase()}`} aria-hidden="true"><img src={src} alt="" /></span>;
}

const KNIFE_WEAPON_KEYS = new Set([
  'knife', 'knifet', 'knifegg', 'bayonet', 'classicknife', 'flipknife', 'gutknife', 'karambit', 'm9bayonet', 'huntsmanknife', 'falchionknife', 'bowieknife', 'butterflyknife', 'shadowdaggers', 'paracordknife', 'survivalknife', 'ursusknife', 'navajaknife', 'nomadknife', 'stilettoknife', 'talonknife', 'skeletonknife', 'kukriknife',
  'knifeflip', 'knifegut', 'knifekarambit', 'knifem9bayonet', 'knifetactical', 'knifefalchion', 'knifesurvivalbowie', 'knifebutterfly', 'knifepush', 'knifecord', 'knifecanis', 'knifeursus', 'knifegypsyjack', 'knifeoutdoor', 'knifestiletto', 'knifewidowmaker', 'knifeskeleton', 'knifekukri',
]);

const csWeaponKey = (weapon = '', { side = '' } = {}) => {
  const raw = String(weapon).toLowerCase().replace(/^weapon_/, '');
  const compact = raw.replace(/[^a-z0-9]/g, '');
  const grenade = grenadeIconKey(raw);
  if (grenade) return grenade;
  if (compact.includes('c4') || compact === 'explosive') return 'c4';
  if (KNIFE_WEAPON_KEYS.has(compact) || compact.includes('knife') || compact.includes('bayonet') || compact.includes('dagger')) return side === 'T' && csIconUrl.knife_t ? 'knife_t' : 'knife_ct';
  if (compact === 'glock') return 'glock18';
  if (compact === 'cz75a') return 'cz75';
  if (compact === 'sg556') return 'sg553';
  if (compact === 'm4a1silencer' || compact === 'm4a1silenceroff' || compact === 'm4a1s') return 'm4a1';
  if (compact === 'm4a1') return 'm4a4';
  if (compact === 'uspsilencer' || compact === 'uspsilenceroff' || compact === 'usps') return 'usp';
  return compact;
};

export function RosterWeaponIcon({ weapon, side }) {
  const key = csWeaponKey(weapon, { side });
  if (csIconUrl[key]) return <MaskIcon name={key} className={`roster-weapon-icon${grenadeIconKey(weapon) ? ' roster-grenade' : ''}`} />;
  return null;
}

export function RosterIcon({ type }) {
  const paths = {
    armor: <><path d="M4 4l4-2 4 2v4c0 3-1.7 5.2-4 6-2.3-.8-4-3-4-6V4z" /><path d="M6 7h4M8 4v8" /></>,
    helmet: <><path d="M3 8a5 5 0 0110 0v2H8l-2 3H3V8z" /><path d="M8 10v3h4" /></>,
    armorHelmet: <><path d="M2 7l4-2 4 2v3c0 2.4-1.6 4.2-4 5-2.4-.8-4-2.6-4-5V7z" /><path d="M7 5a3.5 3.5 0 017 0v2h-4l-2 2M4 9h4M6 7v6" /></>,
    defuser: <><rect x="3" y="5" width="10" height="8" rx="1" /><path d="M6 5V3h4v2M6 8h4M8 8v3" /></>,
    c4: <><rect x="3" y="4" width="10" height="9" rx="1" /><path d="M6 4V2m4 2V2M5 7h6M5 10h2m2 0h2" /></>,
  };
  const map = { armor: 'armor', helmet: 'helmet', armorHelmet: 'armor_helmet', defuser: 'defuser', c4: 'c4' };
  if (csIconUrl[map[type]]) return <MaskIcon name={map[type]} className={`roster-icon icon-${type}`} />;
  return <svg className={`roster-icon icon-${type}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const weaponIconPaths = {
  ak47: 'M1 7h4l2-2h9l2 1h7l5-2v3l-5 1h-8l-2 2-2 5h-3l1-5H7l-3 3H1z', m4a1: 'M1 7h5l2-2h10l2 1h8v2h-9l-2 2-1 4h-3l1-4H8l-3 3H2z', m4a1_silencer: 'M1 7h5l2-2h10l2 1h5v-1h6v3h-12l-2 2-1 4h-3l1-4H8l-3 3H2z', galilar: 'M1 7h6l2-2h10l2 2h9v2H19l-2 2-2 4h-3l1-5H8l-4 3H1z', famas: 'M1 8l5-2 2-2h11l4 3h7v2h-9l-2 3h-5l-1 3h-3l1-5H6l-3 2H1z', aug: 'M1 8h5l2-3h6V3h6v2l4 2h7v2h-9l-2 3h-4l-2 3h-3l1-5H6l-4 2z', sg556: 'M1 8h5l2-3h5V3h6v2l4 2h8v2H20l-2 3h-4l-1 3h-3l1-5H6l-4 2z', awp: 'M1 8h7l2-2h3V4h7v2h3l2 1h6v2h-8l-2 2-2 4h-3l1-5H9l-5 3H1z', ssg08: 'M1 8h8l2-2h2V4h6v2h3l2 1h7v2h-9l-2 2-1 4h-3l1-5H9l-5 3H1z', scar20: 'M1 8h6l2-2h3V4h7v2h3l3 1h6v2h-9l-2 2-1 4h-3l1-5H8l-4 3H1z', g3sg1: 'M1 8h6l2-2h3V4h7v2h3l3 1h6v2H20l-1 3-2 3h-3l1-5H8l-4 3H1z',
  glock: 'M3 5h18l2 2v3h-9l-1 6H8l1-6H3z', usp_silencer: 'M2 6h15V4h13v4H17v2h-5l-1 6H7l1-6H2z', hkp2000: 'M3 5h18l2 2v3h-9l-1 6H8l1-6H3zM6 4h12', p250: 'M3 6h17l2 2v2h-8l-2 6H8l1-6H3zM7 4h11', fiveseven: 'M2 5h20l2 2v3h-9l-2 6H8l1-6H2zM5 4h14', tec9: 'M2 6h19l3 2v2h-8v5h-4l-1-5H8l-2 3H3zM8 4h9', cz75a: 'M2 6h18l3 2v2h-8l-1 6h-4l-1-6H2zM6 4h15l2 1', elite: 'M1 5h13l2 2v2H9l-1 6H4l1-6H1zM16 5h13l2 2v2h-7l-1 6h-4l1-6h-4z', deagle: 'M2 5h21l3 3v2H15l-2 6H8l1-6H2zM5 3h15', revolver: 'M2 6h12l3-2h7l3 3v3h-9l-3 6h-4l1-6H2z',
  mp9: 'M2 5h17l4 3h7v2h-9v5h-4l-1-5H9l-2 4H4l1-4H2z', mac10: 'M2 5h18l3 3h7v2h-9l-1 5h-4l-1-5H8l-2 4H3l1-4H2z', mp7: 'M2 6h20l3 2h6v2H20v5h-4l-1-5H8l-2 4H3l1-4H2z', mp5sd: 'M2 6h18l2 1h3V5h6v4H21l-1 6h-4l-1-5H8l-2 4H3l1-4H2z', ump45: 'M2 6h19l3 2h7v2H20l-1 5h-4l-1-5H8l-3 4H2l2-4H2z', p90: 'M2 6h21l5 2v3H17l-2 4h-4l1-5H8l-2 3H3zM8 4h13', bizon: 'M2 6h20l3 2h6v2H20l-2 3H8l-2 2H3l2-5H2zM9 11h10v3H9z', nova: 'M1 7h24l6 1v2H16l-5 4H7l3-4H1zM12 5h13', xm1014: 'M1 7h23l7 1v2H18l-4 4h-4l2-4H1zM8 5h17M18 11h8', mag7: 'M2 6h19l4 2h6v2H18l-2 5h-4l1-5H7l-2 3H2z', sawedoff: 'M2 7h19l5 1v2H16l-4 4H8l2-4H2z', m249: 'M1 6h21l3 2h6v2H21l-1 4h-4l-1-4H8l-3 3H2zM18 10h7v5h-7z', negev: 'M1 6h20l4 2h7v2H20l-1 4h-4l-1-4H8l-3 3H2zM15 10h8v5h-8z', taser: 'M5 3h18l4 4-4 3h-7l-2 6H9l2-6H5zM18 5l-3 4h4l-2 4',
};

export function KillIcon({ type, weapon, side }) {
  const weaponKey = csWeaponKey(weapon, { side });
  const kind = type === 'weapon' ? weaponIconPaths[weaponKey] ? weaponKey : demoWeaponKind(weapon) : type;
  const paths = {
    pistol: <><path d="M2 6h9v3H8l-1 5H4l1-5H2z" /><path d="M11 7h3" /></>, rifle: <path d="M1 7h10l3-2v4l-3-1H7l-2 3H2l2-3H1z" />, sniper: <><path d="M1 8h13M4 8l-2 3m8-3l3 2M6 6h4v2" /><circle cx="8" cy="5" r="2" /></>, smg: <path d="M2 6h10v4H8l-1 3H4l1-3H2zM10 10v3" />, shotgun: <path d="M1 7h12l2 1-2 1H7l-3 3H2l2-3H1z" />, machinegun: <path d="M1 6h11v5H8l-1 3H4l1-3H1zM11 11l3 3m-3-3l-1 3" />, melee: <path d="M3 13l3-3m-1-1l6-7 2 2-7 6z" />, utility: <><circle cx="8" cy="9" r="5" /><path d="M7 4V2h3m-1 0v2" /></>, c4: <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M5 6h6M5 9h2m2 0h2" /></>, headshot: <><circle cx="8" cy="7" r="4" /><path d="M5 12h6M8 2v10M3 7h10" /></>, smoke: <path d="M3 12c-2-2 1-3 0-5s2-4 4-2c1-3 5-2 5 1 3 1 2 5 0 6z" />, blind: <><path d="M1 8s3-4 7-4 7 4 7 4-3 4-7 4-7-4-7-4z" /><path d="M4 3L2 1m10 2l2-2M8 2V0" /><circle cx="8" cy="8" r="2" /></>, wallbang: <><path d="M2 2v12M6 2v12M10 2v12M14 2v12M0 6h16M0 10h16" /><path d="M1 8h14" /></>, noscope: <><circle cx="8" cy="8" r="5" /><path d="M8 1v14M1 8h14M3 3l10 10" /></>, airborne: <><path d="M2 12c3-1 4-4 5-8l2 3 3-1-1 3 3 2" /><path d="M1 14h14" /></>,
  };
  const indicatorMap = { headshot: 'icon_headshot', smoke: 'smoke_kill', blind: 'blind_kill', wallbang: 'penetrate', noscope: 'noscope', airborne: 'inairkill' };
  if (csIconUrl[indicatorMap[kind]]) return <MaskIcon name={indicatorMap[kind]} className={`kill-icon kill-icon-${kind}`} />;
  if (type === 'weapon' && csIconUrl[weaponKey]) return <MaskIcon name={weaponKey} className={`kill-icon kill-icon-weapon kill-icon-${weaponKey}`} />;
  if (type === 'weapon' && weaponIconPaths[weaponKey]) return <svg className={`kill-icon kill-icon-weapon kill-icon-${weaponKey}`} viewBox="0 0 32 16" aria-hidden="true" fill="currentColor"><path d={weaponIconPaths[weaponKey]} /></svg>;
  return <svg className={`kill-icon kill-icon-${kind}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{paths[kind] || paths.rifle}</svg>;
}
