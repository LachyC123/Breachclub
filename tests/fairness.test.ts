// Fair perception, map reachability under all legal fortifications, and death takeover.
import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { AIDirector } from '../src/ai/brain';
import { findPath } from '../src/ai/nav';
import { World } from '../src/sim/world';

describe('fair bot perception', () => {
  it('a stationary hidden player is never aimed at or hunted', () => {
    for (const seed of [1, 2, 3]) {
      const w = makeWorld({ seed });
      const ai = new AIDirector(w);
      const human = attackers(w)[0];
      // other attackers stand far away on the street, human hides in the alley corner
      for (const a of attackers(w)) place(a, { x: 34.5, y: 26.5 - a.id * 0.8 });
      place(human, { x: 34.5, y: 1.0 });
      let defenderShots = 0;
      for (let i = 0; i < secs(30); i++) {
        const intents = ai.think();
        for (const a of attackers(w)) intents.delete(a.id); // attackers stay still and silent
        w.step(intents);
        defenderShots += w.events.filter((e) => e.type === 'shot' && w.actor(e.actorId)!.team === w.defendTeam).length;
      }
      expect(defenderShots).toBe(0);
      for (const d of defenders(w)) {
        const mem = ai.bots.get(d.id)!.enemies.get(human.id);
        expect(mem).toBeUndefined();
      }
    }
  });

  it('footsteps give a fuzzy region, never the exact position', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const walker = attackers(w)[1];
    const listener = defenders(w)[1];
    place(listener, { x: 15.0, y: 9.5 }); // office, beside the stockroom wall
    place(walker, { x: 17.5, y: 8.0 }); // stockroom, out of sight behind the wall
    steps(w, secs(0.6), () => new Map([[walker.id, intent({ move: { x: 0, y: -1 } })]]));
    const heard = w.heard[w.defendTeam].filter((h) => h.kind === 'step');
    expect(heard.length).toBeGreaterThan(0);
    for (const h of heard) expect(h.uncertainty).toBeGreaterThan(0.5);
    expect(w.visible[w.defendTeam].has(walker.id)).toBe(false);
  });

  it('teammate sightings arrive after a communication delay with their original timestamp', () => {
    const w = makeWorld();
    park(w);
    const ai = new AIDirector(w);
    steps(w, 1);
    const spotter = defenders(w)[0];
    const mate = defenders(w)[2];
    const target = attackers(w)[1];
    place(spotter, { x: 20.0, y: 13.0 });
    place(target, { x: 24.0, y: 13.0 });
    place(mate, { x: 27.5, y: 4.5 });
    // one tick of perception: spotter sees target, mate does not
    w.step(new Map());
    ai.think();
    const seenAt = w.tick;
    place(target, { x: 34.5, y: 26.5 }); // gone out of sight immediately
    expect(ai.bots.get(mate.id)!.enemies.has(target.id)).toBe(false);
    for (let i = 0; i < secs(0.6); i++) {
      w.step(new Map());
      ai.think();
    }
    const m = ai.bots.get(mate.id)!.enemies.get(target.id);
    expect(m).toBeDefined();
    expect(m!.own).toBe(false);
    expect(m!.tick).toBeLessThanOrEqual(seenAt);
  });
});

describe('map validation (docs/08)', () => {
  it('every entry reaches the objective by walking under every legal fortification', () => {
    const base = makeWorld();
    const barricadable = base.map.doors.filter((d) => !d.protected).map((d) => d.index);
    const groups = base.map.softGroups.map((g) => g.index);
    const reinforceSets: number[][] = [[]];
    for (const g of groups) reinforceSets.push([g]);
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) reinforceSets.push([groups[i], groups[j]]);
    let checked = 0;
    for (const rs of reinforceSets)
      for (let mask = 0; mask < 1 << barricadable.length; mask++) {
        const w = makeWorld();
        steps(w, 1);
        for (const g of rs) w.soft[g].state = 'reinforced';
        barricadable.forEach((d, k) => {
          if (mask & (1 << k)) w.barricades[d] = { hp: 40, team: 1, damaged: false };
        });
        w.bumpGeometry();
        for (const e of w.map.entries)
          for (const s of e.spots) {
            const p = findPath(w, 'attack', { x: s[0], y: s[1] }, w.map.console.center);
            expect(p, `entry ${e.id} reinforce ${rs} barricades ${mask}`).not.toBeNull();
            checked++;
          }
      }
    expect(checked).toBeGreaterThan(100);
  });

  it('protected doorways cannot be barricaded and soft panels exist into the objective', () => {
    const w = makeWorld();
    expect(w.map.doors.filter((d) => d.protected).map((d) => d.id).sort()).toEqual(['P', 'Q', 'R']);
    expect(w.map.softGroups.some((g) => g.rooms.includes('office'))).toBe(true);
  });
});

describe('death takeover', () => {
  it('keeps the survivor’s state, clears held input/orders, grants nothing extra', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const human = w.human()!;
    const mate = attackers(w).find((a) => a.id !== human.id)!;
    mate.hp = 57;
    mate.mag = 3;
    mate.reserve = 11;
    const pos = { ...mate.pos };
    w.damageActor(human, 999, defenders(w)[0].id);
    steps(w, 1);
    expect(human.alive).toBe(false);
    expect(w.takeOver(mate.id)).toBe(true);
    expect(w.human()!.id).toBe(mate.id);
    expect(mate.hp).toBe(57);
    expect(mate.mag).toBe(3);
    expect(mate.reserve).toBe(11);
    expect(mate.pos).toEqual(pos);
    expect(mate.interaction).toBeNull();
    expect(mate.breachCharges).toBe(1);
    // no invulnerability
    w.damageActor(mate, 10, defenders(w)[0].id);
    expect(mate.hp).toBe(47);
  });

  it('cannot take over a dead or enemy actor', () => {
    const w = makeWorld();
    steps(w, 1);
    expect(w.takeOver(defenders(w)[0].id)).toBe(false);
  });
});

describe('restart hygiene', () => {
  it('fresh rounds start from identical state for the same seed', () => {
    const snap = (w: World) => JSON.stringify(w.actors.map((a) => [a.pos, a.hp, a.mag, a.gadgetCharges]));
    const a = makeWorld({ seed: 9 });
    const b = makeWorld({ seed: 9 });
    expect(snap(a)).toBe(snap(b));
    for (let i = 0; i < 20; i++) {
      const w = makeWorld({ seed: 9 });
      expect(w.entities.map((e) => e.kind)).toEqual(['puck']);
      expect(w.events.length).toBe(0);
      expect(snap(w)).toBe(snap(a));
    }
  });
});
