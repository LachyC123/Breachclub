// Signature gadgets (Ram's bumper sled, Hinge's pivot wall) plus side-standard tools.
// Every commit is validate -> reserve use -> perform -> emit, per docs/04 global contract.
import { secs, DT } from '../content/defs';
import {
  circleObbOverlap,
  obbHitsCells,
  obbOverlap,
  sledObb,
  hingeObb,
  dist,
  normAngle,
  COVER_HALF_LEN,
  COVER_HALF_THICK,
  HINGE_HALF_LEN,
  HINGE_HALF_THICK,
  cellBlocks,
  raycast,
  type GeoState,
} from './geometry';
import type { Actor, ActorIntent, CoverEntity, HingeEntity, Obb, SledEntity, Vec, ChargeEntity } from './types';
import type { World } from './world';
import { ACTOR_RADIUS, moveCircle } from './movement';

export const SLED_SPEED = 6;
export const SLED_RANGE = 6;
export const SLED_AFTER_BREACH = 2;
export const SLED_HP = 60;
export const SLED_HIT_DAMAGE = 20;
export const SLED_SHOVE = 0.5;
export const SLED_HINGE_DAMAGE = 60;
export const COVER_HP = 120;
export const COVER_SECONDS = 12;
export const RAM_WINDUP = 0.35;
export const HINGE_HP = 160;
export const HINGE_WARNING = 0.25;
export const HINGE_ROTATE = 0.6;
export const HINGE_COOLDOWN = 4;
export const HINGE_REMOTE_RANGE = 6;
export const HINGE_PLACE_RANGE = 3;
export const CHARGE_FUSE = 1.2;
export const CHARGE_DAMAGE = 35;

// ---------- walls ----------

export function breachSoftGroup(w: World, group: number, by: number, cause: 'sled' | 'charge' | 'gunfire') {
  const st = w.soft[group];
  if (st.state !== 'intact') return false;
  st.state = 'breached';
  st.hp = 0;
  w.bumpGeometry();
  w.emit({ type: 'wallBreached', group, by, cause });
  const g = w.map.softGroups[group];
  const team = w.actor(by)?.team ?? w.attackTeam;
  w.emitSound(g.center, 'breach', 14, team, by);
  return true;
}

export function destroyBarricade(w: World, door: number, by: number) {
  if (!w.barricades[door]) return false;
  w.barricades[door] = null;
  w.bumpGeometry();
  w.emit({ type: 'barricadeBroken', door, by });
  const team = w.actor(by)?.team ?? w.attackTeam;
  w.emitSound(w.map.doors[door].center, 'breach', 10, team, by);
  return true;
}

export function damageEntity(w: World, id: number, amount: number, by: number) {
  const e = w.entities.find((x) => x.id === id);
  if (!e) return;
  if (e.kind === 'sled') {
    e.hp -= amount;
    if (e.hp <= 0) {
      removeEntity(w, e.id);
      w.emit({ type: 'sledDestroyed', sledId: e.id, pos: { ...e.pos } });
    }
  } else if (e.kind === 'cover') {
    e.hp -= amount;
    if (e.hp <= 0) {
      removeEntity(w, e.id);
      w.emit({ type: 'coverDestroyed', coverId: e.id, pos: { x: e.obb.cx, y: e.obb.cy } });
    }
  } else if (e.kind === 'hinge') {
    e.hp -= amount;
    if (e.hp <= 0) {
      removeEntity(w, e.id);
      w.emit({ type: 'hingeDestroyed', hingeId: e.id, pos: { ...e.center } });
    }
  }
  void by;
}

function removeEntity(w: World, id: number) {
  w.entities = w.entities.filter((x) => x.id !== id);
  w.bumpGeometry();
}

// ---------- command intake ----------

export function stepGadgetCommands(w: World, get: (a: Actor) => ActorIntent) {
  for (const a of w.actors) {
    if (!a.alive) continue;
    const cmd = get(a).gadget;
    if (!cmd) continue;
    switch (cmd.type) {
      case 'ramLaunch': {
        const v = validateRamLaunch(w, a);
        if (!v.ok) {
          w.emit({ type: 'gadgetInvalid', actorId: a.id, reason: v.reason });
          break;
        }
        a.gadgetCharges--; // committed: charge spent at launch commit
        a.gadgetWindupUntil = w.tick + secs(RAM_WINDUP);
        a.pendingLaunchAngle = cmd.angle;
        a.facing = cmd.angle;
        w.emit({ type: 'ramWindup', actorId: a.id, angle: cmd.angle });
        break;
      }
      case 'ramDeploy': {
        const sled = w.entities.find((e): e is SledEntity => e.kind === 'sled' && e.ownerId === a.id);
        if (sled) sled.deployRequested = true;
        break;
      }
      case 'hingePlace': {
        const v = validateHingePlacement(w, a, { x: cmd.x, y: cmd.y }, cmd.vertical);
        if (!v.ok) {
          w.emit({ type: 'gadgetInvalid', actorId: a.id, reason: v.reason });
          break;
        }
        a.gadgetCharges--;
        const e: HingeEntity = {
          kind: 'hinge',
          id: w.newEntityId(),
          team: a.team,
          ownerId: a.id,
          center: { x: cmd.x, y: cmd.y },
          angle: cmd.vertical ? Math.PI / 2 : 0,
          orient: cmd.vertical ? 1 : 0,
          hp: HINGE_HP,
          maxHp: HINGE_HP,
          state: 'idle',
          stateTick: w.tick,
          fromAngle: 0,
          toAngle: 0,
          progress: 0,
          cooldownUntil: w.tick + secs(0.5),
        };
        w.entities.push(e);
        w.bumpGeometry();
        w.emit({ type: 'hingePlaced', hingeId: e.id, actorId: a.id });
        w.emitSound(e.center, 'gadget', 6, a.team, a.id);
        break;
      }
      case 'hingeRotate': {
        const h = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
        if (!h) {
          w.emit({ type: 'gadgetInvalid', actorId: a.id, reason: 'No wall placed' });
          break;
        }
        const v = validateHingeRotateStart(w, a, h);
        if (!v.ok) {
          w.emit({ type: 'gadgetInvalid', actorId: a.id, reason: v.reason });
          break;
        }
        const sweep = hingeSweepBlocked(w, h);
        if (sweep) {
          w.emit({ type: 'hingeBlocked', hingeId: h.id, reason: sweep.reason, cells: sweep.cells });
          break;
        }
        h.state = 'warning';
        h.stateTick = w.tick;
        h.fromAngle = h.angle;
        h.toAngle = h.orient === 0 ? h.angle + Math.PI / 2 : h.angle - Math.PI / 2;
        h.progress = 0;
        w.emit({ type: 'hingeWarning', hingeId: h.id });
        w.emitSound(h.center, 'gadget', 8, h.team, a.id);
        break;
      }
    }
  }
}

// ---------- Ram ----------

export type Validation = { ok: true } | { ok: false; reason: string };

export function validateRamLaunch(w: World, a: Actor): Validation {
  if (a.operatorId !== 'ram') return { ok: false, reason: 'No sled' };
  if (w.phase === 'prep') return { ok: false, reason: 'Available when action starts' };
  if (w.phase === 'ended') return { ok: false, reason: 'Round over' };
  if (a.gadgetCharges <= 0) return { ok: false, reason: 'Sled already used' };
  if (a.interaction || a.vaulting) return { ok: false, reason: 'Busy' };
  if (w.entities.some((e) => e.kind === 'sled' && e.ownerId === a.id)) return { ok: false, reason: 'Sled active' };
  return { ok: true };
}

/** Straight-line preview for the sled: where it would breach and stop (no hidden actor info). */
export function previewSledPath(w: GeoState, from: Vec, angle: number): { points: Vec[]; breachGroup: number; breachDoor: number; stop: Vec; hard: boolean } {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const start = { x: from.x + dir.x * 0.55, y: from.y + dir.y * 0.55 };
  let traveled = 0;
  let max = SLED_RANGE;
  let breachGroup = -1;
  let breachDoor = -1;
  const p = { ...start };
  const pts: Vec[] = [{ ...p }];
  let hard = false;
  const step = 0.1;
  // a lightweight copy of panel states so the preview "sees through" the first breachable panel
  const passGroup = new Set<number>();
  const passDoor = new Set<number>();
  while (traveled < max) {
    const nx = p.x + dir.x * step;
    const ny = p.y + dir.y * step;
    const obb: Obb = { cx: nx, cy: ny, hx: 0.3, hy: 0.25, angle };
    const cells = obbHitsCells(w, obb, 'move').filter((c) => {
      const ci = c.y * w.map.w + c.x;
      const g = w.map.softGroupOf[ci];
      const d = w.map.doorOf[ci];
      return !(g >= 0 && passGroup.has(g)) && !(d >= 0 && passDoor.has(d));
    });
    let blocked = false;
    for (const c of cells) {
      const ci = c.y * w.map.w + c.x;
      const g = w.map.softGroupOf[ci];
      const d = w.map.doorOf[ci];
      if (g >= 0 && w.soft[g].state === 'intact' && breachGroup < 0 && breachDoor < 0) {
        breachGroup = g;
        passGroup.add(g);
        max = Math.min(SLED_RANGE + 1.2, traveled + SLED_AFTER_BREACH + 1.1);
      } else if (d >= 0 && w.barricades[d] && breachGroup < 0 && breachDoor < 0) {
        breachDoor = d;
        passDoor.add(d);
        max = Math.min(SLED_RANGE + 1.2, traveled + SLED_AFTER_BREACH + 1.1);
      } else {
        blocked = true;
      }
    }
    if (blocked) {
      hard = true;
      break;
    }
    p.x = nx;
    p.y = ny;
    traveled += step;
    if (pts.length === 0 || dist(pts[pts.length - 1], p) > 0.5) pts.push({ ...p });
  }
  pts.push({ ...p });
  return { points: pts, breachGroup, breachDoor, stop: { ...p }, hard };
}

function launchSled(w: World, a: Actor) {
  const angle = a.pendingLaunchAngle ?? a.facing;
  a.pendingLaunchAngle = null;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const sled: SledEntity = {
    kind: 'sled',
    id: w.newEntityId(),
    team: a.team,
    ownerId: a.id,
    pos: { x: a.pos.x + dir.x * 0.55, y: a.pos.y + dir.y * 0.55 },
    dir: angle,
    traveled: 0,
    maxTravel: SLED_RANGE,
    breached: false,
    afterBreach: 0,
    hp: SLED_HP,
    hitActors: [],
    deployRequested: false,
  };
  w.entities.push(sled);
  w.bumpGeometry();
  w.emit({ type: 'sledLaunched', actorId: a.id, sledId: sled.id });
  w.emitSound(sled.pos, 'gadget', 8, a.team, a.id);
}

function stepSled(w: World, s: SledEntity) {
  if (s.deployRequested || s.traveled >= s.maxTravel) {
    stopSled(w, s, s.deployRequested ? 'braked' : 'range');
    return;
  }
  const stepLen = SLED_SPEED * DT;
  const dir = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
  const next = { x: s.pos.x + dir.x * stepLen, y: s.pos.y + dir.y * stepLen };
  const obb = sledObb({ pos: next, dir: s.dir });

  // structure
  const cells = obbHitsCells(w, obb, 'move');
  for (const c of cells) {
    const ci = c.y * w.map.w + c.x;
    const g = w.map.softGroupOf[ci];
    const d = w.map.doorOf[ci];
    if (g >= 0 && w.soft[g].state === 'intact' && !s.breached) {
      breachSoftGroup(w, g, s.ownerId, 'sled');
      s.breached = true;
      s.maxTravel = Math.min(SLED_RANGE + 1.2, s.traveled + SLED_AFTER_BREACH + 1.1);
    } else if (d >= 0 && w.barricades[d] && !s.breached) {
      destroyBarricade(w, d, s.ownerId);
      s.breached = true;
      s.maxTravel = Math.min(SLED_RANGE + 1.2, s.traveled + SLED_AFTER_BREACH + 1.1);
    } else if (cellBlocks(w, c.x, c.y, 'move')) {
      stopSled(w, s, g >= 0 && w.soft[g].state === 'reinforced' ? 'reinforced' : 'wall');
      return;
    }
  }
  // other gadgets
  for (const e of w.entities) {
    if (e.id === s.id) continue;
    if (e.kind === 'hinge' && obbOverlap(obb, hingeObb(e))) {
      damageEntity(w, e.id, SLED_HINGE_DAMAGE, s.ownerId);
      w.emit({ type: 'surfaceHit', pos: { ...next }, material: 'gadget' });
      stopSled(w, s, 'hinge');
      return;
    }
    if (e.kind === 'cover' && obbOverlap(obb, e.obb)) {
      stopSled(w, s, 'cover');
      return;
    }
    if (e.kind === 'sled' && obbOverlap(obb, sledObb(e))) {
      stopSled(w, s, 'sled');
      return;
    }
  }
  // actors: one hit per enemy, friendlies stop it
  for (const b of w.actors) {
    if (!b.alive || b.vaulting) continue;
    if (!circleObbOverlap(b.pos, ACTOR_RADIUS, obb)) continue;
    // the sled drives away from its own launcher; never stopped by the owner's body
    if (b.id === s.ownerId) continue;
    if (b.team === s.team) {
      stopSled(w, s, 'ally');
      return;
    }
    if (!s.hitActors.includes(b.id)) {
      s.hitActors.push(b.id);
      w.damageActor(b, SLED_HIT_DAMAGE, s.ownerId);
      moveCircle(w, b, b.pos, dir.x * SLED_SHOVE + -dir.y * 0.05, dir.y * SLED_SHOVE + dir.x * 0.05);
      w.emit({ type: 'sledHitActor', sledId: s.id, actorId: b.id });
      if (circleObbOverlap(b.pos, ACTOR_RADIUS, obb)) {
        stopSled(w, s, 'blocked');
        return;
      }
    } else {
      // already hit once: no repeated contact damage; the body simply stops the sled
      stopSled(w, s, 'blocked');
      return;
    }
  }
  s.pos = next;
  s.traveled += stepLen;
  w.invalidateObstacles();
  if (w.tick % 18 === 0) w.emitSound(s.pos, 'gadget', 8, s.team, s.ownerId);
}

function stopSled(w: World, s: SledEntity, reason: string) {
  removeEntity(w, s.id);
  w.emit({ type: 'sledStopped', sledId: s.id, pos: { ...s.pos }, reason });
  const dir = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
  for (const back of [0, 0.2, 0.4]) {
    const c = { x: s.pos.x - dir.x * back, y: s.pos.y - dir.y * back };
    const obb: Obb = { cx: c.x, cy: c.y, hx: COVER_HALF_LEN, hy: COVER_HALF_THICK, angle: s.dir + Math.PI / 2 };
    if (coverPlacementValid(w, obb)) {
      const cover: CoverEntity = {
        kind: 'cover',
        id: w.newEntityId(),
        team: s.team,
        ownerId: s.ownerId,
        obb,
        hp: COVER_HP,
        maxHp: COVER_HP,
        expiresTick: w.tick + secs(COVER_SECONDS),
      };
      w.entities.push(cover);
      w.bumpGeometry();
      w.emit({ type: 'coverDeployed', coverId: cover.id });
      w.emitSound(c, 'gadget', 6, s.team, s.ownerId);
      return;
    }
  }
}

function coverPlacementValid(w: World, obb: Obb): boolean {
  if (obbHitsCells(w, obb, 'move').length > 0) return false;
  for (const b of w.actors) if (b.alive && circleObbOverlap(b.pos, ACTOR_RADIUS, obb)) return false;
  for (const e of w.entities) {
    if (e.kind === 'hinge' && obbOverlap(obb, hingeObb(e))) return false;
    if (e.kind === 'cover' && obbOverlap(obb, e.obb)) return false;
  }
  return true;
}

// ---------- Hinge ----------

/** cells around protected doorways and the console that gadgets may never occupy */
export function protectedCells(w: World): Set<number> {
  const out = new Set<number>();
  const m = w.map;
  for (const d of m.doors) {
    if (!d.protected) continue;
    for (const c of d.cells) {
      const x = c % m.w;
      const y = Math.floor(c / m.w);
      for (let k = -1; k <= 1; k++) {
        const nx = d.horizontal ? x : x + k;
        const ny = d.horizontal ? y + k : y;
        out.add(ny * m.w + nx);
      }
    }
  }
  for (const c of m.console.cells) {
    const x = c % m.w;
    const y = Math.floor(c / m.w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.add((y + dy) * m.w + x + dx);
  }
  return out;
}

export function hingePreviewObb(p: Vec, vertical: boolean): Obb {
  return { cx: p.x, cy: p.y, hx: HINGE_HALF_LEN, hy: HINGE_HALF_THICK, angle: vertical ? Math.PI / 2 : 0 };
}

export function validateHingePlacement(w: World, a: Actor, p: Vec, vertical: boolean): Validation {
  if (a.operatorId !== 'hinge') return { ok: false, reason: 'No pivot wall' };
  if (w.phase === 'ended') return { ok: false, reason: 'Round over' };
  if (a.gadgetCharges <= 0 || w.entities.some((e) => e.kind === 'hinge' && e.ownerId === a.id)) return { ok: false, reason: 'Wall already placed' };
  if (dist(a.pos, p) > HINGE_PLACE_RANGE) return { ok: false, reason: 'Too far' };
  if (raycast(w, a.pos, p, 'move', { obs: w.obstacles() })) return { ok: false, reason: 'No clear reach' };
  const obb = hingePreviewObb(p, vertical);
  if (obbHitsCells(w, obb, 'move').length > 0) return { ok: false, reason: 'Hits a wall' };
  const prot = protectedCells(w);
  const m = w.map;
  for (let y = Math.floor(p.y - 1.2); y <= Math.floor(p.y + 1.2); y++)
    for (let x = Math.floor(p.x - 1.2); x <= Math.floor(p.x + 1.2); x++) {
      if (!prot.has(y * m.w + x)) continue;
      if (obbOverlap(obb, { cx: x + 0.5, cy: y + 0.5, hx: 0.5, hy: 0.5, angle: 0 }))
        return { ok: false, reason: 'Keep approach open' };
    }
  if (w.prepConfine && w.phase === 'prep') {
    for (const c of [{ x: p.x + (vertical ? 0 : 1), y: p.y + (vertical ? 1 : 0) }, { x: p.x - (vertical ? 0 : 1), y: p.y - (vertical ? 1 : 0) }]) {
      if (!m.interior[Math.floor(c.y) * m.w + Math.floor(c.x)]) return { ok: false, reason: 'Stay inside during prep' };
    }
  }
  for (const e of w.entities) {
    if (e.kind === 'cover' && obbOverlap(obb, e.obb)) return { ok: false, reason: 'Occupied by cover' };
    if (e.kind === 'sled' && obbOverlap(obb, sledObb(e))) return { ok: false, reason: 'Space occupied' };
  }
  for (const b of w.actors) if (b.alive && circleObbOverlap(b.pos, ACTOR_RADIUS + 0.02, obb)) return { ok: false, reason: 'Space occupied' };
  for (const entry of m.entries) for (const s of entry.spots) if (dist({ x: s[0], y: s[1] }, p) < 2.5) return { ok: false, reason: 'Too close to a spawn' };
  return { ok: true };
}

export function validateHingeRotateStart(w: World, a: Actor, h: HingeEntity): Validation {
  if (h.ownerId !== a.id) return { ok: false, reason: 'Not your wall' };
  if (h.state !== 'idle') return { ok: false, reason: 'Already turning' };
  if (w.tick < h.cooldownUntil) return { ok: false, reason: 'Recovering' };
  if (dist(a.pos, h.center) > HINGE_REMOTE_RANGE) return { ok: false, reason: 'Too far from wall' };
  return { ok: true };
}

/** Points along the swept quarter-discs of a 90 degree rotation. */
function sweepSamples(h: HingeEntity, from: number, to: number): Vec[] {
  const pts: Vec[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const ang = from + ((to - from) * i) / n;
    for (const r of [0.25, 0.5, 0.75, HINGE_HALF_LEN - 0.02]) {
      for (const sgn of [1, -1]) {
        pts.push({ x: h.center.x + Math.cos(ang) * r * sgn, y: h.center.y + Math.sin(ang) * r * sgn });
      }
    }
  }
  return pts;
}

/** Entire swept footprint must be clear of actors, structure and other gadgets. */
export function hingeSweepBlocked(w: World, h: HingeEntity): { reason: string; cells: Vec[] } | null {
  const from = h.angle;
  const to = h.orient === 0 ? h.angle + Math.PI / 2 : h.angle - Math.PI / 2;
  const cells: Vec[] = [];
  const seen = new Set<number>();
  let reason = '';
  const pts = sweepSamples(h, from, to);
  for (const p of pts) {
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    if (cellBlocks(w, cx, cy, 'move')) {
      const k = cy * w.map.w + cx;
      if (!seen.has(k)) {
        seen.add(k);
        cells.push({ x: cx, y: cy });
      }
      reason ||= 'Swing blocked by wall';
    }
  }
  // actors anywhere inside the swept quarter-discs (distance + angle), reported only as a cell
  const R = HINGE_HALF_LEN + HINGE_HALF_THICK + ACTOR_RADIUS;
  for (const b of w.actors) {
    if (!b.alive) continue;
    const d = dist(b.pos, h.center);
    if (d > R) continue;
    const ang = Math.atan2(b.pos.y - h.center.y, b.pos.x - h.center.x);
    const inSweep = (base: number) => {
      const lo = Math.min(from, to) + base;
      const rel = normAngle(ang - lo);
      const span = Math.abs(to - from);
      const pad = Math.asin(Math.min(1, (ACTOR_RADIUS + HINGE_HALF_THICK) / Math.max(d, 0.01)));
      return rel >= -pad && rel <= span + pad;
    };
    if (d < ACTOR_RADIUS + HINGE_HALF_THICK + 0.05 || inSweep(0) || inSweep(Math.PI)) {
      const cx = Math.floor(b.pos.x);
      const cy = Math.floor(b.pos.y);
      const k = cy * w.map.w + cx;
      if (!seen.has(k)) {
        seen.add(k);
        cells.push({ x: cx, y: cy });
      }
      reason ||= 'Space occupied';
    }
  }
  for (const e of w.entities) {
    if (e.id === h.id) continue;
    const o = e.kind === 'cover' ? e.obb : e.kind === 'sled' ? sledObb(e) : e.kind === 'hinge' ? hingeObb(e) : null;
    if (!o) continue;
    for (const p of pts)
      if (circleObbOverlap(p, 0.05, o)) {
        reason ||= 'Gadget in the way';
        cells.push({ x: Math.floor(p.x), y: Math.floor(p.y) });
        break;
      }
  }
  return reason ? { reason, cells } : null;
}

function stepHinge(w: World, h: HingeEntity) {
  const owner = w.actor(h.ownerId);
  if (h.state === 'warning') {
    if (w.tick - h.stateTick >= secs(HINGE_WARNING)) {
      const blocked = hingeSweepBlocked(w, h);
      if (blocked) {
        h.state = 'idle';
        w.emit({ type: 'hingeBlocked', hingeId: h.id, reason: blocked.reason, cells: blocked.cells });
        return;
      }
      h.state = 'rotating';
      h.stateTick = w.tick;
      w.emit({ type: 'hingeRotateStart', hingeId: h.id });
      w.emitSound(h.center, 'gadget', 8, h.team, h.ownerId);
    }
  } else if (h.state === 'rotating') {
    const total = secs(HINGE_ROTATE);
    const nextProgress = h.progress + 1;
    const nextAngle = h.fromAngle + (h.toAngle - h.fromAngle) * Math.min(1, nextProgress / total);
    const nextObb = hingeObb({ center: h.center, angle: nextAngle });
    // never crush or shove: stall while a body is in the moving footprint
    const intruder = w.actors.some((b) => b.alive && circleObbOverlap(b.pos, ACTOR_RADIUS, nextObb));
    if (!intruder) {
      h.progress = nextProgress;
      h.angle = nextAngle;
      w.invalidateObstacles();
    }
    if (h.progress >= total) {
      h.angle = h.toAngle;
      h.orient = h.orient === 0 ? 1 : 0;
      h.state = 'idle';
      h.cooldownUntil = w.tick + secs(HINGE_COOLDOWN);
      w.bumpGeometry();
      w.emit({ type: 'hingeRotateEnd', hingeId: h.id });
    }
  }
  void owner;
}

// ---------- charges ----------

export function plantCharge(w: World, a: Actor, target: { type: 'soft' | 'door'; index: number }) {
  const pos = target.type === 'soft' ? w.map.softGroups[target.index].center : w.map.doors[target.index].center;
  const c: ChargeEntity = {
    kind: 'charge',
    id: w.newEntityId(),
    team: a.team,
    ownerId: a.id,
    pos: { x: (pos.x + a.pos.x) / 2, y: (pos.y + a.pos.y) / 2 },
    target,
    detonateTick: w.tick + secs(CHARGE_FUSE),
  };
  a.breachCharges--;
  w.entities.push(c);
  w.emit({ type: 'chargePlanted', chargeId: c.id, actorId: a.id });
  w.emitSound(c.pos, 'gadget', 6, a.team, a.id);
}

function detonateCharge(w: World, c: ChargeEntity) {
  w.entities = w.entities.filter((e) => e.id !== c.id);
  let did = false;
  if (c.target.type === 'soft') did = breachSoftGroup(w, c.target.index, c.ownerId, 'charge');
  else did = destroyBarricade(w, c.target.index, c.ownerId);
  if (!did) {
    // reinforced or already open: a dull thunk, no effect
    w.emit({ type: 'surfaceHit', pos: c.pos, material: 'soft', reinforced: true });
    w.emitSound(c.pos, 'breach', 8, c.team, c.ownerId);
    return;
  }
  const centre = c.target.type === 'soft' ? w.map.softGroups[c.target.index].center : w.map.doors[c.target.index].center;
  for (const b of w.actors) {
    if (!b.alive || b.team === c.team) continue;
    if (dist(b.pos, centre) > 1.8) continue;
    if (raycast(w, centre, b.pos, 'bullet', { obs: w.obstacles() })) continue;
    w.damageActor(b, CHARGE_DAMAGE, c.ownerId);
  }
}

// ---------- per-tick entity update ----------

export function stepEntities(w: World) {
  // Ram windups resolve into launches
  for (const a of w.actors) {
    if (a.pendingLaunchAngle !== null && w.tick >= a.gadgetWindupUntil) {
      // owner death after commit: the sled still launches (committed motion)
      launchSled(w, a);
    }
  }
  for (const e of [...w.entities]) {
    if (!w.entities.includes(e)) continue;
    if (e.kind === 'sled') stepSled(w, e);
    else if (e.kind === 'hinge') stepHinge(w, e);
    else if (e.kind === 'cover') {
      if (w.tick >= e.expiresTick) {
        removeEntity(w, e.id);
        w.emit({ type: 'coverExpired', coverId: e.id });
      }
    } else if (e.kind === 'charge') {
      if (w.tick >= e.detonateTick) detonateCharge(w, e);
    }
  }
}
