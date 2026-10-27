// Path following: repath on geometry change, vault links, breaking through barricades when
// sealed off, danger-aware routes, quiet walking, ally spacing and stuck recovery (no teleporting).
import { secs } from '../content/defs';
import { angleTo, dist, normAngle, raycast, type ObstacleRef } from '../sim/geometry';
import { canShoot } from '../sim/combat';
import type { Actor, ActorIntent, Vec } from '../sim/types';
import type { World } from '../sim/world';
import { findPath, smooth, walkable, navGrid } from './nav';
import type { BotState } from './types';
import { playerDriven } from './control';

export interface MoveOpts {
  arrive?: number;
  /** quiet walk: half speed, footsteps carry 2 tiles instead of 4 */
  sneak?: boolean;
  danger?: Float32Array;
}

export function followPath(w: World, a: Actor, b: BotState, goal: Vec, intent: ActorIntent, opts: MoveOpts = {}): boolean {
  const arrive = opts.arrive ?? 0.35;
  if (dist(a.pos, goal) <= arrive) {
    b.path = [];
    b.blockedSince = -1;
    return true;
  }
  const rev = `${w.geometryRevision}:${w.phase === 'prep' ? 'p' : 'a'}:${opts.danger ? 'd' : ''}`;
  const goalMoved = !b.pathGoal || dist(b.pathGoal, goal) > 0.5;
  if (goalMoved || b.pathRev !== rev || b.path.length === 0) {
    const r = findPath(w, a.side, a.pos, goal, { extra: opts.danger });
    b.pathGoal = { ...goal };
    b.pathRev = rev;
    b.path = r ? smooth(w, a.pos, r.points) : [];
    b.breakDoor = -1;
    if (!r) {
      // sealed in or out by a barricade: walk up to it and shoot it down (any team's)
      const r2 = findPath(w, a.side, a.pos, goal, { breachCost: 8, doorsOnly: true });
      const door = r2?.breaches.find((x) => x >= 100);
      if (r2 && door !== undefined) {
        const g = navGrid(w, a.side);
        const cut = r2.cells.findIndex((c) => !g.walk[c]);
        b.path = smooth(w, a.pos, r2.points.slice(0, Math.max(1, cut)));
        b.breakDoor = door - 100;
      } else {
        if (b.blockedSince < 0) b.blockedSince = w.tick;
        if (w.tick - b.blockedSince > secs(2)) b.status = 'Blocked';
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
  // ally spacing, and never loiter in the player's line of fire
  for (const o of w.actors) {
    if (o.id === a.id || !o.alive || o.team !== a.team) continue;
    const od = dist(a.pos, o.pos);
    if (od < 1.1 && od > 0.01) {
      dx += ((a.pos.x - o.pos.x) / od) * 0.4;
      dy += ((a.pos.y - o.pos.y) / od) * 0.4;
    }
    if (playerDriven(o) && od < 6) {
      const fx = Math.cos(o.facing);
      const fy = Math.sin(o.facing);
      const rx = a.pos.x - o.pos.x;
      const ry = a.pos.y - o.pos.y;
      const along = rx * fx + ry * fy;
      const lateral = rx * -fy + ry * fx;
      if (along > 0 && Math.abs(lateral) < 0.7) {
        const s = lateral >= 0 ? 1 : -1;
        dx += -fy * s * 0.8;
        dy += fx * s * 0.8;
      }
    }
  }
  const slow = d < 0.6 && b.path.length === 1 ? Math.max(0.35, d / 0.6) : 1;
  const pace = opts.sneak ? 0.55 : 1;
  const m = Math.hypot(dx, dy) || 1;
  intent.move = { x: (dx / m) * slow * pace, y: (dy / m) * slow * pace };
  // stuck detection: 0.6s without progress -> repath; 2s -> report Blocked and let strategy re-plan
  if (dist(a.pos, b.progressPos) > 0.3) {
    b.progressPos = { ...a.pos };
    b.progressTick = w.tick;
    b.blockedSince = -1;
  } else if (w.tick - b.progressTick > secs(0.6)) {
    b.path = [];
    if (b.blockedSince < 0) b.blockedSince = w.tick;
    if (w.tick - b.blockedSince > secs(2)) {
      b.status = 'Blocked';
      b.task = { kind: 'idle' };
      b.blockedSince = -1;
      b.progressTick = w.tick;
    }
  }
  return false;
}

/** A walkable spot near `near` that breaks line of sight to `threat` (for falling back). */
export function coverFrom(w: World, a: Actor, near: Vec, threat: Vec): Vec | null {
  const g = navGrid(w, a.side);
  let best: Vec | null = null;
  let bestScore = Infinity;
  const obs = w.obstacles();
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const x = Math.floor(near.x) + dx;
      const y = Math.floor(near.y) + dy;
      if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h || !g.walk[y * w.map.w + x]) continue;
      const c = { x: x + 0.5, y: y + 0.5 };
      const d = dist(c, near);
      if (d > 4.2) continue;
      // fully hidden from the threat, including both shoulders
      let hidden = true;
      for (const off of [0, 0.3, -0.3]) {
        const p = { x: c.x + off, y: c.y };
        if (!rayBlocked(w, threat, p, obs)) {
          hidden = false;
          break;
        }
      }
      if (!hidden) continue;
      const score = d + Math.max(0, 3 - dist(c, threat)) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  return best;
}

function rayBlocked(w: World, a: Vec, b: Vec, obs: ObstacleRef[]): boolean {
  return raycast(w, a, b, 'sight', { obs }) !== null;
}
