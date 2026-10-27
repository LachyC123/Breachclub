// Shared bot AI types. Every decision reads a Perception snapshot built from what the bot (or its
// team, after a communication delay) actually saw, heard or tagged — never hidden truth.
import type { Actor, Vec } from '../sim/types';
import type { PathPoint } from './nav';
import type { Difficulty } from '../sim/world';

export type Role = 'entry' | 'support' | 'flank' | 'anchor' | 'roamer';

/** Player orders for their own squad. 'auto' = escort the player on attack, hold the site on defence. */
export type Order = { kind: 'auto' } | { kind: 'follow' } | { kind: 'hold'; pos: Vec } | { kind: 'push' };

export type BotStatus =
  | ''
  | 'Droning'
  | 'Moving'
  | 'Stacked'
  | 'Ready'
  | 'Blocked'
  | 'Following'
  | 'Holding'
  | 'Fighting'
  | 'Falling back'
  | 'Breaching'
  | 'Arming'
  | 'Defusing'
  | 'Rotating';

export interface DiffParams {
  reaction: [number, number];
  aimBase: number;
  aimStart: number;
  settle: number;
  comm: number;
  turnRate: number;
  strafe: boolean;
  /** extra aim error per tile/s of the target's sideways motion */
  leadError: number;
  burst: [number, number];
}

export const DIFFICULTY: Record<Difficulty, DiffParams> = {
  rookie: { reaction: [0.55, 0.85], aimBase: 0.13, aimStart: 0.34, settle: 0.9, comm: 0.9, turnRate: 5.5, strafe: false, leadError: 0.05, burst: [0.25, 0.45] },
  club: { reaction: [0.34, 0.55], aimBase: 0.085, aimStart: 0.26, settle: 0.6, comm: 0.55, turnRate: 7.5, strafe: true, leadError: 0.035, burst: [0.35, 0.6] },
  expert: { reaction: [0.22, 0.36], aimBase: 0.05, aimStart: 0.18, settle: 0.42, comm: 0.3, turnRate: 10, strafe: true, leadError: 0.02, burst: [0.45, 0.8] },
};

export interface EnemyMemory {
  pos: Vec;
  tick: number;
  own: boolean;
}

export interface SoundMemory {
  pos: Vec;
  tick: number;
  unc: number;
  kind: string;
}

export type Task =
  | { kind: 'idle' }
  | { kind: 'drone' }
  | { kind: 'goto'; pos: Vec; watch: Vec | null; label: BotStatus; sneak?: boolean }
  | { kind: 'hold'; pos: Vec; watch: Vec | null; label: BotStatus }
  | { kind: 'breach'; target: number; stage: 'approach' | 'act' | 'wait'; stand: Vec; aimAngle: number; useSled: boolean; startTick: number }
  | { kind: 'arm' }
  | { kind: 'shutoff' }
  | { kind: 'prepInteract'; interact: 'reinforce' | 'barricade'; target: number; stand: Vec }
  | { kind: 'placeHinge'; pos: Vec; vertical: boolean }
  | { kind: 'investigate'; pos: Vec; until: number }
  | { kind: 'escort' };

export interface BotState {
  id: number;
  role: Role;
  enemies: Map<number, EnemyMemory>;
  sounds: SoundMemory[];
  inbox: Array<{ deliver: number; enemyId: number; pos: Vec; tick: number }>;
  task: Task;
  path: PathPoint[];
  pathGoal: Vec | null;
  pathRev: string;
  progressPos: Vec;
  progressTick: number;
  blockedSince: number;
  breakDoor: number;
  targetId: number | null;
  acquiredTick: number;
  reactionTicks: number;
  aimOffset: number;
  burstEnd: number;
  burstPauseEnd: number;
  strafeDir: number;
  strafeUntil: number;
  /** cover spot to fall back to and when to re-peek */
  fallback: { pos: Vec; until: number; threat: Vec } | null;
  fallbackCount: number;
  fallbackWindow: number;
  lastEngageTick: number;
  status: BotStatus;
  order: Order;
  lastThink: number;
  heardIds: Set<number>;
  dronePath: Vec[];
  droneGoal: number;
  wantRotate: boolean;
  /** stable slot index within the squad (spacing, stack side) */
  slot: number;
}

export interface Perception {
  visible: Actor[];
  memories: Array<{ id: number; pos: Vec; tick: number }>;
  sounds: SoundMemory[];
}
