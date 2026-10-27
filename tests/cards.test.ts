import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { dealCards, type TeamCards } from '../src/content/cards';
import { TURRET_SECONDS, MISSILE_WARNING } from '../src/sim/cards';
import { Rng } from '../src/sim/rng';
import type { World } from '../src/sim/world';

const noBarrels = (w: World) => (w.entities = w.entities.filter((e) => e.kind !== 'barrel'));
const cards = (own: TeamCards, foe: TeamCards = {}): [TeamCards, TeamCards] => [own, foe];

describe('wild cards: dealing', () => {
  it('deals distinct cards and never offers a maxed card', () => {
    const r = new Rng(5);
    for (let i = 0; i < 50; i++) {
      const hand = dealCards(() => r.next(), { turret: 3 });
      expect(new Set(hand).size).toBe(3);
      expect(hand).not.toContain('turret');
    }
  });
});

describe('wild cards: passives', () => {
  it('Kevlar raises max health, Adrenaline speeds you up, Hollow Points hits harder', () => {
    const w = makeWorld({ cards: cards({ kevlar: 2, adrenaline: 3, hollow: 1 }) });
    park(w);
    noBarrels(w);
    const [ram, mo] = attackers(w);
    expect(ram.maxHp).toBe(140);
    expect(ram.hp).toBe(140);
    const plain = makeWorld();
    park(plain);
    const pMo = attackers(plain)[1];
    place(mo, { x: 12.5, y: 13.5 });
    place(pMo, { x: 12.5, y: 13.5 });
    steps(w, secs(1), () => new Map([[mo.id, intent({ move: { x: 1, y: 0 } })]]));
    steps(plain, secs(1), () => new Map([[pMo.id, intent({ move: { x: 1, y: 0 } })]]));
    expect(mo.pos.x - 12.5).toBeGreaterThan((pMo.pos.x - 12.5) * 1.2);
    const dex = defenders(w).find((a) => a.name === 'DEX')!;
    place(ram, { x: 20.5, y: 15.5 });
    place(dex, { x: 22.5, y: 15.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, fire: true })]]));
    expect(100 - dex.hp).toBe(34); // 30 * 1.12
  });

  it('Poison keeps hurting after the hit; Vampire heals the killer', () => {
    const w = makeWorld({ cards: cards({ poison: 1, vampire: 1 }) });
    park(w);
    noBarrels(w);
    const [ram] = attackers(w);
    const dex = defenders(w).find((a) => a.name === 'DEX')!;
    place(ram, { x: 20.5, y: 15.5 });
    place(dex, { x: 22.5, y: 15.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, fire: true })]]));
    const after = dex.hp;
    steps(w, secs(2));
    expect(dex.hp).toBeLessThan(after); // ticking down
    ram.hp = 40;
    w.damageActor(dex, 999, ram.id);
    steps(w, 1);
    expect(ram.hp).toBe(75); // +35
  });

  it('Recon Pulse pings every enemy on its interval', () => {
    const w = makeWorld({ cards: cards({ pulse: 3 }) });
    park(w);
    steps(w, secs(9) - (w.tick % secs(9)) + 1);
    for (const d of defenders(w)) expect(w.marks[0].has(d.id)).toBe(true);
  });
});

describe('wild cards: Sentry Turret', () => {
  it('deploys, shoots only enemies it can see, can be shot down, expires, and charges run out', () => {
    const w = makeWorld({ cards: cards({ turret: 1 }) });
    park(w);
    noBarrels(w);
    const [ram] = attackers(w);
    const [d1, d2] = defenders(w);
    place(ram, { x: 18.5, y: 16.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, card: { type: 'turret' } })]]));
    const t = w.entities.find((e) => e.kind === 'turret')!;
    expect(t).toBeTruthy();
    expect(w.cardCharges[0].turret).toBe(0);
    // second deploy refused: out of charges
    steps(w, 1, () => new Map([[ram.id, intent({ card: { type: 'turret' } })]]));
    expect(w.entities.filter((e) => e.kind === 'turret').length).toBe(1);
    expect(w.events.some((e) => e.type === 'gadgetInvalid')).toBe(true);
    place(d1, { x: 23.5, y: 16.5 }); // in the open, in range
    place(d2, { x: 22.5, y: 10.0 }); // behind the stock wall
    steps(w, secs(2));
    expect(d1.hp).toBeLessThan(100);
    expect(d2.hp).toBe(100);
    // the enemy shoots it down
    place(d1, { x: 21.5, y: 18.5 });
    d1.hp = 100;
    steps(w, secs(3), () => new Map([[d1.id, intent({ aim: Math.atan2(t.pos.y - d1.pos.y, t.pos.x - d1.pos.x), fire: true })]]));
    expect(w.entities.some((e) => e.kind === 'turret')).toBe(false);
  });

  it('expires on its own', () => {
    const w = makeWorld({ cards: cards({ turret: 1 }) });
    park(w);
    const [ram] = attackers(w);
    place(ram, { x: 18.5, y: 16.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, card: { type: 'turret' } })]]));
    steps(w, secs(TURRET_SECONDS) + 2);
    expect(w.entities.some((e) => e.kind === 'turret')).toBe(false);
  });
});

describe('wild cards: Missile Strike', () => {
  it('telegraphs for both teams, then blasts the point; you can run out of it', () => {
    const w = makeWorld({ cards: cards({ missile: 1 }) });
    park(w);
    noBarrels(w);
    const [ram] = attackers(w);
    const [d1, d2] = defenders(w);
    place(ram, { x: 18.5, y: 16.5 });
    place(d1, { x: 24.5, y: 16.5 });
    place(d2, { x: 22.5, y: 16.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ card: { type: 'missile', x: 24.5, y: 16.5 } })]]));
    const m = w.entities.find((e) => e.kind === 'missile')!;
    expect(m).toBeTruthy();
    expect(w.visibleEntities[1].has(m.id)).toBe(true); // the target team sees the warning
    // d2 runs, d1 doesn't
    steps(w, secs(MISSILE_WARNING) + 2, () => new Map([[d2.id, intent({ move: { x: -1, y: 0 } })]]));
    expect(d1.alive).toBe(false);
    expect(d2.hp).toBe(100);
  });

  it('refuses targets out of range and cards before action', () => {
    const w = makeWorld({ prep: 10, cards: cards({ missile: 1 }) });
    park(w);
    const [ram] = attackers(w);
    steps(w, 1, () => new Map([[ram.id, intent({ card: { type: 'missile', x: ram.pos.x - 2, y: ram.pos.y } })]]));
    expect(w.entities.some((e) => e.kind === 'missile')).toBe(false);
    const w2 = makeWorld({ cards: cards({ missile: 1 }) });
    park(w2);
    const r2 = attackers(w2)[0];
    steps(w2, 1, () => new Map([[r2.id, intent({ card: { type: 'missile', x: r2.pos.x - 30, y: r2.pos.y } })]]));
    expect(w2.entities.some((e) => e.kind === 'missile')).toBe(false);
    expect(w2.cardCharges[0].missile).toBe(1);
  });
});

describe('wild cards: Explosive Rounds', () => {
  it('every Nth bullet detonates', () => {
    const w = makeWorld({ cards: cards({ explosive: 3 }) });
    park(w);
    noBarrels(w);
    const [ram] = attackers(w);
    place(ram, { x: 18.5, y: 16.5 });
    let blasts = 0;
    for (let i = 0; i < secs(1.5); i++) {
      steps(w, 1, () => new Map([[ram.id, intent({ aim: 0, fire: true })]]));
      blasts += w.events.filter((e) => e.type === 'explosion').length;
    }
    expect(ram.shotCount).toBeGreaterThanOrEqual(8);
    expect(blasts).toBe(Math.floor(ram.shotCount / 4));
  });
});
