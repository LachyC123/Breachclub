// Contextual squad call-outs and sound captions. Built from events and what the team actually
// perceives — never from hidden enemy state. Lines are short, occasional and in-character.
import type { World } from '../sim/world';
import type { SimEvent, Vec, TeamId } from '../sim/types';
import { roomAt } from '../sim/mapdata';
import { soundField } from '../sim/perception';
import { angleTo } from '../sim/geometry';
import { h } from './dom';

type Kind = 'ally' | 'enemy' | 'system' | 'sound';

const LINES: Record<string, Record<string, string[]>> = {
  ram: {
    spot: ['Eyes on one — {room}!', 'Contact, {room}! Coming through!', 'Somebody in {room}!'],
    breach: ['Made a door.', 'Sorry, wall!', 'New shortcut, {room}.'],
    launch: ['Clear the lane!', 'Sled out!', 'Mind your toes!'],
    cover: ['Shield up — use it!', 'Parked. Get behind it.'],
    kill: ['Sorry! Sorry. Moving on.', 'Down one!'],
    reload: ['Pit stop — reloading!'],
    hurt: ['Ow — that was rude.'],
  },
  hinge: {
    spot: ['Visitor in {room}.', 'Contact — {room}, darling.', 'One in {room}.'],
    place: ['Wall is up. Tasteful.', 'Furniture placed.'],
    rotate: ['Better floor plan.', 'Swinging it shut.', 'Rearranging.'],
    blocked: ['Something is in the swing.', "It won't turn — space taken."],
    kill: ['Out of the floor plan.'],
    reload: ['Reloading, one moment.'],
    hurt: ["I'm hit — hold the room."],
  },
  _default: {
    spot: ['Contact, {room}!', 'Enemy in {room}!', 'Got one in {room}!', 'Movement — {room}!'],
    kill: ['Got one.', 'One down.', "They're down."],
    reload: ['Reloading!', 'Changing mag!'],
    hear: ['Footsteps — {room}.', 'Hearing steps in {room}.', 'Someone moving, {room}.'],
    down: ['{name} is down!', "We lost {name}!"],
    reinforce: ['Reinforcing {room}.', 'Bracing this wall.'],
    barricade: ['Boarding up {room}.', 'Barricade going up.'],
    breachSet: ['Charge set — stand clear!', 'Breaching!'],
    arming: ['Arming the console — cover me!', "On the console!"],
    shutting: ['Shutting it down — cover me!'],
    blocked: ["Can't get through here.", 'Path blocked.'],
    hurt: ["I'm hit!", 'Taking fire!'],
  },
};

const ENEMY_LINES: Record<string, string[]> = {
  spot: ['Contact!', 'There!', 'Got movement!'],
  reload: ['Reloading!'],
  breach: ['Breaching!'],
  arming: ['Arming it!'],
  shutting: ['Shutting it down!'],
};

function compass(a: number): string {
  // screen angle (y down) -> map compass words
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const i = Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[i];
}

export class Callouts {
  private box: HTMLElement;
  private lastBy = new Map<string, number>();
  private lastAny = 0;
  private now = 0;
  enabledSoundCaptions = true;
  private seenHeard = new Set<number>();

  constructor(parent: HTMLElement) {
    this.box = h('div', { class: 'captions' });
    parent.appendChild(this.box);
  }

  clear() {
    this.box.innerHTML = '';
    this.lastBy.clear();
    this.seenHeard.clear();
  }

  private pick(op: string, key: string, vars: Record<string, string>): string | null {
    const pool = LINES[op]?.[key] ?? LINES._default[key];
    if (!pool || !pool.length) return null;
    let s = pool[Math.floor(Math.random() * pool.length)];
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  private ready(key: string, cd: number, globalCd = 1.2): boolean {
    const last = this.lastBy.get(key) ?? -99;
    if (this.now - last < cd || this.now - this.lastAny < globalCd) return false;
    this.lastBy.set(key, this.now);
    this.lastAny = this.now;
    return true;
  }

  show(who: string, text: string, kind: Kind) {
    const el = h('div', { class: `cap ${kind}` }, who ? h('b', {}, who) : null, text);
    this.box.appendChild(el);
    while (this.box.children.length > 4) this.box.firstElementChild?.remove();
    setTimeout(() => (el.style.opacity = '0'), 3600);
    setTimeout(() => el.remove(), 4100);
  }

  /** Called once per simulated tick with that tick's events. */
  onTick(w: World, events: SimEvent[], humanId: number, statuses: Map<number, string>) {
    this.now = w.tick / 60;
    const human = w.actor(humanId);
    const room = (p: Vec) => roomAt(w.map, p)?.name.toLowerCase() ?? 'outside';
    const say = (actorId: number, key: string, vars: Record<string, string> = {}, cd = 5) => {
      const a = w.actor(actorId);
      if (!a || !a.alive || a.controller === 'human') return;
      if (a.team === 0) {
        if (!this.ready(`${a.id}:${key}`, cd)) return;
        const line = this.pick(a.operatorId, key, vars);
        if (line) this.show(a.name, line, 'ally');
      } else this.enemySay(w, a.id, key, humanId);
    };
    for (const e of events) {
      switch (e.type) {
        case 'spotted': {
          const target = w.actor(e.actorId);
          if (!target) break;
          if (e.team === 0) say(e.spotterId, 'spot', { room: room(target.pos) }, 6);
          else say(e.spotterId, 'spot', {}, 6);
          break;
        }
        case 'death': {
          const a = w.actor(e.actorId);
          if (!a) break;
          if (a.team === 0 && a.id !== humanId) {
            const mate = w.actors.find((x) => x.team === 0 && x.alive && x.controller === 'bot');
            if (mate && this.ready(`down${a.id}`, 0, 0)) this.show(mate.name, this.pick('_default', 'down', { name: a.name })!, 'ally');
          }
          const k = w.actor(e.killerId);
          if (k && k.team === 0 && a.team !== 0 && k.controller === 'bot') say(k.id, 'kill', {}, 6);
          break;
        }
        case 'sledLaunched':
          say(e.actorId, 'launch', {}, 3);
          break;
        case 'wallBreached': {
          const a = w.actor(e.by);
          if (a && a.team === 0 && e.cause === 'sled') say(a.id, 'breach', { room: room(w.map.softGroups[e.group].center) }, 2);
          if (a && a.team !== 0) this.enemySay(w, a.id, 'breach', humanId);
          break;
        }
        case 'coverDeployed': {
          const c = w.entities.find((x) => x.id === e.coverId);
          if (c) say(c.ownerId, 'cover', {}, 4);
          break;
        }
        case 'hingePlaced':
          say(e.actorId, 'place', {}, 4);
          break;
        case 'hingeRotateEnd': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg) say(hg.ownerId, 'rotate', {}, 6);
          break;
        }
        case 'hingeBlocked': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.ownerId !== humanId) say(hg.ownerId, 'blocked', {}, 6);
          break;
        }
        case 'reloadStart':
          say(e.actorId, 'reload', {}, 9);
          break;
        case 'interactStart': {
          const a = w.actor(e.actorId);
          if (!a) break;
          const key = e.kind === 'arm' ? 'arming' : e.kind === 'shutoff' ? 'shutting' : e.kind === 'reinforce' ? 'reinforce' : e.kind === 'barricade' ? 'barricade' : e.kind === 'breach' ? 'breachSet' : '';
          if (key) say(a.id, key, { room: room(a.pos) }, 4);
          break;
        }
        case 'armed': {
          const a = w.actor(e.actorId);
          if (!a) break;
          this.show('', a.team === 0 ? 'Transmitter armed — hold the office for 30 seconds!' : 'They armed the transmitter — shut it off!', 'system');
          break;
        }
        case 'damage': {
          const a = w.actor(e.actorId);
          if (a && a.team === 0 && a.hp < 45 && a.hp + e.amount >= 45) say(a.id, 'hurt', {}, 10);
          break;
        }
      }
    }
    // bots report what they hear (their own hearing), with region words only
    for (const hs of w.heard[0]) {
      if (this.seenHeard.has(hs.soundId)) continue;
      this.seenHeard.add(hs.soundId);
      const listener = w.actor(hs.listenerId);
      if (hs.kind === 'step' && listener && listener.controller === 'bot' && listener.alive && !w.actors.some((x) => x.team !== 0 && w.visible[0].has(x.id))) {
        if (this.ready('hear', 9, 2)) {
          const line = this.pick('_default', 'hear', { room: room(hs.estimate) });
          if (line) this.show(listener.name, line, 'ally');
        }
      }
      if (this.enabledSoundCaptions && human && human.alive && hs.listenerId === human.id) {
        const kindWord = hs.kind === 'step' ? 'Footsteps' : hs.kind === 'shot' ? 'Gunfire' : hs.kind === 'breach' ? 'Breach' : hs.kind === 'gadget' ? 'Gadget' : hs.kind === 'reload' ? 'Reload' : hs.kind === 'console' ? 'Console' : 'Voice';
        if (hs.kind !== 'shot' || !w.actors.some((x) => x.team !== 0 && w.visible[0].has(x.id))) {
          if (this.ready(`snd${hs.kind}`, hs.kind === 'step' ? 4 : 3, 0.6)) this.show('', `${kindWord} — ${compass(angleTo(human.pos, hs.estimate))}`, 'sound');
        }
      }
    }
    if (this.seenHeard.size > 800) this.seenHeard = new Set([...this.seenHeard].slice(-400));
    // blocked teammates say so (visible failure)
    for (const [id, st] of statuses) {
      if (st === 'Blocked') say(id, 'blocked', {}, 12);
    }
  }

  /** Enemy chatter is a sound: only shown when it carries to the player's team. */
  private enemySay(w: World, speakerId: number, key: string, humanId: number) {
    const sp = w.actor(speakerId);
    if (!sp || !sp.alive) return;
    const listeners = w.actors.filter((a) => a.team === (0 as TeamId) && a.alive);
    if (!listeners.length) return;
    const field = soundField(w, sp.pos, 6);
    const hears = listeners.some((l) => field[Math.floor(l.pos.y) * w.map.w + Math.floor(l.pos.x)] <= 6);
    if (!hears || !this.ready(`enemy:${key}`, 5, 0.8)) return;
    const pool = ENEMY_LINES[key];
    if (!pool) return;
    const human = w.actor(humanId);
    const dir = human ? ` (${compass(angleTo(human.pos, sp.pos))})` : '';
    const seen = w.visible[0].has(sp.id);
    this.show(seen ? sp.name : `Enemy voice${dir}`, `"${pool[Math.floor(Math.random() * pool.length)]}"`, 'enemy');
  }
}
