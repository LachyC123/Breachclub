// Fair perception: hard-occluded 9-tile sight, shared team vision, and room-portal-ish
// sound propagation (walls attenuate). Sounds yield fuzzy regions, never exact positions.
import { RULES } from '../content/defs';
import { CellKind } from './mapdata';
import { lineOfSight, dist, cellBlocks, raycast } from './geometry';
import type { HeardSound, SoundEvent, TeamId, Vec } from './types';
import type { World } from './world';

const VISION = RULES.vision_tiles;
export const DRONE_VISION = 8;
const HEARD_KEEP_TICKS = 60 * 6;

export function canSee(w: World, from: Vec, to: Vec): boolean {
  if (dist(from, to) > VISION) return false;
  return lineOfSight(w, from, to, w.obstacles());
}

export function updatePerception(w: World) {
  const obs = w.obstacles();
  for (const team of [0, 1] as TeamId[]) {
    const eyes = w.actors.filter((a) => a.team === team && a.alive);
    // recon drones are low cameras: hard-occluded by walls like everyone else
    const viewers: Array<{ id: number; pos: Vec; range: number }> = eyes.map((a) => ({ id: a.id, pos: a.pos, range: VISION }));
    for (const d of w.entities) if (d.kind === 'drone' && d.team === team) viewers.push({ id: -d.id, pos: d.pos, range: DRONE_VISION });
    const vis = new Set<number>();
    const spot = new Map<number, number>();
    for (const e of w.actors) {
      if (e.team === team || !e.alive) continue;
      for (const s of viewers) {
        if (dist(s.pos, e.pos) > s.range) continue;
        if (lineOfSight(w, s.pos, e.pos, obs)) {
          vis.add(e.id);
          spot.set(e.id, s.id);
          break;
        }
      }
    }
    // newly spotted events (used by callouts and AI memory)
    for (const id of vis) if (!w.visible[team].has(id)) w.emit({ type: 'spotted', team, actorId: id, spotterId: spot.get(id)! });
    w.visible[team] = vis;
    w.spotter[team] = spot;
    for (const id of vis) {
      const e = w.actor(id)!;
      w.lastSeen[team].set(id, { pos: { ...e.pos }, tick: w.tick, facing: e.facing });
    }
    for (const e of w.actors) if (!e.alive && e.team !== team) w.lastSeen[team].delete(e.id);

    // gadgets: own team always known; enemy gadgets only when seen
    const ents = new Set<number>();
    for (const ent of w.entities) {
      // barrels are part of the map and missile warnings are meant to be seen by everyone
      if (ent.team === team || ent.kind === 'barrel' || ent.kind === 'missile') {
        ents.add(ent.id);
        continue;
      }
      const c = ent.kind === 'cover' ? { x: ent.obb.cx, y: ent.obb.cy } : ent.kind === 'hinge' ? ent.center : ent.pos;
      // drones reveal gadgets too
      const extraEyes = viewers.filter((v) => v.id < 0).map((v) => ({ pos: v.pos }));
      const probes: Vec[] = [c];
      if (ent.kind === 'hinge') {
        probes.push({ x: c.x + Math.cos(ent.angle) * 0.8, y: c.y + Math.sin(ent.angle) * 0.8 });
        probes.push({ x: c.x - Math.cos(ent.angle) * 0.8, y: c.y - Math.sin(ent.angle) * 0.8 });
      }
      if (ent.kind === 'cover') {
        probes.push({ x: c.x + Math.cos(ent.obb.angle) * 0.6, y: c.y + Math.sin(ent.obb.angle) * 0.6 });
        probes.push({ x: c.x - Math.cos(ent.obb.angle) * 0.6, y: c.y - Math.sin(ent.obb.angle) * 0.6 });
      }
      let seen = false;
      for (const s of [...eyes, ...extraEyes]) {
        for (const p of probes) {
          if (dist(s.pos, p) > VISION + 1) continue;
          const hit = raycast(w, s.pos, p, 'sight', { obs, ignoreEntity: ent.id });
          if (!hit) {
            seen = true;
            break;
          }
        }
        if (seen) break;
      }
      if (seen) ents.add(ent.id);
    }
    w.visibleEntities[team] = ents;
    if (!w.objectiveFound[team] && team === w.attackTeam) {
      const c = w.map.console.center;
      if (viewers.some((v) => dist(v.pos, c) <= v.range && !raycast(w, v.pos, c, 'sight', { obs, ignoreCell: w.map.console.cells[0] }))) {
        w.objectiveFound[team] = true;
        w.emit({ type: 'objectiveFound', team });
      }
    }

    // soft panel / barricade knowledge: updated only when the surface is observed
    if (w.tick % 6 === 0 || w.tick < 2) {
      const m = w.map;
      const eyePos = viewers.map((v) => v.pos);
      for (const g of m.softGroups) {
        if (w.soft[g.index].reinforcedBy === team) w.knownSoft[team][g.index] = w.soft[g.index].state;
        if (observeCells(w, eyePos, g.cells)) w.knownSoft[team][g.index] = w.soft[g.index].state;
      }
      for (const d of m.doors) {
        const bar = w.barricades[d.index];
        if (bar && bar.team === team) w.knownBarricade[team][d.index] = true;
        else if (observeCells(w, eyePos, d.cells)) w.knownBarricade[team][d.index] = !!bar;
      }
    }
    // expire old heard sounds
    w.heard[team] = w.heard[team].filter((h) => w.tick - h.tick < HEARD_KEEP_TICKS);
  }
}

function observeCells(w: World, eyes: Vec[], cells: number[]): boolean {
  for (const c of cells) {
    const target = { x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 };
    for (const e of eyes) {
      if (dist(e, target) > VISION) continue;
      if (!raycast(w, e, target, 'sight', { ignoreCell: c, obs: w.obstacles() })) return true;
    }
  }
  return false;
}

/**
 * Dijkstra over cells from the source. Open cells cost 1/tile; blocking cells (walls,
 * closed panels, barricades) cost extra so sound leaks through walls with heavy loss.
 */
export function soundField(w: World, src: Vec, radius: number): Float32Array {
  const m = w.map;
  const n = m.w * m.h;
  const cost = new Float32Array(n).fill(Infinity);
  const sx = Math.max(0, Math.min(m.w - 1, Math.floor(src.x)));
  const sy = Math.max(0, Math.min(m.h - 1, Math.floor(src.y)));
  const start = sy * m.w + sx;
  cost[start] = 0;
  // small binary heap
  const heap: number[] = [start];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (cost[heap[p]] <= cost[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let s = k;
        if (l < heap.length && cost[heap[l]] < cost[heap[s]]) s = l;
        if (r < heap.length && cost[heap[r]] < cost[heap[s]]) s = r;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        k = s;
      }
    }
    return top;
  };
  const dirs: Array<[number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];
  const done = new Uint8Array(n);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % m.w;
    const y = (i / m.w) | 0;
    for (const [dx, dy, base] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      let c = base;
      if (cellBlocks(w, nx, ny, 'sight')) {
        // structural walls muffle more than thin panels and barricades
        c *= m.kind[j] === CellKind.Wall || m.kind[j] === CellKind.Prop ? 4.5 : 2.5;
      }
      const nc = cost[i] + c;
      if (nc < cost[j] && nc <= radius) {
        cost[j] = nc;
        push(j);
      }
    }
  }
  return cost;
}

export function propagateSound(w: World, s: SoundEvent) {
  const field = soundField(w, s.pos, s.radius);
  const listenerTeam = (1 - s.team) as TeamId;
  for (const l of w.actors) {
    if (!l.alive || l.team !== listenerTeam) continue;
    const ci = Math.floor(l.pos.y) * w.map.w + Math.floor(l.pos.x);
    const c = field[ci];
    if (!(c <= s.radius)) continue;
    // fuzzed region estimate: never an exact hidden coordinate
    const unc = 0.8 + c * 0.18;
    const ang = w.rng.range(0, Math.PI * 2);
    const r = w.rng.range(0, unc);
    const heard: HeardSound = {
      soundId: s.id,
      tick: w.tick,
      kind: s.kind,
      estimate: { x: s.pos.x + Math.cos(ang) * r, y: s.pos.y + Math.sin(ang) * r },
      uncertainty: unc,
      listenerId: l.id,
      sourceTeam: s.team,
    };
    // one record per sound per team keeps memory bounded
    if (!w.heard[listenerTeam].some((h) => h.soundId === s.id)) w.heard[listenerTeam].push(heard);
  }
}
