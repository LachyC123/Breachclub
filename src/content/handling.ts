// Mechanical identity beyond gadgets: Siege-style armour/speed ratings per operator and per-weapon
// handling. Fixed per operator and weapon (never earned or upgraded). Keyed by stable ids.
import type { WeaponDef } from './defs';

export type Rating = 1 | 2 | 3;

export interface OperatorStats {
  /** 3 = heavy (takes 20% less gunfire damage, moves 12% slower) */
  armour: Rating;
  /** 3 = light and fast (12% faster, full gunfire damage) */
  speed: Rating;
}

export const OPERATOR_STATS: Record<string, OperatorStats> = {
  ram: { armour: 2, speed: 2 },
  recruit_mo: { armour: 1, speed: 3 },
  recruit_tess: { armour: 3, speed: 1 },
  hinge: { armour: 3, speed: 1 },
  recruit_dex: { armour: 1, speed: 3 },
  recruit_june: { armour: 2, speed: 2 },
  dummy: { armour: 2, speed: 2 },
};

export const ARMOUR_DAMAGE: Record<Rating, number> = { 1: 1, 2: 0.9, 3: 0.8 };
export const SPEED_MULT: Record<Rating, number> = { 1: 0.88, 2: 1, 3: 1.12 };

export function statsOf(opId: string): OperatorStats {
  return OPERATOR_STATS[opId] ?? { armour: 2, speed: 2 };
}

export interface WeaponHandling {
  /** cone half-width (radians) of a settled first shot */
  baseSpread: number;
  /** extra spread per shot fired */
  bloomPerShot: number;
  /** spread recovered per second when not firing */
  bloomRecovery: number;
  /** extra spread while moving */
  movingSpread: number;
  /** movement multiplier while aiming down sights */
  adsMove: number;
  /** movement multiplier for a moment after each shot (heavy guns stagger you) */
  fireMove: number;
  /** knockback in tiles per pellet that hits */
  shove: number;
  /** 'mag' swaps a magazine; 'shell' loads one shell at a time and firing interrupts it */
  reload: 'mag' | 'shell';
  shellSeconds: number;
}

export const WEAPON_HANDLING: Record<WeaponDef['id'], WeaponHandling> = {
  // run-and-gun: forgiving on the move, sprays wider the longer you hold it
  smg: { baseSpread: 0.045, bloomPerShot: 0.016, bloomRecovery: 0.5, movingSpread: 0.012, adsMove: 0.7, fireMove: 0.92, shove: 0, reload: 'mag', shellSeconds: 0 },
  // marksman: pin-point first shots, punishes moving and holding the trigger
  carbine: { baseSpread: 0.018, bloomPerShot: 0.026, bloomRecovery: 0.42, movingSpread: 0.045, adsMove: 0.5, fireMove: 0.8, shove: 0.02, reload: 'mag', shellSeconds: 0 },
  // pump scattergun: huge close-range punch and knockback, shell-by-shell reload
  scattergun: { baseSpread: 0.02, bloomPerShot: 0.05, bloomRecovery: 0.3, movingSpread: 0.02, adsMove: 0.6, fireMove: 0.55, shove: 0.07, reload: 'shell', shellSeconds: 0.42 },
};
