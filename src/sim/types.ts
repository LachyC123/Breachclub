import type { Side, WeaponDef } from '../content/defs';

export interface Vec {
  x: number;
  y: number;
}

/** 0 = the human player's squad, 1 = the opposing bot squad. */
export type TeamId = 0 | 1;

export type Phase = 'prep' | 'action' | 'armed' | 'ended';

export type RoundReason =
  | 'attackers_eliminated'
  | 'defenders_eliminated'
  | 'timeout'
  | 'broadcast_complete'
  | 'shutdown'
  | 'mutual_elimination_unarmed'
  | 'mutual_elimination_armed';

export type InteractKind = 'arm' | 'shutoff' | 'reinforce' | 'barricade' | 'unbarricade' | 'breach' | 'vault';

export interface InteractOption {
  kind: InteractKind;
  /** soft group / door index / vault index, or -1 for console */
  target: number;
  label: string;
  pos: Vec;
  durationTicks: number;
  enabled: boolean;
  reason?: string;
}

export interface ActiveInteraction {
  kind: InteractKind;
  target: number;
  startTick: number;
  durationTicks: number;
  startPos: Vec;
}

export type GadgetCommand =
  | { type: 'ramLaunch'; angle: number }
  | { type: 'ramDeploy' }
  | { type: 'hingePlace'; x: number; y: number; vertical: boolean }
  | { type: 'hingeRotate' };

/** One tick of intent. Humans and bots use the exact same interface. */
export interface ActorIntent {
  move: Vec;
  /** facing angle (radians) or null to keep the last facing */
  aim: number | null;
  fire: boolean;
  interact: boolean;
  reload: boolean;
  gadget: GadgetCommand | null;
  /** prep only: drive the shared scouting puck instead of walking */
  puck: Vec | null;
}

export const emptyIntent = (): ActorIntent => ({
  move: { x: 0, y: 0 },
  aim: null,
  fire: false,
  interact: false,
  reload: false,
  gadget: null,
  puck: null,
});

export interface Actor {
  id: number;
  team: TeamId;
  side: Side;
  operatorId: string;
  name: string;
  look: string;
  pos: Vec;
  prevPos: Vec;
  vel: Vec;
  facing: number;
  hp: number;
  alive: boolean;
  diedTick: number;
  weapon: WeaponDef;
  mag: number;
  reserve: number;
  reloadUntil: number;
  nextShotTick: number;
  bloom: number;
  autoReloadArmed: boolean;
  flinchUntil: number;
  lowerWeaponUntil: number;
  interaction: ActiveInteraction | null;
  interactHeldLastTick: boolean;
  breachCharges: number;
  gadgetCharges: number;
  gadgetCooldownUntil: number;
  gadgetWindupUntil: number;
  pendingLaunchAngle: number | null;
  stepAccum: number;
  controller: 'human' | 'bot';
  /** shove impulse remaining (tiles) applied over a few ticks */
  shove: Vec;
  lastDamagedTick: number;
  lastDamagedBy: number;
  kills: number;
  vaulting: { from: Vec; to: Vec; startTick: number; endTick: number } | null;
}

export type SoftState = 'intact' | 'reinforced' | 'breached';

export interface SoftPanelState {
  state: SoftState;
  hp: number;
  /** reinforcement in progress / owner for prep refund rules */
  reinforcedBy: TeamId | null;
}

export interface BarricadeState {
  hp: number;
  team: TeamId;
  damaged: boolean;
}

/** Oriented box obstacle used by gadgets. Angle is the long axis direction. */
export interface Obb {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  angle: number;
}

export interface SledEntity {
  kind: 'sled';
  id: number;
  team: TeamId;
  ownerId: number;
  pos: Vec;
  dir: number;
  traveled: number;
  maxTravel: number;
  breached: boolean;
  afterBreach: number;
  hp: number;
  hitActors: number[];
  deployRequested: boolean;
}

export interface CoverEntity {
  kind: 'cover';
  id: number;
  team: TeamId;
  ownerId: number;
  obb: Obb;
  hp: number;
  maxHp: number;
  expiresTick: number;
}

export interface HingeEntity {
  kind: 'hinge';
  id: number;
  team: TeamId;
  ownerId: number;
  center: Vec;
  /** authoritative current angle of the 2-tile wall */
  angle: number;
  /** resting orientation: 0 = horizontal (along x), 1 = vertical */
  orient: 0 | 1;
  hp: number;
  maxHp: number;
  state: 'idle' | 'warning' | 'rotating';
  stateTick: number;
  fromAngle: number;
  toAngle: number;
  /** ticks of rotation progress (stalls when an actor intrudes) */
  progress: number;
  cooldownUntil: number;
}

export interface ChargeEntity {
  kind: 'charge';
  id: number;
  team: TeamId;
  ownerId: number;
  pos: Vec;
  target: { type: 'soft' | 'door'; index: number };
  detonateTick: number;
}

/** Shared attacker scouting puck (prep only). Sees through doors, never through walls. */
export interface PuckEntity {
  kind: 'puck';
  id: number;
  team: TeamId;
  ownerId: number;
  pos: Vec;
  hp: number;
  driverId: number;
  stepAccum: number;
}

export type Entity = SledEntity | CoverEntity | HingeEntity | ChargeEntity | PuckEntity;

export interface SoundEvent {
  id: number;
  tick: number;
  pos: Vec;
  kind: 'step' | 'shot' | 'breach' | 'reload' | 'gadget' | 'console' | 'voice';
  radius: number;
  team: TeamId;
  sourceId: number;
}

/** What a team actually knows about a sound (bearing/region with uncertainty). */
export interface HeardSound {
  soundId: number;
  tick: number;
  kind: SoundEvent['kind'];
  /** fuzzed estimate, never the exact hidden coordinate */
  estimate: Vec;
  uncertainty: number;
  listenerId: number;
  sourceTeam: TeamId;
}

export type SimEvent =
  | { type: 'shot'; id: number; actorId: number; from: Vec; to: Vec; hitActor: number | null; hitSurface: 'wall' | 'soft' | 'barricade' | 'gadget' | 'prop' | 'none'; weapon: string }
  | { type: 'damage'; id: number; actorId: number; amount: number; sourceId: number; hpAfter: number }
  | { type: 'death'; id: number; actorId: number; killerId: number }
  | { type: 'wallBreached'; id: number; group: number; by: number; cause: 'sled' | 'charge' | 'gunfire' }
  | { type: 'barricadeBroken'; id: number; door: number; by: number }
  | { type: 'barricadePlaced'; id: number; door: number; team: TeamId }
  | { type: 'barricadeRemoved'; id: number; door: number; team: TeamId }
  | { type: 'reinforced'; id: number; group: number; team: TeamId }
  | { type: 'surfaceHit'; id: number; pos: Vec; material: 'wall' | 'soft' | 'barricade' | 'gadget' | 'prop'; reinforced?: boolean }
  | { type: 'reloadStart'; id: number; actorId: number }
  | { type: 'reloadEnd'; id: number; actorId: number }
  | { type: 'dryFire'; id: number; actorId: number }
  | { type: 'interactStart'; id: number; actorId: number; kind: InteractKind }
  | { type: 'interactCancel'; id: number; actorId: number; kind: InteractKind; reason: string }
  | { type: 'interactDone'; id: number; actorId: number; kind: InteractKind }
  | { type: 'armed'; id: number; actorId: number }
  | { type: 'shutoff'; id: number; actorId: number }
  | { type: 'gadgetInvalid'; id: number; actorId: number; reason: string }
  | { type: 'ramWindup'; id: number; actorId: number; angle: number }
  | { type: 'sledLaunched'; id: number; actorId: number; sledId: number }
  | { type: 'sledHitActor'; id: number; sledId: number; actorId: number }
  | { type: 'sledStopped'; id: number; sledId: number; pos: Vec; reason: string }
  | { type: 'sledDestroyed'; id: number; sledId: number; pos: Vec }
  | { type: 'coverDeployed'; id: number; coverId: number }
  | { type: 'coverDestroyed'; id: number; coverId: number; pos: Vec }
  | { type: 'coverExpired'; id: number; coverId: number }
  | { type: 'hingePlaced'; id: number; hingeId: number; actorId: number }
  | { type: 'hingeWarning'; id: number; hingeId: number }
  | { type: 'hingeRotateStart'; id: number; hingeId: number }
  | { type: 'hingeRotateEnd'; id: number; hingeId: number }
  | { type: 'hingeBlocked'; id: number; hingeId: number; reason: string; cells: Vec[] }
  | { type: 'hingeDestroyed'; id: number; hingeId: number; pos: Vec }
  | { type: 'chargePlanted'; id: number; chargeId: number; actorId: number }
  | { type: 'puckDestroyed'; id: number; puckId: number; pos: Vec }
  | { type: 'puckExpired'; id: number; puckId: number }
  | { type: 'vault'; id: number; actorId: number }
  | { type: 'phase'; id: number; phase: Phase }
  | { type: 'roundEnded'; id: number; winner: TeamId; reason: RoundReason }
  | { type: 'sound'; id: number; sound: SoundEvent }
  | { type: 'spotted'; id: number; team: TeamId; actorId: number; spotterId: number };

export type SimEventType = SimEvent['type'];
