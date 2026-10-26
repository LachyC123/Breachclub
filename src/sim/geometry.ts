// Geometry queries shared by movement, sight, bullets, navigation and gadgets.
// Everything reads the same authoritative state, so one geometry revision updates all consumers.
import { CellKind, type MapData } from './mapdata';
import type { Obb, Vec, SoftPanelState, BarricadeState, Entity, TeamId } from './types';

export interface GeoState {
  map: MapData;
  soft: SoftPanelState[];
  barricades: (BarricadeState | null)[];
  entities: Entity[];
  /** during prep: confinement per team (attackers stay out, defenders stay in) */
  prepConfine: { attackTeam: TeamId } | null;
}

export type BlockMode = 'move' | 'sight' | 'bullet';

export function cellBlocks(g: GeoState, x: number, y: number, mode: BlockMode): boolean {
  const m = g.map;
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
  const i = y * m.w + x;
  switch (m.kind[i] as CellKind) {
    case CellKind.Floor:
      return false;
    case CellKind.Wall:
    case CellKind.Prop:
      return true;
    case CellKind.Window:
      return mode === 'move';
    case CellKind.Soft:
      return g.soft[m.softGroupOf[i]].state !== 'breached';
    case CellKind.Door:
      return g.barricades[m.doorOf[i]] !== null;
  }
  return true;
}

/** Structural-only blocking (ignores gadgets) used by Hinge sweep validation. */
export function cellIsStructure(g: GeoState, x: number, y: number): boolean {
  return cellBlocks(g, x, y, 'move');
}

// ---------- Oriented boxes ----------

export function obbCorners(o: Obb): Vec[] {
  const c = Math.cos(o.angle);
  const s = Math.sin(o.angle);
  const ax = { x: c * o.hx, y: s * o.hx };
  const ay = { x: -s * o.hy, y: c * o.hy };
  return [
    { x: o.cx + ax.x + ay.x, y: o.cy + ax.y + ay.y },
    { x: o.cx - ax.x + ay.x, y: o.cy - ax.y + ay.y },
    { x: o.cx - ax.x - ay.x, y: o.cy - ax.y - ay.y },
    { x: o.cx + ax.x - ay.x, y: o.cy + ax.y - ay.y },
  ];
}

/** Ray (origin p, direction d unnormalised, t in [0,1]) vs OBB. Returns entry t or null. */
export function rayObb(p: Vec, d: Vec, o: Obb): number | null {
  const c = Math.cos(-o.angle);
  const s = Math.sin(-o.angle);
  const px = p.x - o.cx;
  const py = p.y - o.cy;
  const lx = px * c - py * s;
  const ly = px * s + py * c;
  const dx = d.x * c - d.y * s;
  const dy = d.x * s + d.y * c;
  let tmin = 0;
  let tmax = 1;
  const slabs: Array<[number, number, number]> = [
    [lx, dx, o.hx],
    [ly, dy, o.hy],
  ];
  for (const [o0, dd, h] of slabs) {
    if (Math.abs(dd) < 1e-9) {
      if (o0 < -h || o0 > h) return null;
    } else {
      let t1 = (-h - o0) / dd;
      let t2 = (h - o0) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/** Closest point on OBB to p, and whether p is inside. */
export function closestOnObb(p: Vec, o: Obb): { q: Vec; inside: boolean } {
  const c = Math.cos(o.angle);
  const s = Math.sin(o.angle);
  const px = p.x - o.cx;
  const py = p.y - o.cy;
  const lx = px * c + py * s;
  const ly = -px * s + py * c;
  const qx = Math.max(-o.hx, Math.min(o.hx, lx));
  const qy = Math.max(-o.hy, Math.min(o.hy, ly));
  const inside = Math.abs(lx) <= o.hx && Math.abs(ly) <= o.hy;
  return { q: { x: o.cx + qx * c - qy * s, y: o.cy + qx * s + qy * c }, inside };
}

export function circleObbOverlap(p: Vec, r: number, o: Obb): boolean {
  const { q, inside } = closestOnObb(p, o);
  if (inside) return true;
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy < r * r;
}

/** Does an OBB overlap any blocking cell (sampled conservatively)? */
export function obbHitsCells(g: GeoState, o: Obb, mode: BlockMode): Vec[] {
  const hits: Vec[] = [];
  const corners = obbCorners(o);
  const minX = Math.floor(Math.min(...corners.map((c) => c.x)));
  const maxX = Math.floor(Math.max(...corners.map((c) => c.x)));
  const minY = Math.floor(Math.min(...corners.map((c) => c.y)));
  const maxY = Math.floor(Math.max(...corners.map((c) => c.y)));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      if (!cellBlocks(g, x, y, mode)) continue;
      // cell AABB vs OBB: test cell as circle-ish via closest point on OBB to cell centre, then clamp
      const cell: Obb = { cx: x + 0.5, cy: y + 0.5, hx: 0.5, hy: 0.5, angle: 0 };
      if (obbOverlap(o, cell)) hits.push({ x, y });
    }
  return hits;
}

/** Separating axis test for two OBBs. */
export function obbOverlap(a: Obb, b: Obb): boolean {
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2];
  const ca = obbCorners(a);
  const cb = obbCorners(b);
  for (const ang of axes) {
    const ax = Math.cos(ang);
    const ay = Math.sin(ang);
    let amin = Infinity;
    let amax = -Infinity;
    let bmin = Infinity;
    let bmax = -Infinity;
    for (const p of ca) {
      const v = p.x * ax + p.y * ay;
      amin = Math.min(amin, v);
      amax = Math.max(amax, v);
    }
    for (const p of cb) {
      const v = p.x * ax + p.y * ay;
      bmin = Math.min(bmin, v);
      bmax = Math.max(bmax, v);
    }
    if (amax <= bmin + 1e-6 || bmax <= amin + 1e-6) return false;
  }
  return true;
}

// ---------- Gadget obstacles ----------

export const HINGE_HALF_LEN = 1.0;
export const HINGE_HALF_THICK = 0.16;
export const COVER_HALF_LEN = 0.75;
export const COVER_HALF_THICK = 0.2;
export const SLED_HALF_LEN = 0.34;
export const SLED_HALF_W = 0.28;

export function hingeObb(e: { center: Vec; angle: number }): Obb {
  return { cx: e.center.x, cy: e.center.y, hx: HINGE_HALF_LEN, hy: HINGE_HALF_THICK, angle: e.angle };
}

export function sledObb(e: { pos: Vec; dir: number }): Obb {
  return { cx: e.pos.x, cy: e.pos.y, hx: SLED_HALF_LEN, hy: SLED_HALF_W, angle: e.dir };
}

export interface ObstacleRef {
  obb: Obb;
  entityId: number;
  kind: Entity['kind'];
  blocksSight: boolean;
  blocksBullet: boolean;
  blocksMove: boolean;
}

export function obstacles(g: GeoState): ObstacleRef[] {
  const out: ObstacleRef[] = [];
  for (const e of g.entities) {
    if (e.kind === 'hinge')
      out.push({ obb: hingeObb(e), entityId: e.id, kind: e.kind, blocksSight: true, blocksBullet: true, blocksMove: true });
    else if (e.kind === 'cover')
      out.push({ obb: e.obb, entityId: e.id, kind: e.kind, blocksSight: true, blocksBullet: true, blocksMove: true });
    else if (e.kind === 'sled')
      out.push({ obb: sledObb(e), entityId: e.id, kind: e.kind, blocksSight: false, blocksBullet: true, blocksMove: true });
  }
  return out;
}

// ---------- Raycasting ----------

export interface RayHit {
  t: number;
  point: Vec;
  /** blocking cell, if the ray stopped on the grid */
  cell: { x: number; y: number } | null;
  entityId: number | null;
}

/**
 * Grid DDA from a to b. Returns the first blocking cell hit (t in [0,1]) or null.
 * The starting cell never blocks (an actor standing in a doorway is not inside a wall).
 */
export function gridRay(g: GeoState, a: Vec, b: Vec, mode: BlockMode, ignoreCell?: number): RayHit | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let x = Math.floor(a.x);
  let y = Math.floor(a.y);
  const endX = Math.floor(b.x);
  const endY = Math.floor(b.y);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - a.x : a.x - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - a.y : a.y - y) * tDeltaY : Infinity;
  let t = 0;
  const w = g.map.w;
  for (let guard = 0; guard < 400; guard++) {
    if (x === endX && y === endY) return null;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
    }
    if (t > 1) return null;
    if (ignoreCell !== undefined && y * w + x === ignoreCell) continue;
    if (cellBlocks(g, x, y, mode)) return { t, point: { x: a.x + dx * t, y: a.y + dy * t }, cell: { x, y }, entityId: null };
  }
  return null;
}

export function raycast(
  g: GeoState,
  a: Vec,
  b: Vec,
  mode: BlockMode,
  opts: { ignoreEntity?: number; ignoreCell?: number; obs?: ObstacleRef[] } = {},
): RayHit | null {
  let best = gridRay(g, a, b, mode, opts.ignoreCell);
  const d = { x: b.x - a.x, y: b.y - a.y };
  const obs = opts.obs ?? obstacles(g);
  for (const o of obs) {
    if (o.entityId === opts.ignoreEntity) continue;
    if (mode === 'sight' && !o.blocksSight) continue;
    if (mode === 'bullet' && !o.blocksBullet) continue;
    if (mode === 'move' && !o.blocksMove) continue;
    const t = rayObb(a, d, o.obb);
    if (t !== null && (best === null || t < best.t)) {
      best = { t, point: { x: a.x + d.x * t, y: a.y + d.y * t }, cell: null, entityId: o.entityId };
    }
  }
  return best;
}

export function lineOfSight(g: GeoState, a: Vec, b: Vec, obs?: ObstacleRef[]): boolean {
  return raycast(g, a, b, 'sight', { obs }) === null;
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);
export const normAngle = (a: number) => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};
