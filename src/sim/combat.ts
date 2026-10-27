// Authoritative hitscan gunplay. Shots stop at the first blocking surface; no penetration.
import { secs } from '../content/defs';
import { raycast, dist } from './geometry';
import type { Actor, ActorIntent, Vec } from './types';
import type { World } from './world';
import { breachSoftGroup, destroyBarricade, damageEntity } from './gadgets';
import { ACTOR_RADIUS } from './movement';
import { ARMOUR_DAMAGE, WEAPON_HANDLING, statsOf } from '../content/handling';

const HIT_RADIUS = 0.4;
const SOFT_GUNFIRE_FACTOR = 0.15;
const BARRICADE_GUNFIRE_FACTOR = 0.5;

export function canShoot(w: World, a: Actor): boolean {
  return (
    a.alive &&
    !a.vaulting &&
    !a.interaction &&
    // a shell-by-shell reload can be interrupted by firing whatever is already loaded
    (a.reloadUntil < 0 || (WEAPON_HANDLING[a.weapon.id].reload === 'shell' && a.mag > 0)) &&
    a.gadgetWindupUntil < w.tick &&
    a.lowerWeaponUntil < w.tick
  );
}

export function startReload(w: World, a: Actor): boolean {
  if (a.reloadUntil >= 0 || a.reserve <= 0 || a.mag >= a.weapon.magazine || a.interaction) return false;
  const hd = WEAPON_HANDLING[a.weapon.id];
  a.reloadUntil = w.tick + secs(hd.reload === 'shell' ? hd.shellSeconds : a.weapon.reload_seconds);
  w.emit({ type: 'reloadStart', actorId: a.id });
  w.emitSound(a.pos, 'reload', 3, a.team, a.id);
  return true;
}

export function stepReloads(w: World, get: (a: Actor) => ActorIntent) {
  for (const a of w.actors) {
    if (!a.alive) {
      a.reloadUntil = -1;
      continue;
    }
    const it = get(a);
    if (it.reload) startReload(w, a);
    if (a.reloadUntil >= 0 && w.tick >= a.reloadUntil && WEAPON_HANDLING[a.weapon.id].reload === 'shell') {
      // one shell in; keep going until full or out of reserve
      a.mag++;
      a.reserve--;
      if (a.mag < a.weapon.magazine && a.reserve > 0) {
        a.reloadUntil = w.tick + secs(WEAPON_HANDLING[a.weapon.id].shellSeconds);
        w.emitSound(a.pos, 'reload', 2, a.team, a.id);
      } else {
        a.reloadUntil = -1;
        w.emit({ type: 'reloadEnd', actorId: a.id });
      }
    } else if (a.reloadUntil >= 0 && w.tick >= a.reloadUntil) {
      const take = Math.min(a.weapon.magazine - a.mag, a.reserve);
      a.mag += take;
      a.reserve -= take;
      a.reloadUntil = -1;
      w.emit({ type: 'reloadEnd', actorId: a.id });
    }
  }
}

function muzzle(a: Actor): Vec {
  return { x: a.pos.x + Math.cos(a.facing) * 0.45, y: a.pos.y + Math.sin(a.facing) * 0.45 };
}

export function stepCombat(w: World, get: (a: Actor) => ActorIntent) {
  for (const a of w.actors) {
    if (!a.alive) continue;
    const it = get(a);
    if (!it.fire) {
      a.autoReloadArmed = true;
      continue;
    }
    if (!canShoot(w, a) || w.tick < a.nextShotTick) continue;
    if (a.mag <= 0) {
      if (a.autoReloadArmed) {
        a.autoReloadArmed = false;
        w.emit({ type: 'dryFire', actorId: a.id });
        startReload(w, a);
      }
      continue;
    }
    fire(w, a);
  }
}

function fire(w: World, a: Actor) {
  const wpn = a.weapon;
  const hd = WEAPON_HANDLING[wpn.id];
  if (a.reloadUntil >= 0) {
    // firing interrupts a shell reload
    a.reloadUntil = -1;
    w.emit({ type: 'reloadEnd', actorId: a.id });
  }
  a.mag--;
  a.nextShotTick = w.tick + Math.max(1, secs(wpn.interval_seconds));
  const moving = Math.hypot(a.vel.x, a.vel.y) > 0.5 ? hd.movingSpread : 0;
  const adsK = a.ads ? 0.4 : 1;
  const spread = (hd.baseSpread + a.bloom + moving) * adsK;
  a.bloom = Math.min(0.12, a.bloom + hd.bloomPerShot * (a.ads ? 0.6 : 1));
  const maxRange = wpn.effective_range_tiles * 2;
  const start = muzzle(a);
  // if the muzzle pokes through a wall, the shot originates (and stops) at the wall face
  const poke = raycast(w, a.pos, start, 'bullet', { obs: w.obstacles() });
  const origin = poke ? a.pos : start;

  for (let p = 0; p < wpn.pellets; p++) {
    let ang = a.facing;
    if (wpn.pellets > 1) {
      // readable seeded fan: evenly spaced pellets with small jitter
      const fan = 0.22;
      ang += -fan / 2 + (fan * p) / (wpn.pellets - 1) + w.rng.range(-0.03, 0.03);
      ang += w.rng.range(-spread, spread) * 0.5;
    } else {
      ang += w.rng.gauss() * spread * 0.5;
    }
    const end = { x: origin.x + Math.cos(ang) * maxRange, y: origin.y + Math.sin(ang) * maxRange };
    traceBullet(w, a, origin, end, wpn.damage);
  }
  w.emitSound(a.pos, 'shot', 12, a.team, a.id);
}

function falloff(a: Actor, d: number): number {
  const eff = a.weapon.effective_range_tiles;
  if (d <= eff) return 1;
  if (d >= eff * 2) return 0.35;
  return 1 - 0.65 * ((d - eff) / eff);
}

function traceBullet(w: World, a: Actor, from: Vec, to: Vec, baseDamage: number) {
  const hit = raycast(w, from, to, 'bullet', { obs: w.obstacles() });
  let tWall = hit ? hit.t : 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  // nearest enemy body along the ray (friendly bodies never absorb shots)
  let best: Actor | null = null;
  let bestT = tWall;
  for (const b of w.actors) {
    if (!b.alive || b.team === a.team || b.vaulting) continue;
    const fx = from.x - b.pos.x;
    const fy = from.y - b.pos.y;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - HIT_RADIUS * HIT_RADIUS;
    const disc = B * B - 4 * len2 * C;
    if (disc < 0) continue;
    const t = (-B - Math.sqrt(disc)) / (2 * len2);
    if (t >= 0 && t < bestT) {
      bestT = t;
      best = b;
    }
  }
  const endPoint = { x: from.x + dx * bestT, y: from.y + dy * bestT };
  if (best) {
    const d = dist(from, best.pos);
    // armour soaks part of every bullet; heavy guns knock the target back
    const dmg = Math.round(baseDamage * falloff(a, d) * ARMOUR_DAMAGE[statsOf(best.operatorId).armour]);
    w.damageActor(best, dmg, a.id);
    const push = WEAPON_HANDLING[a.weapon.id].shove * falloff(a, d);
    if (push > 0 && w.phase !== 'prep') {
      const len = Math.hypot(dx, dy) || 1;
      // shove decays by half each tick, so this totals `push` tiles
      best.shove = { x: best.shove.x + (dx / len) * push * 0.5, y: best.shove.y + (dy / len) * push * 0.5 };
    }
    w.emit({ type: 'shot', actorId: a.id, from, to: endPoint, hitActor: best.id, hitSurface: 'none', weapon: a.weapon.id });
    return;
  }
  let surface: 'wall' | 'soft' | 'barricade' | 'gadget' | 'prop' | 'none' = 'none';
  if (hit) {
    tWall = hit.t;
    if (hit.entityId !== null) {
      surface = 'gadget';
      // during prep only recon drones can be damaged
      const ent = w.entities.find((e) => e.id === hit.entityId);
      if (w.phase !== 'prep' || ent?.kind === 'drone') damageEntity(w, hit.entityId, baseDamage, a.id);
    } else if (hit.cell) {
      const ci = hit.cell.y * w.map.w + hit.cell.x;
      const g = w.map.softGroupOf[ci];
      const d = w.map.doorOf[ci];
      if (g >= 0) {
        surface = 'soft';
        const st = w.soft[g];
        if (st.state === 'intact' && w.phase !== 'prep') {
          st.hp -= baseDamage * SOFT_GUNFIRE_FACTOR;
          if (st.hp <= 0) breachSoftGroup(w, g, a.id, 'gunfire');
        }
      } else if (d >= 0 && w.barricades[d]) {
        surface = 'barricade';
        if (w.phase !== 'prep') {
          const bar = w.barricades[d]!;
          bar.hp -= baseDamage * BARRICADE_GUNFIRE_FACTOR;
          bar.damaged = true;
          if (bar.hp <= 0) destroyBarricade(w, d, a.id);
        }
      } else if (w.map.prop[ci]) surface = 'prop';
      else surface = 'wall';
    }
    const material = surface === 'none' ? 'wall' : surface;
    const reinforced = surface === 'soft' && w.soft[w.map.softGroupOf[hit.cell ? hit.cell.y * w.map.w + hit.cell.x : 0]]?.state === 'reinforced';
    w.emit({ type: 'surfaceHit', pos: hit.point, material, reinforced });
  }
  w.emit({ type: 'shot', actorId: a.id, from, to: endPoint, hitActor: null, hitSurface: surface, weapon: a.weapon.id });
  void ACTOR_RADIUS;
}
