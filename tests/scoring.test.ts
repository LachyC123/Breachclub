import { describe, it, expect } from 'vitest';
import { makeWorld, park, steps, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { ScoreTracker } from '../src/app/scoring';
import type { World } from '../src/sim/world';

function run(w: World, t: ScoreTracker, n = 1) {
  const awards: ScoreTracker['awards'] = [];
  const announces: ScoreTracker['announces'] = [];
  for (let i = 0; i < n; i++) {
    steps(w, 1);
    t.handle(w, w.events);
    awards.push(...t.awards);
    announces.push(...t.announces);
  }
  return { awards, announces };
}

describe('arcade scoring', () => {
  it('first blood, chained combo, double kill, ace and assists', () => {
    const w = makeWorld();
    park(w);
    const t = new ScoreTracker();
    const [ram, mo] = attackers(w);
    const [d1, d2, d3] = defenders(w);
    w.damageActor(d1, 30, mo.id); // Mo softens the first defender
    t.handle(w, w.events); // (outside a step, so feed the damage event directly)
    w.damageActor(d1, 999, ram.id);
    const r1 = run(w, t);
    expect(r1.awards.map((a) => a.label)).toEqual(expect.arrayContaining([`ELIMINATED ${d1.name}`, 'FIRST BLOOD', 'ASSIST']));
    expect(r1.announces[0].text).toBe('FIRST BLOOD');
    steps(w, secs(1));
    w.damageActor(d2, 999, ram.id);
    const r2 = run(w, t);
    const kill2 = r2.awards.find((a) => a.label === `ELIMINATED ${d2.name}`)!;
    expect(kill2.combo).toBeGreaterThan(1); // chained inside the combo window
    expect(kill2.points).toBeGreaterThan(100);
    expect(r2.announces.map((a) => a.text)).toContain('DOUBLE KILL');
    w.damageActor(d3, 999, ram.id);
    const r3 = run(w, t, 2);
    expect(r3.announces.map((a) => a.text)).toEqual(expect.arrayContaining(['TRIPLE KILL', 'ACE']));
    expect(t.points(ram.id)).toBeGreaterThan(t.points(mo.id));
    expect(ScoreTracker.rank(t.points(ram.id))).toBe('S');
    const medals = t.medals(w, ram.id, ram.id).map((m) => m.id);
    expect(medals).toEqual(expect.arrayContaining(['mvp', 'hunter']));
  });

  it('kills outside the windows do not chain', () => {
    const w = makeWorld();
    park(w);
    const t = new ScoreTracker();
    const [ram] = attackers(w);
    const [d1, d2] = defenders(w);
    w.damageActor(d1, 999, ram.id);
    run(w, t);
    steps(w, secs(6));
    w.damageActor(d2, 999, ram.id);
    const r = run(w, t);
    expect(r.awards.find((a) => a.label.startsWith('ELIMINATED'))!.combo).toBe(1);
    expect(r.announces.map((a) => a.text)).not.toContain('DOUBLE KILL');
  });
});
