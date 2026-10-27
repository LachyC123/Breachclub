// Defending squad strategy: fortify from the objective side in prep, then hold authored spots
// that cover approaches from behind cover. Rotate toward the approach the team has evidence of,
// keep an anchor on site, and send the safest defender to shut off an armed console.
import { secs } from '../content/defs';
import { dist, hingeObb, rayObb } from '../sim/geometry';
import { validateHingePlacement } from '../sim/gadgets';
import type { Actor, HingeEntity, Vec } from '../sim/types';
import type { World } from '../sim/world';
import { findPath, navGrid } from './nav';
import { approachOf, holdSpotsFor, type HoldSpot } from './tactics';
import type { BotState, Perception, Task } from './types';
import { threatPoints } from './memory';

const HINGE_SOCKETS: Array<{ x: number; y: number; vertical: boolean }> = [
  { x: 5.5, y: 8.5, vertical: false },
  { x: 12.5, y: 7.5, vertical: true },
  { x: 9.5, y: 8.0, vertical: false },
  { x: 11.0, y: 5.5, vertical: true },
];

export class DefenceBrain {
  /** prep reservations: job key -> bot id */
  private reserved = new Map<string, number>();
  /** hold spot id -> bot id */
  private claims = new Map<string, number>();
  private lastSpotChange = new Map<number, number>();

  constructor(private w: World) {}

  release(actorId: number) {
    for (const [k, v] of this.reserved) if (v === actorId) this.reserved.delete(k);
    for (const [k, v] of this.claims) if (v === actorId) this.claims.delete(k);
  }

  decide(a: Actor, b: BotState, p: Perception) {
    const w = this.w;
    if (w.phase === 'prep') {
      if (b.task.kind === 'prepInteract' || b.task.kind === 'placeHinge') {
        if (this.prepJobStillValid(a, b.task)) return;
        this.release(a.id);
      }
      const job = this.nextPrepJob(a);
      if (job) {
        b.task = job;
        return;
      }
      this.hold(a, b, p);
      return;
    }
    if (w.phase === 'armed') {
      const team = a.team;
      const defenders = w.actors.filter((x) => x.team === team && x.alive);
      const humanShutting = defenders.some((x) => x.controller === 'human' && x.interaction?.kind === 'shutoff');
      // the defender closest to the console goes; others cover from site spots
      const c = w.map.console.center;
      const closest = defenders.filter((x) => x.controller === 'bot').sort((x, y) => dist(x.pos, c) - dist(y.pos, c))[0];
      if (!humanShutting && closest && closest.id === a.id) {
        b.task = { kind: 'shutoff' };
        return;
      }
      this.hold(a, b, p, true);
      return;
    }
    if (a.operatorId === 'hinge') this.considerHingeRotate(a, b, p);
    this.hold(a, b, p);
  }

  /** Pick (or keep) a hold spot for this bot's role, rotating toward known threats. */
  private hold(a: Actor, b: BotState, p: Perception, siteOnly = false) {
    const w = this.w;
    const spots = holdSpotsFor(w);
    if (!spots.length) {
      b.task = { kind: 'hold', pos: { ...a.pos }, watch: null, label: 'Holding' };
      return;
    }
    const threats = threatPoints(w, p, 8);
    const threatApproach = threats.length ? approachOf(w, threats[threats.length - 1]) : '';
    const current = b.task.kind === 'hold' ? spots.find((s) => dist(s.pos, (b.task as { pos: Vec }).pos) < 0.1) : undefined;
    const since = this.lastSpotChange.get(a.id) ?? -999;
    // don't fidget: keep a spot for at least 4s unless the current one is now useless
    if (current && w.tick - since < secs(4) && (!siteOnly || current.id.startsWith('office'))) return;
    const objRoom = w.map.objectiveRoom;
    const linked = (s: HoldSpot) => !!findPath(w, 'defence', w.map.console.center, s.pos);
    let best: HoldSpot | null = null;
    let bestScore = -Infinity;
    for (const s of spots) {
      const claimer = this.claims.get(s.id);
      if (claimer !== undefined && claimer !== a.id && w.actor(claimer)?.alive) continue;
      if (siteOnly && !s.id.startsWith(objRoom === 'office' ? 'office' : objRoom)) continue;
      let score = 0;
      if (s.roles.includes(b.role === 'anchor' || b.role === 'support' || b.role === 'roamer' ? b.role : 'support')) score += 6;
      if (threatApproach && s.covers.includes(threatApproach)) score += b.role === 'anchor' ? 4 : 7;
      // gentle variety between rounds, stable within one
      score += ((s.id.length * 7 + b.slot * 13 + w.cfg.seed) % 10) / 10;
      score -= dist(a.pos, s.pos) * 0.08;
      if (current && s.id === current.id) score += 2;
      if (score > bestScore && linked(s)) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) {
      b.task = { kind: 'hold', pos: { ...a.pos }, watch: null, label: 'Holding' };
      return;
    }
    for (const [k, v] of this.claims) if (v === a.id) this.claims.delete(k);
    this.claims.set(best.id, a.id);
    if (!current || current.id !== best.id) this.lastSpotChange.set(a.id, w.tick);
    b.task = { kind: 'hold', pos: best.pos, watch: best.watch, label: current && current.id !== best.id ? 'Rotating' : 'Holding' };
  }

  private prepJobStillValid(a: Actor, t: Task): boolean {
    const w = this.w;
    if (t.kind === 'prepInteract') {
      if (t.interact === 'reinforce') return w.soft[t.target].state === 'intact' && w.resources[a.team].reinforcements > 0;
      return !w.barricades[t.target] && w.resources[a.team].barricades > 0;
    }
    if (t.kind === 'placeHinge') return a.gadgetCharges > 0;
    return false;
  }

  private nextPrepJob(a: Actor): Task | null {
    const w = this.w;
    const res = w.resources[a.team];
    const free = (k: string) => !this.reserved.has(k) || this.reserved.get(k) === a.id || !w.actor(this.reserved.get(k)!)?.alive;
    if (a.operatorId === 'hinge' && a.gadgetCharges > 0 && free('hinge')) {
      for (const s of HINGE_SOCKETS) {
        // validate as if standing next to the socket (bot walks there first)
        const probe = { ...a, pos: s.vertical ? { x: s.x + 1.2, y: s.y } : { x: s.x, y: s.y + 1.2 } } as Actor;
        if (validateHingePlacement(w, probe, { x: s.x, y: s.y }, s.vertical).ok) {
          this.reserved.set('hinge', a.id);
          return { kind: 'placeHinge', pos: { x: s.x, y: s.y }, vertical: s.vertical };
        }
      }
    }
    // reinforce panels that open straight into the objective room first
    const softOrder = w.map.softGroups.filter((g) => g.rooms.includes(w.map.objectiveRoom)).concat(w.map.softGroups.filter((g) => !g.rooms.includes(w.map.objectiveRoom)));
    if (res.reinforcements > 0)
      for (const g of softOrder) {
        const k = `soft${g.index}`;
        if (w.soft[g.index].state !== 'intact' || !free(k)) continue;
        if ([...this.reserved.keys()].filter((x) => x.startsWith('soft')).length >= res.reinforcements && !this.reserved.has(k)) break;
        const stand = this.interiorStand(g.center, g.horizontal);
        if (!stand) continue;
        this.reserved.set(k, a.id);
        return { kind: 'prepInteract', interact: 'reinforce', target: g.index, stand };
      }
    if (res.barricades > 0)
      for (const d of w.map.doors) {
        const k = `door${d.index}`;
        if (d.protected || w.barricades[d.index] || !free(k)) continue;
        if ([...this.reserved.keys()].filter((x) => x.startsWith('door')).length >= res.barricades && !this.reserved.has(k)) break;
        const stand = this.interiorStand(d.center, d.horizontal);
        if (!stand) continue;
        // never board a door that would leave the barricader (or anyone) cut off from the site
        const planned = new Set<number>([d.index]);
        for (const key of this.reserved.keys()) if (key.startsWith('door')) planned.add(Number(key.slice(4)));
        w.barricades.forEach((bar, i) => bar && planned.add(i));
        if (!this.connected(stand, planned)) continue;
        this.reserved.set(k, a.id);
        return { kind: 'prepInteract', interact: 'barricade', target: d.index, stand };
      }
    return null;
  }

  /** Is `from` still connected to the console if these doors were barricaded? (BFS, 4-neighbour) */
  private connected(from: Vec, doors: Set<number>): boolean {
    const w = this.w;
    const g = navGrid(w, 'defence');
    const m = w.map;
    const blocked = new Uint8Array(m.w * m.h);
    for (const di of doors) for (const c of m.doors[di].cells) blocked[c] = 1;
    const start = Math.floor(from.y) * m.w + Math.floor(from.x);
    const goals = new Set(m.console.cells.flatMap((c) => [c - 1, c + 1, c - m.w, c + m.w]));
    const seen = new Uint8Array(m.w * m.h);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop()!;
      if (goals.has(i)) return true;
      const x = i % m.w;
      for (const j of [i - 1, i + 1, i - m.w, i + m.w]) {
        if (j < 0 || j >= m.w * m.h || seen[j] || blocked[j] || !g.walk[j]) continue;
        if (Math.abs((j % m.w) - x) > 1) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    return false;
  }

  /** A standing spot inside the building next to a wall feature, on the objective side. */
  private interiorStand(c: Vec, horizontal: boolean): Vec | null {
    const w = this.w;
    const g = navGrid(w, 'defence');
    const goal = w.map.console.center;
    const sides = [1, -1].map((s) => (horizontal ? { x: c.x, y: c.y + s } : { x: c.x + s, y: c.y })).sort((p, q) => dist(p, goal) - dist(q, goal));
    for (const p of sides) {
      const i = Math.floor(p.y) * w.map.w + Math.floor(p.x);
      if (g.walk[i] && w.map.interior[i]) return p;
    }
    return null;
  }

  /** Swing Hinge's wall when a remembered threat would get a line to the console it could deny. */
  private considerHingeRotate(a: Actor, b: BotState, p: Perception) {
    const w = this.w;
    const h = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
    if (!h || h.state !== 'idle' || w.tick < h.cooldownUntil || dist(a.pos, h.center) > 6) return;
    const threats = threatPoints(w, p, 3).filter((t) => dist(t, h.center) < 9);
    if (!threats.length) return;
    const guard = w.map.console.center;
    const blocks = (angle: number, t: Vec) => rayObb(t, { x: guard.x - t.x, y: guard.y - t.y }, hingeObb({ center: h.center, angle })) !== null;
    const other = h.orient === 0 ? h.angle + Math.PI / 2 : h.angle - Math.PI / 2;
    if (threats.filter((t) => blocks(other, t)).length > threats.filter((t) => blocks(h.angle, t)).length) b.wantRotate = true;
  }
}
