import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { BARREL_HP } from '../src/sim/explosions';
import type { World } from '../src/sim/world';
import type { Vec } from '../src/sim/types';

function barrels(w: World, ps: Vec[]) {
  w.entities = w.entities.filter((e) => e.kind !== 'barrel');
  for (const p of ps) w.entities.push({ kind: 'barrel', id: w.newEntityId(), team: 0, ownerId: -1, pos: { ...p }, hp: BARREL_HP, fuseTick: -1, lastHitBy: -1 });
  w.bumpGeometry();
}

describe('explosive barrels', () => {
  it('a shot barrel cooks off, then blasts enemies in the open but not behind walls or teammates', () => {
    const w = makeWorld();
    park(w);
    const [ram, mo] = attackers(w);
    const [d1, d2] = defenders(w);
    barrels(w, [{ x: 22.5, y: 16.5 }]);
    place(ram, { x: 17.5, y: 16.5 });
    place(mo, { x: 22.5, y: 18.0 }); // teammate in the blast
    place(d1, { x: 23.5, y: 16.5 }); // enemy in the blast
    place(d2, { x: 22.5, y: 10.0 }); // enemy behind the stock wall
    steps(w, 2, () => new Map([[ram.id, intent({ aim: 0, fire: true })]]));
    expect(w.entities.some((e) => e.kind === 'barrel')).toBe(true); // fuse burning: time to run
    steps(w, secs(0.5));
    expect(w.entities.some((e) => e.kind === 'barrel')).toBe(false);
    expect(d1.hp).toBeLessThan(40);
    expect(d2.hp).toBe(100);
    expect(mo.hp).toBe(100);
  });

  it('chains into nearby barrels and blows open an unreinforced soft wall', () => {
    const w = makeWorld();
    park(w);
    const [ram] = attackers(w);
    const g = w.map.softGroups.findIndex((s) => s.id === 'a');
    const c = w.map.softGroups[g].center;
    barrels(w, [{ x: c.x + 2.5, y: c.y + 1.6 }, { x: c.x + 0.5, y: c.y + 1.4 }]);
    place(ram, { x: c.x + 7.5, y: c.y + 1.6 });
    steps(w, 2, () => new Map([[ram.id, intent({ aim: Math.PI, fire: true })]]));
    steps(w, secs(1));
    expect(w.entities.filter((e) => e.kind === 'barrel').length).toBe(0);
    expect(w.soft[g].state).toBe('breached');
  });

  it('cannot be set off during preparation', () => {
    const w = makeWorld({ prep: 20 });
    park(w);
    const [, d1] = defenders(w);
    barrels(w, [{ x: 12.5, y: 7.5 }]);
    place(d1, { x: 9.5, y: 7.5 });
    steps(w, secs(1), () => new Map([[d1.id, intent({ aim: 0, fire: true })]]));
    expect(w.entities.filter((e) => e.kind === 'barrel').length).toBe(1);
  });
});
