// Attacker scouting puck (docs/02 Preparation).
import { describe, it, expect } from 'vitest';
import { makeWorld, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { AIDirector } from '../src/ai/brain';
import type { PuckEntity } from '../src/sim/types';

const puckOf = (w: ReturnType<typeof makeWorld>) => w.entities.find((e): e is PuckEntity => e.kind === 'puck');

describe('scouting puck', () => {
  it('drives through an open doorway during prep while its operator stands still', () => {
    const w = makeWorld({ prep: 20 });
    const driver = attackers(w)[0];
    const pk = puckOf(w)!;
    pk.pos = { x: 18.5, y: 24.0 };
    const start = { ...driver.pos };
    steps(w, secs(1.2), () => new Map([[driver.id, intent({ puck: { x: 0, y: -1 }, move: { x: 1, y: 0 } })]]));
    expect(pk.pos.y).toBeLessThan(21.5); // inside the shop past the front doors
    expect(driver.pos).toEqual(start);
  });

  it('cannot pass through walls and only reveals what it can see', () => {
    const w = makeWorld({ prep: 20 });
    const driver = attackers(w)[0];
    const pk = puckOf(w)!;
    pk.pos = { x: 12.5, y: 23.5 }; // street, in front of a solid wall
    steps(w, secs(1), () => new Map([[driver.id, intent({ puck: { x: 0, y: -1 } })]]));
    expect(pk.pos.y).toBeGreaterThan(22.9);
    // a defender behind that wall stays hidden
    const d = defenders(w)[0];
    place(d, { x: 12.5, y: 20.0 });
    steps(w, 2);
    expect(w.visible[w.attackTeam].has(d.id)).toBe(false);
  });

  it('expires when the action phase starts', () => {
    const w = makeWorld({ prep: 1 });
    steps(w, secs(1.2));
    expect(w.phase).toBe('action');
    expect(puckOf(w)).toBeUndefined();
  });

  it('defender bots shoot a puck they can see, and prep shooting costs no action ammo', () => {
    const w = makeWorld({ prep: 20 });
    const ai = new AIDirector(w);
    const pk = puckOf(w)!;
    for (const d of defenders(w)) place(d, { x: 20 + d.id * 0.1, y: 16.5 });
    pk.pos = { x: 18.0, y: 19.5 };
    let destroyed = false;
    for (let i = 0; i < secs(5) && !destroyed; i++) {
      const m = ai.think();
      for (const a of attackers(w)) m.delete(a.id);
      w.step(m);
      if (w.events.some((e) => e.type === 'puckDestroyed')) destroyed = true;
    }
    expect(destroyed).toBe(true);
    w.phaseEndTick = w.tick + 1;
    steps(w, 2);
    for (const d of defenders(w)) expect(d.mag).toBe(d.weapon.magazine);
  });
});
