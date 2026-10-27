// Arcade scoring: every action is worth points, chained actions build a combo multiplier,
// kills in quick succession become multi-kills, and the round ends with medals and a rank.
// Renderer-free (reads simulation events only) so it is testable headless. Same rules for bots.
import { secs } from '../content/defs';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/types';

export interface Award {
  actorId: number;
  label: string;
  points: number;
  /** combo count after this award (1 = no chain) */
  combo: number;
}

export interface Announce {
  actorId: number;
  text: string;
  sub: string;
  /** 1 small, 2 big, 3 huge */
  tier: 1 | 2 | 3;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
}

const COMBO_WINDOW = 5;
const MULTI_WINDOW = 4;
const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL'];

interface ActorScore {
  points: number;
  combo: number;
  comboTick: number;
  multi: number;
  multiTick: number;
  kills: number;
  breaches: number;
  tags: number;
  fortify: number;
  objective: number;
  shots: number;
  hitShots: number;
}

export class ScoreTracker {
  private s = new Map<number, ActorScore>();
  private firstBlood = false;
  /** last killer of each actor this round (for trades) */
  private killedBy = new Map<number, { killer: number; tick: number }>();
  /** who has damaged each actor since they last died (the sim clears its own list on death) */
  private hurtBy = new Map<number, Set<number>>();
  /** kills without dying, carried across rounds by the match runner */
  streak = new Map<number, number>();
  awards: Award[] = [];
  announces: Announce[] = [];

  /** Reset per-round state (streaks persist across the match). */
  newRound() {
    this.s.clear();
    this.firstBlood = false;
    this.killedBy.clear();
    this.hurtBy.clear();
  }

  private st(id: number): ActorScore {
    let v = this.s.get(id);
    if (!v) {
      v = { points: 0, combo: 0, comboTick: -9999, multi: 0, multiTick: -9999, kills: 0, breaches: 0, tags: 0, fortify: 0, objective: 0, shots: 0, hitShots: 0 };
      this.s.set(id, v);
    }
    return v;
  }

  points(id: number): number {
    return this.s.get(id)?.points ?? 0;
  }

  pointsMap(): Map<number, number> {
    return new Map([...this.s].map(([k, v]) => [k, v.points]));
  }

  private give(w: World, id: number, label: string, base: number) {
    const a = this.st(id);
    // chained actions within the window build a multiplier: x1, x1.25, x1.5 ... up to x2
    a.combo = w.tick - a.comboTick <= secs(COMBO_WINDOW) ? a.combo + 1 : 1;
    a.comboTick = w.tick;
    const mult = Math.min(2, 1 + (a.combo - 1) * 0.25);
    const pts = Math.round(base * mult);
    a.points += pts;
    this.awards.push({ actorId: id, label, points: pts, combo: a.combo });
  }

  private announce(actorId: number, text: string, sub: string, tier: 1 | 2 | 3) {
    this.announces.push({ actorId, text, sub, tier });
  }

  /** Consume one tick of events; read `awards` / `announces` afterwards (they are cleared here first). */
  handle(w: World, events: SimEvent[]) {
    this.awards = [];
    this.announces = [];
    const shotBy = new Set<number>();
    const hitBy = new Set<number>();
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          const set = this.hurtBy.get(e.actorId) ?? new Set<number>();
          set.add(e.sourceId);
          this.hurtBy.set(e.actorId, set);
          break;
        }
        case 'shot':
          shotBy.add(e.actorId);
          if (e.hitActor !== null) hitBy.add(e.actorId);
          break;
        case 'death': {
          const victim = w.actor(e.actorId);
          const killer = w.actor(e.killerId);
          if (!victim) break;
          this.streak.set(victim.id, 0);
          this.killedBy.set(victim.id, { killer: e.killerId, tick: w.tick });
          if (!killer || killer.team === victim.team) break;
          const k = this.st(killer.id);
          k.kills++;
          this.give(w, killer.id, `ELIMINATED ${victim.name}`, 100);
          if (!this.firstBlood) {
            this.firstBlood = true;
            this.give(w, killer.id, 'FIRST BLOOD', 50);
            this.announce(killer.id, 'FIRST BLOOD', killer.name, 2);
          }
          // trade: avenge a teammate within 6 s
          for (const [mate, kb] of this.killedBy)
            if (kb.killer === victim.id && w.tick - kb.tick <= secs(6) && w.actor(mate)?.team === killer.team) {
              this.give(w, killer.id, 'TRADE', 25);
              this.killedBy.delete(mate);
              break;
            }
          k.multi = w.tick - k.multiTick <= secs(MULTI_WINDOW) ? k.multi + 1 : 1;
          k.multiTick = w.tick;
          if (k.multi >= 2) {
            this.give(w, killer.id, MULTI[Math.min(3, k.multi)], 50 * (k.multi - 1));
            this.announce(killer.id, MULTI[Math.min(3, k.multi)], killer.name, k.multi >= 3 ? 3 : 2);
          }
          const enemies = w.actors.filter((x) => x.team === victim.team);
          if (k.kills === enemies.length && enemies.length >= 3) {
            this.give(w, killer.id, 'ACE', 150);
            this.announce(killer.id, 'ACE', `${killer.name} wiped the squad`, 3);
          }
          const streak = (this.streak.get(killer.id) ?? 0) + 1;
          this.streak.set(killer.id, streak);
          if (streak === 3) this.announce(killer.id, 'ON A ROLL', `${killer.name} · 3 in a row`, 1);
          if (streak === 5) this.announce(killer.id, 'UNSTOPPABLE', `${killer.name} · 5 in a row`, 2);
          // assists for everyone else who damaged the victim
          for (const id of this.hurtBy.get(victim.id) ?? []) if (id !== killer.id && w.actor(id)?.team === killer.team) this.give(w, id, 'ASSIST', 50);
          this.hurtBy.delete(victim.id);
          break;
        }
        case 'armed':
          this.st(e.actorId).objective++;
          this.give(w, e.actorId, 'TRANSMITTER ARMED', 150);
          break;
        case 'shutoff':
          this.st(e.actorId).objective++;
          this.give(w, e.actorId, 'BROADCAST SHUT OFF', 150);
          this.announce(e.actorId, 'DEFUSED', w.actor(e.actorId)?.name ?? '', 2);
          break;
        case 'wallBreached':
          if (w.actor(e.by)) {
            this.st(e.by).breaches++;
            this.give(w, e.by, 'BREACH', 50);
          }
          break;
        case 'barricadeBroken':
          if (w.actor(e.by)) this.give(w, e.by, 'BARRICADE DOWN', 15);
          break;
        case 'tagged':
          this.st(e.byId).tags++;
          this.give(w, e.byId, 'DRONE TAG', 10);
          break;
        case 'droneDestroyed':
          if (w.actor(e.by)) this.give(w, e.by, 'DRONE DESTROYED', 25);
          break;
        case 'interactDone':
          if (e.kind === 'reinforce' || e.kind === 'barricade') {
            this.st(e.actorId).fortify++;
            this.give(w, e.actorId, e.kind === 'reinforce' ? 'REINFORCED' : 'BARRICADED', 10);
          }
          break;
        case 'sledHitActor': {
          const sled = w.entities.find((x) => x.id === e.sledId);
          if (sled) this.give(w, sled.ownerId, 'SLED HIT', 25);
          break;
        }
        case 'roundEnded': {
          // clutch: the last one standing on the winning side after losing teammates
          const alive = w.actors.filter((x) => x.team === e.winner && x.alive);
          const lost = w.actors.filter((x) => x.team === e.winner && !x.alive).length;
          if (alive.length === 1 && lost >= 2) {
            this.give(w, alive[0].id, 'CLUTCH', 200);
            this.announce(alive[0].id, 'CLUTCH', alive[0].name, 3);
          }
          for (const a of w.actors.filter((x) => x.team === e.winner)) this.give(w, a.id, 'ROUND WIN', 50);
          break;
        }
      }
    }
    for (const id of shotBy) this.st(id).shots++;
    for (const id of hitBy) this.st(id).hitShots++;
  }

  /** Letter grade for a round's points. */
  static rank(points: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    return points >= 650 ? 'S' : points >= 420 ? 'A' : points >= 260 ? 'B' : points >= 120 ? 'C' : 'D';
  }

  medals(w: World, id: number, mvpId: number): Medal[] {
    const a = this.st(id);
    const actor = w.actor(id);
    const out: Medal[] = [];
    if (id === mvpId) out.push({ id: 'mvp', name: 'MVP', desc: 'Top score this round' });
    if (a.kills >= 2) out.push({ id: 'hunter', name: 'HUNTER', desc: `${a.kills} eliminations` });
    if (a.shots >= 8 && a.hitShots / a.shots >= 0.5) out.push({ id: 'sharp', name: 'SHARPSHOOTER', desc: `${Math.round((a.hitShots / a.shots) * 100)}% of shots hit` });
    if (a.breaches >= 1) out.push({ id: 'wrecker', name: 'WRECKER', desc: 'Opened a wall' });
    if (a.tags >= 2) out.push({ id: 'eagle', name: 'EAGLE EYE', desc: `${a.tags} drone tags` });
    if (a.fortify >= 2) out.push({ id: 'bulwark', name: 'BULWARK', desc: `${a.fortify} fortifications` });
    if (a.objective >= 1) out.push({ id: 'objective', name: 'OBJECTIVE', desc: 'Played the console' });
    if (actor?.alive && w.result) out.push({ id: 'survivor', name: 'SURVIVOR', desc: 'Still standing' });
    return out;
  }
}
