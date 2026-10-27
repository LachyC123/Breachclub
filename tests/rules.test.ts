// Objective outcomes and documented tie-breaks (docs/02 Deterministic resolution, docs/13 #1).
import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs, RULES } from '../src/content/defs';
import type { World } from '../src/sim/world';

const STAND = { x: 6.0, y: 6.75 }; // just south of the console, within 1.25 tiles

function toAction(w: World) {
  steps(w, 1);
  expect(w.phase).toBe('action');
}

describe('round rules', () => {
  it('a plant completing on the last action tick enters the armed state', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    w.phaseEndTick = w.tick + 1 + secs(RULES.arm_seconds);
    steps(w, secs(RULES.arm_seconds) + 1, () => new Map([[planter.id, intent({ interact: true })]]));
    expect(w.phase).toBe('armed');
    expect(w.result).toBeNull();
  });

  it('without a plant the action clock running out wins for defenders', () => {
    const w = makeWorld({ action: 2 });
    park(w);
    toAction(w);
    steps(w, secs(3));
    expect(w.result?.winner).toBe(w.defendTeam);
    expect(w.result?.reason).toBe('timeout');
  });

  it('a shutdown completing on the final broadcast tick beats expiry', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    steps(w, secs(RULES.arm_seconds) + 2, () => new Map([[planter.id, intent({ interact: true })]]));
    expect(w.phase).toBe('armed');
    place(planter, { x: 33.5, y: 25.5 });
    const def = defenders(w)[0];
    place(def, STAND);
    w.phaseEndTick = w.tick + 1 + secs(RULES.shutdown_seconds);
    steps(w, secs(RULES.shutdown_seconds) + 2, () => new Map([[def.id, intent({ interact: true })]]));
    expect(w.result?.reason).toBe('shutdown');
    expect(w.result?.winner).toBe(w.defendTeam);
  });

  it('both teams eliminated on the same tick: defenders win unarmed', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    for (const a of attackers(w).slice(1)) a.hp = 0;
    for (const a of defenders(w).slice(1)) a.hp = 0;
    steps(w, 1);
    const la = attackers(w)[0];
    const ld = defenders(w)[0];
    w.damageActor(la, 999, ld.id);
    w.damageActor(ld, 999, la.id);
    steps(w, 1);
    expect(w.result?.reason).toBe('mutual_elimination_unarmed');
    expect(w.result?.winner).toBe(w.defendTeam);
  });

  it('a planter killed on the completion tick cannot finish the plant', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    planter.hp = 1;
    const shooter = defenders(w)[0];
    place(shooter, { x: 6.0, y: 9.5 });
    const start = w.tick + 1;
    const done = start + secs(RULES.arm_seconds);
    steps(w, secs(RULES.arm_seconds) + 1, (ww) => {
      const m = new Map([[planter.id, intent({ interact: true })]]);
      const ang = Math.atan2(planter.pos.y - shooter.pos.y, planter.pos.x - shooter.pos.x);
      m.set(shooter.id, intent({ aim: ang, fire: ww.tick + 1 === done }));
      return m;
    });
    expect(planter.alive).toBe(false);
    expect(w.phase).not.toBe('armed');
  });

  it('once armed, eliminating every attacker does not end the round', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    steps(w, secs(RULES.arm_seconds) + 2, () => new Map([[planter.id, intent({ interact: true })]]));
    expect(w.phase).toBe('armed');
    for (const a of attackers(w)) w.damageActor(a, 999, defenders(w)[0].id);
    steps(w, 5);
    expect(w.result).toBeNull();
    expect(w.phase).toBe('armed');
    steps(w, secs(RULES.broadcast_seconds) + 5);
    expect(w.result?.reason).toBe('broadcast_complete');
    expect(w.result?.winner).toBe(w.attackTeam);
  });

  it('eliminating every defender after the arm wins for attackers immediately', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    steps(w, secs(RULES.arm_seconds) + 2, () => new Map([[planter.id, intent({ interact: true })]]));
    for (const d of defenders(w)) w.damageActor(d, 999, planter.id);
    steps(w, 1);
    expect(w.result?.reason).toBe('defenders_eliminated');
    expect(w.result?.winner).toBe(w.attackTeam);
  });

  it('records exactly one RoundEnded event', () => {
    const w = makeWorld({ action: 1 });
    park(w);
    let ended = 0;
    for (let i = 0; i < secs(3); i++) {
      w.step(new Map());
      ended += w.events.filter((e) => e.type === 'roundEnded').length;
    }
    expect(ended).toBe(1);
  });

  it('moving cancels an arming attempt and resets its progress', () => {
    const w = makeWorld();
    park(w);
    toAction(w);
    const planter = attackers(w)[0];
    place(planter, STAND);
    steps(w, secs(1.5), () => new Map([[planter.id, intent({ interact: true })]]));
    expect(planter.interaction?.kind).toBe('arm');
    steps(w, 1, () => new Map([[planter.id, intent({ interact: true, move: { x: 1, y: 0 } })]]));
    expect(planter.interaction).toBeNull();
    // holding again requires a fresh press and starts from zero
    steps(w, 2, () => new Map([[planter.id, intent({ interact: false })]]));
    place(planter, STAND);
    steps(w, secs(2.5), () => new Map([[planter.id, intent({ interact: true })]]));
    expect(w.phase).toBe('action');
  });
});

import { Match } from '../src/app/session';

describe('match flow', () => {
  it('stepping after a round ends exposes no stale events and scores once', () => {
    const m = new Match({ seed: 3, difficulty: 'club', playerStartSide: 'attack', winsNeeded: 3, prepSeconds: 0, actionSeconds: 1 });
    let ended = 0;
    for (let i = 0; i < 60 * 4; i++) {
      if (m.step(null)) ended++;
      if (m.world.phase === 'ended') expect(m.world.events.filter((e) => e.type === 'death' || e.type === 'roundEnded').length).toBeLessThanOrEqual(1);
    }
    expect(ended).toBe(1);
    expect(m.score[0] + m.score[1]).toBe(1);
    // one step later the buffer is empty
    m.step(null);
    expect(m.world.events.length).toBe(0);
  });
});
