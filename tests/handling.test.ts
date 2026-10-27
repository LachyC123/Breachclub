import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';

describe('operator ratings and weapon handling', () => {
  it('heavy armour soaks gunfire that a light operator takes in full', () => {
    const hits: Record<string, number> = {};
    for (const name of ['DEX', 'HINGE']) {
      const w = makeWorld();
      park(w);
      const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
      const target = defenders(w).find((a) => a.name === name)!;
      place(ram, { x: 20.5, y: 15.5 });
      place(target, { x: 22.5, y: 15.5 });
      steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, fire: true })]]));
      hits[name] = 100 - target.hp;
    }
    expect(hits.DEX).toBe(30); // carbine, armour 1
    expect(hits.HINGE).toBe(24); // armour 3: 20% less
  });

  it('a light operator outruns a heavy one', () => {
    const w = makeWorld();
    park(w);
    const [, mo, tess] = attackers(w);
    place(mo, { x: 12.5, y: 13.5 });
    place(tess, { x: 12.5, y: 16.5 });
    steps(w, secs(1), () => new Map([[mo.id, intent({ move: { x: 1, y: 0 } })], [tess.id, intent({ move: { x: 1, y: 0 } })]]));
    expect(mo.pos.x - 12.5).toBeGreaterThan((tess.pos.x - 12.5) * 1.2);
  });

  it('the scattergun loads shell by shell and firing interrupts the reload', () => {
    const w = makeWorld();
    park(w);
    const tess = attackers(w).find((a) => a.weapon.id === 'scattergun')!;
    place(tess, { x: 12.5, y: 16.5 });
    tess.mag = 0;
    steps(w, 1, () => new Map([[tess.id, intent({ reload: true })]]));
    steps(w, secs(0.45));
    expect(tess.mag).toBe(1);
    expect(tess.reloadUntil).toBeGreaterThanOrEqual(0); // still loading the next shell
    steps(w, 1, () => new Map([[tess.id, intent({ aim: 0, fire: true })]]));
    expect(tess.mag).toBe(0);
    expect(tess.reloadUntil).toBe(-1);
  });

  it('slide bursts you forward, then needs a cooldown', () => {
    const w = makeWorld();
    park(w);
    const [ram, mo] = attackers(w);
    place(ram, { x: 12.5, y: 13.5 });
    place(mo, { x: 12.5, y: 16.5 });
    const fwd = { x: 1, y: 0 };
    steps(w, 1, () => new Map([[ram.id, intent({ move: fwd, slide: true })], [mo.id, intent({ move: fwd })]]));
    steps(w, secs(0.3), () => new Map([[ram.id, intent({ move: fwd })], [mo.id, intent({ move: fwd })]]));
    // Ram (medium) out-slides Mo (light) walking
    expect(ram.pos.x - 12.5).toBeGreaterThan((mo.pos.x - 12.5) * 1.6);
    const ready = ram.slideReadyTick;
    steps(w, 1, () => new Map([[ram.id, intent({ move: fwd, slide: true })]]));
    expect(ram.slide).toBeNull(); // still cooling down
    expect(ram.slideReadyTick).toBe(ready);
  });
});
