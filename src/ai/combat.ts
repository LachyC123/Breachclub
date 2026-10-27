// Bot gunfights: fair reaction delays, settling aim with sideways-motion error, burst discipline,
// standing still to aim, and falling back to cover to reload or when losing a fight.
import { secs } from '../content/defs';
import { angleTo, dist, normAngle } from '../sim/geometry';
import { canSee } from '../sim/perception';
import { canShoot } from '../sim/combat';
import type { Actor, ActorIntent, BarrelEntity, DroneEntity, Vec } from '../sim/types';
import { BARREL_RADIUS } from '../sim/explosions';
import type { World } from '../sim/world';
import type { BotState, DiffParams, Perception } from './types';
import { coverFrom, followPath } from './locomotion';

function turnToward(a: Actor, desired: number, rate: number): number {
  const maxTurn = rate / 60;
  const delta = normAngle(desired - a.facing);
  return a.facing + Math.max(-maxTurn, Math.min(maxTurn, delta));
}

/** Pick the most dangerous visible enemy: one already aiming at us, else the closest. */
function chooseTarget(a: Actor, b: BotState, visible: Actor[]): Actor {
  const cur = visible.find((v) => v.id === b.targetId);
  if (cur) return cur;
  let best = visible[0];
  let bestScore = Infinity;
  for (const v of visible) {
    const d = dist(a.pos, v.pos);
    const aimingAtMe = Math.abs(normAngle(v.facing - angleTo(v.pos, a.pos))) < 0.35;
    const score = d - (aimingAtMe ? 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

export interface EngageOpts {
  /** holders keep their spot; pushers may close distance */
  hold: boolean;
}

export function engage(w: World, a: Actor, b: BotState, p0: Perception, diff: DiffParams, intent: ActorIntent, opts: EngageOpts): boolean {
  // nobody can be hurt during preparation: only drones are worth shooting
  const p = w.phase === 'prep' ? { ...p0, visible: [] } : p0;
  if (p.visible.length === 0) {
    if (shootDrone(w, a, b, diff, intent)) return true;
    // finish a fallback even after losing sight: reload in cover before re-peeking
    if (b.fallback && w.tick < b.fallback.until) {
      followPath(w, a, b, b.fallback.pos, intent, { arrive: 0.3 });
      intent.aim = turnToward(a, angleTo(a.pos, b.fallback.threat), diff.turnRate);
      if (a.mag < a.weapon.magazine) intent.reload = true;
      b.status = 'Falling back';
      return true;
    }
    b.fallback = null;
    b.targetId = null;
    return false;
  }
  const target = chooseTarget(a, b, p.visible);
  if (target.id !== b.targetId) {
    b.targetId = target.id;
    b.acquiredTick = w.tick;
    b.reactionTicks = secs(w.rng.range(diff.reaction[0], diff.reaction[1]));
    b.aimOffset = (w.rng.next() < 0.5 ? -1 : 1) * diff.aimStart * w.rng.range(0.6, 1.0);
    // holding an angle pays off: a target that walks into where you're already aiming is quicker to hit
    if (b.status === 'Holding' && Math.abs(normAngle(a.facing - angleTo(a.pos, target.pos))) < 0.45) {
      b.reactionTicks = Math.round(b.reactionTicks * 0.6);
      b.aimOffset *= 0.4;
    }
    b.burstEnd = 0;
    b.burstPauseEnd = 0;
  }
  b.lastEngageTick = w.tick;
  b.status = 'Fighting';
  // committed shutdown in the final seconds: keep holding rather than turning to fight
  if (a.interaction && a.interaction.kind === 'shutoff' && w.secondsLeft() < 3.5) {
    intent.interact = true;
    return true;
  }
  // an enemy standing by a barrel: shoot the barrel instead (never with a teammate in the blast)
  const barrel = juicyBarrel(w, a, target);
  const aimAt = barrel ? barrel.pos : target.pos;
  const d = dist(a.pos, aimAt);
  const trueAng = angleTo(a.pos, aimAt);
  // aim settles over time; sideways target motion is harder to track
  const since = (w.tick - b.acquiredTick) / 60;
  const settle = Math.min(1, since / diff.settle);
  const perpX = -Math.sin(trueAng);
  const perpY = Math.cos(trueAng);
  const lateral = barrel ? 0 : Math.abs(target.vel.x * perpX + target.vel.y * perpY);
  const noise = w.rng.gauss() * (diff.aimBase * 0.5 + diff.leadError * lateral);
  const desired = trueAng + b.aimOffset * (1 - settle) + noise;
  intent.aim = turnToward(a, desired, diff.turnRate);
  const err = Math.abs(normAngle(intent.aim - trueAng));
  const range = a.weapon.effective_range_tiles * (a.weapon.pellets > 1 ? 1.4 : 1.6);
  const tol = Math.max(0.05, Math.atan2(0.42, d)) + 0.03;

  // fall back: losing the trade, or empty with a threat in front of us (point blank, turning away
  // only gets you shot in the back: fight it out)
  const losing = a.hp < 45 && (target.hp > a.hp || p.visible.length > 1) && d < 9 && d > 3.5;
  // facing two or more at once: break line of sight and re-peek them one at a time
  const outnumbered = p.visible.length >= 2 && d > 3.5 && w.phase !== 'armed';
  // at most two retreats per stretch of fighting: then commit (time and the objective matter)
  if (w.tick - b.fallbackWindow > secs(10)) {
    b.fallbackWindow = w.tick;
    b.fallbackCount = 0;
  }
  if ((losing || outnumbered || (a.mag === 0 && a.reserve > 0)) && !b.fallback && !a.interaction && b.fallbackCount < 2 && w.secondsLeft() > 15) {
    b.fallbackCount++;
    const cover = coverFrom(w, a, a.pos, target.pos);
    if (cover) {
      b.fallback = { pos: cover, until: w.tick + secs(2.2), threat: { ...target.pos } };
      // burst into cover
      intent.slide = true;
    }
  }
  if (b.fallback && w.tick < b.fallback.until) {
    followPath(w, a, b, b.fallback.pos, intent, { arrive: 0.3 });
    if (a.mag === 0) intent.reload = true;
    // snap shots while retreating are allowed but sloppy
    intent.fire = err < tol && w.tick - b.acquiredTick >= b.reactionTicks && d <= range && canShoot(w, a) && a.mag > 0;
    b.status = 'Falling back';
    return true;
  }
  b.fallback = null;

  // burst discipline (single-shot scatterguns rely on their own interval)
  let burstOk = true;
  if (a.weapon.pellets === 1) {
    if (w.tick < b.burstPauseEnd) burstOk = false;
    else if (b.burstEnd === 0) b.burstEnd = w.tick + secs(w.rng.range(diff.burst[0], diff.burst[1]));
    else if (w.tick > b.burstEnd) {
      // short reset between bursts: recoil recovers, aim re-centres with a small error
      b.burstPauseEnd = w.tick + secs(w.rng.range(0.14, 0.3));
      b.burstEnd = 0;
      b.aimOffset = (w.rng.next() < 0.5 ? -1 : 1) * diff.aimBase * 0.8;
      b.acquiredTick = w.tick - secs(diff.settle * 0.5);
      burstOk = false;
    }
  }
  intent.fire = burstOk && w.tick - b.acquiredTick >= b.reactionTicks && err < tol && d <= range && canShoot(w, a);
  if (a.mag === 0 && a.reserve > 0) intent.reload = true;

  // footwork: stand still to aim (tighter spread); small strafes when skilled; close in if out of range
  if (diff.strafe && w.tick >= b.strafeUntil) {
    b.strafeDir = w.rng.next() < 0.5 ? -1 : 1;
    b.strafeUntil = w.tick + secs(w.rng.range(0.4, 0.9));
    // the odd slide-strafe makes skilled bots harder to track
    if (!opts.hold && w.rng.next() < 0.18) intent.slide = true;
  }
  let mx = 0;
  let my = 0;
  if (d > range * 0.9 && !opts.hold) {
    mx += Math.cos(trueAng) * 0.6;
    my += Math.sin(trueAng) * 0.6;
  } else if (a.weapon.pellets > 1 && d > 3.2 && !opts.hold) {
    mx += Math.cos(trueAng) * 0.6;
    my += Math.sin(trueAng) * 0.6;
  } else if (diff.strafe && !opts.hold) {
    mx += perpX * b.strafeDir * 0.45;
    my += perpY * b.strafeDir * 0.45;
  }
  intent.move = { x: mx, y: my };
  intent.ads = Math.hypot(mx, my) < 0.1 && a.weapon.pellets === 1;
  return true;
}

function juicyBarrel(w: World, a: Actor, target: Actor): BarrelEntity | null {
  if (w.phase === 'prep') return null;
  for (const e of w.entities) {
    if (e.kind !== 'barrel' || e.fuseTick >= 0) continue;
    if (dist(e.pos, target.pos) > 1.9 || dist(e.pos, a.pos) < 3.4) continue;
    if (w.actors.some((x) => x.alive && x.team === a.team && dist(x.pos, e.pos) < BARREL_RADIUS + 0.3)) continue;
    if (!canSee(w, a.pos, e.pos)) continue;
    return e;
  }
  return null;
}

/** Defenders shoot recon drones they can actually see (same reaction rules as actors). */
function shootDrone(w: World, a: Actor, b: BotState, diff: DiffParams, intent: ActorIntent): boolean {
  let best: DroneEntity | null = null;
  let bd = Infinity;
  for (const e of w.entities) {
    if (e.kind !== 'drone' || e.team === a.team) continue;
    const d = dist(a.pos, e.pos);
    if (d < bd && canSee(w, a.pos, e.pos)) {
      bd = d;
      best = e;
    }
  }
  if (!best) return false;
  if (b.targetId !== -best.id) {
    b.targetId = -best.id;
    b.acquiredTick = w.tick;
    // small, fast drones are harder to pick up than people
    b.reactionTicks = secs(w.rng.range(diff.reaction[0], diff.reaction[1]) + 0.55);
  }
  const ang = angleTo(a.pos, best.pos);
  intent.aim = turnToward(a, ang, diff.turnRate);
  intent.fire = w.tick - b.acquiredTick >= b.reactionTicks && Math.abs(normAngle(intent.aim - ang)) < 0.1 && canShoot(w, a);
  intent.ads = true;
  b.status = 'Fighting';
  return true;
}

/** Where to point the gun when nothing is visible. */
export function idleAim(w: World, a: Actor, _b: BotState, p: Perception, diff: DiffParams, intent: ActorIntent, fallbackLook: Vec | null) {
  if (intent.aim !== null) return;
  let look: number | null = null;
  const recentEnemy = p.memories.filter((m) => w.tick - m.tick < secs(5)).sort((x, y) => y.tick - x.tick)[0];
  const recentSound = p.sounds.filter((s) => w.tick - s.tick < secs(2.5) && s.kind !== 'voice').sort((x, y) => y.tick - x.tick)[0];
  if (recentEnemy) look = angleTo(a.pos, recentEnemy.pos);
  else if (recentSound) look = angleTo(a.pos, recentSound.pos);
  else if (fallbackLook && dist(fallbackLook, a.pos) > 0.6) look = angleTo(a.pos, fallbackLook);
  else if (Math.hypot(intent.move.x, intent.move.y) > 0.1) look = Math.atan2(intent.move.y, intent.move.x);
  if (look !== null) intent.aim = turnToward(a, look, diff.turnRate * 0.75);
}
