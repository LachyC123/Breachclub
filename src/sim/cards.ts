// Wild-card mechanics: card commands (Sentry Turret, Missile Strike), turret behaviour, missile
// impacts, Recon Pulse and Poison ticks. Passive stat cards are read where they apply
// (movement, combat, spawn). Numbers per level: index 0 = card not held.
import { secs } from '../content/defs';
import { lvl } from '../content/cards';
import { angleTo, dist, normAngle, raycast } from './geometry';
import { damageEntity } from './gadgets';
import { explode } from './explosions';
import type { Actor, ActorIntent, MissileEntity, TeamId, TurretEntity, Vec } from './types';
import type { World } from './world';

export const KEVLAR = [0, 25, 40, 60];
export const VAMPIRE = [0, 35, 60, 999];
export const ADRENALINE = [0, 0.12, 0.2, 0.28];
export const HOLLOW = [0, 0.12, 0.2, 0.28];
export const QUICKDRAW = [0, 0.3, 0.45, 0.6];
export const POISON_DPS = [0, 4, 6, 8];
export const POISON_SECONDS = 3;
export const EXPLOSIVE_EVERY = [0, 6, 5, 4];
export const EXPLOSIVE_DAMAGE = 22;
export const PULSE_SECONDS = [0, 16, 12, 9];
export const AIMBOT_CONE = [0, 20, 28, 36];

export const TURRET_HP = 70;
export const TURRET_SECONDS = 30;
export const TURRET_RANGE = 7.5;
export const TURRET_DAMAGE = [0, 9, 11, 13];
const TURRET_REACTION = 0.45;
const TURRET_INTERVAL = 0.2;
const TURRET_TURN = 7;

export const MISSILE_RANGE = 16;
export const MISSILE_WARNING = 1.6;
export const MISSILE_RADIUS = 2.6;
export const MISSILE_DAMAGE = 120;

const live = (w: World) => w.phase === 'action' || w.phase === 'armed';

export function stepCards(w: World, get: (a: Actor) => ActorIntent) {
  for (const a of w.actors) {
    if (!a.alive) continue;
    const c = get(a).card;
    if (c) useCard(w, a, c);
  }
  for (const e of [...w.entities]) {
    if (!w.entities.includes(e)) continue;
    if (e.kind === 'turret') stepTurret(w, e);
    else if (e.kind === 'missile' && w.tick >= e.impactTick) {
      w.entities = w.entities.filter((x) => x !== e);
      explode(w, e.pos, { radius: MISSILE_RADIUS, damage: MISSILE_DAMAGE, sourceId: e.ownerId, cause: 'missile', breaks: true });
    }
  }
  // Recon Pulse: every N seconds the whole enemy team is pinged (and told about it)
  if (live(w))
    for (const team of [0, 1] as TeamId[]) {
      const l = lvl(w.cards[team], 'pulse');
      if (!l || w.tick % secs(PULSE_SECONDS[l]) !== 0) continue;
      for (const en of w.actors) if (en.alive && en.team !== team) w.marks[team].set(en.id, { pos: { ...en.pos }, untilTick: w.tick + secs(2.5), byId: -1 });
      w.emit({ type: 'pulse', team });
    }
  // Poison Rounds: damage over time, credited to whoever poisoned you
  for (const a of w.actors) {
    if (!a.alive || !a.poison) continue;
    if (w.tick > a.poison.until) {
      a.poison = null;
      continue;
    }
    if (w.tick >= a.poison.nextTick) {
      a.poison.nextTick = w.tick + secs(0.5);
      w.damageActor(a, a.poison.dps / 2, a.poison.by, true);
    }
  }
}

function useCard(w: World, a: Actor, c: NonNullable<ActorIntent['card']>) {
  const charges = w.cardCharges[a.team];
  const fail = (reason: string) => w.emit({ type: 'gadgetInvalid', actorId: a.id, reason });
  if (!live(w)) return fail('Cards unlock when the action starts');
  if (c.type === 'turret') {
    if (charges.turret <= 0) return fail('No turrets left this round');
    const pos = turretSpot(w, a);
    if (!pos) return fail('No room for a turret here');
    charges.turret--;
    const t: TurretEntity = { kind: 'turret', id: w.newEntityId(), team: a.team, ownerId: a.id, pos, facing: a.facing, hp: TURRET_HP, level: lvl(w.cards[a.team], 'turret'), expiresTick: w.tick + secs(TURRET_SECONDS), nextShotTick: 0, targetId: -1, acquiredTick: 0 };
    w.entities.push(t);
    w.bumpGeometry();
    w.emit({ type: 'turretDeployed', turretId: t.id, ownerId: a.id });
    w.emitSound(pos, 'gadget', 5, a.team, a.id);
  } else {
    if (charges.missile <= 0) return fail('No missiles left this round');
    const p = { x: c.x, y: c.y };
    if (dist(a.pos, p) > MISSILE_RANGE + 0.01) return fail('Out of missile range');
    if (p.x < 0.5 || p.y < 0.5 || p.x > w.map.w - 0.5 || p.y > w.map.h - 0.5) return fail('Off the map');
    charges.missile--;
    const m: MissileEntity = { kind: 'missile', id: w.newEntityId(), team: a.team, ownerId: a.id, pos: p, impactTick: w.tick + secs(MISSILE_WARNING) };
    w.entities.push(m);
    w.emit({ type: 'missileIncoming', missileId: m.id, pos: { ...p }, team: a.team, ownerId: a.id });
    w.emitSound(p, 'gadget', 14, a.team, a.id);
  }
}

/** In front of you if there's room, else at your feet; never in a doorway. */
function turretSpot(w: World, a: Actor): Vec | null {
  const m = w.map;
  // front-right first (stays visible beside you), then front-left, straight ahead, at your feet
  const offs: Array<[number, number]> = [
    [0.8, 1.2],
    [-0.8, 1.2],
    [0, 1.3],
    [0, 0],
  ];
  const tries = offs.map(([da, d]) => ({ x: a.pos.x + Math.cos(a.facing + da) * d, y: a.pos.y + Math.sin(a.facing + da) * d }));
  for (const p of tries) {
    const i = Math.floor(p.y) * m.w + Math.floor(p.x);
    if (i < 0 || i >= m.w * m.h || m.doorOf[i] >= 0 || m.softGroupOf[i] >= 0) continue;
    if (raycast(w, a.pos, p, 'move', { obs: w.obstacles() }) && p !== tries[3]) continue;
    if (w.entities.some((e) => (e.kind === 'turret' || e.kind === 'barrel') && dist(e.pos, p) < 0.8)) continue;
    return p;
  }
  return null;
}

function stepTurret(w: World, t: TurretEntity) {
  if (w.tick >= t.expiresTick) {
    w.entities = w.entities.filter((x) => x !== t);
    w.bumpGeometry();
    w.emit({ type: 'turretExpired', turretId: t.id, pos: { ...t.pos } });
    return;
  }
  // fair perception: only targets it can actually see, within range
  const obs = w.obstacles();
  let target: Actor | null = null;
  let bd = Infinity;
  for (const en of w.actors) {
    if (!en.alive || en.team === t.team) continue;
    const d = dist(en.pos, t.pos);
    if (d > TURRET_RANGE || d >= bd) continue;
    if (raycast(w, t.pos, en.pos, 'sight', { obs, ignoreEntity: t.id })) continue;
    target = en;
    bd = d;
  }
  if (!target) {
    t.targetId = -1;
    return;
  }
  if (target.id !== t.targetId) {
    t.targetId = target.id;
    t.acquiredTick = w.tick;
  }
  const want = angleTo(t.pos, target.pos);
  const delta = normAngle(want - t.facing);
  const max = TURRET_TURN / 60;
  t.facing += Math.max(-max, Math.min(max, delta));
  if (w.tick - t.acquiredTick < secs(TURRET_REACTION) || Math.abs(normAngle(want - t.facing)) > 0.12 || w.tick < t.nextShotTick) return;
  t.nextShotTick = w.tick + secs(TURRET_INTERVAL);
  const ang = t.facing + w.rng.gauss() * 0.05;
  const from = { x: t.pos.x + Math.cos(ang) * 0.35, y: t.pos.y + Math.sin(ang) * 0.35 };
  const to = { x: from.x + Math.cos(ang) * TURRET_RANGE * 1.3, y: from.y + Math.sin(ang) * TURRET_RANGE * 1.3 };
  const hit = raycast(w, from, to, 'bullet', { obs, ignoreEntity: t.id });
  const tWall = hit ? hit.t : 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  let best: Actor | null = null;
  let bestT = tWall;
  for (const b of w.actors) {
    if (!b.alive || b.team === t.team) continue;
    const fx = from.x - b.pos.x;
    const fy = from.y - b.pos.y;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - 0.16;
    const disc = B * B - 4 * len2 * C;
    if (disc < 0) continue;
    const tt = (-B - Math.sqrt(disc)) / (2 * len2);
    if (tt >= 0 && tt < bestT) {
      bestT = tt;
      best = b;
    }
  }
  const end = { x: from.x + dx * bestT, y: from.y + dy * bestT };
  if (best) w.damageActor(best, TURRET_DAMAGE[t.level] ?? 9, t.ownerId);
  else if (hit?.entityId != null) damageEntity(w, hit.entityId, TURRET_DAMAGE[t.level] ?? 9, t.ownerId);
  if (!best && hit) w.emit({ type: 'surfaceHit', pos: hit.point, material: hit.entityId != null ? 'gadget' : 'wall' });
  w.emit({ type: 'turretShot', turretId: t.id, from, to: end, hitActor: best?.id ?? null });
  w.emitSound(t.pos, 'shot', 10, t.team, -t.id);
}

/** Turrets are shot down like any gadget. */
export function damageTurret(w: World, t: TurretEntity, amount: number) {
  t.hp -= amount;
  if (t.hp <= 0) {
    w.entities = w.entities.filter((x) => x !== t);
    w.bumpGeometry();
    w.emit({ type: 'turretDestroyed', turretId: t.id, pos: { ...t.pos } });
  }
}
