// What a bot knows: its own sight and hearing, teammate reports after a communication delay
// (original timestamps kept), and drone tags (instant team pings). Never hidden truth.
import { secs } from '../content/defs';
import { dist } from '../sim/geometry';
import { canSee } from '../sim/perception';
import type { Actor, TeamId, Vec } from '../sim/types';
import type { World } from '../sim/world';
import type { BotState, DiffParams, Perception } from './types';

export function shareIntel(w: World, bots: Map<number, BotState>, diff: DiffParams) {
  const delay = secs(diff.comm);
  for (const team of [0, 1] as TeamId[]) {
    for (const [enemyId, spotterId] of w.spotter[team]) {
      const e = w.actor(enemyId);
      if (!e) continue;
      for (const mate of w.actors) {
        if (mate.team !== team || !mate.alive || mate.id === spotterId) continue;
        const b = bots.get(mate.id);
        if (!b) continue;
        // throttle: one queued report per enemy per 0.25s
        const last = b.inbox[b.inbox.length - 1];
        if (last && last.enemyId === enemyId && w.tick - last.tick < 15) continue;
        b.inbox.push({ deliver: w.tick + delay, enemyId, pos: { ...e.pos }, tick: w.tick });
      }
    }
    // drone/ping tags reach the whole team at once (that is the point of tagging)
    for (const [enemyId, m] of w.marks[team]) {
      for (const mate of w.actors) {
        if (mate.team !== team || !mate.alive) continue;
        const b = bots.get(mate.id);
        if (!b) continue;
        const cur = b.enemies.get(enemyId);
        if (!cur || cur.tick < m.untilTick - secs(5)) b.enemies.set(enemyId, { pos: { ...m.pos }, tick: m.untilTick - secs(5), own: false });
      }
    }
  }
  for (const b of bots.values()) {
    while (b.inbox.length && b.inbox[0].deliver <= w.tick) {
      const m = b.inbox.shift()!;
      const cur = b.enemies.get(m.enemyId);
      // messages never refresh information that is already newer
      if (!cur || cur.tick < m.tick) b.enemies.set(m.enemyId, { pos: m.pos, tick: m.tick, own: false });
    }
    if (b.inbox.length > 200) b.inbox.splice(0, b.inbox.length - 200);
  }
}

export function absorbHearing(w: World, a: Actor, b: BotState, diff: DiffParams) {
  const delay = secs(diff.comm);
  for (const h of w.heard[a.team]) {
    if (b.heardIds.has(h.soundId)) continue;
    const mine = h.listenerId === a.id;
    if (!mine && w.tick - h.tick < delay) continue;
    b.heardIds.add(h.soundId);
    b.sounds.push({ pos: h.estimate, tick: h.tick, unc: h.uncertainty, kind: h.kind });
  }
  b.sounds = b.sounds.filter((s) => w.tick - s.tick < secs(6));
  if (b.heardIds.size > 600) b.heardIds = new Set([...b.heardIds].slice(-300));
}

export function perceive(w: World, a: Actor, b: BotState): Perception {
  const visible: Actor[] = [];
  for (const e of w.actors) {
    if (e.team === a.team || !e.alive) continue;
    if (canSee(w, a.pos, e.pos)) {
      visible.push(e);
      b.enemies.set(e.id, { pos: { ...e.pos }, tick: w.tick, own: true });
    }
  }
  for (const [id] of b.enemies) {
    const e = w.actor(id);
    // a death we saw or were told about (kill feed) clears the memory
    if (e && !e.alive) b.enemies.delete(id);
  }
  // checking an empty last-known spot downgrades the memory to "moved on"
  for (const [id, m] of b.enemies) {
    if (visible.some((v) => v.id === id)) continue;
    if (w.tick - m.tick > secs(10)) b.enemies.delete(id);
    else if (dist(a.pos, m.pos) < 1.2 || (w.tick - m.tick > secs(1) && canSee(w, a.pos, m.pos) && dist(a.pos, m.pos) < 5)) b.enemies.delete(id);
  }
  const memories = [...b.enemies.entries()].filter(([id]) => !visible.some((v) => v.id === id)).map(([id, m]) => ({ id, pos: m.pos, tick: m.tick }));
  return { visible, memories, sounds: b.sounds };
}

/** Recent threat positions this bot believes in (memories and loud sounds). */
export function threatPoints(w: World, p: Perception, maxAge = 6): Vec[] {
  const out: Vec[] = [];
  for (const m of p.memories) if (w.tick - m.tick < secs(maxAge)) out.push(m.pos);
  for (const s of p.sounds) if (w.tick - s.tick < secs(Math.min(3, maxAge)) && (s.kind === 'shot' || s.kind === 'step' || s.kind === 'breach')) out.push(s.pos);
  return out;
}
