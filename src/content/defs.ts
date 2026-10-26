// Typed views of the design fixtures in /data. Narrative fields stay design text;
// numeric mechanics are turned into typed parameters here as each ability is implemented.
import operatorsJson from '../../data/operators.json';
import weaponsJson from '../../data/weapons.json';
import rulesJson from '../../data/rules.json';

export type Side = 'attack' | 'defence';

export interface WeaponDef {
  id: 'smg' | 'carbine' | 'scattergun';
  name: string;
  damage: number;
  pellets: number;
  interval_seconds: number;
  magazine: number;
  reload_seconds: number;
  effective_range_tiles: number;
  operators: string[];
}

export interface OperatorDef {
  id: string;
  name: string;
  side: Side;
  tier: string;
  personality: string;
  gadget: string;
  player_fantasy: string;
  charges: number;
  cooldown_seconds: number;
  counterplay: string;
  limitations: string;
}

export const RULES = rulesJson as {
  team_size: number;
  wins_to_match: number;
  prep_seconds: number;
  action_seconds: number;
  broadcast_seconds: number;
  arm_seconds: number;
  shutdown_seconds: number;
  base_health: number;
  walk_tiles_per_second: number;
  vision_tiles: number;
  reinforcements_per_team: number;
  barricades_per_team: number;
  friendly_fire: boolean;
};

export const WEAPONS = weaponsJson as WeaponDef[];
export const OPERATORS = operatorsJson as unknown as OperatorDef[];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}

export function operatorById(id: string): OperatorDef | undefined {
  return OPERATORS.find((o) => o.id === id);
}

/** Operators implemented with real signature mechanics in this build. */
export const PLAYABLE_SIGNATURE: Record<Side, string[]> = {
  attack: ['ram'],
  defence: ['hinge'],
};

/**
 * Slice squadmates: explicitly temporary basic operators (docs/02 "remaining slots are
 * explicitly temporary basic squadmates"). They carry the side-standard tool only.
 */
export interface SquadmateDef {
  id: string;
  name: string;
  side: Side;
  weapon: WeaponDef['id'];
  look: string;
}

export const SQUADMATES: SquadmateDef[] = [
  { id: 'recruit_mo', name: 'MO', side: 'attack', weapon: 'smg', look: 'mo' },
  { id: 'recruit_tess', name: 'TESS', side: 'attack', weapon: 'scattergun', look: 'tess' },
  { id: 'recruit_dex', name: 'DEX', side: 'defence', weapon: 'smg', look: 'dex' },
  { id: 'recruit_june', name: 'JUNE', side: 'defence', weapon: 'scattergun', look: 'june' },
];

export function weaponForOperator(opId: string): WeaponDef['id'] {
  const mate = SQUADMATES.find((s) => s.id === opId);
  if (mate) return mate.weapon;
  const w = WEAPONS.find((x) => x.operators.includes(opId));
  if (!w) throw new Error(`No weapon assigned to ${opId}`);
  return w.id;
}

export function displayName(opId: string): string {
  const mate = SQUADMATES.find((s) => s.id === opId);
  if (mate) return mate.name;
  return operatorById(opId)?.name ?? opId.toUpperCase();
}

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const secs = (s: number) => Math.round(s * TICK_RATE);
