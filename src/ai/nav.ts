// Grid navigation with actor clearance. Rebuilt per geometry revision; gadgets mark cells
// conservatively (a rotating Hinge reserves its whole swept disc).
import { cellBlocks, closestOnObb, raycast, type ObstacleRef } from '../sim/geometry';
import { HINGE_HALF_LEN } from '../sim/geometry';
import type { Side } from '../content/defs';
import type { Vec } from '../sim/types';
import type { World } from '../sim/world';
import { ACTOR_RADIUS } from '../sim/movement';

export interface NavGrid {
  rev: string;
  w: number;
  h: number;
  walk: Uint8Array;
  /** passable only by breaching (intact soft panels / barricades) */
  breachable: Int16Array;
}

const cache = new Map<string, NavGrid>();

/** 'free' ignores prep confinement (the scouting puck may enter the building). */
export type NavSide = Side | 'free';

function key(w: World, side: NavSide) {
  const rotating = w.entities.some((e) => e.kind === 'hinge' && e.state !== 'idle');
  return `${w.uid}:${w.geometryRevision}:${w.phase === 'prep' ? 'p' : 'a'}:${side}:${rotating ? w.tick : 0}`;
}

export function navGrid(w: World, side: NavSide): NavGrid {
  const k = key(w, side);
  const hit = cache.get(k);
  if (hit) return hit;
  if (cache.size > 24) cache.clear();
  const m = w.map;
  const n = m.w * m.h;
  const walk = new Uint8Array(n);
  const breachable = new Int16Array(n).fill(-1);
  const obs: ObstacleRef[] = w.obstacles();
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (cellBlocks(w, x, y, 'move')) {
        const g = m.softGroupOf[i];
        const d = m.doorOf[i];
        if (g >= 0 && w.soft[g].state === 'intact') breachable[i] = g;
        else if (d >= 0 && w.barricades[d]) breachable[i] = 100 + d;
        continue;
      }
      if (w.phase === 'prep' && w.prepConfine && side !== 'free') {
        const inside = m.interior[i] === 1;
        if (side === 'attack' ? inside : !inside) continue;
      }
      const c = { x: x + 0.5, y: y + 0.5 };
      let blocked = false;
      for (const o of obs) {
        if (!o.blocksMove) continue;
        const { q, inside } = closestOnObb(c, o.obb);
        if (inside || Math.hypot(c.x - q.x, c.y - q.y) < 0.42) {
          blocked = true;
          break;
        }
      }
      if (!blocked)
        for (const e of w.entities) {
          if (e.kind !== 'hinge' || e.state === 'idle') continue;
          if (Math.hypot(c.x - e.center.x, c.y - e.center.y) < HINGE_HALF_LEN + 0.45) blocked = true;
        }
      if (!blocked) walk[i] = 1;
    }
  const g: NavGrid = { rev: k, w: m.w, h: m.h, walk, breachable };
  cache.set(k, g);
  return g;
}

export interface PathPoint extends Vec {
  /** set when reaching this point requires vaulting through window link `vault` from `from` */
  vault?: { index: number; from: Vec };
}

export interface PathResult {
  cells: number[];
  points: PathPoint[];
  /** soft group index or 100+door index that must be breached, in path order */
  breaches: number[];
  cost: number;
}

function nearestWalkable(g: NavGrid, p: Vec): number {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  for (let r = 0; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        if (g.walk[y * g.w + x]) return y * g.w + x;
      }
  return -1;
}

/**
 * A* over 8-neighbour cells without corner cutting. With `breachCost`, intact soft panels and
 * barricades become passable at that extra cost (used to plan a breach, never to walk through).
 */
export function findPath(w: World, side: NavSide, from: Vec, to: Vec, opts: { breachCost?: number; maxNodes?: number } = {}): PathResult | null {
  const g = navGrid(w, side);
  const start = nearestWalkable(g, from);
  const goal = nearestWalkable(g, to);
  if (start < 0 || goal < 0) return null;
  const n = g.w * g.h;
  const passable = (i: number) => g.walk[i] === 1 || (opts.breachCost !== undefined && g.breachable[i] >= 0);
  const stepCost = (i: number) => (g.walk[i] ? 1 : opts.breachCost ?? 1);
  const gs = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = goal % g.w;
  const gy = (goal / g.w) | 0;
  const hfn = (i: number) => {
    const dx = Math.abs((i % g.w) - gx);
    const dy = Math.abs(((i / g.w) | 0) - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  const open: number[] = [start];
  const f = new Float32Array(n).fill(Infinity);
  gs[start] = 0;
  f[start] = hfn(start);
  let expanded = 0;
  const maxNodes = opts.maxNodes ?? 4000;
  // authored vault links act as extra graph edges (closed during prep confinement)
  const vaultEdges = new Map<number, Array<{ to: number; index: number; from: Vec; land: Vec }>>();
  if (w.phase !== 'prep')
    w.map.vaults.forEach((v, index) => {
      const ca = Math.floor(v.a.y) * g.w + Math.floor(v.a.x);
      const cb = Math.floor(v.b.y) * g.w + Math.floor(v.b.x);
      if (!g.walk[ca] || !g.walk[cb]) return;
      vaultEdges.set(ca, [...(vaultEdges.get(ca) ?? []), { to: cb, index, from: v.a, land: v.b }]);
      vaultEdges.set(cb, [...(vaultEdges.get(cb) ?? []), { to: ca, index, from: v.b, land: v.a }]);
    });
  const viaVault = new Map<number, { index: number; from: Vec }>();
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % g.w;
    const cy = (cur / g.w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (!passable(j) || closed[j]) continue;
        if (dx && dy) {
          // no corner cutting, and never diagonally through a breach cell
          const a = cy * g.w + nx;
          const b = ny * g.w + cx;
          if (!g.walk[a] || !g.walk[b] || !g.walk[j]) continue;
        }
        const c = gs[cur] + (dx && dy ? 1.414 : 1) * stepCost(j);
        if (c < gs[j]) {
          gs[j] = c;
          came[j] = cur;
          viaVault.delete(j);
          f[j] = c + hfn(j);
          open.push(j);
        }
      }
    for (const v of vaultEdges.get(cur) ?? []) {
      if (closed[v.to]) continue;
      const c = gs[cur] + 3;
      if (c < gs[v.to]) {
        gs[v.to] = c;
        came[v.to] = cur;
        viaVault.set(v.to, { index: v.index, from: v.from });
        f[v.to] = c + hfn(v.to);
        open.push(v.to);
      }
    }
  }
  // unreachable goals return null; callers report Blocked rather than wandering elsewhere
  if (came[goal] < 0 && goal !== start) return null;
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]) {
    cells.push(c);
    if (c === start) break;
  }
  cells.reverse();
  const breaches: number[] = [];
  for (const c of cells) {
    const b = g.breachable[c];
    if (b >= 0 && !g.walk[c] && !breaches.includes(b)) breaches.push(b);
  }
  const points: PathPoint[] = cells.map((c) => {
    const p: PathPoint = { x: (c % g.w) + 0.5, y: ((c / g.w) | 0) + 0.5 };
    const v = viaVault.get(c);
    if (v) p.vault = v;
    return p;
  });
  const toCell = Math.floor(to.y) * g.w + Math.floor(to.x);
  if (points.length && cells[cells.length - 1] === toCell && g.walk[toCell]) points[points.length - 1] = { ...to };
  return { cells, points, breaches, cost: gs[goal] };
}

/** Clearance-aware straight walk test (centre plus both shoulders). */
export function walkable(w: World, a: Vec, b: Vec): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const nx = (-dy / len) * (ACTOR_RADIUS + 0.04);
  const ny = (dx / len) * (ACTOR_RADIUS + 0.04);
  const obs = w.obstacles();
  for (const s of [0, 1, -1]) {
    const p = { x: a.x + nx * s, y: a.y + ny * s };
    const q = { x: b.x + nx * s, y: b.y + ny * s };
    if (raycast(w, p, q, 'move', { obs })) return false;
  }
  return true;
}

/** Remove waypoints that can be skipped with a clear straight walk. */
export function smooth(w: World, from: Vec, pts: PathPoint[]): PathPoint[] {
  if (pts.length <= 1) return pts;
  const out: PathPoint[] = [];
  let anchor: Vec = from;
  let i = 0;
  while (i < pts.length) {
    // a vault point can never be skipped: the landing before it must be reached first
    let limit = pts.length - 1;
    for (let k = i; k < pts.length; k++)
      if (pts[k].vault) {
        limit = k;
        break;
      }
    if (pts[limit].vault && limit === i) {
      out.push(pts[i]);
      anchor = pts[i];
      i++;
      continue;
    }
    let j = pts[limit].vault ? limit - 1 : limit;
    while (j > i && !walkable(w, anchor, pts[j])) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
