export interface CombatOverlayOptions { enabled?: boolean; hurt?: boolean; flash?: boolean; reducedEffects?: boolean; maxFlashOpacity?: number }
export interface CombatOverlayState { active: boolean; hurtOpacity: number | null; flashOpacity: number | null; reducedEffects: boolean }
export function combatOverlayState(input?: { active?: boolean; alive?: boolean | null; hurt?: boolean | null; hurtAgeSeconds?: number | null; flashOpacity?: number | null }, options?: CombatOverlayOptions): CombatOverlayState;
export const COMBAT_OVERLAY_THEME: Readonly<{ hurtBackground: string; hurtShadow: string; flashBackground: string; flashShadow: string }>;
export function createCombatOverlay(options: { container: HTMLElement; theme?: Partial<typeof COMBAT_OVERLAY_THEME>; zIndex?: number }): { update(state: CombatOverlayState): void; setViewport(rect?: { left: number; top: number; width: number; height: number } | null): void; getState(): CombatOverlayState | null; dispose(): void };
