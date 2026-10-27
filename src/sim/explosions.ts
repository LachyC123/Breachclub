// Explosions: one shared blast used by barrels (and anything else that goes bang). Damage falls
// off with distance and is blocked by walls; blasts shove people, chain into other barrels and
// blow open unreinforced soft walls and barricades in range. Explosive barrels cook off for a
// moment after they're shot (telegraph + time to get clear).
import { secs } from '../content/defs';
import { dist, raycast } from './geometry';
import { breachSoftGroup, destroyBarricade } from './gadgets';
import type { BarrelEntity, Vec } from './types';
import type { World } from './world';

export const BARREL_HP = 30;
export const BARREL_FUSE = 0.4;
export const BARREL_RADIUS = 2.4;
export const BARREL_DAMAGE = 110;

export interface BlastOpts {
  radius: number;
  damage: number;
  /** actor credited with the blast (-1 = nobody) */
  sourceId: number;
  cause: 'barrel' | 'missile' | 'round';
  /** whether it opens soft walls and barricades */
  breaks: boolean;
}

export function explode(w: World, pos: Vec, o: BlastOpts) {
  const src = w.actor(o.sourceId);
  const obs = w.obstacles();
  w.emit({ type: 'explosion', pos: { ...pos }, radius: o.radius, cause: o.cause, by: o.sourceId });
  w.emitSound(pos, 'breach', o.radius > 1.5 ? 16 : 9, src?.team ?? 0, o.sourceId);
  if (w.phase === 'prep') return;
  for (const a of w.actors) {
    if (!a.alive) continue;
    const d = dist(a.pos, pos);
    if (d > o.radius) continue;
    // hard walls shelter you; other bodies and gadgets don't
    if (raycast(w, pos, a.pos, 'bullet', { obs: [] })) continue;
    // no friendly fire (rules), but you can catch your own blast
    if (src && a.team === src.team && a.id !== src.id) continue;
    const k = 1 - (d / o.radius) * 0.7;
    w.damageActor(a, Math.round(o.damage * k * (src && a.id === src.id ? 0.5 : 1)), o.sourceId);
    const len = d || 1;
    const push = 0.35 * k;
    a.shove = { x: a.shove.x + ((a.pos.x - pos.x) / len) * push, y: a.shove.y + ((a.pos.y - pos.y) / len) * push };
  }
  // chain reaction: other barrels in range cook off quickly
  for (const e of w.entities) {
    if (e.kind !== 'barrel' || e.fuseTick >= 0) continue;
    if (dist(e.pos, pos) <= o.radius && !raycast(w, pos, e.pos, 'bullet', { obs: obs.filter((x) => x.entityId !== e.id) })) {
      e.fuseTick = w.tick + secs(0.18);
      e.lastHitBy = o.sourceId;
    }
  }
  if (!o.breaks) return;
  w.map.softGroups.forEach((g, gi) => {
    if (w.soft[gi].state !== 'intact') return;
    if (g.cells.some((c) => dist({ x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 }, pos) <= o.radius * 0.8)) breachSoftGroup(w, gi, o.sourceId, 'explosion');
  });
  w.map.doors.forEach((d, di) => {
    if (w.barricades[di] && dist(d.center, pos) <= o.radius * 0.9) destroyBarricade(w, di, o.sourceId);
  });
}

/** Shot or caught in a blast: start the cook-off (once). */
export function hitBarrel(w: World, b: BarrelEntity, amount: number, by: number) {
  if (w.phase === 'prep' || b.fuseTick >= 0) return;
  b.hp -= amount;
  b.lastHitBy = by;
  if (b.hp <= 0) {
    b.fuseTick = w.tick + secs(BARREL_FUSE);
    w.emit({ type: 'barrelLit', barrelId: b.id, pos: { ...b.pos } });
  }
}

export function stepBarrels(w: World) {
  for (const e of [...w.entities]) {
    if (e.kind !== 'barrel' || e.fuseTick < 0 || w.tick < e.fuseTick) continue;
    w.entities = w.entities.filter((x) => x !== e);
    w.bumpGeometry();
    explode(w, e.pos, { radius: BARREL_RADIUS, damage: BARREL_DAMAGE, sourceId: e.lastHitBy, cause: 'barrel', breaks: true });
  }
}
