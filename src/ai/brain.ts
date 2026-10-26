// Deterministic local bot AI. Decisions read a per-bot PerceptionSnapshot (own sight, own
// hearing, and teammate intel delivered after a communication delay) — never hidden truth.
import type { Side } from '../content/defs';
import { secs } from '../content/defs';
import { angleTo, dist, normAngle, hingeObb, rayObb } from '../sim/geometry';
import { canSee } from '../sim/perception';
import { canShoot } from '../sim/combat';
import { bestInteract, distToCells } from '../sim/interact';
import {
  previewSledPath,
  validateHingePlacement,
  validateRamLaunch,
} from '../sim/gadgets';
import type { Actor, ActorIntent, HingeEntity, PuckEntity, TeamId, Vec } from '../sim/types';
import { emptyIntent } from '../sim/types';
import type { Difficulty, World } from '../sim/world';
import { findPath, smooth, walkable, navGrid, type PathPoint } from './nav';

export type Order = { kind: 'auto' } | { kind: 'follow' } | { kind: 'hold'; pos: Vec };
export type BotStatus = 'Scouting' | 'Moving' | 'Ready' | 'Blocked' | 'Following' | 'Holding' | 'Fighting' | 'Breaching' | 'Arming' | '';

interface DiffParams {
  reaction: [number, number];
  aimBase: number;
  aimStart: number;
  settle: number;
  comm: number;
  turnRate: number;
  strafe: boolean;
}

export const DIFFICULTY: Record<Difficulty, DiffParams> = {
  rookie: { reaction: [0.45, 0.7], aimBase: 0.085, aimStart: 0.3, settle: 0.8, comm: 0.9, turnRate: 6, strafe: false },
  club: { reaction: [0.25, 0.45], aimBase: 0.05, aimStart: 0.22, settle: 0.5, comm: 0.5, turnRate: 9, strafe: true },
  expert: { reaction: [0.18, 0.32], aimBase: 0.03, aimStart: 0.16, settle: 0.35, comm: 0.3, turnRate: 12, strafe: true },
};

interface EnemyMemory {
  pos: Vec;
  tick: number;
  own: boolean;
}

interface SoundMemory {
  pos: Vec;
  tick: number;
  unc: number;
  kind: string;
}

type Task =
  | { kind: 'idle' }
  | { kind: 'goto'; pos: Vec; face: number | null; label: BotStatus }
  | { kind: 'hold'; pos: Vec; face: number | null; label: BotStatus }
  | { kind: 'breach'; target: number; stage: 'approach' | 'act' | 'wait'; stand: Vec; aimAngle: number; useSled: boolean; startTick: number }
  | { kind: 'arm' }
  | { kind: 'shutoff' }
  | { kind: 'prepInteract'; interact: 'reinforce' | 'barricade'; target: number; stand: Vec }
  | { kind: 'placeHinge'; pos: Vec; vertical: boolean }
  | { kind: 'investigate'; pos: Vec; until: number };

export interface BotState {
  id: number;
  role: 'entry' | 'support' | 'flank' | 'anchor' | 'roamer';
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
  targetId: number | null;
  acquiredTick: number;
  reactionTicks: number;
  aimOffset: number;
  strafeDir: number;
  strafeUntil: number;
  status: BotStatus;
  order: Order;
  holdInteract: boolean;
  breakDoor: number;
  lastThink: number;
  heardIds: Set<number>;
  puckPath: Vec[];
}

/** Snapshot of what one bot may legitimately know this tick. */
interface Perception {
  visible: Actor[];
  memories: Array<{ id: number; pos: Vec; tick: number }>;
  sounds: SoundMemory[];
}

const ATTACK_HOLD_SPOTS: Vec[] = [
  { x: 8.6, y: 6.6 },
  { x: 4.6, y: 8.2 },
  { x: 9.6, y: 3.8 },
];
const DEFENCE_SPOTS: Record<'anchor' | 'support' | 'roamer', Array<{ pos: Vec; face: number }>> = {
  anchor: [{ pos: { x: 4.2, y: 3.8 }, face: Math.PI / 2 }],
  support: [
    { pos: { x: 14.2, y: 9.4 }, face: -Math.PI / 2 },
    { pos: { x: 13.6, y: 3.8 }, face: Math.PI / 2 },
  ],
  roamer: [
    { pos: { x: 18.5, y: 13.0 }, face: Math.PI / 2 },
    { pos: { x: 4.5, y: 13.5 }, face: Math.PI / 2 },
    { pos: { x: 27.5, y: 4.0 }, face: 0 },
  ],
};
const HINGE_SOCKETS: Array<{ x: number; y: number; vertical: boolean }> = [
  { x: 5.5, y: 8.5, vertical: false },
  { x: 12.5, y: 7.5, vertical: true },
  { x: 9.5, y: 8.0, vertical: false },
  { x: 11.0, y: 5.5, vertical: true },
];

export class AIDirector {
  bots = new Map<number, BotState>();
  diff: DiffParams;
  /** defence prep reservations: job key -> bot id */
  private reserved = new Map<string, number>();
  private planterId: [number, number] = [-1, -1];

  constructor(private w: World) {
    this.diff = DIFFICULTY[w.cfg.difficulty];
    for (const team of [0, 1] as TeamId[]) {
      const members = w.actors.filter((a) => a.team === team);
      const side = w.sideOf(team);
      const roles: BotState['role'][] = side === 'attack' ? ['entry', 'support', 'flank'] : ['anchor', 'support', 'roamer'];
      members.forEach((a, i) => this.bots.set(a.id, this.newBot(a, roles[i % 3])));
    }
  }

  private newBot(a: Actor, role: BotState['role']): BotState {
    return {
      id: a.id,
      role,
      enemies: new Map(),
      sounds: [],
      inbox: [],
      task: { kind: 'idle' },
      path: [],
      pathGoal: null,
      pathRev: '',
      progressPos: { ...a.pos },
      progressTick: 0,
      blockedSince: -1,
      targetId: null,
      acquiredTick: 0,
      reactionTicks: 0,
      aimOffset: 0,
      strafeDir: 1,
      strafeUntil: 0,
      status: '',
      order: { kind: 'auto' },
      holdInteract: false,
      breakDoor: -1,
      lastThink: -100,
      heardIds: new Set(),
      puckPath: [],
    };
  }

  setOrder(actorId: number, order: Order) {
    const b = this.bots.get(actorId);
    if (b) {
      b.order = order;
      b.task = { kind: 'idle' };
      b.path = [];
    }
  }

  /** Called after takeover so the newly-human actor's old AI order is cleared. */
  clearFor(actorId: number) {
    const b = this.bots.get(actorId);
    if (!b) return;
    b.task = { kind: 'idle' };
    b.path = [];
    b.order = { kind: 'auto' };
    b.holdInteract = false;
    for (const [k, v] of this.reserved) if (v === actorId) this.reserved.delete(k);
  }

  /** Development autopilot: the same bot logic drives a human-controlled actor. */
  intentFor(actorId: number): ActorIntent {
    const a = this.w.actor(actorId);
    const b = this.bots.get(actorId);
    if (!a || !b || !a.alive) return emptyIntent();
    return this.botTick(a, b);
  }

  /** Produce intents for every living bot-controlled actor. */
  think(): Map<number, ActorIntent> {
    const w = this.w;
    const out = new Map<number, ActorIntent>();
    this.shareIntel();
    for (const a of w.actors) {
      const b = this.bots.get(a.id)!;
      if (!a.alive) {
        for (const [k, v] of this.reserved) if (v === a.id) this.reserved.delete(k);
        continue;
      }
      this.absorbHearing(a, b);
      if (a.controller !== 'bot') continue;
      out.set(a.id, this.botTick(a, b));
    }
    return out;
  }

  // ---------- perception ----------

  /** Teammates' sightings reach other bots only after a communication delay, with original timestamps. */
  private shareIntel() {
    const w = this.w;
    const delay = secs(this.diff.comm);
    for (const team of [0, 1] as TeamId[]) {
      for (const [enemyId, spotterId] of w.spotter[team]) {
        const e = w.actor(enemyId);
        if (!e) continue;
        for (const mate of w.actors) {
          if (mate.team !== team || !mate.alive || mate.id === spotterId) continue;
          const b = this.bots.get(mate.id)!;
          // throttle: one queued report per enemy per 0.25s
          const last = b.inbox[b.inbox.length - 1];
          if (last && last.enemyId === enemyId && w.tick - last.tick < 15) continue;
          b.inbox.push({ deliver: w.tick + delay, enemyId, pos: { ...e.pos }, tick: w.tick });
        }
      }
    }
    for (const b of this.bots.values()) {
      while (b.inbox.length && b.inbox[0].deliver <= w.tick) {
        const m = b.inbox.shift()!;
        const cur = b.enemies.get(m.enemyId);
        // messages never refresh information that is already newer
        if (!cur || cur.tick < m.tick) b.enemies.set(m.enemyId, { pos: m.pos, tick: m.tick, own: false });
      }
      if (b.inbox.length > 200) b.inbox.splice(0, b.inbox.length - 200);
    }
  }

  private absorbHearing(a: Actor, b: BotState) {
    const w = this.w;
    const delay = secs(this.diff.comm);
    for (const h of w.heard[a.team]) {
      if (b.heardIds.has(h.soundId)) continue;
      const mine = h.listenerId === a.id;
      if (!mine && w.tick - h.tick < delay) continue;
      b.heardIds.add(h.soundId);
      b.sounds.push({ pos: h.estimate, tick: h.tick, unc: h.uncertainty, kind: h.kind });
    }
    b.sounds = b.sounds.filter((s) => w.tick - s.tick < secs(5));
    if (b.heardIds.size > 600) b.heardIds = new Set([...b.heardIds].slice(-300));
  }

  private perceive(a: Actor, b: BotState): Perception {
    const w = this.w;
    const visible: Actor[] = [];
    for (const e of w.actors) {
      if (e.team === a.team || !e.alive) continue;
      if (canSee(w, a.pos, e.pos)) {
        visible.push(e);
        b.enemies.set(e.id, { pos: { ...e.pos }, tick: w.tick, own: true });
      }
    }
    for (const [id] of b.enemies) {
      const e = w.actor(id);
      // a death we saw or were told about (kill feed) clears the memory
      if (e && !e.alive) b.enemies.delete(id);
    }
    // seeing an empty last-known spot downgrades the memory to "moved on"
    for (const [id, m] of b.enemies) {
      if (visible.some((v) => v.id === id)) continue;
      if (w.tick - m.tick > secs(8)) b.enemies.delete(id);
      else if (dist(a.pos, m.pos) < 1.2) b.enemies.delete(id);
    }
    const memories = [...b.enemies.entries()].filter(([id]) => !visible.some((v) => v.id === id)).map(([id, m]) => ({ id, pos: m.pos, tick: m.tick }));
    return { visible, memories, sounds: b.sounds };
  }

  // ---------- per tick ----------

  private botTick(a: Actor, b: BotState): ActorIntent {
    const w = this.w;
    const intent = emptyIntent();
    const p = this.perceive(a, b);
    const side = a.side;

    if (w.tick - b.lastThink >= 6 || b.task.kind === 'idle') {
      b.lastThink = w.tick;
      this.decide(a, b, p, side);
    }

    const engaged = this.combat(a, b, p, intent);
    this.executeTask(a, b, p, intent, engaged);
    if (!engaged) this.drivePuck(a, b, intent);
    if (!engaged) this.idleAim(a, b, p, intent);

    // reload discipline
    if (!engaged && a.mag < a.weapon.magazine * 0.4 && a.reserve > 0 && !a.interaction && b.task.kind !== 'arm' && b.task.kind !== 'shutoff') intent.reload = true;
    return intent;
  }

  /** The shared puck this bot may drive (attack support, prep, nobody human driving it). */
  private puckFor(a: Actor): PuckEntity | null {
    const w = this.w;
    if (w.phase !== 'prep' || a.side !== 'attack') return null;
    const pk = w.entities.find((e): e is PuckEntity => e.kind === 'puck' && e.team === a.team);
    if (!pk) return null;
    const driver = w.actor(pk.driverId);
    if (driver && driver.controller === 'human') return null;
    return pk;
  }

  private drivePuck(a: Actor, b: BotState, intent: ActorIntent) {
    const w = this.w;
    if (b.role !== 'support' || a.controller !== 'bot') return;
    const pk = this.puckFor(a);
    if (!pk) return;
    const goal = w.map.console.center;
    if (dist(pk.pos, goal) < 3.5) {
      intent.puck = { x: 0, y: 0 };
      return;
    }
    if (!b.puckPath.length || w.tick % 60 === 0) {
      const r = findPath(w, 'free', pk.pos, goal);
      b.puckPath = r ? r.points.slice(1) : [];
    }
    while (b.puckPath.length && dist(pk.pos, b.puckPath[0]) < 0.35) b.puckPath.shift();
    const next = b.puckPath[0];
    if (!next) return;
    const d = dist(pk.pos, next) || 1;
    intent.puck = { x: (next.x - pk.pos.x) / d, y: (next.y - pk.pos.y) / d };
  }

  /** Defenders shoot a scouting puck they can actually see (same reaction rules as actors). */
  private shootPuck(a: Actor, b: BotState, intent: ActorIntent): boolean {
    const w = this.w;
    if (a.side !== 'defence') return false;
    const pk = w.entities.find((e): e is PuckEntity => e.kind === 'puck' && e.team !== a.team);
    if (!pk || !canSee(w, a.pos, pk.pos)) return false;
    if (b.targetId !== -pk.id) {
      b.targetId = -pk.id;
      b.acquiredTick = w.tick;
      b.reactionTicks = secs(w.rng.range(this.diff.reaction[0], this.diff.reaction[1]));
    }
    const ang = angleTo(a.pos, pk.pos);
    const maxTurn = this.diff.turnRate / 60;
    const delta = normAngle(ang - a.facing);
    intent.aim = a.facing + Math.max(-maxTurn, Math.min(maxTurn, delta));
    intent.fire = w.tick - b.acquiredTick >= b.reactionTicks && Math.abs(delta) < 0.12 && canShoot(w, a);
    b.status = 'Fighting';
    return true;
  }

  private combat(a: Actor, b: BotState, p: Perception, intent: ActorIntent): boolean {
    const w = this.w;
    if (p.visible.length === 0) {
      if (this.shootPuck(a, b, intent)) return true;
      b.targetId = null;
      return false;
    }
    let target = p.visible.find((v) => v.id === b.targetId) ?? null;
    if (!target) {
      target = p.visible.reduce((best, v) => (dist(a.pos, v.pos) < dist(a.pos, best.pos) ? v : best), p.visible[0]);
      b.targetId = target.id;
      b.acquiredTick = w.tick;
      b.reactionTicks = secs(w.rng.range(this.diff.reaction[0], this.diff.reaction[1]));
      b.aimOffset = (w.rng.next() < 0.5 ? -1 : 1) * this.diff.aimStart * w.rng.range(0.6, 1.0);
    }
    // committed shutdown in the final seconds: keep holding rather than turning to fight
    if (a.interaction && a.interaction.kind === 'shutoff' && w.secondsLeft() < 3.5) {
      intent.interact = true;
      return true;
    }
    const since = (w.tick - b.acquiredTick) / 60;
    const settle = Math.min(1, since / this.diff.settle);
    const noise = w.rng.gauss() * this.diff.aimBase * 0.5;
    const offset = b.aimOffset * (1 - settle) + noise;
    const desired = angleTo(a.pos, target.pos) + offset;
    const maxTurn = this.diff.turnRate / 60;
    const delta = normAngle(desired - a.facing);
    intent.aim = a.facing + Math.max(-maxTurn, Math.min(maxTurn, delta));
    const d = dist(a.pos, target.pos);
    const range = a.weapon.effective_range_tiles * (a.weapon.pellets > 1 ? 1.7 : 1.6);
    const err = Math.abs(normAngle(intent.aim - angleTo(a.pos, target.pos)));
    const tol = Math.max(0.05, Math.atan2(0.45, d)) + 0.04;
    if (w.tick - b.acquiredTick >= b.reactionTicks && err < tol && d <= range && canShoot(w, a)) intent.fire = true;
    if (a.mag === 0 && a.reserve > 0) intent.reload = true;
    b.holdInteract = false;
    b.status = 'Fighting';
    // footwork: small strafes; low health backs away from the threat
    if (this.diff.strafe && w.tick >= b.strafeUntil) {
      b.strafeDir = w.rng.next() < 0.5 ? -1 : 1;
      b.strafeUntil = w.tick + secs(w.rng.range(0.35, 0.8));
    }
    const ang = angleTo(a.pos, target.pos);
    let mx = 0;
    let my = 0;
    if (this.diff.strafe) {
      mx += Math.cos(ang + Math.PI / 2) * b.strafeDir * 0.55;
      my += Math.sin(ang + Math.PI / 2) * b.strafeDir * 0.55;
    }
    if (a.hp < 40 && d < 6) {
      mx -= Math.cos(ang) * 0.8;
      my -= Math.sin(ang) * 0.8;
    } else if (d > range * 0.85) {
      mx += Math.cos(ang) * 0.7;
      my += Math.sin(ang) * 0.7;
    } else if (a.weapon.pellets > 1 && d > 3) {
      mx += Math.cos(ang) * 0.6;
      my += Math.sin(ang) * 0.6;
    }
    intent.move = { x: mx, y: my };
    return true;
  }

  private idleAim(a: Actor, b: BotState, p: Perception, intent: ActorIntent) {
    const w = this.w;
    let look: number | null = null;
    const recentEnemy = p.memories.filter((m) => w.tick - m.tick < secs(4)).sort((x, y) => y.tick - x.tick)[0];
    const recentSound = p.sounds.filter((s) => w.tick - s.tick < secs(2.5) && s.kind !== 'voice').sort((x, y) => y.tick - x.tick)[0];
    if (recentEnemy) look = angleTo(a.pos, recentEnemy.pos);
    else if (recentSound) look = angleTo(a.pos, recentSound.pos);
    else if ((b.task.kind === 'hold' || b.task.kind === 'goto') && b.task.face !== null && b.path.length === 0) look = b.task.face;
    else if (Math.hypot(intent.move.x, intent.move.y) > 0.1) look = Math.atan2(intent.move.y, intent.move.x);
    if (b.task.kind === 'breach' && b.task.stage !== 'approach') look = b.task.aimAngle;
    if (look !== null && intent.aim === null) {
      const maxTurn = (this.diff.turnRate * 0.7) / 60;
      const delta = normAngle(look - a.facing);
      intent.aim = a.facing + Math.max(-maxTurn, Math.min(maxTurn, delta));
    }
  }

  // ---------- strategy ----------

  private decide(a: Actor, b: BotState, p: Perception, side: Side) {
    const w = this.w;
    // player orders override ordinary utility (not self-preservation; combat still runs)
    if (a.team === 0 && b.order.kind !== 'auto') {
      const human = w.human();
      if (b.order.kind === 'follow' && human && human.alive) {
        const back = { x: human.pos.x - Math.cos(human.facing) * 1.6 + (b.id % 2 ? 0.9 : -0.9) * Math.sin(human.facing), y: human.pos.y - Math.sin(human.facing) * 1.6 - (b.id % 2 ? 0.9 : -0.9) * Math.cos(human.facing) };
        const target = dist(a.pos, human.pos) > 2.6 || b.task.kind !== 'goto' ? back : (b.task as { pos: Vec }).pos;
        b.task = { kind: 'goto', pos: target, face: human.facing, label: 'Following' };
        return;
      }
      if (b.order.kind === 'hold') {
        b.task = { kind: 'hold', pos: b.order.pos, face: null, label: 'Holding' };
        return;
      }
    }
    if (side === 'attack') this.decideAttack(a, b, p);
    else this.decideDefence(a, b, p);
  }

  private chooseInvestigate(a: Actor, _b: BotState, p: Perception, maxDist: number): Vec | null {
    const w = this.w;
    const mem = p.memories.filter((m) => w.tick - m.tick < secs(5)).sort((x, y) => y.tick - x.tick)[0];
    if (mem && dist(a.pos, mem.pos) < maxDist) return mem.pos;
    const snd = p.sounds.filter((s) => w.tick - s.tick < secs(3) && (s.kind === 'step' || s.kind === 'shot' || s.kind === 'breach')).sort((x, y) => y.tick - x.tick)[0];
    if (snd && dist(a.pos, snd.pos) < maxDist) return snd.pos;
    return null;
  }

  private decideAttack(a: Actor, b: BotState, p: Perception) {
    const w = this.w;
    const team = a.team;
    if (w.phase === 'prep') {
      b.task = { kind: 'hold', pos: { ...a.pos }, face: -Math.PI / 2, label: b.role === 'support' && this.puckFor(a) ? 'Scouting' : 'Ready' };
      return;
    }
    const console = w.map.console;
    // armed: hold around the console
    if (w.phase === 'armed') {
      const mates = w.actors.filter((x) => x.team === team && x.alive && (x.controller === 'bot' || x.id === a.id));
      const idx = Math.max(0, mates.findIndex((x) => x.id === a.id));
      const spot = ATTACK_HOLD_SPOTS[idx % ATTACK_HOLD_SPOTS.length];
      b.task = { kind: 'hold', pos: spot, face: angleTo(spot, w.map.doors.find((d) => d.id === (idx % 2 ? 'Q' : 'P'))!.center), label: 'Holding' };
      return;
    }
    // continue an active breach
    if (b.task.kind === 'breach') {
      const t = b.task;
      const done = t.target >= 100 ? !w.barricades[t.target - 100] : w.soft[t.target].state !== 'intact';
      if (!done && w.tick - t.startTick < secs(14)) return;
    }
    if (b.task.kind === 'arm' && distToCells(w, a.pos, console.cells) < 3) return;

    // planter selection: one bot, never stacking on the console
    const living = w.actors.filter((x) => x.team === team && x.alive);
    const humanArming = living.some((x) => x.controller === 'human' && x.interaction?.kind === 'arm');
    let planter = w.actor(this.planterId[team]);
    if (!planter || !planter.alive || (planter.controller !== 'bot' && planter.id !== a.id)) {
      const bots = living.filter((x) => x.controller === 'bot');
      // dev autopilot drives the human with this same logic; it may plant when no bot can
      planter = bots.sort((x, y) => dist(x.pos, console.center) - dist(y.pos, console.center))[0] ?? (a.controller === 'human' ? a : undefined);
      this.planterId[team] = planter?.id ?? -1;
    }

    // team breach plan: cheapest route to the console, allowing breachable surfaces
    const canBreach = living.some((x) => (x.operatorId === 'ram' && x.gadgetCharges > 0) || x.breachCharges > 0);
    const route = findPath(w, 'attack', a.pos, console.center, canBreach ? { breachCost: 7 } : {});
    if (route && route.breaches.length > 0) {
      const tgt = route.breaches[0];
      const assigned = [...this.bots.values()].find((o) => o.id !== b.id && o.task.kind === 'breach' && o.task.target === tgt && w.actor(o.id)?.alive && w.actor(o.id)?.controller === 'bot');
      if (!assigned) {
        const plan = this.planBreach(a, tgt);
        if (plan) {
          b.task = plan;
          return;
        }
      } else {
        // stack up near the breach and wait for the opening
        const where = tgt >= 100 ? w.map.doors[tgt - 100].center : w.map.softGroups[tgt].center;
        const stand = this.stackPoint(a, where);
        b.task = { kind: 'goto', pos: stand, face: angleTo(stand, where), label: 'Ready' };
        return;
      }
    }

    if (planter && planter.id === a.id && (!humanArming || a.controller === 'human')) {
      b.task = { kind: 'arm' };
      return;
    }
    // investigate fresh contacts on the way, otherwise escort toward the console
    const inv = this.chooseInvestigate(a, b, p, 7);
    if (inv && b.role !== 'support') {
      b.task = { kind: 'goto', pos: inv, face: null, label: 'Moving' };
      return;
    }
    const mates = living.filter((x) => x.controller === 'bot' && x.id !== this.planterId[team]);
    const idx = Math.max(0, mates.findIndex((x) => x.id === a.id));
    const spot = ATTACK_HOLD_SPOTS[(idx + 1) % ATTACK_HOLD_SPOTS.length];
    b.task = { kind: 'goto', pos: spot, face: angleTo(spot, console.center) + Math.PI, label: 'Moving' };
  }

  private stackPoint(a: Actor, where: Vec): Vec {
    const ang = angleTo(where, a.pos);
    for (const r of [2.6, 2.2, 3.2]) {
      for (const off of [0.6, -0.6, 1.2, -1.2, 0]) {
        const p = { x: where.x + Math.cos(ang) * r + Math.cos(ang + Math.PI / 2) * off, y: where.y + Math.sin(ang) * r + Math.sin(ang + Math.PI / 2) * off };
        const g = navGrid(this.w, 'attack');
        const i = Math.floor(p.y) * g.w + Math.floor(p.x);
        if (g.walk[i]) return p;
      }
    }
    return { ...a.pos };
  }

  private planBreach(a: Actor, target: number): Task | null {
    const w = this.w;
    const isDoor = target >= 100;
    const center = isDoor ? w.map.doors[target - 100].center : w.map.softGroups[target].center;
    const horizontal = isDoor ? w.map.doors[target - 100].horizontal : w.map.softGroups[target].horizontal;
    const normal = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const sideSign = (a.pos.x - center.x) * normal.x + (a.pos.y - center.y) * normal.y >= 0 ? 1 : -1;
    const g = navGrid(w, 'attack');
    const ok = (p: Vec) => g.walk[Math.floor(p.y) * g.w + Math.floor(p.x)] === 1;
    const useSled = a.operatorId === 'ram' && validateRamLaunch(w, a).ok;
    if (useSled) {
      for (const r of [2.6, 2.1, 3.1]) {
        for (const lat of [0, 0.4, -0.4]) {
          const stand = {
            x: center.x + normal.x * sideSign * r + normal.y * lat,
            y: center.y + normal.y * sideSign * r + normal.x * lat,
          };
          if (!ok(stand)) continue;
          const ang = angleTo(stand, center);
          const prev = previewSledPath(w, stand, ang);
          if ((!isDoor && prev.breachGroup === target) || (isDoor && prev.breachDoor === target - 100))
            return { kind: 'breach', target, stage: 'approach', stand, aimAngle: ang, useSled: true, startTick: w.tick };
        }
      }
    }
    if (a.breachCharges > 0 || isDoor) {
      for (const r of [0.95, 1.1]) {
        const stand = { x: center.x + normal.x * sideSign * r, y: center.y + normal.y * sideSign * r };
        if (ok(stand)) return { kind: 'breach', target, stage: 'approach', stand, aimAngle: angleTo(stand, center), useSled: false, startTick: w.tick };
      }
    }
    return null;
  }

  private decideDefence(a: Actor, b: BotState, p: Perception) {
    const w = this.w;
    const team = a.team;
    const console = w.map.console;
    if (w.phase === 'prep') {
      if (b.task.kind === 'prepInteract' || b.task.kind === 'placeHinge') {
        if (this.prepJobStillValid(a, b.task)) return;
        for (const [k, v] of this.reserved) if (v === a.id) this.reserved.delete(k);
      }
      const job = this.nextPrepJob(a);
      if (job) {
        b.task = job;
        return;
      }
      this.defenceHold(a, b);
      return;
    }
    if (w.phase === 'armed') {
      const defenders = w.actors.filter((x) => x.team === team && x.alive);
      const humanShutting = defenders.some((x) => x.controller === 'human' && x.interaction?.kind === 'shutoff');
      const closest = defenders.filter((x) => x.controller === 'bot').sort((x, y) => dist(x.pos, console.center) - dist(y.pos, console.center))[0];
      if (!humanShutting && closest && closest.id === a.id) {
        b.task = { kind: 'shutoff' };
        return;
      }
      const spot = DEFENCE_SPOTS.anchor[0];
      b.task = { kind: 'goto', pos: { x: console.center.x + (b.id % 2 ? 2.5 : -1.2), y: console.center.y + 2.4 }, face: spot.face, label: 'Moving' };
      return;
    }
    // Hinge: rotate when a known threat would gain a line to the console the wall could deny
    if (a.operatorId === 'hinge') this.considerHingeRotate(a, b, p);
    if (b.role === 'roamer') {
      const inv = this.chooseInvestigate(a, b, p, 9);
      if (inv && w.map.interior[Math.floor(inv.y) * w.map.w + Math.floor(inv.x)]) {
        b.task = { kind: 'investigate', pos: inv, until: w.tick + secs(4) };
        return;
      }
    } else if (b.task.kind === 'investigate' && w.tick < b.task.until) return;
    this.defenceHold(a, b);
  }

  private defenceHold(a: Actor, b: BotState) {
    const w = this.w;
    const list = DEFENCE_SPOTS[b.role as 'anchor' | 'support' | 'roamer'] ?? DEFENCE_SPOTS.support;
    // only hold spots still connected to the objective (barricades may have cut rooms off)
    const linked = (p: Vec) => !!findPath(w, 'defence', w.map.console.center, p);
    const rotated = [...list.slice((b.id + Math.floor(w.tick / secs(20))) % list.length), ...list];
    const pick = rotated.find((s) => linked(s.pos)) ?? [...DEFENCE_SPOTS.anchor, ...DEFENCE_SPOTS.support].find((s) => linked(s.pos));
    if (!pick) {
      b.task = { kind: 'hold', pos: { ...a.pos }, face: null, label: 'Holding' };
      return;
    }
    if (b.task.kind === 'hold' && dist(b.task.pos, pick.pos) < 0.1) return;
    b.task = { kind: 'hold', pos: pick.pos, face: pick.face, label: 'Holding' };
  }

  private prepJobStillValid(a: Actor, t: Task): boolean {
    const w = this.w;
    if (t.kind === 'prepInteract') {
      if (t.interact === 'reinforce') return w.soft[t.target].state === 'intact' && w.resources[a.team].reinforcements > 0;
      return !w.barricades[t.target] && w.resources[a.team].barricades > 0;
    }
    if (t.kind === 'placeHinge') return a.gadgetCharges > 0;
    return false;
  }

  private nextPrepJob(a: Actor): Task | null {
    const w = this.w;
    const res = w.resources[a.team];
    const free = (k: string) => !this.reserved.has(k) || this.reserved.get(k) === a.id || !w.actor(this.reserved.get(k)!)?.alive;
    if (a.operatorId === 'hinge' && a.gadgetCharges > 0 && free('hinge')) {
      for (const s of HINGE_SOCKETS) {
        // validate as if standing next to the socket (bot walks there first)
        const probe = { ...a, pos: { x: s.x, y: s.y + (s.vertical ? 0 : 1.2) } } as Actor;
        if (s.vertical) probe.pos = { x: s.x + 1.2, y: s.y };
        if (validateHingePlacement(w, probe, { x: s.x, y: s.y }, s.vertical).ok) {
          this.reserved.set('hinge', a.id);
          return { kind: 'placeHinge', pos: { x: s.x, y: s.y }, vertical: s.vertical };
        }
      }
    }
    // reinforce panels that open straight into the objective room first
    const softOrder = w.map.softGroups.filter((g) => g.rooms.includes(w.map.objectiveRoom)).concat(w.map.softGroups.filter((g) => !g.rooms.includes(w.map.objectiveRoom)));
    if (res.reinforcements > 0)
      for (const g of softOrder) {
        const k = `soft${g.index}`;
        if (w.soft[g.index].state !== 'intact' || !free(k)) continue;
        if ([...this.reserved.keys()].filter((x) => x.startsWith('soft')).length >= res.reinforcements && !this.reserved.has(k)) break;
        const stand = this.interiorStand(g.center, g.horizontal);
        if (!stand) continue;
        this.reserved.set(k, a.id);
        return { kind: 'prepInteract', interact: 'reinforce', target: g.index, stand };
      }
    if (res.barricades > 0)
      for (const d of w.map.doors) {
        const k = `door${d.index}`;
        if (d.protected || w.barricades[d.index] || !free(k)) continue;
        if ([...this.reserved.keys()].filter((x) => x.startsWith('door')).length >= res.barricades && !this.reserved.has(k)) break;
        const stand = this.interiorStand(d.center, d.horizontal);
        if (!stand) continue;
        this.reserved.set(k, a.id);
        return { kind: 'prepInteract', interact: 'barricade', target: d.index, stand };
      }
    return null;
  }

  /** A standing spot inside the building next to a wall feature. */
  private interiorStand(c: Vec, horizontal: boolean): Vec | null {
    const w = this.w;
    const g = navGrid(w, 'defence');
    const goal = w.map.console.center;
    const sides = [1, -1]
      .map((s) => (horizontal ? { x: c.x, y: c.y + s } : { x: c.x + s, y: c.y }))
      .sort((p, q) => dist(p, goal) - dist(q, goal));
    // work from the objective side so defenders never seal themselves out
    for (const p of sides) {
      const i = Math.floor(p.y) * w.map.w + Math.floor(p.x);
      if (g.walk[i] && w.map.interior[i]) return p;
    }
    return null;
  }

  private considerHingeRotate(a: Actor, b: BotState, p: Perception) {
    const w = this.w;
    const h = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
    if (!h || h.state !== 'idle' || w.tick < h.cooldownUntil || dist(a.pos, h.center) > 6) return;
    const threats = [
      ...p.memories.filter((m) => w.tick - m.tick < secs(3)).map((m) => m.pos),
      ...p.sounds.filter((s) => w.tick - s.tick < secs(2)).map((s) => s.pos),
    ].filter((t) => dist(t, h.center) < 9);
    if (!threats.length) return;
    const guard = w.map.console.center;
    const blocks = (angle: number, t: Vec) => rayObb(t, { x: guard.x - t.x, y: guard.y - t.y }, hingeObb({ center: h.center, angle })) !== null;
    const other = h.orient === 0 ? h.angle + Math.PI / 2 : h.angle - Math.PI / 2;
    const gainNow = threats.filter((t) => blocks(h.angle, t)).length;
    const gainOther = threats.filter((t) => blocks(other, t)).length;
    if (gainOther > gainNow) {
      (b as BotState & { wantRotate?: boolean }).wantRotate = true;
    }
  }

  // ---------- execution ----------

  private executeTask(a: Actor, b: BotState, _p: Perception, intent: ActorIntent, engaged: boolean) {
    const w = this.w;
    const t = b.task;
    const ext = b as BotState & { wantRotate?: boolean };
    if (ext.wantRotate) {
      intent.gadget = { type: 'hingeRotate' };
      ext.wantRotate = false;
    }
    const goTo = (pos: Vec, arrive = 0.35): boolean => {
      if (engaged) return dist(a.pos, pos) <= arrive;
      return this.followPath(a, b, pos, arrive, intent);
    };
    switch (t.kind) {
      case 'idle':
        b.status = '';
        return;
      case 'goto':
      case 'hold': {
        const arrived = goTo(t.pos, t.kind === 'hold' ? 0.5 : 0.6);
        if (!engaged) b.status = arrived ? (t.label === 'Following' ? 'Following' : t.kind === 'hold' ? 'Holding' : 'Ready') : b.blockedSince > 0 ? 'Blocked' : t.label || 'Moving';
        return;
      }
      case 'investigate': {
        if (goTo(t.pos, 1.0)) b.task = { kind: 'idle' };
        if (!engaged) b.status = 'Moving';
        return;
      }
      case 'breach': {
        if (!engaged) b.status = 'Breaching';
        if (t.stage === 'approach') {
          if (goTo(t.stand, 0.22)) {
            t.stage = 'act';
            t.startTick = w.tick;
          }
          return;
        }
        if (t.stage === 'act') {
          if (engaged) return;
          const err = Math.abs(normAngle(a.facing - t.aimAngle));
          intent.aim = t.aimAngle;
          if (t.useSled) {
            if (err < 0.05) {
              intent.gadget = { type: 'ramLaunch', angle: t.aimAngle };
              t.stage = 'wait';
              t.startTick = w.tick;
            }
          } else if (a.breachCharges > 0) {
            const opt = bestInteract(w, a);
            if (opt && opt.kind === 'breach' && opt.enabled) {
              intent.interact = !(a.interactHeldLastTick && !a.interaction);
              if (a.interaction?.kind === 'breach') intent.interact = true;
            }
            if (a.breachCharges === 0 || w.tick - t.startTick > secs(3)) {
              t.stage = 'wait';
              t.startTick = w.tick;
            }
          } else {
            // barricade without a charge: shoot it down
            intent.fire = err < 0.1 && canShoot(w, a);
          }
          return;
        }
        // wait: step aside from the blast and hold the angle
        const side = { x: t.stand.x + Math.cos(t.aimAngle + Math.PI / 2) * 1.2 - Math.cos(t.aimAngle) * 0.8, y: t.stand.y + Math.sin(t.aimAngle + Math.PI / 2) * 1.2 - Math.sin(t.aimAngle) * 0.8 };
        if (!t.useSled) goTo(side, 0.3);
        if (w.tick - t.startTick > secs(4)) b.task = { kind: 'idle' };
        return;
      }
      case 'arm': {
        const stand = this.consoleStand(a);
        if (!engaged && goTo(stand, 0.3)) {
          b.status = 'Arming';
          const recentThreat = [...b.enemies.values()].some((m) => w.tick - m.tick < secs(1.2) && dist(m.pos, a.pos) < 8);
          const opt = bestInteract(w, a);
          if (!recentThreat && opt && opt.kind === 'arm') {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
          }
        } else if (!engaged) b.status = 'Moving';
        return;
      }
      case 'shutoff': {
        const stand = this.consoleStand(a);
        const urgent = w.secondsLeft() < 9;
        if ((!engaged || urgent) && goTo(stand, 0.3)) {
          b.status = 'Arming';
          const opt = bestInteract(w, a);
          if (opt && opt.kind === 'shutoff') {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
            if (a.interaction) intent.fire = false;
          }
        }
        return;
      }
      case 'prepInteract': {
        if (goTo(t.stand, 0.25)) {
          const opt = bestInteract(w, a);
          if (opt && opt.kind === t.interact && opt.target === t.target && opt.enabled) {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
          } else if (!a.interaction) {
            // something else is closer/prioritised: nudge toward the feature
            const c = t.interact === 'reinforce' ? w.map.softGroups[t.target].center : w.map.doors[t.target].center;
            intent.aim = angleTo(a.pos, c);
            if (w.tick % 30 === 0) b.task = { kind: 'idle' };
          }
        }
        b.status = 'Moving';
        return;
      }
      case 'placeHinge': {
        const stand = { x: t.pos.x + (t.vertical ? 1.3 : 0), y: t.pos.y + (t.vertical ? 0 : 1.3) };
        if (goTo(stand, 0.4)) {
          if (validateHingePlacement(w, a, t.pos, t.vertical).ok) intent.gadget = { type: 'hingePlace', x: t.pos.x, y: t.pos.y, vertical: t.vertical };
          else if (w.tick % 30 === 0) {
            this.reserved.delete('hinge');
            b.task = { kind: 'idle' };
          }
        }
        b.status = 'Moving';
        return;
      }
    }
  }

  private consoleStand(a: Actor): Vec {
    const c = this.w.map.console;
    const opts = [
      { x: c.center.x, y: c.center.y + 1.25 },
      { x: c.center.x, y: c.center.y - 1.25 },
      { x: c.center.x + 1.75, y: c.center.y },
      { x: c.center.x - 1.75, y: c.center.y },
    ];
    return opts.sort((x, y) => dist(x, a.pos) - dist(y, a.pos))[0];
  }

  /** Path following with repath on geometry change and stuck recovery (no teleporting). */
  private followPath(a: Actor, b: BotState, goal: Vec, arrive: number, intent: ActorIntent): boolean {
    const w = this.w;
    if (dist(a.pos, goal) <= arrive) {
      b.path = [];
      b.blockedSince = -1;
      return true;
    }
    const rev = `${w.geometryRevision}:${w.phase === 'prep' ? 'p' : 'a'}`;
    const goalMoved = !b.pathGoal || dist(b.pathGoal, goal) > 0.5;
    if (goalMoved || b.pathRev !== rev || b.path.length === 0) {
      const r = findPath(w, a.side, a.pos, goal);
      b.pathGoal = { ...goal };
      b.pathRev = rev;
      b.path = r ? smooth(w, a.pos, r.points) : [];
      b.breakDoor = -1;
      if (!r) {
        // sealed in or out by a barricade: walk up to it and shoot it down (any team's)
        const r2 = findPath(w, a.side, a.pos, goal, { breachCost: 8 });
        const door = r2?.breaches.find((x) => x >= 100);
        if (r2 && door !== undefined) {
          const g = navGrid(w, a.side);
          const cut = r2.cells.findIndex((c) => !g.walk[c]);
          b.path = smooth(w, a.pos, r2.points.slice(0, Math.max(1, cut)));
          b.breakDoor = door - 100;
        } else {
          if (b.blockedSince < 0) b.blockedSince = w.tick;
          if (w.tick - b.blockedSince > secs(2)) b.task = { kind: 'idle' };
          return false;
        }
      }
    }
    if (b.breakDoor >= 0) {
      const dc = w.map.doors[b.breakDoor].center;
      if (!w.barricades[b.breakDoor]) {
        b.breakDoor = -1;
        b.path = [];
      } else if (dist(a.pos, dc) < 1.7) {
        const ang = angleTo(a.pos, dc);
        intent.aim = ang;
        intent.fire = Math.abs(normAngle(a.facing - ang)) < 0.15 && canShoot(w, a);
        return false;
      }
    }
    if (a.vaulting) return false;
    while (b.path.length > 1 && !b.path[0].vault) {
      if (dist(a.pos, b.path[0]) < 0.3 || (!b.path[1].vault && walkable(w, a.pos, b.path[1]))) b.path.shift();
      else break;
    }
    if (b.path[0]?.vault && dist(a.pos, b.path[0]) < 0.45) b.path.shift();
    let next: Vec | undefined = b.path[0];
    if (!next) return false;
    const vault = b.path[0].vault;
    if (vault) {
      // walk to the near landing, then vault through the authored link
      if (dist(a.pos, vault.from) < 0.6) {
        intent.interact = !a.interactHeldLastTick;
        intent.move = { x: 0, y: 0 };
        return false;
      }
      next = vault.from;
    }
    let dx = next.x - a.pos.x;
    let dy = next.y - a.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05 && b.path.length === 1) {
      b.path = [];
      return dist(a.pos, goal) <= arrive + 0.3;
    }
    dx /= d || 1;
    dy /= d || 1;
    // gentle ally avoidance, never standing in the human's line of fire for long
    for (const o of w.actors) {
      if (o.id === a.id || !o.alive || o.team !== a.team) continue;
      const od = dist(a.pos, o.pos);
      if (od < 0.9 && od > 0.01) {
        dx += ((a.pos.x - o.pos.x) / od) * 0.35;
        dy += ((a.pos.y - o.pos.y) / od) * 0.35;
      }
      if (o.controller === 'human' && od < 5) {
        const fx = Math.cos(o.facing);
        const fy = Math.sin(o.facing);
        const rx = a.pos.x - o.pos.x;
        const ry = a.pos.y - o.pos.y;
        const along = rx * fx + ry * fy;
        const lateral = rx * -fy + ry * fx;
        if (along > 0 && Math.abs(lateral) < 0.6 && o.interactHeldLastTick === false) {
          const s = lateral >= 0 ? 1 : -1;
          dx += -fy * s * 0.6;
          dy += fx * s * 0.6;
        }
      }
    }
    const slow = d < 0.6 && b.path.length === 1 ? Math.max(0.35, d / 0.6) : 1;
    const m = Math.hypot(dx, dy) || 1;
    intent.move = { x: (dx / m) * slow, y: (dy / m) * slow };
    // stuck detection: 0.6s without progress -> repath; 2s -> abandon and report Blocked
    if (dist(a.pos, b.progressPos) > 0.3) {
      b.progressPos = { ...a.pos };
      b.progressTick = w.tick;
      b.blockedSince = -1;
    } else if (w.tick - b.progressTick > secs(0.6)) {
      b.path = [];
      if (b.blockedSince < 0) b.blockedSince = w.tick;
      if (w.tick - b.blockedSince > secs(2)) {
        b.task = { kind: 'idle' };
        b.status = 'Blocked';
        b.blockedSince = -1;
        b.progressTick = w.tick;
      }
    }
    return false;
  }
}
