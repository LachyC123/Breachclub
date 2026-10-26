import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';

describe('smoke', () => {
  it('runs prep into action with no input', () => {
    const w = new World({ seed: 1, attackTeam: 0, squads: [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']], humanIndex: 0, attackEntry: 'front', difficulty: 'club' });
    expect(w.actors.length).toBe(6);
    for (let i = 0; i < 60 * 26; i++) w.step(new Map());
    expect(w.phase).toBe('action');
  });
});
