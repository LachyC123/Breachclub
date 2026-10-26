import { World } from '../src/sim/world';
import { emptyIntent, type ActorIntent, type Actor, type Vec } from '../src/sim/types';

export function makeWorld(opts: Partial<{ attackTeam: 0 | 1; prep: number; action: number; seed: number }> = {}): World {
  const attackTeam = opts.attackTeam ?? 0;
  return new World({
    seed: opts.seed ?? 1,
    attackTeam,
    squads: attackTeam === 0 ? [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']] : [['hinge', 'recruit_dex', 'recruit_june'], ['ram', 'recruit_mo', 'recruit_tess']],
    humanIndex: 0,
    attackEntry: 'front',
    difficulty: 'club',
    prepSeconds: opts.prep ?? 0,
    actionSeconds: opts.action ?? 120,
  });
}

/** Park every actor somewhere harmless so tests control exactly who does what. */
export function park(w: World) {
  const spots: Vec[] = [
    { x: 33.5, y: 25.5 },
    { x: 34.5, y: 25.5 },
    { x: 33.5, y: 26.5 },
    { x: 27.5, y: 4.5 },
    { x: 28.5, y: 4.5 },
    { x: 29.5, y: 4.5 },
  ];
  w.actors.forEach((a, i) => place(a, spots[i]));
}

export function place(a: Actor, p: Vec) {
  a.pos = { ...p };
  a.prevPos = { ...p };
}

export function steps(w: World, n: number, intents: (w: World) => Map<number, ActorIntent> = () => new Map()) {
  for (let i = 0; i < n && w.phase !== 'ended'; i++) w.step(intents(w));
}

export function intent(p: Partial<ActorIntent>): ActorIntent {
  return { ...emptyIntent(), ...p };
}

export const attackers = (w: World) => w.actors.filter((a) => a.team === w.attackTeam);
export const defenders = (w: World) => w.actors.filter((a) => a.team === w.defendTeam);
