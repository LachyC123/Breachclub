// Bot director. Each bot builds a perception snapshot (own sight/hearing, delayed teammate
// reports, drone tags), decides a task a few times per second, then fights, moves and aims every
// tick through the same ActorIntent interface the player uses. Strategy lives in attack.ts and
// defence.ts; gunfights in combat.ts; movement in locomotion.ts.
import { secs } from '../content/defs';
import { dist, normAngle } from '../sim/geometry';
import { bestInteract } from '../sim/interact';
import { validateHingePlacement } from '../sim/gadgets';
import { canShoot } from '../sim/combat';
import type { Actor, ActorIntent, TeamId, Vec } from '../sim/types';
import { emptyIntent } from '../sim/types';
import type { World } from '../sim/world';
import { DIFFICULTY, type BotState, type DiffParams, type Order, type Perception, type Role } from './types';
import { absorbHearing, perceive, shareIntel, threatPoints } from './memory';
import { followPath } from './locomotion';
import { engage, idleAim } from './combat';
import { advancePlan, breacherFor, buildAttackPlan, driveDrone, escortGoal, planBreach, postPlantTask, slotOffset, type AttackPlan } from './attack';
import { DefenceBrain } from './defence';
import { dangerField, nextPortalAlong } from './tactics';

export type { Order, BotStatus } from './types';
export { DIFFICULTY } from './types';

export class AIDirector {
  bots = new Map<number, BotState>();
  diff: DiffParams;
  private defence: DefenceBrain;
  private plans: [AttackPlan | null, AttackPlan | null] = [null, null];
  private planTried: [number, number] = [-999, -999];

  constructor(private w: World) {
    this.diff = DIFFICULTY[w.cfg.difficulty];
    this.defence = new DefenceBrain(w);
    for (const team of [0, 1] as TeamId[]) {
      const members = w.actors.filter((a) => a.team === team);
      const side = w.sideOf(team);
      const roles: Role[] = side === 'attack' ? ['entry', 'support', 'flank'] : ['anchor', 'support', 'roamer'];
      members.forEach((a, i) => this.bots.set(a.id, this.newBot(a, roles[i % 3], i)));
    }
  }

  private newBot(a: Actor, role: Role, slot: number): BotState {
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
      breakDoor: -1,
      targetId: null,
      acquiredTick: 0,
      reactionTicks: 0,
      aimOffset: 0,
      burstEnd: 0,
      burstPauseEnd: 0,
      strafeDir: 1,
      strafeUntil: 0,
      fallback: null,
      fallbackCount: 0,
      fallbackWindow: 0,
      lastEngageTick: -999,
      status: '',
      order: { kind: 'auto' },
      lastThink: -100 - slot * 2,
      heardIds: new Set(),
      dronePath: [],
      droneGoal: 0,
      wantRotate: false,
      slot,
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
    b.fallback = null;
    this.defence.release(actorId);
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
    shareIntel(w, this.bots, this.diff);
    for (const team of [0, 1] as TeamId[]) {
      const plan = this.plans[team];
      if (plan && w.phase !== 'prep') advancePlan(w, plan, this.bots);
    }
    for (const a of w.actors) {
      const b = this.bots.get(a.id);
      if (!b) continue;
      if (!a.alive) {
        this.defence.release(a.id);
        continue;
      }
      absorbHearing(w, a, b, this.diff);
      if (a.controller !== 'bot') continue;
      out.set(a.id, this.botTick(a, b));
    }
    return out;
  }

  private human(): Actor | undefined {
    return this.w.actors.find((a) => a.controller === 'human' && a.alive);
  }

  /** Bots on the player's attacking squad escort the player unless told to push. */
  private escorting(a: Actor, b: BotState): boolean {
    if (a.team !== 0 || a.side !== 'attack' || a.controller !== 'bot') return false;
    if (b.order.kind === 'push') return false;
    const h = this.human();
    return !!h && h.team === a.team;
  }

  private botTick(a: Actor, b: BotState): ActorIntent {
    const w = this.w;
    const intent = emptyIntent();
    const p = perceive(w, a, b);
    if (w.tick - b.lastThink >= 6 || b.task.kind === 'idle') {
      b.lastThink = w.tick;
      this.decide(a, b, p);
    }
    const droning = w.phase === 'prep' && a.side === 'attack';
    const holding = b.task.kind === 'hold' || b.task.kind === 'arm' || b.task.kind === 'shutoff';
    const engaged = !droning && engage(w, a, b, p, this.diff, intent, { hold: holding && a.side === 'defence' });
    const look = this.execute(a, b, p, intent, engaged);
    if (!engaged && !droning) idleAim(w, a, b, p, this.diff, intent, look);
    // reload in quiet moments, never mid-objective
    if (!engaged && a.mag < a.weapon.magazine * 0.5 && a.reserve > 0 && !a.interaction && b.task.kind !== 'arm' && b.task.kind !== 'shutoff') intent.reload = true;
    if (b.wantRotate) {
      intent.gadget = { type: 'hingeRotate' };
      b.wantRotate = false;
    }
    return intent;
  }

  private decide(a: Actor, b: BotState, p: Perception) {
    if (a.team === 0 && a.controller === 'bot' && b.order.kind === 'hold') {
      b.task = { kind: 'hold', pos: b.order.pos, watch: null, label: 'Holding' };
      return;
    }
    if (a.side === 'defence') return this.defence.decide(a, b, p);
    this.decideAttack(a, b);
  }

  private decideAttack(a: Actor, b: BotState) {
    const w = this.w;
    if (w.phase === 'prep') {
      b.task = { kind: 'drone' };
      return;
    }
    if (w.phase === 'armed') {
      if (b.task.kind !== 'hold' || b.status === 'Blocked') b.task = postPlantTask(w, b.slot);
      return;
    }
    if (this.escorting(a, b) || (a.team === 0 && b.order.kind === 'follow')) {
      const h = this.human();
      if (h && h.interaction?.kind === 'arm') {
        b.task = postPlantTask(w, b.slot);
        return;
      }
      b.task = { kind: 'escort' };
      return;
    }
    // continue an active breach until the panel is open (or it clearly failed)
    if (b.task.kind === 'breach') {
      const t = b.task;
      const done = t.target >= 100 ? !w.barricades[t.target - 100] : w.soft[t.target].state !== 'intact';
      if (!done && w.tick - t.startTick < secs(14)) return;
    }
    const team = a.team;
    let plan = this.plans[team];
    if (!plan || plan.stage >= plan.checkpoints.length) {
      if (w.tick - this.planTried[team] > secs(1)) {
        this.planTried[team] = w.tick;
        const living = w.actors.filter((x) => x.team === team && x.alive);
        const canBreach = living.some((x) => (x.operatorId === 'ram' && x.gadgetCharges > 0) || x.breachCharges > 0);
        const centroid = living.reduce((acc, x) => ({ x: acc.x + x.pos.x / living.length, y: acc.y + x.pos.y / living.length }), { x: 0, y: 0 });
        plan = buildAttackPlan(w, team, canBreach, centroid);
        this.plans[team] = plan;
      }
    }
    if (!plan) {
      b.task = { kind: 'goto', pos: { ...w.map.console.center }, watch: null, label: 'Moving' };
      return;
    }
    // breach the planned panel/barricade once the squad is stacked near it
    const pending = plan.breaches.find((t) => (t >= 100 ? !!w.barricades[t - 100] : w.soft[t].state === 'intact'));
    if (pending !== undefined && b.role !== 'flank') {
      const center = pending >= 100 ? w.map.doors[pending - 100].center : w.map.softGroups[pending].center;
      const breacher = breacherFor(w, team, pending, this.bots);
      if (breacher && breacher.id === a.id && dist(a.pos, center) < 9) {
        const t = planBreach(w, a, pending);
        if (t) {
          b.task = t;
          return;
        }
      }
    }
    const last = plan.checkpoints.length - 1;
    const isFlank = b.role === 'flank' && plan.flank;
    const stage = isFlank ? Math.min(plan.flankStage, plan.flank!.length - 1) : Math.min(plan.stage, last);
    const cps = isFlank ? plan.flank! : plan.checkpoints;
    if (stage >= cps.length - 1) {
      // on site: one planter (the closest), everyone else covers an entrance
      const living = w.actors.filter((x) => x.team === team && x.alive && x.controller === 'bot');
      const c = w.map.console.center;
      let planter = w.actor(plan.planterId);
      const closest = living.sort((x, y) => dist(x.pos, c) - dist(y.pos, c))[0];
      if (!planter || !planter.alive || planter.controller !== 'bot' || (closest && dist(closest.pos, c) + 3 < dist(planter.pos, c))) {
        planter = closest;
        plan.planterId = planter?.id ?? -1;
      }
      const humanArming = w.actors.some((x) => x.team === team && x.controller === 'human' && x.interaction?.kind === 'arm');
      if (planter && planter.id === a.id && !humanArming) b.task = { kind: 'arm' };
      else b.task = postPlantTask(w, b.slot);
      return;
    }
    const cp = cps[stage];
    const pos = slotOffset(cp, b.role === 'entry' ? 0 : b.slot);
    b.task = { kind: 'goto', pos, watch: cp.watch, label: cp.stack ? 'Stacked' : 'Moving', sneak: cp.stack };
  }

  /** Run the current task; returns a point worth looking at when nothing is visible. */
  private execute(a: Actor, b: BotState, p: Perception, intent: ActorIntent, engaged: boolean): Vec | null {
    const w = this.w;
    const t = b.task;
    const threats = threatPoints(w, p, 6);
    const danger = threats.length ? dangerField(w, threats) : undefined;
    const goTo = (pos: Vec, arrive = 0.35, sneak = false): boolean => {
      if (engaged) return dist(a.pos, pos) <= arrive;
      return followPath(w, a, b, pos, intent, { arrive, sneak, danger });
    };
    const aheadLook = () => (b.path.length ? nextPortalAlong(w, a.pos, b.path) : null);
    switch (t.kind) {
      case 'idle':
        if (!engaged) b.status = '';
        return null;
      case 'drone':
        driveDrone(w, a, b, intent);
        return null;
      case 'escort': {
        const h = this.human();
        if (!h) {
          b.task = { kind: 'idle' };
          return null;
        }
        const g = escortGoal(w, a, h, b.slot);
        const far = dist(a.pos, h.pos) > 3.2;
        if (far || dist(a.pos, g.pos) > 1.2) goTo(g.pos, 0.6, !far && h.vel.x * h.vel.x + h.vel.y * h.vel.y < 4);
        if (!engaged) b.status = 'Following';
        return far ? aheadLook() ?? g.watch : g.watch;
      }
      case 'goto':
      case 'hold': {
        const arrived = goTo(t.pos, t.kind === 'hold' ? 0.5 : 0.6, t.kind === 'goto' && !!t.sneak);
        if (!engaged) b.status = arrived ? (t.kind === 'hold' ? t.label || 'Holding' : t.label === 'Stacked' ? 'Stacked' : 'Ready') : b.status === 'Blocked' ? 'Blocked' : t.label === 'Rotating' ? 'Rotating' : 'Moving';
        return arrived ? t.watch : aheadLook() ?? t.watch;
      }
      case 'investigate':
        if (goTo(t.pos, 1.0, true) || w.tick > t.until) b.task = { kind: 'idle' };
        if (!engaged) b.status = 'Moving';
        return t.pos;
      case 'breach': {
        if (!engaged) b.status = 'Breaching';
        if (t.stage === 'approach') {
          if (goTo(t.stand, 0.22)) {
            t.stage = 'act';
            t.startTick = w.tick;
          }
          return null;
        }
        if (t.stage === 'act') {
          if (engaged) return null;
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
            if (opt && opt.kind === 'breach' && opt.enabled) intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            if (a.breachCharges === 0 || w.tick - t.startTick > secs(3)) {
              t.stage = 'wait';
              t.startTick = w.tick;
            }
          } else {
            // barricade without a charge: shoot it down
            intent.fire = err < 0.1 && canShoot(w, a);
          }
          return null;
        }
        // wait: step aside from the blast and hold the angle through the new opening
        const side = { x: t.stand.x + Math.cos(t.aimAngle + Math.PI / 2) * 1.2 - Math.cos(t.aimAngle) * 0.8, y: t.stand.y + Math.sin(t.aimAngle + Math.PI / 2) * 1.2 - Math.sin(t.aimAngle) * 0.8 };
        if (!t.useSled) goTo(side, 0.3);
        if (w.tick - t.startTick > secs(3)) b.task = { kind: 'idle' };
        return { x: t.stand.x + Math.cos(t.aimAngle) * 4, y: t.stand.y + Math.sin(t.aimAngle) * 4 };
      }
      case 'arm': {
        const stand = this.consoleStand(a);
        if (!engaged && goTo(stand, 0.3)) {
          b.status = 'Arming';
          const recentThreat = [...b.enemies.values()].some((m) => w.tick - m.tick < secs(1.5) && dist(m.pos, a.pos) < 9);
          const opt = bestInteract(w, a);
          if (!recentThreat && opt && opt.kind === 'arm') {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
          }
        } else if (!engaged) b.status = 'Moving';
        return aheadLook();
      }
      case 'shutoff': {
        const stand = this.consoleStand(a);
        const urgent = w.secondsLeft() < 9;
        if ((!engaged || urgent) && goTo(stand, 0.3)) {
          b.status = 'Defusing';
          const opt = bestInteract(w, a);
          if (opt && opt.kind === 'shutoff') {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
            if (a.interaction) intent.fire = false;
          }
        }
        return aheadLook();
      }
      case 'prepInteract': {
        if (goTo(t.stand, 0.25)) {
          const opt = bestInteract(w, a);
          if (opt && opt.kind === t.interact && opt.target === t.target && opt.enabled) {
            intent.interact = a.interaction ? true : !a.interactHeldLastTick;
            intent.move = { x: 0, y: 0 };
          } else if (!a.interaction && w.tick % 30 === 0) b.task = { kind: 'idle' };
        }
        if (!engaged) b.status = 'Moving';
        return t.interact === 'reinforce' ? w.map.softGroups[t.target].center : w.map.doors[t.target].center;
      }
      case 'placeHinge': {
        const stand = { x: t.pos.x + (t.vertical ? 1.3 : 0), y: t.pos.y + (t.vertical ? 0 : 1.3) };
        if (goTo(stand, 0.4)) {
          if (validateHingePlacement(w, a, t.pos, t.vertical).ok) intent.gadget = { type: 'hingePlace', x: t.pos.x, y: t.pos.y, vertical: t.vertical };
          else if (w.tick % 30 === 0) {
            this.defence.release(a.id);
            b.task = { kind: 'idle' };
          }
        }
        if (!engaged) b.status = 'Moving';
        return t.pos;
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
}
