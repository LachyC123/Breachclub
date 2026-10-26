// Signature gadget acceptance tests (data/operators.json acceptance_test fields) and placement rules.
import { describe, it, expect } from 'vitest';
import { makeWorld, park, place, steps, intent, attackers, defenders } from './helpers';
import { secs } from '../src/content/defs';
import { lineOfSight, raycast } from '../src/sim/geometry';
import { navGrid } from '../src/ai/nav';
import { validateHingePlacement } from '../src/sim/gadgets';
import { interactOptions } from '../src/sim/interact';
import type { World } from '../src/sim/world';
import type { HingeEntity } from '../src/sim/types';

const group = (w: World, id: string) => w.map.softGroups.find((g) => g.id === id)!.index;

describe('Ram — bumper sled', () => {
  it('breaches one soft wall; sight, bullets and navigation agree on the opening', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
    place(ram, { x: 11.5, y: 13.4 });
    const a = group(w, 'a');
    const before = navGrid(w, 'attack').walk[11 * w.map.w + 11];
    expect(before).toBe(0);
    steps(w, 1, () => new Map([[ram.id, intent({ gadget: { type: 'ramLaunch', angle: -Math.PI / 2 } })]]));
    expect(ram.gadgetCharges).toBe(0);
    steps(w, secs(1.5));
    expect(w.soft[a].state).toBe('breached');
    const from = { x: 11.5, y: 13.4 };
    const to = { x: 11.5, y: 9.2 };
    // the wall itself is gone for sight and bullets (the sled's own cover is a separate entity)
    expect(raycast(w, from, to, 'sight', { obs: [] })).toBeNull();
    expect(raycast(w, from, to, 'bullet', { obs: [] })).toBeNull();
    expect(navGrid(w, 'attack').walk[11 * w.map.w + 11]).toBe(1);
    // it continued up to ~2 tiles through the opening and unfolded cover
    const cover = w.entities.find((e) => e.kind === 'cover');
    expect(cover).toBeDefined();
  });

  it('stops at a reinforced wall without breaching it', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
    place(ram, { x: 11.5, y: 13.4 });
    const a = group(w, 'a');
    w.soft[a].state = 'reinforced';
    w.bumpGeometry();
    const reasons: string[] = [];
    steps(w, 1, () => new Map([[ram.id, intent({ gadget: { type: 'ramLaunch', angle: -Math.PI / 2 } })]]));
    for (let i = 0; i < secs(1.5); i++) {
      w.step(new Map());
      for (const e of w.events) if (e.type === 'sledStopped') reasons.push(e.reason);
    }
    expect(reasons).toEqual(['reinforced']);
    expect(w.soft[a].state).toBe('reinforced');
  });

  it('two actors in its lane are each hit at most once', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
    const [d1, d2] = defenders(w);
    place(ram, { x: 17.0, y: 12.6 });
    place(d1, { x: 19.0, y: 12.6 });
    place(d2, { x: 20.0, y: 12.6 });
    const hits = new Map<number, number>();
    steps(w, 1, () => new Map([[ram.id, intent({ gadget: { type: 'ramLaunch', angle: 0 } })]]));
    for (let i = 0; i < secs(2); i++) {
      w.step(new Map());
      for (const e of w.events) if (e.type === 'sledHitActor') hits.set(e.actorId, (hits.get(e.actorId) ?? 0) + 1);
    }
    for (const n of hits.values()) expect(n).toBeLessThanOrEqual(1);
    expect(d1.hp).toBeGreaterThanOrEqual(80);
    expect(d2.hp).toBeGreaterThanOrEqual(80);
    expect(hits.size).toBeGreaterThanOrEqual(1);
  });

  it('cannot launch during prep and an invalid launch spends nothing', () => {
    const w = makeWorld({ prep: 5 });
    const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
    steps(w, 1, () => new Map([[ram.id, intent({ gadget: { type: 'ramLaunch', angle: 0 } })]]));
    expect(ram.gadgetCharges).toBe(1);
    expect(w.entities.some((e) => e.kind === 'sled')).toBe(false);
  });

  it('can be shot down (60 HP) and then leaves no cover', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const ram = attackers(w).find((a) => a.operatorId === 'ram')!;
    const d = defenders(w)[0];
    place(ram, { x: 9.0, y: 16.5 });
    place(d, { x: 15.0, y: 16.5 });
    steps(w, 1, () => new Map([[ram.id, intent({ gadget: { type: 'ramLaunch', angle: 0 } })]]));
    let destroyed = false;
    for (let i = 0; i < secs(1.2); i++) {
      const sled = w.entities.find((e) => e.kind === 'sled');
      const m = new Map();
      if (sled && sled.kind === 'sled') m.set(d.id, intent({ aim: Math.atan2(sled.pos.y - d.pos.y, sled.pos.x - d.pos.x), fire: true }));
      w.step(m);
      if (w.events.some((e) => e.type === 'sledDestroyed')) destroyed = true;
    }
    expect(destroyed).toBe(true);
    expect(w.entities.some((e) => e.kind === 'cover')).toBe(false);
  });
});

describe('Hinge — pivot wall', () => {
  function setup() {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const hinge = defenders(w).find((a) => a.operatorId === 'hinge')!;
    place(hinge, { x: 18.5, y: 18.0 });
    steps(w, 1, () => new Map([[hinge.id, intent({ gadget: { type: 'hingePlace', x: 18.5, y: 16.5, vertical: false } })]]));
    const h = w.entities.find((e): e is HingeEntity => e.kind === 'hinge')!;
    expect(h).toBeDefined();
    steps(w, secs(0.6));
    return { w, hinge, h };
  }

  it('refuses to rotate with a body in its swept footprint, without clipping or damage', () => {
    const { w, hinge, h } = setup();
    const blocker = attackers(w)[1];
    place(blocker, { x: 19.1, y: 17.1 });
    const cdBefore = h.cooldownUntil;
    const reasons: string[] = [];
    steps(w, 1, () => new Map([[hinge.id, intent({ gadget: { type: 'hingeRotate' } })]]));
    for (const e of w.events) if (e.type === 'hingeBlocked') reasons.push(e.reason);
    steps(w, secs(1));
    expect(reasons).toEqual(['Space occupied']);
    expect(h.angle).toBe(0);
    expect(h.cooldownUntil).toBe(cdBefore);
    expect(blocker.hp).toBe(100);
    expect(blocker.pos).toEqual({ x: 19.1, y: 17.1 });
  });

  it('after clearance rotates and updates sight and navigation together', () => {
    const { w, hinge, h } = setup();
    const a = { x: 17.0, y: 17.2 };
    const b = { x: 20.0, y: 17.2 };
    expect(lineOfSight(w, a, b)).toBe(true);
    expect(navGrid(w, 'defence').walk[17 * w.map.w + 18]).toBe(1);
    steps(w, 1, () => new Map([[hinge.id, intent({ gadget: { type: 'hingeRotate' } })]]));
    steps(w, secs(0.25 + 0.6) + 2);
    expect(h.orient).toBe(1);
    expect(Math.abs(h.angle - Math.PI / 2)).toBeLessThan(1e-6);
    expect(lineOfSight(w, a, b)).toBe(false);
    expect(navGrid(w, 'defence').walk[17 * w.map.w + 18]).toBe(0);
    // recovers for 4 seconds before the next swing
    expect(h.cooldownUntil - w.tick).toBeGreaterThan(secs(3.5));
  });

  it('stalls rather than shoving a body that steps in mid-swing', () => {
    const { w, hinge, h } = setup();
    steps(w, 1, () => new Map([[hinge.id, intent({ gadget: { type: 'hingeRotate' } })]]));
    steps(w, secs(0.25) + 6);
    expect(h.state).toBe('rotating');
    const intruder = attackers(w)[2];
    const spot = { x: 18.5 + Math.cos(h.angle + 0.35) * 0.75, y: 16.5 + Math.sin(h.angle + 0.35) * 0.75 };
    place(intruder, spot);
    const ang = h.angle;
    steps(w, secs(0.5));
    expect(Math.abs(h.angle - ang)).toBeLessThan(0.2);
    expect(intruder.hp).toBe(100);
  });

  it('cannot be placed across a protected approach or the console', () => {
    const w = makeWorld();
    park(w);
    steps(w, 1);
    const hinge = defenders(w).find((a) => a.operatorId === 'hinge')!;
    place(hinge, { x: 14.5, y: 6.5 });
    // across the office/stock doorway Q (x16, y6-7)
    expect(validateHingePlacement(w, hinge, { x: 15.5, y: 7.0 }, true)).toMatchObject({ ok: false, reason: 'Keep approach open' });
    place(hinge, { x: 6.0, y: 8.0 });
    expect(validateHingePlacement(w, hinge, { x: 6.0, y: 6.5 }, false).ok).toBe(false);
  });
});

describe('defender prep tools', () => {
  it('never offers a barricade on protected approaches', () => {
    const w = makeWorld({ attackTeam: 0, prep: 10 });
    const d = defenders(w)[0];
    const q = w.map.doors.find((x) => x.id === 'Q')!;
    place(d, { x: q.center.x - 1.0, y: q.center.y });
    const opt = interactOptions(w, d).find((o) => o.kind === 'barricade');
    expect(opt?.enabled).toBe(false);
    expect(opt?.reason).toBe('Keep approach open');
  });

  it('reinforcing spends a shared charge and makes the panel immune to breaching', () => {
    const w = makeWorld({ attackTeam: 0, prep: 10 });
    const d = defenders(w)[1];
    const g = w.map.softGroups.find((x) => x.id === 'a')!;
    place(d, { x: g.center.x, y: g.center.y - 1.0 });
    steps(w, secs(1.4), () => new Map([[d.id, intent({ interact: true })]]));
    expect(w.soft[g.index].state).toBe('reinforced');
    expect(w.resources[w.defendTeam].reinforcements).toBe(1);
  });
});
