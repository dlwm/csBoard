// demoinfocs wire properties belong here, never in the application orchestrator.
// Go 协议字段集中映射；其他解析器自行实现语义相同的 profile。
export const ACTIVE_WEAPON_HANDLE_PROP = 'CCSPlayerPawn.CCSPlayer_WeaponServices.m_hActiveWeapon';
// Some GOTV demos retain the player controller but lose its pawn association.
// These controller fields keep the roster/state truthful even when coordinates cannot be recovered.
const CONTROLLER_TEAM_PROP = 'CCSPlayerController.m_iTeamNum';
const CONTROLLER_PENDING_TEAM_PROP = 'CCSPlayerController.m_iPendingTeamNum';
const CONTROLLER_HEALTH_PROP = 'CCSPlayerController.m_iPawnHealth';
const CONTROLLER_ALIVE_PROP = 'CCSPlayerController.m_bPawnIsAlive';
const controllerFallbackProps = [CONTROLLER_TEAM_PROP, CONTROLLER_PENDING_TEAM_PROP, CONTROLLER_HEALTH_PROP, CONTROLLER_ALIVE_PROP];
export const GRENADE_ENTITY_PROPS = ['Grenade.m_flThrowStrength', 'Grenade.m_bJumpThrow', 'Grenade.m_fThrowTime', 'Grenade.m_vInitialVelocity', 'Grenade.m_vSmokeDetonationPos', 'Grenade.m_VoxelFrameData', 'Grenade.m_nVoxelFrameDataSize', 'Grenade.m_nVoxelUpdate', 'Grenade.m_firePositions', 'Grenade.m_bFireIsBurning', 'Grenade.m_BurnNormal', 'Grenade.m_fireCount', 'Grenade.m_nFireLifetime'];
export const EVENT_TYPES = ['round_start', 'round_freeze_end', 'round_end', 'player_death', 'player_hurt', 'player_blind', 'weapon_fire', 'weapon_reload', 'fire_bullets', 'item_equip', 'item_pickup', 'item_purchase', 'hltv_fixed', 'hltv_chase', 'grenade_thrown', 'smokegrenade_detonate', 'smokegrenade_expired', 'inferno_startburn', 'inferno_expire', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate', 'bomb_dropped', 'bomb_pickup', 'bomb_planted', 'bomb_begindefuse', 'bomb_abortdefuse', 'bomb_exploded', 'bomb_defused'];
const replayProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'user_id', 'team_rounds_total', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'inventory', 'armor_value', 'has_helmet', 'has_defuser', 'flash_duration', 'flash_max_alpha', 'is_scoped', 'is_walking', 'active_weapon_ammo', 'is_alive', 'is_defusing', 'balance', 'cash_spent_this_round', 'round_start_equip_value', 'current_equip_value', ...controllerFallbackProps];
const analysisProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'is_alive', ...controllerFallbackProps];
const throwProps = ['X', 'Y', 'Z', 'health', 'team_num', 'pitch', 'yaw', 'duck_amount', 'is_airborne', 'is_walking', 'FIRE', 'RIGHTCLICK', 'FORWARD', 'BACK', 'LEFT', 'RIGHT', 'JUMP', 'WALK', 'grenade_pin_pulled', 'grenade_throw_strength', 'active_weapon_name', ACTIVE_WEAPON_HANDLE_PROP, 'has_defuser', 'last_place_name', ...controllerFallbackProps];

export const FRAME_PROFILES = Object.freeze({ replay: replayProps, analysis: analysisProps, preparation: throwProps });
