// Siege-style recon drones (prep only): two per attacker, tagging, anti-drone fire.
import { describe, it, expect } from 'vitest';
import { makeWorld, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { AIDirector } from '../src/ai/brain';
import type { DroneEntity } from '../src/sim/types';
import type { World } from '../src/sim/world';

const droneOf = (w: World, ownerId: number) => w.entities.find((e): e is DroneEntity => e.kind === 'drone' && e.ownerId === ownerId);

describe('recon drones', () => {
  it('every attacker starts prep on a drone, with one spare; operators wait at spawn', () => {
    const w = makeWorld({ prep: 20 });
    for (const a of attackers(w)) {
      expect(droneOf(w, a.id)).toBeDefined();
      expect(a.drones).toBe(1);
    }
    const a = attackers(w)[0];
    const start = { ...a.pos };
    steps(w, secs(1), () => new Map([[a.id, intent({ move: { x: 1, y: 0 }, drone: { move: { x: 0, y: -1 }, tag: false } })]]));
    expect(a.pos).toEqual(start);
    expect(droneOf(w, a.id)!.pos.y).toBeLessThan(start.y - 3);
  });

  it('drives through an open doorway and reveals a defender only by line of sight', () => {
    const w = makeWorld({ prep: 20 });
    const a = attackers(w)[0];
    const d = droneOf(w, a.id)!;
    w.entities = [d];
    d.pos = { x: 18.5, y: 24.0 };
    for (const o of attackers(w)) place(o, { x: 2 + o.id, y: 26.5 });
    const def = defenders(w)[0];
    place(def, { x: 22.5, y: 19.5 });
    steps(w, 2);
    expect(w.visible[w.attackTeam].has(def.id)).toBe(false);
    steps(w, secs(0.8), () => new Map([[a.id, intent({ drone: { move: { x: 0, y: -1 }, tag: false } })]]));
    expect(d.pos.y).toBeLessThan(21.5);
    expect(w.visible[w.attackTeam].has(def.id)).toBe(true);
  });

  it('tagging pings every enemy the drone sees for five seconds', () => {
    const w = makeWorld({ prep: 20 });
    const a = attackers(w)[0];
    const d = droneOf(w, a.id)!;
    d.pos = { x: 18.5, y: 19.0 };
    const def = defenders(w)[0];
    place(def, { x: 18.5, y: 15.8 });
    steps(w, 1, () => new Map([[a.id, intent({ drone: { move: { x: 0, y: 0 }, tag: true } })]]));
    expect(w.marks[w.attackTeam].has(def.id)).toBe(true);
    steps(w, secs(5.2));
    expect(w.marks[w.attackTeam].has(def.id)).toBe(false);
  });

  it('a destroyed drone is replaced by the spare, then none remain', () => {
    const w = makeWorld({ prep: 20 });
    const a = attackers(w)[0];
    const shooter = defenders(w)[0];
    for (let i = 0; i < 2; i++) {
      const d = droneOf(w, a.id)!;
      d.pos = { x: 18.5, y: 19.0 };
      place(shooter, { x: 18.5, y: 16.0 });
      let killed = false;
      for (let t = 0; t < secs(1) && !killed; t++) {
        w.step(new Map([[shooter.id, intent({ aim: Math.PI / 2, fire: true })]]));
        killed = w.events.some((e) => e.type === 'droneDestroyed');
      }
      expect(killed).toBe(true);
    }
    expect(droneOf(w, a.id)).toBeUndefined();
    expect(a.drones).toBe(0);
  });

  it('drones power down when the action phase starts', () => {
    const w = makeWorld({ prep: 1 });
    steps(w, secs(1.2));
    expect(w.phase).toBe('action');
    expect(w.entities.some((e) => e.kind === 'drone')).toBe(false);
  });

  it('defender bots shoot a drone they can see; prep shooting costs no action ammo', () => {
    const w = makeWorld({ prep: 20 });
    const ai = new AIDirector(w);
    const a = attackers(w)[0];
    for (const d of defenders(w)) place(d, { x: 20 + d.id * 0.1, y: 16.5 });
    droneOf(w, a.id)!.pos = { x: 18.0, y: 19.5 };
    let destroyed = false;
    for (let i = 0; i < secs(5) && !destroyed; i++) {
      const m = ai.think();
      for (const x of attackers(w)) m.delete(x.id);
      w.step(m);
      if (w.events.some((e) => e.type === 'droneDestroyed')) destroyed = true;
    }
    expect(destroyed).toBe(true);
    w.phaseEndTick = w.tick + 1;
    steps(w, 2);
    for (const d of defenders(w)) expect(d.mag).toBe(d.weapon.magazine);
  });
});
