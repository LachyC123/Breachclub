// Tactical knowledge: authored hold spots and their sightlines for Spin Cycle, plus generic
// map helpers (portals for pre-aiming, danger fields for safer routes). Positions are tile space.
import type { Vec } from '../sim/types';
import type { World } from '../sim/world';
import { dist, raycast } from '../sim/geometry';
import { RULES } from '../content/defs';

export interface HoldSpot {
  id: string;
  pos: Vec;
  /** the point this spot is held toward (a doorway, panel or window) */
  watch: Vec;
  /** approach ids this spot can punish */
  covers: string[];
  roles: Array<'anchor' | 'support' | 'roamer'>;
}

/** Defender spots: behind cover or off-angle, never standing in a doorway. */
export const SPIN_CYCLE_HOLDS: HoldSpot[] = [
  { id: 'office-nw', pos: { x: 4.0, y: 3.7 }, watch: { x: 4.5, y: 11.0 }, covers: ['P', 'a'], roles: ['anchor'] },
  { id: 'office-mid', pos: { x: 8.2, y: 6.3 }, watch: { x: 16.0, y: 6.6 }, covers: ['Q', 'a', 'c'], roles: ['anchor', 'support'] },
  { id: 'office-ne', pos: { x: 14.3, y: 3.7 }, watch: { x: 16.0, y: 6.6 }, covers: ['Q', 'c'], roles: ['anchor', 'support'] },
  { id: 'office-se', pos: { x: 13.4, y: 10.2 }, watch: { x: 11.5, y: 11.0 }, covers: ['a', 'Q'], roles: ['support'] },
  { id: 'office-sw', pos: { x: 3.7, y: 9.6 }, watch: { x: 4.5, y: 11.6 }, covers: ['P'], roles: ['support'] },
  { id: 'stock-ne', pos: { x: 29.6, y: 3.7 }, watch: { x: 31.0, y: 5.8 }, covers: ['R', '4'], roles: ['roamer'] },
  { id: 'stock-sw', pos: { x: 18.0, y: 9.7 }, watch: { x: 21.0, y: 11.0 }, covers: ['b', '4', 'Q'], roles: ['support', 'roamer'] },
  { id: 'stock-nw', pos: { x: 22.5, y: 3.6 }, watch: { x: 31.0, y: 5.8 }, covers: ['R'], roles: ['roamer'] },
  { id: 'service-s', pos: { x: 3.6, y: 20.6 }, watch: { x: 2.6, y: 14.6 }, covers: ['window', '2'], roles: ['roamer'] },
  { id: 'service-n', pos: { x: 5.6, y: 12.5 }, watch: { x: 7.2, y: 17.5 }, covers: ['window', '2', 'P'], roles: ['roamer', 'support'] },
  { id: 'shop-se', pos: { x: 29.5, y: 20.6 }, watch: { x: 18.5, y: 22.0 }, covers: ['1'], roles: ['roamer'] },
  { id: 'shop-nw', pos: { x: 9.4, y: 12.6 }, watch: { x: 7.2, y: 17.5 }, covers: ['2', 'a', '1'], roles: ['roamer'] },
  { id: 'shop-ne', pos: { x: 26.5, y: 12.6 }, watch: { x: 27.5, y: 11.0 }, covers: ['4', 'b', '1'], roles: ['roamer'] },
];

/** Attackers' post-plant spots inside the office, each watching an entrance. */
export const SPIN_CYCLE_POSTPLANT: HoldSpot[] = [
  { id: 'pp-p', pos: { x: 8.6, y: 7.6 }, watch: { x: 4.5, y: 11.0 }, covers: ['P', 'a'], roles: ['anchor'] },
  { id: 'pp-q', pos: { x: 10.4, y: 5.8 }, watch: { x: 16.0, y: 6.6 }, covers: ['Q'], roles: ['anchor'] },
  { id: 'pp-n', pos: { x: 6.6, y: 3.6 }, watch: { x: 11.5, y: 11.0 }, covers: ['a', 'c'], roles: ['anchor'] },
];

export interface Portal {
  id: string;
  pos: Vec;
}

/** Doorways, breach panels and windows: where threats come from and where to pre-aim. */
export function portals(w: World): Portal[] {
  const out: Portal[] = [];
  for (const d of w.map.doors) out.push({ id: d.id, pos: d.center });
  for (const g of w.map.softGroups) out.push({ id: g.id, pos: g.center });
  for (const v of w.map.vaults) out.push({ id: 'window', pos: v.center });
  return out;
}

/** Which approach a threat near this point is most likely using. */
export function approachOf(w: World, p: Vec): string {
  let best = '';
  let bd = Infinity;
  for (const pt of portals(w)) {
    const d = dist(pt.pos, p);
    if (d < bd) {
      bd = d;
      best = pt.id;
    }
  }
  return best;
}

export function holdSpotsFor(w: World): HoldSpot[] {
  return w.map.id === 'spin_cycle' ? SPIN_CYCLE_HOLDS : [];
}

export function postPlantSpots(w: World): HoldSpot[] {
  if (w.map.id === 'spin_cycle') return SPIN_CYCLE_POSTPLANT;
  const c = w.map.console.center;
  return [0, 1, 2].map((i) => ({ id: `pp${i}`, pos: { x: c.x + Math.cos(i * 2.1) * 2.5, y: c.y + Math.sin(i * 2.1) * 2.5 }, watch: c, covers: [], roles: ['anchor' as const] }));
}

/** First doorway/panel/window ahead along a path (within range) to pre-aim while moving. */
export function nextPortalAlong(w: World, from: Vec, path: Vec[], range = 7): Vec | null {
  const ps = portals(w);
  let travelled = 0;
  let prev = from;
  for (const p of path) {
    travelled += dist(prev, p);
    if (travelled > range) break;
    prev = p;
    for (const pt of ps) if (dist(pt.pos, p) < 1.4 && dist(pt.pos, from) > 1.2) return pt.pos;
  }
  return null;
}

// ---------- danger field ----------

const dangerCache = new Map<string, Float32Array>();

/**
 * Cells a known threat can see get extra path cost, so bots route around open sightlines
 * instead of strolling through a defender's angle. Built only from remembered positions.
 */
export function dangerField(w: World, threats: Vec[]): Float32Array | undefined {
  if (!threats.length) return undefined;
  const key = `${w.uid}:${w.geometryRevision}:${threats.map((t) => `${Math.round(t.x)},${Math.round(t.y)}`).sort().join('|')}`;
  const hit = dangerCache.get(key);
  if (hit) return hit;
  if (dangerCache.size > 40) dangerCache.clear();
  const m = w.map;
  const f = new Float32Array(m.w * m.h);
  const R = RULES.vision_tiles;
  const obs = w.obstacles();
  for (const t of threats) {
    const x0 = Math.max(0, Math.floor(t.x - R));
    const x1 = Math.min(m.w - 1, Math.floor(t.x + R));
    const y0 = Math.max(0, Math.floor(t.y - R));
    const y1 = Math.min(m.h - 1, Math.floor(t.y + R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const c = { x: x + 0.5, y: y + 0.5 };
        const d = dist(c, t);
        if (d > R) continue;
        if (raycast(w, t, c, 'sight', { obs })) continue;
        f[y * m.w + x] += d < 3 ? 6 : 3.5;
      }
  }
  dangerCache.set(key, f);
  return f;
}
