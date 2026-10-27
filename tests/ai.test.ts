import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { AIDirector } from '../src/ai/brain';
import { emptyIntent } from '../src/sim/types';

describe('attack squad AI', () => {
  it('escorts arm the console when the player idles on site and the clock runs low', () => {
    const w = makeWorld({ action: 40 });
    park(w);
    const ai = new AIDirector(w);
    // two defenders down, the last one far away in the stock room
    const [last, ...rest] = defenders(w);
    rest.forEach((d) => (d.alive = false));
    const [human, mo, tess] = attackers(w);
    const c = w.map.console.center;
    place(human, { x: c.x + 1, y: c.y + 2 });
    place(mo, { x: c.x - 1, y: c.y + 2 });
    place(tess, { x: c.x + 2, y: c.y + 3 });
    steps(w, secs(14), () => {
      const m = ai.think();
      m.set(human.id, emptyIntent()); // the player stands still
      m.delete(last.id); // the last defender stays out of the fight
      return m;
    });
    expect(w.phase).toBe('armed');
    expect(human.alive).toBe(true);
    expect(w.armedBy).not.toBe(human.id);
  });
});

import { World } from '../src/sim/world';
import { dist } from '../src/sim/geometry';
import { roomAt } from '../src/sim/mapdata';
import { canSee } from '../src/sim/perception';

describe('defence squad AI', () => {
  it('defenders spend prep fortifying, not shooting at untouchable attackers or camping a spawn', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = new World({ seed, attackTeam: 1, squads: [['hinge', 'recruit_dex', 'recruit_june'], ['ram', 'recruit_mo', 'recruit_tess']], humanIndex: -1, attackEntry: 'window', difficulty: 'club' });
      const ai = new AIDirector(w);
      while (w.phase === 'prep') {
        const drones = w.entities.filter((d) => d.kind === 'drone').map((d) => ({ ...(d as { pos: { x: number; y: number } }).pos }));
        w.step(ai.think());
        // nobody can be hurt in prep: every defender shot must be at a drone, never at people
        for (const e of w.events) {
          if (e.type !== 'shot' || w.actor(e.actorId)?.team !== w.defendTeam) continue;
          const ang = Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x);
          const atDrone = drones.some((d) => Math.abs(Math.atan2(Math.sin(Math.atan2(d.y - e.from.y, d.x - e.from.x) - ang), Math.cos(Math.atan2(d.y - e.from.y, d.x - e.from.x) - ang))) < 0.3);
          expect(atDrone, `seed ${seed}: defender ${e.actorId} shot at nothing during prep`).toBe(true);
        }
      }
      const spawns = w.map.entries.flatMap((e) => e.spots.map(([x, y]) => ({ x, y })));
      for (const d of w.actors.filter((a) => a.team === w.defendTeam)) {
        const off = roomAt(w.map, d.pos)?.id !== w.map.objectiveRoom;
        // standing where an attacker spawn can see you (the window lets sight through)
        const camping = off && spawns.some((s) => dist(s, d.pos) < 8 && canSee(w, s, d.pos));
        expect(camping, `seed ${seed}: ${d.name} at ${d.pos.x.toFixed(1)},${d.pos.y.toFixed(1)}`).toBe(false);
      }
    }
  });
});
