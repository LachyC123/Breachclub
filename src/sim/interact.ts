// Contextual hold-to-interact actions. Priority: objective first, then doorway/panel tools.
import { RULES, secs } from '../content/defs';
import { dist } from './geometry';
import type { Actor, ActorIntent, InteractOption, Vec } from './types';
import type { World } from './world';
import { plantCharge } from './gadgets';
import { ACTOR_RADIUS, circleFree } from './movement';

export const INTERACT_RADIUS = 1.25;

const DUR = {
  arm: () => secs(RULES.arm_seconds),
  shutoff: () => secs(RULES.shutdown_seconds),
  reinforce: () => secs(1.2),
  barricade: () => secs(0.7),
  unbarricade: () => secs(0.5),
  breach: () => secs(0.8),
  vault: () => secs(0.45),
};

/** Distance from p to the nearest point of a set of cells. */
export function distToCells(w: World, p: Vec, cells: number[]): number {
  let best = Infinity;
  for (const c of cells) {
    const x = c % w.map.w;
    const y = Math.floor(c / w.map.w);
    const qx = Math.max(x, Math.min(x + 1, p.x));
    const qy = Math.max(y, Math.min(y + 1, p.y));
    best = Math.min(best, Math.hypot(p.x - qx, p.y - qy));
  }
  return best;
}

export function interactOptions(w: World, a: Actor): InteractOption[] {
  const opts: InteractOption[] = [];
  if (!a.alive || w.phase === 'ended') return opts;
  const m = w.map;
  const res = w.resources[a.team];

  // objective
  const dc = distToCells(w, a.pos, m.console.cells);
  if (dc <= INTERACT_RADIUS) {
    if (a.side === 'attack' && w.phase === 'action')
      opts.push({ kind: 'arm', target: -1, label: 'Arm', pos: m.console.center, durationTicks: DUR.arm(), enabled: true });
    if (a.side === 'defence' && w.phase === 'armed')
      opts.push({ kind: 'shutoff', target: -1, label: 'Shut Off', pos: m.console.center, durationTicks: DUR.shutoff(), enabled: true });
  }

  // soft panels
  for (const g of m.softGroups) {
    const d = distToCells(w, a.pos, g.cells);
    if (d > INTERACT_RADIUS) continue;
    const st = w.soft[g.index];
    if (a.side === 'attack' && (w.phase === 'action' || w.phase === 'armed') && st.state !== 'breached') {
      const ok = a.breachCharges > 0 && st.state === 'intact';
      opts.push({
        kind: 'breach',
        target: g.index,
        label: 'Breach',
        pos: g.center,
        durationTicks: DUR.breach(),
        enabled: ok,
        reason: st.state === 'reinforced' ? 'Reinforced' : a.breachCharges <= 0 ? 'No breach charge' : undefined,
      });
    }
    if (a.side === 'defence' && w.phase === 'prep' && st.state === 'intact') {
      opts.push({
        kind: 'reinforce',
        target: g.index,
        label: 'Reinforce',
        pos: g.center,
        durationTicks: DUR.reinforce(),
        enabled: res.reinforcements > 0,
        reason: res.reinforcements > 0 ? undefined : 'No reinforcements left',
      });
    }
  }

  // doorways
  for (const door of m.doors) {
    const d = distToCells(w, a.pos, door.cells);
    if (d > INTERACT_RADIUS) continue;
    const bar = w.barricades[door.index];
    if (a.side === 'defence' && w.phase === 'prep') {
      if (!bar && door.protected) {
        opts.push({ kind: 'barricade', target: door.index, label: 'Barricade', pos: door.center, durationTicks: DUR.barricade(), enabled: false, reason: 'Keep approach open' });
      } else if (!bar) {
        const occupied = w.actors.some((b) => b.alive && distToCells(w, b.pos, door.cells) < ACTOR_RADIUS);
        opts.push({
          kind: 'barricade',
          target: door.index,
          label: 'Barricade',
          pos: door.center,
          durationTicks: DUR.barricade(),
          enabled: res.barricades > 0 && !occupied,
          reason: occupied ? 'Doorway occupied' : res.barricades > 0 ? undefined : 'No barricades left',
        });
      } else if (bar.team === a.team && !bar.damaged) {
        opts.push({ kind: 'unbarricade', target: door.index, label: 'Remove', pos: door.center, durationTicks: DUR.unbarricade(), enabled: true });
      }
    }
    if (a.side === 'attack' && bar && (w.phase === 'action' || w.phase === 'armed')) {
      opts.push({
        kind: 'breach',
        target: 100 + door.index,
        label: 'Breach',
        pos: door.center,
        durationTicks: DUR.breach(),
        enabled: a.breachCharges > 0,
        reason: a.breachCharges > 0 ? undefined : 'No breach charge',
      });
    }
  }

  // vault (window) — closed during prep so confinement holds
  m.vaults.forEach((v, vi) => {
    if (w.phase === 'prep') return;
    const da = dist(a.pos, v.a);
    const db = dist(a.pos, v.b);
    if (Math.min(da, db) > 1.0) return;
    const to = da < db ? v.b : v.a;
    const clear = circleFree(w, to, ACTOR_RADIUS) && !w.actors.some((b) => b.alive && b.id !== a.id && dist(b.pos, to) < ACTOR_RADIUS * 2);
    opts.push({ kind: 'vault', target: vi, label: 'Vault', pos: v.center, durationTicks: DUR.vault(), enabled: clear, reason: clear ? undefined : 'Landing blocked' });
  });

  const rank = (o: InteractOption) => (o.kind === 'arm' || o.kind === 'shutoff' ? 0 : 1);
  opts.sort((x, y) => rank(x) - rank(y) || Number(y.enabled) - Number(x.enabled) || dist(a.pos, x.pos) - dist(a.pos, y.pos));
  return opts;
}

export function bestInteract(w: World, a: Actor): InteractOption | null {
  return interactOptions(w, a)[0] ?? null;
}

function stillValid(w: World, a: Actor): boolean {
  const it = a.interaction!;
  const opts = interactOptions(w, a);
  return opts.some((o) => o.kind === it.kind && o.target === it.target && o.enabled);
}

export function stepInteractions(w: World, get: (a: Actor) => ActorIntent) {
  for (const a of w.actors) {
    if (!a.alive) continue;
    const intent = get(a);
    if (a.interaction) {
      const it = a.interaction;
      let reason = '';
      if (!intent.interact) reason = 'Released';
      else if (Math.hypot(intent.move.x, intent.move.y) > 0.2 || dist(a.pos, it.startPos) > 0.25) reason = 'Moved';
      else if (w.damagedThisTick.has(a.id) && it.kind !== 'vault') reason = 'Hit';
      else if (it.kind !== 'vault' && !stillValid(w, a)) reason = 'Unavailable';
      if (reason && it.kind !== 'vault') {
        w.emit({ type: 'interactCancel', actorId: a.id, kind: it.kind, reason });
        a.interaction = null;
      }
      continue;
    }
    if (!intent.interact || a.vaulting || a.gadgetWindupUntil >= w.tick) continue;
    // a fresh press is needed after a cancel, so a held button never re-arms by surprise
    if (a.interactHeldLastTick) continue;
    const opt = bestInteract(w, a);
    if (!opt || !opt.enabled) continue;
    a.interaction = { kind: opt.kind, target: opt.target, startTick: w.tick, durationTicks: opt.durationTicks, startPos: { ...a.pos } };
    a.reloadUntil = -1; // interacting interrupts a reload (reserve preserved)
    w.emit({ type: 'interactStart', actorId: a.id, kind: opt.kind });
    if (opt.kind === 'arm' || opt.kind === 'shutoff') w.emitSound(m(w).console.center, 'console', 6, a.team, a.id);
    if (opt.kind === 'vault') {
      const v = w.map.vaults[opt.target];
      const da = dist(a.pos, v.a);
      const db = dist(a.pos, v.b);
      a.vaulting = { from: { ...a.pos }, to: da < db ? { ...v.b } : { ...v.a }, startTick: w.tick, endTick: w.tick + opt.durationTicks };
    }
  }
}

const m = (w: World) => w.map;

export function completeInteractions(w: World) {
  for (const a of w.actors) {
    const it = a.interaction;
    if (!it || !a.alive) continue;
    if (w.tick - it.startTick < it.durationTicks) continue;
    a.interaction = null;
    const res = w.resources[a.team];
    switch (it.kind) {
      case 'arm':
        if (w.phase !== 'action') continue;
        w.phase = 'armed';
        w.armedTick = w.tick;
        w.armedBy = a.id;
        w.phaseEndTick = w.tick + secs(RULES.broadcast_seconds);
        w.emit({ type: 'armed', actorId: a.id });
        w.emit({ type: 'phase', phase: 'armed' });
        w.emitSound(w.map.console.center, 'console', 16, a.team, a.id);
        break;
      case 'shutoff':
        if (w.phase !== 'armed') continue;
        w.emit({ type: 'shutoff', actorId: a.id });
        w.endRound(w.defendTeam, 'shutdown');
        break;
      case 'reinforce':
        if (res.reinforcements <= 0 || w.soft[it.target].state !== 'intact') continue;
        res.reinforcements--;
        w.soft[it.target].state = 'reinforced';
        w.soft[it.target].reinforcedBy = a.team;
        w.bumpGeometry();
        w.emit({ type: 'reinforced', group: it.target, team: a.team });
        w.emitSound(w.map.softGroups[it.target].center, 'gadget', 6, a.team, a.id);
        break;
      case 'barricade':
        if (res.barricades <= 0 || w.barricades[it.target]) continue;
        res.barricades--;
        w.barricades[it.target] = { hp: 40, team: a.team, damaged: false };
        w.bumpGeometry();
        w.emit({ type: 'barricadePlaced', door: it.target, team: a.team });
        w.emitSound(w.map.doors[it.target].center, 'gadget', 6, a.team, a.id);
        // nobody may be left standing inside the new barricade
        for (const b of w.actors) if (b.alive && distToCells(w, b.pos, w.map.doors[it.target].cells) < ACTOR_RADIUS) nudgeOut(w, b, it.target);
        break;
      case 'unbarricade':
        if (!w.barricades[it.target]) continue;
        w.barricades[it.target] = null;
        res.barricades++;
        w.bumpGeometry();
        w.emit({ type: 'barricadeRemoved', door: it.target, team: a.team });
        break;
      case 'breach':
        if (a.breachCharges <= 0) continue;
        plantCharge(w, a, it.target >= 100 ? { type: 'door', index: it.target - 100 } : { type: 'soft', index: it.target });
        break;
      case 'vault':
        w.emit({ type: 'vault', actorId: a.id });
        break;
    }
    w.emit({ type: 'interactDone', actorId: a.id, kind: it.kind });
  }
}

function nudgeOut(w: World, b: Actor, door: number) {
  const d = w.map.doors[door];
  const dir = d.horizontal ? { x: 0, y: b.pos.y < d.center.y ? -1 : 1 } : { x: b.pos.x < d.center.x ? -1 : 1, y: 0 };
  b.pos = { x: d.center.x + dir.x * 1.0, y: d.center.y + dir.y * 1.0 };
}
