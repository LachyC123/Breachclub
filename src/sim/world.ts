// Authoritative round simulation. Fixed 60Hz steps; presentation reads state + events only.
import { RULES, secs, weaponById, weaponForOperator, displayName, SQUADMATES, type Side, type WeaponDef } from '../content/defs';
import { buildMap, type MapData, type MapId } from './mapdata';
import { Rng } from './rng';
import type { GeoState, ObstacleRef } from './geometry';
import { obstacles } from './geometry';
import type {
  Actor,
  ActorIntent,
  BarricadeState,
  Entity,
  HeardSound,
  Phase,
  RoundReason,
  SimEvent,
  SoftPanelState,
  SoftState,
  SoundEvent,
  TagMark,
  TeamId,
  Vec,
} from './types';
import { emptyIntent } from './types';
import { stepMovement } from './movement';
import { stepCombat, stepReloads } from './combat';
import { stepInteractions, completeInteractions } from './interact';
import { stepGadgetCommands, stepEntities, stepDrones, deployDrone } from './gadgets';
import { updatePerception, propagateSound } from './perception';
import { stepRules } from './rules';
import { stepRange } from './range';
import { BARREL_HP, stepBarrels } from './explosions';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewEvent = DistributiveOmit<SimEvent, 'id'>;

export type Difficulty = 'rookie' | 'club' | 'expert';

export interface RoundConfig {
  seed: number;
  attackTeam: TeamId;
  /** operator ids for team 0 and team 1, three each */
  squads: [string[], string[]];
  /** index into squads[0] for the human-controlled actor */
  humanIndex: number;
  /** attacker entry point id */
  attackEntry: string;
  difficulty: Difficulty;
  /** shorter clocks for tests/tutorial */
  prepSeconds?: number;
  actionSeconds?: number;
  /** map to load (default Spin Cycle) */
  mapId?: MapId;
  /** 'range' never ends: targets respawn and walls regenerate */
  mode?: 'match' | 'range';
  /** the human's chosen primary (loadout); defaults to the operator's weapon */
  humanWeapon?: WeaponDef['id'];
}

export interface TeamResources {
  reinforcements: number;
  barricades: number;
}

export interface LastSeen {
  pos: Vec;
  tick: number;
  facing: number;
}

export interface RoundResult {
  winner: TeamId;
  reason: RoundReason;
  tick: number;
}

let worldCounter = 0;

export class World implements GeoState {
  readonly uid = ++worldCounter;
  readonly map: MapData;
  readonly cfg: RoundConfig;
  readonly rng: Rng;
  tick = 0;
  phase: Phase = 'prep';
  phaseEndTick: number;
  armedTick = -1;
  armedBy = -1;
  attackTeam: TeamId;
  actors: Actor[] = [];
  soft: SoftPanelState[];
  barricades: (BarricadeState | null)[];
  entities: Entity[] = [];
  resources: [TeamResources, TeamResources];
  prepConfine: { attackTeam: TeamId } | null;
  geometryRevision = 0;
  events: SimEvent[] = [];
  private eventSeq = 0;
  private entitySeq = 100;
  private soundSeq = 0;
  result: RoundResult | null = null;
  /** enemies currently visible to each team (shared team vision) */
  visible: [Set<number>, Set<number>] = [new Set(), new Set()];
  /** actor id -> id of a teammate that sees them (per viewing team) */
  spotter: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  visibleEntities: [Set<number>, Set<number>] = [new Set(), new Set()];
  lastSeen: [Map<number, LastSeen>, Map<number, LastSeen>] = [new Map(), new Map()];
  knownSoft: [SoftState[], SoftState[]];
  knownBarricade: [boolean[], boolean[]];
  heard: [HeardSound[], HeardSound[]] = [[], []];
  /** sounds emitted this tick (for AI + audio) */
  sounds: SoundEvent[] = [];
  damagedThisTick = new Set<number>();
  prepReadyRequested = false;
  /** drone/ping tags per team: enemy id -> marker */
  marks: [Map<number, TagMark>, Map<number, TagMark>] = [new Map(), new Map()];
  objectiveFound: [boolean, boolean] = [false, false];
  /** shooting-range reset timers keyed by feature */
  rangeTimers: Record<string, number> = {};
  private obsCache: { rev: number; tick: number; list: ObstacleRef[] } | null = null;

  constructor(cfg: RoundConfig) {
    this.cfg = cfg;
    this.map = buildMap(cfg.mapId ?? 'spin_cycle');
    this.rng = new Rng(cfg.seed);
    this.attackTeam = cfg.attackTeam;
    this.phaseEndTick = secs(cfg.prepSeconds ?? RULES.prep_seconds);
    this.soft = this.map.softGroups.map(() => ({ state: 'intact', hp: 100, reinforcedBy: null }));
    this.barricades = this.map.doors.map(() => null);
    this.resources = [
      { reinforcements: RULES.reinforcements_per_team, barricades: RULES.barricades_per_team },
      { reinforcements: RULES.reinforcements_per_team, barricades: RULES.barricades_per_team },
    ];
    this.prepConfine = { attackTeam: cfg.attackTeam };
    this.knownSoft = [this.soft.map(() => 'intact'), this.soft.map(() => 'intact')];
    this.knownBarricade = [this.barricades.map(() => false), this.barricades.map(() => false)];
    this.spawnActors();
    for (const p of this.map.barrels) this.entities.push({ kind: 'barrel', id: this.newEntityId(), team: 0, ownerId: -1, pos: { ...p }, hp: BARREL_HP, fuseTick: -1, lastHitBy: -1 });
    // Siege-style recon: every attacker starts prep driving their first drone
    if (this.phaseEndTick > 0 && this.cfg.mode !== 'range') for (const a of this.actors) if (a.side === 'attack') deployDrone(this, a);
    if (this.phaseEndTick <= 0) {
      this.phase = 'action';
      this.prepConfine = null;
      this.phaseEndTick = secs(cfg.actionSeconds ?? RULES.action_seconds);
    }
    updatePerception(this);
  }

  sideOf(team: TeamId): Side {
    return team === this.attackTeam ? 'attack' : 'defence';
  }

  get defendTeam(): TeamId {
    return (1 - this.attackTeam) as TeamId;
  }

  private spawnActors() {
    const entry = this.map.entries.find((e) => e.id === this.cfg.attackEntry) ?? this.map.entries[0];
    let id = 1;
    for (const team of [0, 1] as TeamId[]) {
      const side = this.sideOf(team);
      const ops = this.cfg.squads[team];
      ops.forEach((opId, i) => {
        const es = entry.spots[i % entry.spots.length];
        const spot: Vec = side === 'attack' ? { x: es[0], y: es[1] } : { ...this.map.defenderSpawns[i % this.map.defenderSpawns.length] };
        const isHuman = team === 0 && i === this.cfg.humanIndex;
        const weapon = weaponById(isHuman && this.cfg.humanWeapon ? this.cfg.humanWeapon : weaponForOperator(opId));
        const isSignature = !SQUADMATES.some((s) => s.id === opId);
        const facing = side === 'attack' ? -Math.PI / 2 : Math.PI / 2;
        const a: Actor = {
          id: id++,
          team,
          side,
          operatorId: opId,
          name: displayName(opId),
          look: SQUADMATES.find((s) => s.id === opId)?.look ?? opId,
          pos: spot,
          prevPos: { x: 0, y: 0 },
          vel: { x: 0, y: 0 },
          facing,
          hp: RULES.base_health,
          alive: true,
          diedTick: -1,
          weapon,
          mag: weapon.magazine,
          reserve: weapon.magazine * 3,
          reloadUntil: -1,
          nextShotTick: 0,
          bloom: 0,
          autoReloadArmed: true,
          flinchUntil: -1,
          lowerWeaponUntil: -1,
          interaction: null,
          interactHeldLastTick: false,
          breachCharges: side === 'attack' ? 1 : 0,
          gadgetCharges: isSignature ? (opId === 'ram' ? 1 : opId === 'hinge' ? 1 : 0) : 0,
          gadgetCooldownUntil: 0,
          gadgetWindupUntil: -1,
          pendingLaunchAngle: null,
          stepAccum: 0,
          controller: isHuman ? 'human' : 'bot',
          shove: { x: 0, y: 0 },
          lastDamagedTick: -1000,
          lastDamagedBy: -1,
          kills: 0,
          deaths: 0,
          assists: 0,
          damageDealt: 0,
          drones: side === 'attack' ? 2 : 0,
          tagReadyTick: 0,
          ads: false,
          damagedBy: [],
          vaulting: null,
          slide: null,
          slideReadyTick: 0,
        };
        a.prevPos = { ...a.pos };
        this.actors.push(a);
      });
    }
  }

  emit(e: NewEvent): SimEvent {
    const ev = { ...e, id: ++this.eventSeq } as SimEvent;
    this.events.push(ev);
    return ev;
  }

  newEntityId(): number {
    return ++this.entitySeq;
  }

  bumpGeometry() {
    this.geometryRevision++;
    this.obsCache = null;
  }

  obstacles(): ObstacleRef[] {
    if (!this.obsCache || this.obsCache.tick !== this.tick || this.obsCache.rev !== this.geometryRevision) {
      this.obsCache = { rev: this.geometryRevision, tick: this.tick, list: obstacles(this) };
    }
    return this.obsCache.list;
  }

  /** gadgets that move every tick (sled, rotating hinge) must invalidate the cache */
  invalidateObstacles() {
    this.obsCache = null;
  }

  emitSound(pos: Vec, kind: SoundEvent['kind'], radius: number, team: TeamId, sourceId: number) {
    const s: SoundEvent = { id: ++this.soundSeq, tick: this.tick, pos: { ...pos }, kind, radius, team, sourceId };
    this.sounds.push(s);
    this.emit({ type: 'sound', sound: s });
    propagateSound(this, s);
  }

  actor(id: number): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  human(): Actor | undefined {
    return this.actors.find((a) => a.controller === 'human');
  }

  alive(team: TeamId): Actor[] {
    return this.actors.filter((a) => a.team === team && a.alive);
  }

  /** Death takeover: hand human control to a surviving teammate with their real state. */
  takeOver(actorId: number): boolean {
    const target = this.actor(actorId);
    if (!target || !target.alive || target.team !== 0) return false;
    for (const a of this.actors) if (a.controller === 'human') a.controller = 'bot';
    target.controller = 'human';
    // cancel any bot-held actions; no heal, no reload, no extra charges
    target.interaction = null;
    target.interactHeldLastTick = false;
    target.autoReloadArmed = true;
    return true;
  }

  requestPrepReady() {
    if (this.phase === 'prep') this.prepReadyRequested = true;
  }

  /** Advance exactly one fixed tick. Update order follows docs/11_ARCHITECTURE.md. */
  step(intents: Map<number, ActorIntent>) {
    // clear first: a stale RoundEnded must never be re-read after the round is over
    this.events = [];
    this.sounds = [];
    if (this.phase === 'ended') return;
    this.damagedThisTick.clear();
    this.tick++;
    for (const a of this.actors) a.prevPos = { ...a.pos };
    const get = (a: Actor) => (a.alive ? intents.get(a.id) ?? emptyIntent() : emptyIntent());

    // 1. consume commands: gadget commands validated and committed
    stepGadgetCommands(this, get);
    // 2. movement + active gadget motion
    stepMovement(this, get);
    stepDrones(this, get);
    stepEntities(this);
    stepBarrels(this);
    // 3. geometry revisions are applied atomically inside the gadget/wall handlers
    // 4. perception from the updated geometry
    updatePerception(this);
    // 5. validated actions: reload, shots, interaction progress
    stepReloads(this, get);
    stepCombat(this, get);
    stepInteractions(this, get);
    // 6. deaths
    this.resolveDeaths();
    // 7. surviving interaction completions
    completeInteractions(this);
    // 8. round rules (the shooting range never ends; it resets targets instead)
    if (this.cfg.mode === 'range') stepRange(this);
    else stepRules(this);
    for (const team of [0, 1] as TeamId[]) for (const [id, m] of this.marks[team]) if (this.tick > m.untilTick) this.marks[team].delete(id);
    for (const a of this.actors) a.interactHeldLastTick = a.alive && get(a).interact;
  }

  damageActor(target: Actor, amount: number, sourceId: number) {
    if (!target.alive || amount <= 0) return;
    if (this.phase === 'prep') return;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    target.lastDamagedTick = this.tick;
    target.lastDamagedBy = sourceId;
    const src = this.actor(sourceId);
    if (src && src.team !== target.team) {
      src.damageDealt += dealt;
      if (!target.damagedBy.includes(src.id)) target.damagedBy.push(src.id);
    }
    target.flinchUntil = this.tick + secs(0.12);
    this.damagedThisTick.add(target.id);
    this.emit({ type: 'damage', actorId: target.id, amount, sourceId, hpAfter: target.hp });
  }

  private resolveDeaths() {
    for (const a of this.actors) {
      if (a.alive && a.hp <= 0) {
        a.alive = false;
        a.diedTick = this.tick;
        if (a.interaction) {
          this.emit({ type: 'interactCancel', actorId: a.id, kind: a.interaction.kind, reason: 'Down' });
          a.interaction = null;
        }
        a.vaulting = null;
        a.deaths++;
        const killer = this.actor(a.lastDamagedBy);
        if (killer && killer.team !== a.team) killer.kills++;
        for (const id of a.damagedBy) if (id !== a.lastDamagedBy) this.actor(id)!.assists++;
        a.damagedBy = [];
        this.emit({ type: 'death', actorId: a.id, killerId: a.lastDamagedBy });
      }
    }
  }

  endRound(winner: TeamId, reason: RoundReason) {
    if (this.result) return;
    this.result = { winner, reason, tick: this.tick };
    this.phase = 'ended';
    this.emit({ type: 'roundEnded', winner, reason });
  }

  secondsLeft(): number {
    return Math.max(0, (this.phaseEndTick - this.tick) / 60);
  }
}
