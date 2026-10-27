// Training Grounds rules: nothing ends the session. Targets respawn, soft panels and the
// barricade regenerate, and the trainee's gadgets and ammo refill so drills can repeat.
import { secs } from '../content/defs';
import { RANGE_TARGETS } from '../content/rangeMap';
import { moveCircle } from './movement';
import { BARREL_HP } from './explosions';
import type { World } from './world';

const RESPAWN = 1.6;
const WALL_RESET = 4;
const GADGET_RESET = 3;

export function stepRange(w: World) {
  if (w.phase === 'prep') {
    w.phase = 'action';
    w.prepConfine = null;
  }
  // practice arming: the console resets a moment after it is armed
  if (w.phase === 'armed' && w.tick - w.armedTick > secs(2.5)) {
    w.phase = 'action';
    w.emit({ type: 'phase', phase: 'action' });
  }
  w.phaseEndTick = w.tick + secs(999);
  const targets = w.actors.filter((a) => a.team !== w.attackTeam);
  targets.forEach((t, i) => {
    const home = RANGE_TARGETS[i % RANGE_TARGETS.length];
    if (!t.alive) {
      if (w.tick - t.diedTick >= secs(RESPAWN)) {
        t.alive = true;
        t.hp = 100;
        t.pos = { x: home.x, y: home.y };
        t.prevPos = { ...t.pos };
        t.diedTick = -1;
      }
      return;
    }
    t.facing = Math.PI / 2;
    if (home.strafe) {
      // side-to-side strafing target: 2.5 tiles each way
      const targetX = home.x + Math.sin(w.tick / 50 + i) * 2.5;
      moveCircle(w, t, t.pos, (targetX - t.pos.x) * 0.25, 0);
      t.vel = { x: (targetX - t.pos.x) * 60 * 0.25, y: 0 };
    }
  });
  for (const [gi, s] of w.soft.entries()) {
    if (s.state === 'breached') {
      const k = `soft${gi}`;
      w.rangeTimers[k] ??= w.tick;
      if (w.tick - w.rangeTimers[k] >= secs(WALL_RESET) && !w.actors.some((a) => a.alive && w.map.softGroups[gi].cells.some((c) => Math.floor(a.pos.x) === c % w.map.w && Math.floor(a.pos.y) === Math.floor(c / w.map.w)))) {
        s.state = 'intact';
        s.hp = 100;
        delete w.rangeTimers[k];
        w.bumpGeometry();
      }
    }
  }
  w.map.doors.forEach((d, di) => {
    if (w.barricades[di]) return;
    const k = `door${di}`;
    w.rangeTimers[k] ??= w.tick;
    const occupied = w.actors.some((a) => a.alive && d.cells.some((c) => Math.abs(a.pos.x - ((c % w.map.w) + 0.5)) < 0.9 && Math.abs(a.pos.y - (Math.floor(c / w.map.w) + 0.5)) < 0.9));
    if (w.tick - w.rangeTimers[k] >= secs(WALL_RESET) && !occupied) {
      w.barricades[di] = { hp: 40, team: w.defendTeam, damaged: false };
      delete w.rangeTimers[k];
      w.bumpGeometry();
    }
  });
  // active wild cards recharge
  const ch = w.cardCharges[w.attackTeam];
  for (const k of ['turret', 'missile'] as const) {
    const held = w.cards[w.attackTeam][k] ?? 0;
    if (!held || ch[k] > 0) continue;
    const key = `card_${k}`;
    w.rangeTimers[key] ??= w.tick;
    if (w.tick - w.rangeTimers[key] >= secs(GADGET_RESET + 2)) {
      ch[k] = held;
      delete w.rangeTimers[key];
    }
  }
  // blown barrels come back after a few seconds
  w.map.barrels.forEach((p, i) => {
    if (w.entities.some((e) => e.kind === 'barrel' && Math.abs(e.pos.x - p.x) < 0.01 && Math.abs(e.pos.y - p.y) < 0.01)) return;
    const k = `barrel${i}`;
    w.rangeTimers[k] ??= w.tick;
    if (w.tick - w.rangeTimers[k] >= secs(WALL_RESET) && !w.actors.some((a) => a.alive && Math.hypot(a.pos.x - p.x, a.pos.y - p.y) < 0.8)) {
      w.entities.push({ kind: 'barrel', id: w.newEntityId(), team: 0, ownerId: -1, pos: { ...p }, hp: BARREL_HP, fuseTick: -1, lastHitBy: -1 });
      w.bumpGeometry();
      delete w.rangeTimers[k];
    }
  });
  for (const a of w.actors) {
    if (a.team !== w.attackTeam || !a.alive) continue;
    a.hp = 100;
    if (a.reserve < a.weapon.magazine) a.reserve = a.weapon.magazine * 3;
    const busy = w.entities.some((e) => e.ownerId === a.id && (e.kind === 'sled' || e.kind === 'hinge' || e.kind === 'charge'));
    const spent = a.gadgetCharges <= 0 || a.breachCharges <= 0;
    const k = `gadget${a.id}`;
    if (spent && !busy) {
      w.rangeTimers[k] ??= w.tick;
      if (w.tick - w.rangeTimers[k] >= secs(GADGET_RESET)) {
        a.gadgetCharges = 1;
        a.breachCharges = 1;
        delete w.rangeTimers[k];
      }
    } else if (busy && a.operatorId === 'hinge') {
      // a placed pivot wall is cleared after a while so it can be placed again
      const h = w.entities.find((e) => e.ownerId === a.id && e.kind === 'hinge');
      w.rangeTimers[k] ??= w.tick;
      if (h && w.tick - w.rangeTimers[k] >= secs(30)) {
        w.entities = w.entities.filter((e) => e !== h);
        w.bumpGeometry();
        delete w.rangeTimers[k];
      }
    } else delete w.rangeTimers[k];
  }
}

