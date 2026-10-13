// Normalized observations use Source coordinates; renderer coordinates are host-owned.
const CONTROLLER_TEAM_PROP = 'CCSPlayerController.m_iTeamNum';
const CONTROLLER_PENDING_TEAM_PROP = 'CCSPlayerController.m_iPendingTeamNum';
const CONTROLLER_HEALTH_PROP = 'CCSPlayerController.m_iPawnHealth';
const CONTROLLER_ALIVE_PROP = 'CCSPlayerController.m_bPawnIsAlive';
const numeric = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const flag = value => value == null ? null : Boolean(value);
export function observeGoPlayer(row) {
    const id = String(row.steamid || row.name || '');
    const steamId = /^[1-9][0-9]{15,19}$/.test(String(row.steamid || '')) ? String(row.steamid) : null;
    const inventory = Array.isArray(row.inventory) ? row.inventory.map((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item)).filter(Boolean) : null;
    const parsedTeam = Number(row.team_num ?? row[CONTROLLER_TEAM_PROP] ?? row[CONTROLLER_PENDING_TEAM_PROP]);
    const team = Number.isFinite(parsedTeam) ? parsedTeam : null;
    const parsedHealth = Number(row.health ?? row[CONTROLLER_HEALTH_PROP]);
    const health = Number.isFinite(parsedHealth) ? parsedHealth : null;
    const rawPosition = [row.X, row.Y, row.Z];
    const hasPosition = rawPosition.every((value) => value != null && value !== '' && Number.isFinite(Number(value)));
    const numericPosition = rawPosition.map(Number);
    // `is_alive` defaults to false when pawn lookup fails; only override it for that failure mode.
    const alive = hasPosition
      ? row.is_alive ?? row[CONTROLLER_ALIVE_PROP] ?? (health != null ? health > 0 : null)
      : row[CONTROLLER_ALIVE_PROP] ?? row.is_alive ?? (health != null ? health > 0 : null);
    return {
      id, steamId,
      name: row.name, steamid: row.steamid, userId: row.user_id ?? null,
      team, side: team === 2 ? 'T' : team === 3 ? 'CT' : '', health, armor: numeric(row.armor_value),
      hasHelmet: flag(row.has_helmet), hasDefuser: flag(row.has_defuser), pitch: numeric(row.pitch), yaw: numeric(row.yaw),
      duckAmount: numeric(row.duck_amount), isAirborne: flag(row.is_airborne), movement: ['FORWARD', 'BACK', 'LEFT', 'RIGHT'].filter((key) => Boolean(row[key])),
      grenadePinPulled: typeof row.grenade_pin_pulled === 'boolean' ? row.grenade_pin_pulled : null, grenadeThrowStrength: Number.isFinite(row.grenade_throw_strength) ? row.grenade_throw_strength : null,
      jump: typeof row.JUMP === 'boolean' ? row.JUMP : null, walking: row.WALK != null || row.is_walking != null ? Boolean(row.WALK || row.is_walking) : null, inputAvailable: ['FIRE', 'RIGHTCLICK', 'FORWARD', 'BACK', 'LEFT', 'RIGHT', 'JUMP'].some(key => typeof row[key] === 'boolean'), fire: flag(row.FIRE), secondaryFire: flag(row.RIGHTCLICK),
      flashDuration: numeric(row.flash_duration), flashMaxAlpha: numeric(row.flash_max_alpha), scoped: flag(row.is_scoped),
      placeName: row.last_place_name || null, activeWeaponAmmo: row.active_weapon_ammo ?? null, alive: flag(alive),
      defusing: flag(row.is_defusing), balance: row.balance ?? null,
      cashSpentThisRound: row.cash_spent_this_round ?? null, roundStartEquipValue: row.round_start_equip_value ?? null, currentEquipValue: row.current_equip_value ?? null,
      score: numeric(row.team_rounds_total),
       activeWeapon: row.active_weapon_name || null, inventory,
      hasC4: inventory?.some((item) => String(typeof item === 'object' && item ? item.name || item.weapon_name || item.weapon || item.item_name || '' : item).toLowerCase().includes('c4')) ?? null,
      // Keep a stable position shape for consumers, but never render/analyse the zero fallback.
      hasPosition,
      raw: { x: hasPosition ? numericPosition[0] : null, y: hasPosition ? numericPosition[1] : null, z: hasPosition ? numericPosition[2] : null },
    };
}
