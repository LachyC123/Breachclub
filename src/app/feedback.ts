// Simulation events -> audio, HUD toasts, kill feed and round stats. Only what the player's
// team could perceive is voiced: enemy sounds play when heard, enemy effects when seen.
import type { World } from '../sim/world';
import type { SimEvent, Vec } from '../sim/types';
import type { Sfx, SfxName } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import type { WorldView } from '../render/view';
import { canSee } from '../sim/perception';
import { angleTo, dist } from '../sim/geometry';
import { roomAt } from '../sim/mapdata';
import { T } from '../render/art/env';

const WEAPON_SHORT: Record<string, string> = { smg: 'SMG', carbine: 'CARBINE', scattergun: 'SCATTER' };

export interface RoundStats {
  sledBreach: string;
  humanKills: number;
  humanArmed: boolean;
  humanShutoff: number;
  hingeTurns: number;
  takeovers: number;
  tags: number;
}

export const freshStats = (): RoundStats => ({ sledBreach: '', humanKills: 0, humanArmed: false, humanShutoff: -1, hingeTurns: 0, takeovers: 0, tags: 0 });

export class Feedback {
  stats = freshStats();
  private lowTimeSec = -1;
  /** hint flags raised by player actions */
  done = new Set<string>();
  onHumanDeath: (killerId: number) => void = () => {};
  onDroneLost: () => void = () => {};
  /** the player's own kills (hit-stop) */
  onHumanKill: () => void = () => {};

  constructor(
    private sfx: Sfx,
    private hud: Hud,
    private view: WorldView,
    private zoom: () => number,
  ) {}

  reset() {
    this.stats = freshStats();
    this.lowTimeSec = -1;
  }

  private listener(w: World): Vec {
    const h = w.human();
    return h ? h.pos : w.map.console.center;
  }

  private playAt(w: World, name: SfxName, pos: Vec, radius: number, muffled = false, volume = 1) {
    const l = this.listener(w);
    const d = dist(l, pos);
    const vol = Math.max(0.12, 1 - d / (radius * 1.3)) * volume;
    const viewW = window.innerWidth / (this.zoom() * T);
    const pan = Math.max(-1, Math.min(1, (pos.x - l.x) / (viewW * 0.6)));
    this.sfx.play(name, { pan, volume: vol, muffled });
  }

  private pointSeen(w: World, p: Vec): boolean {
    return w.actors.some((a) => a.team === 0 && a.alive && canSee(w, a.pos, p));
  }

  handle(w: World, events: SimEvent[]) {
    const human = w.human();
    const heardIds = new Set(w.heard[0].filter((hs) => hs.tick === w.tick).map((hs) => hs.soundId));
    const gadgetName = new Map<number, SfxName>();
    for (const e of events) {
      if (e.type === 'sledLaunched') gadgetName.set(e.actorId, 'sled_motor');
      if (e.type === 'hingeWarning' || e.type === 'hingeRotateStart') {
        const hg = w.entities.find((x) => x.id === e.hingeId);
        if (hg) gadgetName.set(hg.ownerId, e.type === 'hingeWarning' ? 'hinge_ratchet' : 'hinge_swing');
      }
      if (e.type === 'hingePlaced') gadgetName.set(e.actorId, 'hinge_place');
      if (e.type === 'coverDeployed') {
        const c = w.entities.find((x) => x.id === e.coverId);
        if (c) gadgetName.set(c.ownerId, 'cover_unfold');
      }
      if (e.type === 'reinforced') {
        const a = w.actors.find((x) => x.team === e.team && x.interaction === null);
        if (a) gadgetName.set(a.id, 'reinforce');
      }
      if (e.type === 'barricadePlaced') for (const a of w.actors) if (a.team === e.team) gadgetName.set(a.id, 'barricade_place');
      if (e.type === 'chargePlanted') gadgetName.set(e.actorId, 'charge_beep');
    }
    // positional sounds: own team always, enemy only when the team actually heard it
    for (const s of w.sounds) {
      const own = s.team === 0;
      const src = w.actor(s.sourceId);
      const seen = src && (own || w.visible[0].has(src.id));
      if (!own && !heardIds.has(s.id) && !seen) continue;
      const muffled = !own && !seen && !!human && !canSee(w, human.pos, s.pos);
      let name: SfxName | null = null;
      switch (s.kind) {
        case 'shot':
          name = src ? (`shot_${src.weapon.id}` as SfxName) : 'shot_smg';
          break;
        case 'step': {
          const room = roomAt(w.map, s.pos);
          name = !room ? 'step_concrete' : !room.interior ? 'step_outdoor' : room.floor === 'wood' ? 'step_wood' : room.floor === 'concrete' ? 'step_concrete' : 'step_tile';
          break;
        }
        case 'reload':
          name = 'reload_start';
          break;
        case 'breach':
          name = 'breach_boom';
          this.sfx.duck(0.7, 1.2);
          break;
        case 'console':
          name = 'console_tick';
          break;
        case 'gadget':
          name = gadgetName.get(s.sourceId) ?? (w.phase === 'prep' ? 'drone_move' : 'sled_motor');
          break;
        default:
          name = null;
      }
      if (name) this.playAt(w, name, s.pos, s.radius, muffled, s.kind === 'step' && src?.id === human?.id ? 0.55 : 1);
      // sound arc around the player for heard (unseen) enemy sounds: direction only
      if (!own && !seen && human && human.alive) {
        const hs = w.heard[0].find((x) => x.soundId === s.id);
        if (hs) this.view.pushSoundArc(angleTo(human.pos, hs.estimate), Math.min(0.9, 0.25 + hs.uncertainty * 0.12), s.kind);
      }
    }
    for (const e of events) {
      switch (e.type) {
        case 'dryFire':
          if (e.actorId === human?.id) this.sfx.play('dry_fire');
          break;
        case 'reloadEnd':
          if (e.actorId === human?.id) this.sfx.play('reload_end', { volume: 0.8 });
          break;
        case 'damage': {
          const a = w.actor(e.actorId);
          if (!a) break;
          if (a.team === 0 || w.visible[0].has(a.id)) this.playAt(w, 'hit_flesh', a.pos, 10, false, a.id === human?.id ? 1 : 0.7);
          if (e.sourceId === human?.id && a.team !== 0 && e.hpAfter > 0) this.sfx.play('hitmarker', { volume: 0.8 });
          if (a.id === human?.id) {
            this.hud.hurt(e.amount);
            const src = w.actor(e.sourceId);
            // direction only toward a source the team can see, else a vague flash from behind
            if (src && w.visible[0].has(src.id)) this.hud.damageFrom(angleTo(a.pos, src.pos));
            else this.hud.damageFrom(a.facing + Math.PI);
          }
          break;
        }
        case 'surfaceHit': {
          if (!human || dist(human.pos, e.pos) > 10) break;
          const name: SfxName = e.material === 'soft' ? (e.reinforced ? 'hit_metal' : 'hit_soft') : e.material === 'barricade' ? 'hit_wood' : e.material === 'gadget' ? 'hit_metal' : 'hit_wall';
          if (canSee(w, human.pos, e.pos)) this.playAt(w, name, e.pos, 10, false, 0.5);
          break;
        }
        case 'death': {
          const a = w.actor(e.actorId);
          const k = w.actor(e.killerId);
          if (a && (a.team === 0 || w.visible[0].has(a.id))) this.playAt(w, 'death', a.pos, 12);
          if (a) this.hud.killfeed(k ? k.name : 'BREACH', k ? k.team : -1, a.name, a.team, k ? WEAPON_SHORT[k.weapon.id] ?? '' : '', k?.id === human?.id || a.id === human?.id);
          if (k && k.id === human?.id && a && a.team !== 0) {
            this.stats.humanKills++;
            this.sfx.play('kill_confirm');
            this.onHumanKill();
            this.hud.killPop(a.name, 100);
          }
          if (a && a.id === human?.id) this.onHumanDeath(e.killerId);
          break;
        }
        case 'gadgetInvalid':
          if (e.actorId === human?.id) {
            this.hud.toast(e.reason);
            this.sfx.play('invalid');
          }
          break;
        case 'hingeBlocked': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.ownerId === human?.id) {
            this.hud.toast(`${e.reason} — no cooldown used`);
            this.sfx.play('hinge_blocked');
          }
          break;
        }
        case 'hingeRotateEnd': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.team === 0) this.stats.hingeTurns++;
          break;
        }
        case 'sledStopped':
          if (human && dist(human.pos, e.pos) < 12) this.playAt(w, 'sled_thud', e.pos, 10);
          break;
        case 'sledDestroyed':
        case 'coverDestroyed':
          if (human && canSee(w, human.pos, e.pos)) this.playAt(w, 'cover_break', e.pos, 10);
          break;
        case 'barricadeBroken':
          if (human && dist(human.pos, w.map.doors[e.door].center) < 12) this.playAt(w, 'barricade_break', w.map.doors[e.door].center, 12);
          break;
        case 'wallBreached': {
          const a = w.actor(e.by);
          if (a && a.id === human?.id && e.cause === 'sled') this.stats.sledBreach = roomAt(w.map, w.map.softGroups[e.group].center)?.name ?? 'a room';
          break;
        }
        case 'slide': {
          const sl = w.actor(e.actorId);
          if (sl && (sl.team === 0 || w.visible[0].has(sl.id))) this.playAt(w, 'slide', sl.pos, 8, false, sl.id === human?.id ? 1 : 0.7);
          break;
        }
        case 'vault':
          if (e.actorId === human?.id) this.sfx.play('vault');
          break;
        case 'armed':
          this.sfx.play('armed_alarm');
          this.sfx.setMusic('tense');
          if (e.actorId === human?.id) this.stats.humanArmed = true;
          if (w.cfg.mode !== 'range') this.hud.banner(w.sideOf(0) === 'attack' ? 'TRANSMITTER ARMED' : 'CONSOLE ARMED', w.sideOf(0) === 'attack' ? 'Hold the office until the broadcast completes' : 'Shut it off before the broadcast ends', 2000, 'armed');
          else this.hud.toast('Console armed — it resets in a moment', true);
          break;
        case 'shutoff':
          this.sfx.play('shutoff');
          if (e.actorId === human?.id) this.stats.humanShutoff = Math.ceil(w.secondsLeft());
          break;
        case 'phase':
          if (e.phase === 'action' && w.cfg.mode !== 'range') {
            this.sfx.play('action_start');
            this.sfx.setMusic('tense');
            this.hud.banner('ACTION PHASE', w.sideOf(0) === 'attack' ? 'Breach and arm the console' : 'Hold the office', 1500);
          }
          break;
        case 'sledLaunched':
          if (e.actorId === human?.id) this.done.add('sled');
          break;
        case 'coverDeployed': {
          const c = w.entities.find((x) => x.id === e.coverId);
          if (c && c.ownerId === human?.id) this.done.add('brake');
          break;
        }
        case 'sledHitActor':
          this.playAt(w, 'sled_thud', w.actor(e.actorId)?.pos ?? this.listener(w), 10);
          break;
        case 'interactDone':
          if (e.actorId === human?.id && e.kind === 'reinforce') this.done.add('reinforce');
          if (e.actorId === human?.id && (e.kind === 'reinforce' || e.kind === 'barricade')) this.hud.toast(e.kind === 'reinforce' ? 'Wall reinforced' : 'Barricade placed', true);
          break;
        case 'hingePlaced':
          if (e.actorId === human?.id) this.done.add('place');
          break;
        case 'hingeRotateStart': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.ownerId === human?.id) this.done.add('rotate');
          break;
        }
        case 'droneDestroyed': {
          const ownDrone = w.actor(e.ownerId)?.team === 0;
          if (ownDrone || this.pointSeen(w, e.pos)) this.playAt(w, 'cover_break', e.pos, 10, false, 0.7);
          if (ownDrone && e.ownerId === human?.id) {
            this.hud.toast(w.entities.some((x) => x.kind === 'drone' && x.ownerId === e.ownerId) ? 'DRONE DESTROYED — switching to your spare' : 'DRONE DESTROYED');
            this.onDroneLost();
          } else if (!ownDrone && e.by === human?.id) this.hud.toast('Enemy drone destroyed', true);
          break;
        }
        case 'tagged': {
          if (e.team === 0) {
            if (e.byId === human?.id) {
              this.stats.tags++;
              this.done.add('tag');
            }
            this.sfx.play('drone_tag');
          } else if (e.actorId === human?.id) this.hud.toast("You've been spotted by a drone");
          break;
        }
        case 'objectiveFound':
          if (e.team === 0) {
            this.hud.banner('OBJECTIVE LOCATED', 'Transmitter console · office', 1600, 'small');
            this.sfx.play('ui_confirm');
          }
          break;
        case 'interactCancel':
          if (e.actorId === human?.id && e.reason !== 'Released') this.hud.toast(`Interrupted — ${e.reason.toLowerCase()}`);
          break;
      }
    }
    // low-time ticks in the last 10 seconds of a running clock
    if (w.cfg.mode !== 'range' && (w.phase === 'action' || w.phase === 'armed') && w.secondsLeft() <= 10) {
      const s = Math.ceil(w.secondsLeft());
      if (s !== this.lowTimeSec) {
        this.lowTimeSec = s;
        this.sfx.play('low_time', { volume: 0.6 });
      }
    }
  }

  highlight(w: World): string {
    const s = this.stats;
    if (s.humanShutoff >= 0) return `You shut off the broadcast with ${s.humanShutoff}s left.`;
    if (s.sledBreach) return `Your sled opened a new route into the ${s.sledBreach.toLowerCase()}.`;
    if (s.humanArmed) return 'You armed the transmitter yourself.';
    if (s.humanKills >= 2) return `You eliminated ${s.humanKills} opponents.`;
    if (s.hingeTurns > 0 && w.sideOf(0) === 'defence') return `Your squad swung the pivot wall ${s.hingeTurns} time${s.hingeTurns > 1 ? 's' : ''}.`;
    if (s.tags >= 2) return `Your drone tagged ${s.tags} defenders in prep.`;
    if (s.takeovers > 0) return `You took over a teammate ${s.takeovers > 1 ? `${s.takeovers} times` : 'and kept fighting'}.`;
    if (s.humanKills === 1) return 'You eliminated one opponent.';
    return '';
  }
}
