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
