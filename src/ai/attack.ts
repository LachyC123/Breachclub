// Attacking squad strategy: drone the building in prep, then take a planned route in stages —
// stack beside each threshold, enter with the entry fragger first and teammates trading behind,
// breach soft panels on the route, send a flanker on a different route, plant, and hold post-plant.
// When the player attacks, their bots escort them instead (unless ordered to push).
import { secs } from '../content/defs';
import { angleTo, dist } from '../sim/geometry';
import { raycast } from '../sim/geometry';
import { previewSledPath, validateRamLaunch } from '../sim/gadgets';
import { DRONE_VISION } from '../sim/perception';
import type { Actor, ActorIntent, DroneEntity, TeamId, Vec } from '../sim/types';
import type { World } from '../sim/world';
import { findPath, navGrid, type PathPoint } from './nav';
import { postPlantSpots } from './tactics';
import type { BotState, Task } from './types';

interface Checkpoint {
  pos: Vec;
  watch: Vec;
  stack: boolean;
}

export interface AttackPlan {
  team: TeamId;
  route: PathPoint[];
  breaches: number[];
  checkpoints: Checkpoint[];
  flank: Checkpoint[] | null;
  stage: number;
  stageSince: number;
  flankStage: number;
  flankWaitSince: number;
  rev: number;
  planterId: number;
}

const walkAt = (w: World, p: Vec) => {
  const g = navGrid(w, 'attack');
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x >= 0 && y >= 0 && x < w.map.w && y < w.map.h && g.walk[y * w.map.w + x] === 1;
};

/** Thresholds along a route (entering the building, entering the objective room) become stacks. */
function checkpointsFor(w: World, route: PathPoint[]): Checkpoint[] {
  const m = w.map;
  const out: Checkpoint[] = [];
  const objRoom = m.rooms.findIndex((r) => r.id === m.objectiveRoom);
  let wasInterior = -1;
  let wasObj = false;
  for (let i = 1; i < route.length; i++) {
    const p = route[i];
    const ci = Math.floor(p.y) * m.w + Math.floor(p.x);
    const interior = m.interior[ci];
    const inObj = m.roomOf[ci] === objRoom;
    const crossesIn = (wasInterior === 0 && interior === 1) || (!wasObj && inObj && i > 1);
    if (crossesIn) {
      // stand back from the threshold, beside it, and look through it
      let j = i - 1;
      while (j > 0 && dist(route[j], p) < 2.2) j--;
      const back = route[j];
      const dx = p.x - back.x;
      const dy = p.y - back.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      let stack = { x: p.x - dir.x * 2.0, y: p.y - dir.y * 2.0 };
      if (!walkAt(w, stack)) stack = { ...back };
      out.push({ pos: stack, watch: { x: p.x + dir.x * 2, y: p.y + dir.y * 2 }, stack: true });
      const inside = { x: p.x + dir.x * 2.2, y: p.y + dir.y * 2.2 };
      out.push({ pos: walkAt(w, inside) ? inside : { ...p }, watch: { x: p.x + dir.x * 6, y: p.y + dir.y * 6 }, stack: false });
    }
    wasInterior = interior;
    wasObj = inObj;
  }
  out.push({ pos: { ...m.console.center }, watch: m.console.center, stack: false });
  return out;
}

export function buildAttackPlan(w: World, team: TeamId, canBreach: boolean, from: Vec): AttackPlan | null {
  const route = findPath(w, 'attack', from, w.map.console.center, canBreach ? { breachCost: 7 } : {});
  if (!route) return null;
  const checkpoints = checkpointsFor(w, route.points);
  // flank: a second route that avoids the main one, if it reaches the objective another way
  const extra = new Float32Array(w.map.w * w.map.h);
  for (const c of route.cells) {
    const x = c % w.map.w;
    const y = Math.floor(c / w.map.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w.map.w && ny < w.map.h) extra[ny * w.map.w + nx] = 6;
      }
  }
  const alt = findPath(w, 'attack', from, w.map.console.center, { extra });
  let flank: Checkpoint[] | null = null;
  if (alt) {
    const fc = checkpointsFor(w, alt.points);
    const lastMain = checkpoints.filter((c) => c.stack).pop();
    const lastFlank = fc.filter((c) => c.stack).pop();
    // a flank worth taking: genuinely different entrance, not a lap around the block
    if (lastMain && lastFlank && dist(lastMain.pos, lastFlank.pos) > 4 && alt.points.length < route.points.length * 1.6 + 6) flank = fc;
  }
  return { team, route: route.points, breaches: route.breaches, checkpoints, flank, stage: 0, stageSince: w.tick, flankStage: 0, flankWaitSince: -1, rev: w.geometryRevision, planterId: -1 };
}

/** Team stage advances once everyone is stacked (or waited long enough) and nobody is in a fight. */
export function advancePlan(w: World, plan: AttackPlan, bots: Map<number, BotState>) {
  const members = w.actors.filter((a) => a.team === plan.team && a.alive && a.controller === 'bot' && bots.get(a.id)?.role !== 'flank');
  const cp = plan.checkpoints[Math.min(plan.stage, plan.checkpoints.length - 1)];
  const mainActive = members.length > 0 && plan.stage < plan.checkpoints.length - 1;
  const arrived = members.filter((a) => dist(a.pos, cp.pos) < 2.2).length;
  const fighting = members.some((a) => w.tick - (bots.get(a.id)?.lastEngageTick ?? -999) < secs(1.2));
  const breachPending = plan.breaches.some((t) => (t >= 100 ? !!w.barricades[t - 100] : w.soft[t].state === 'intact')) && cp.stack && plan.stage === firstBreachStage(w, plan);
  const waited = w.tick - plan.stageSince > secs(cp.stack ? 7 : 3);
  if (mainActive && !fighting && !breachPending && (arrived === members.length || waited)) {
    plan.stage++;
    plan.stageSince = w.tick;
  }
  // a flanker waits at its final stack until the main group is ready to push too
  if (plan.flank) {
    const flankStacks = plan.flank.map((c, i) => (c.stack ? i : -1)).filter((i) => i >= 0);
    const lastFlankStack = flankStacks[flankStacks.length - 1] ?? 0;
    const mainStacks = plan.checkpoints.map((c, i) => (c.stack ? i : -1)).filter((i) => i >= 0);
    const lastMainStack = mainStacks[mainStacks.length - 1] ?? 0;
    const flanker = w.actors.find((a) => a.team === plan.team && a.alive && bots.get(a.id)?.role === 'flank');
    if (flanker) {
      const fcp = plan.flank[plan.flankStage];
      const there = fcp && dist(flanker.pos, fcp.pos) < 1.8;
      if (there && plan.flankWaitSince < 0) plan.flankWaitSince = w.tick;
      if (!there) plan.flankWaitSince = -1;
      // hold for the main push, but never wait forever (or for a squad that is gone)
      const gate = plan.flankStage >= lastFlankStack && plan.stage <= lastMainStack && members.length > 0 && w.tick - plan.flankWaitSince < secs(10);
      if (there && !gate && plan.flankStage < plan.flank.length - 1) plan.flankStage++;
    }
  }
}

function firstBreachStage(w: World, plan: AttackPlan): number {
  const t = plan.breaches[0];
  if (t === undefined) return -1;
  const c = t >= 100 ? w.map.doors[t - 100].center : w.map.softGroups[t].center;
  let best = -1;
  let bd = Infinity;
  plan.checkpoints.forEach((cp, i) => {
    if (!cp.stack) return;
    const d = dist(cp.pos, c);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Spread squadmates beside a checkpoint instead of stacking on one tile. */
export function slotOffset(cp: Checkpoint, slot: number): Vec {
  const dir = angleTo(cp.pos, cp.watch);
  const side = slot % 2 === 0 ? 1 : -1;
  const mag = slot === 0 ? 0 : 0.9 * Math.ceil(slot / 2);
  const back = slot === 0 ? 0 : 0.5;
  return { x: cp.pos.x + Math.cos(dir + Math.PI / 2) * side * mag - Math.cos(dir) * back, y: cp.pos.y + Math.sin(dir + Math.PI / 2) * side * mag - Math.sin(dir) * back };
}

export function planBreach(w: World, a: Actor, target: number): Task | null {
  const isDoor = target >= 100;
  const center = isDoor ? w.map.doors[target - 100].center : w.map.softGroups[target].center;
  const horizontal = isDoor ? w.map.doors[target - 100].horizontal : w.map.softGroups[target].horizontal;
  const normal = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const sideSign = (a.pos.x - center.x) * normal.x + (a.pos.y - center.y) * normal.y >= 0 ? 1 : -1;
  const ok = (p: Vec) => walkAt(w, p);
  const useSled = a.operatorId === 'ram' && validateRamLaunch(w, a).ok;
  if (useSled) {
    for (const r of [2.6, 2.1, 3.1])
      for (const lat of [0, 0.4, -0.4]) {
        const stand = { x: center.x + normal.x * sideSign * r + normal.y * lat, y: center.y + normal.y * sideSign * r + normal.x * lat };
        if (!ok(stand)) continue;
        const ang = angleTo(stand, center);
        const prev = previewSledPath(w, stand, ang);
        if ((!isDoor && prev.breachGroup === target) || (isDoor && prev.breachDoor === target - 100)) return { kind: 'breach', target, stage: 'approach', stand, aimAngle: ang, useSled: true, startTick: w.tick };
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

/** Choose who breaches: Ram's sled if available, else whoever carries a charge, closest first. */
export function breacherFor(w: World, team: TeamId, target: number, bots: Map<number, BotState>): Actor | null {
  const center = target >= 100 ? w.map.doors[target - 100].center : w.map.softGroups[target].center;
  const cands = w.actors.filter((a) => a.team === team && a.alive && a.controller === 'bot' && bots.get(a.id)?.role !== 'flank');
  const ram = cands.find((a) => a.operatorId === 'ram' && a.gadgetCharges > 0);
  if (ram && target < 100) return ram;
  return cands.filter((a) => a.breachCharges > 0 || target >= 100).sort((x, y) => dist(x.pos, center) - dist(y.pos, center))[0] ?? ram ?? null;
}

export function postPlantTask(w: World, slot: number): Task {
  const spots = postPlantSpots(w);
  const s = spots[slot % spots.length];
  return { kind: 'hold', pos: s.pos, watch: s.watch, label: 'Holding' };
}

// ---------- drones (prep) ----------

/** Recon route: objective room first, then the other interior rooms. */
export function droneWaypoints(w: World, slot: number): Vec[] {
  const m = w.map;
  const obj = m.rooms.find((r) => r.id === m.objectiveRoom);
  const others = m.rooms.filter((r) => r.interior && r.id !== m.objectiveRoom);
  const centre = (r: { rects: Array<[number, number, number, number]> }) => {
    const [x0, y0, x1, y1] = r.rects[0];
    return { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2 };
  };
  const pts: Vec[] = [];
  // different drones sweep in a different order so the team covers more ground
  const rot = others.length ? slot % others.length : 0;
  const ordered = [...others.slice(rot), ...others.slice(0, rot)];
  if (slot % 2 === 0 && obj) pts.push(centre(obj));
  for (const r of ordered) pts.push(centre(r));
  if (slot % 2 === 1 && obj) pts.push(centre(obj));
  return pts;
}

export function driveDrone(w: World, a: Actor, b: BotState, intent: ActorIntent) {
  const d = w.entities.find((e): e is DroneEntity => e.kind === 'drone' && e.ownerId === a.id);
  if (!d) return;
  b.status = 'Droning';
  const goals = droneWaypoints(w, b.slot);
  if (!goals.length) return;
  let goal = goals[b.droneGoal % goals.length];
  if (dist(d.pos, goal) < 1.5) {
    b.droneGoal++;
    b.dronePath = [];
    goal = goals[b.droneGoal % goals.length];
  }
  if (!b.dronePath.length || w.tick % 45 === b.slot) {
    const r = findPath(w, 'free', d.pos, goal);
    b.dronePath = r ? r.points.slice(1) : [];
    if (!r) b.droneGoal++;
  }
  while (b.dronePath.length && dist(d.pos, b.dronePath[0]) < 0.35) b.dronePath.shift();
  const next = b.dronePath[0];
  let move = { x: 0, y: 0 };
  if (next) {
    const len = dist(d.pos, next) || 1;
    move = { x: (next.x - d.pos.x) / len, y: (next.y - d.pos.y) / len };
  }
  // tag whatever the drone itself can see
  let tag = false;
  for (const t of w.actors) {
    if (!t.alive || t.team === a.team || dist(t.pos, d.pos) > DRONE_VISION) continue;
    if (!raycast(w, d.pos, t.pos, 'sight', { obs: w.obstacles(), ignoreEntity: d.id })) {
      tag = true;
      // once tagged, a drone retreats out of the defender's view instead of waiting to be shot
      const away = dist(t.pos, d.pos) || 1;
      move = { x: (d.pos.x - t.pos.x) / away, y: (d.pos.y - t.pos.y) / away };
      b.droneGoal++;
      b.dronePath = [];
      break;
    }
  }
  intent.drone = { move, tag };
}

// ---------- escort (bots following the player) ----------

export function escortGoal(w: World, a: Actor, human: Actor, slot: number): { pos: Vec; watch: Vec } {
  const f = human.facing;
  const side = slot % 2 === 0 ? 1 : -1;
  const back = { x: human.pos.x - Math.cos(f) * 1.7 + Math.cos(f + Math.PI / 2) * side * 1.1, y: human.pos.y - Math.sin(f) * 1.7 + Math.sin(f + Math.PI / 2) * side * 1.1 };
  // each escort watches a flank the player is not looking at
  const watchAng = f + side * 1.1;
  const watch = { x: human.pos.x + Math.cos(watchAng) * 5, y: human.pos.y + Math.sin(watchAng) * 5 };
  const pos = walkAt(w, back) ? back : { x: human.pos.x - Math.cos(f) * 1.2, y: human.pos.y - Math.sin(f) * 1.2 };
  void a;
  return { pos: walkAt(w, pos) ? pos : { ...human.pos }, watch };
}
