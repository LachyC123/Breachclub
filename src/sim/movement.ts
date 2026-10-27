// Actor locomotion with circle-vs-grid and circle-vs-gadget collision. Swept in small
// substeps so nothing tunnels through a one-tile obstruction.
import { DT, RULES, secs } from '../content/defs';
import { cellBlocks, closestOnObb, type GeoState } from './geometry';
import type { Actor, ActorIntent, Vec } from './types';
import type { World } from './world';
import { SPEED_MULT, WEAPON_HANDLING, statsOf } from '../content/handling';

export const ACTOR_RADIUS = 0.32;

function prepBlocked(w: World, a: Actor, cx: number, cy: number): boolean {
  if (!w.prepConfine || w.phase !== 'prep') return false;
  if (cx < 0 || cy < 0 || cx >= w.map.w || cy >= w.map.h) return true;
  const inside = w.map.interior[cy * w.map.w + cx] === 1;
  return a.side === 'attack' ? inside : !inside;
}

export function blockedFor(w: World, a: Actor | null, cx: number, cy: number): boolean {
  if (cellBlocks(w, cx, cy, 'move')) return true;
  return a !== null && prepBlocked(w, a, cx, cy);
}

/** Push a circle out of blocking cells. Returns true if any correction happened. */
export function resolveGrid(w: World, a: Actor | null, p: Vec, r: number): boolean {
  let moved = false;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    const x0 = Math.floor(p.x - r);
    const x1 = Math.floor(p.x + r);
    const y0 = Math.floor(p.y - r);
    const y1 = Math.floor(p.y + r);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        if (!blockedFor(w, a, cx, cy)) continue;
        const qx = Math.max(cx, Math.min(cx + 1, p.x));
        const qy = Math.max(cy, Math.min(cy + 1, p.y));
        let dx = p.x - qx;
        let dy = p.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-10) {
          // centre inside the cell: push out along the shallowest axis
          const left = p.x - cx;
          const right = cx + 1 - p.x;
          const up = p.y - cy;
          const down = cy + 1 - p.y;
          const m = Math.min(left, right, up, down);
          if (m === left) p.x = cx - r;
          else if (m === right) p.x = cx + 1 + r;
          else if (m === up) p.y = cy - r;
          else p.y = cy + 1 + r;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          p.x = qx + dx * r;
          p.y = qy + dy * r;
        }
        any = true;
        moved = true;
      }
    if (!any) break;
  }
  return moved;
}

export function resolveObstacles(w: World, p: Vec, r: number, ignoreEntity = -1): boolean {
  let moved = false;
  for (const o of w.obstacles()) {
    if (!o.blocksMove || o.entityId === ignoreEntity) continue;
    const { q, inside } = closestOnObb(p, o.obb);
    let dx = p.x - q.x;
    let dy = p.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (!inside && d2 >= r * r) continue;
    if (inside || d2 < 1e-10) {
      // push along the box's short axis toward the side we are on
      const nx = -Math.sin(o.obb.angle);
      const ny = Math.cos(o.obb.angle);
      const side = (p.x - o.obb.cx) * nx + (p.y - o.obb.cy) * ny >= 0 ? 1 : -1;
      const off = o.obb.hy + r + 0.001;
      const along = (p.x - o.obb.cx) * Math.cos(o.obb.angle) + (p.y - o.obb.cy) * Math.sin(o.obb.angle);
      p.x = o.obb.cx + Math.cos(o.obb.angle) * along + nx * side * off;
      p.y = o.obb.cy + Math.sin(o.obb.angle) * along + ny * side * off;
    } else {
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      p.x = q.x + dx * r;
      p.y = q.y + dy * r;
    }
    moved = true;
  }
  return moved;
}

/** Move a circle by (dx,dy) with substeps; returns actual displacement. */
export function moveCircle(w: World, a: Actor | null, p: Vec, dx: number, dy: number, r = ACTOR_RADIUS, ignoreEntity = -1): Vec {
  const start = { ...p };
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / 0.12));
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    resolveGrid(w, a, p, r);
    p.y += dy / steps;
    resolveGrid(w, a, p, r);
    if (resolveObstacles(w, p, r, ignoreEntity)) resolveGrid(w, a, p, r);
  }
  return { x: p.x - start.x, y: p.y - start.y };
}

export function circleFree(g: GeoState, p: Vec, r: number): boolean {
  const x0 = Math.floor(p.x - r);
  const x1 = Math.floor(p.x + r);
  const y0 = Math.floor(p.y - r);
  const y1 = Math.floor(p.y + r);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      if (!cellBlocks(g, cx, cy, 'move')) continue;
      const qx = Math.max(cx, Math.min(cx + 1, p.x));
      const qy = Math.max(cy, Math.min(cy + 1, p.y));
      if ((p.x - qx) ** 2 + (p.y - qy) ** 2 < r * r) return false;
    }
  return true;
}

export const SLIDE_SECONDS = 0.32;
export const SLIDE_COOLDOWN = 2.2;
const SLIDE_MULT = 2.3;

export function stepMovement(w: World, get: (a: Actor) => ActorIntent) {
  const speedBase = RULES.walk_tiles_per_second;
  for (const a of w.actors) {
    if (!a.alive) {
      a.vel = { x: 0, y: 0 };
      continue;
    }
    const it = get(a);
    if (it.aim !== null && a.gadgetWindupUntil < w.tick) a.facing = it.aim;

    if (a.vaulting) {
      const v = a.vaulting;
      const t = Math.min(1, (w.tick - v.startTick) / (v.endTick - v.startTick));
      a.pos = { x: v.from.x + (v.to.x - v.from.x) * t, y: v.from.y + (v.to.y - v.from.y) * t };
      if (w.tick >= v.endTick) a.vaulting = null;
      continue;
    }

    // attackers are on their drones during prep: operators wait at spawn (Siege rules)
    const droning = w.phase === 'prep' && a.side === 'attack' && w.cfg.mode !== 'range';
    let mx = droning ? 0 : it.move.x;
    let my = droning ? 0 : it.move.y;
    a.ads = it.ads && !droning;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    // locked while bracing the sled or committed to an interaction
    if (a.gadgetWindupUntil >= w.tick) {
      mx = 0;
      my = 0;
    }
    const hd = WEAPON_HANDLING[a.weapon.id];
    // slide: a short committed burst in the stick direction, then a cooldown
    if (it.slide && !a.slide && w.tick >= a.slideReadyTick && Math.hypot(mx, my) > 0.3 && !a.interaction && !droning && a.gadgetWindupUntil < w.tick) {
      const l = Math.hypot(mx, my);
      a.slide = { dir: { x: mx / l, y: my / l }, until: w.tick + secs(SLIDE_SECONDS) };
      a.slideReadyTick = w.tick + secs(SLIDE_COOLDOWN);
      w.emit({ type: 'slide', actorId: a.id });
      w.emitSound(a.pos, 'step', 6, a.team, a.id);
    }
    if (a.slide && w.tick >= a.slide.until) a.slide = null;
    if (a.slide) {
      mx = a.slide.dir.x * SLIDE_MULT;
      my = a.slide.dir.y * SLIDE_MULT;
      a.ads = false;
    }
    // operator speed rating, slower while aiming, and a brief stagger after each shot
    let speed = speedBase * SPEED_MULT[statsOf(a.operatorId).speed] * (a.ads ? hd.adsMove : 1);
    if (w.tick < a.nextShotTick && a.mag < a.weapon.magazine) speed *= hd.fireMove;
    if (a.flinchUntil >= w.tick) speed *= 0.7;
    const dx = mx * speed * DT + a.shove.x;
    const dy = my * speed * DT + a.shove.y;
    a.shove = { x: a.shove.x * 0.5, y: a.shove.y * 0.5 };
    if (Math.abs(a.shove.x) + Math.abs(a.shove.y) < 0.002) a.shove = { x: 0, y: 0 };
    const moved = moveCircle(w, a, a.pos, dx, dy);
    a.vel = { x: moved.x / DT, y: moved.y / DT };

    // footsteps: louder at full pace, quiet when easing the stick (docs/06 walk = 4 tiles)
    const sp = Math.hypot(a.vel.x, a.vel.y);
    if (sp > 0.4) {
      a.stepAccum += sp * DT;
      if (a.stepAccum >= 0.85) {
        a.stepAccum = 0;
        const radius = sp > speedBase * 0.6 ? 4 : 2;
        w.emitSound(a.pos, 'step', radius, a.team, a.id);
      }
    }
  }
  separateActors(w);
  // bloom decay
  for (const a of w.actors) a.bloom = Math.max(0, a.bloom - DT * WEAPON_HANDLING[a.weapon.id].bloomRecovery);
  void secs;
}

/** Soft ally avoidance and firm enemy body blocking without permanent jams. */
function separateActors(w: World) {
  const r2 = ACTOR_RADIUS * 2;
  const live = w.actors.filter((a) => a.alive && !a.vaulting);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d >= r2 || d < 1e-6) continue;
      const overlap = r2 - d;
      const k = a.team === b.team ? 0.35 : 0.5;
      const nx = dx / d;
      const ny = dy / d;
      moveCircle(w, a, a.pos, -nx * overlap * k, -ny * overlap * k);
      moveCircle(w, b, b.pos, nx * overlap * k, ny * overlap * k);
    }
}
