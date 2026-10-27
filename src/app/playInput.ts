// Player input -> ActorIntent: CODM-style controls, aim assist, signature-gadget previews
// and commits, and drone driving during preparation. Shared by matches and the range.
import { Controls, type GadgetPreview } from '../ui/controls';
import type { Hud, GadgetUi } from '../ui/hud';
import type { Sfx } from '../audio/sfx';
import type { Settings } from './settings';
import type { PreviewState } from '../render/view';
import type { World } from '../sim/world';
import type { ActorIntent, DroneEntity, GadgetCommand, HingeEntity, SledEntity, Vec } from '../sim/types';
import { previewSledPath, validateHingePlacement, validateRamLaunch, HINGE_REMOTE_RANGE } from '../sim/gadgets';
import { AIMBOT_CONE, MISSILE_RANGE } from '../sim/cards';
import { lvl } from '../content/cards';
import { canSee } from '../sim/perception';
import { angleTo, dist, normAngle, type GeoState } from '../sim/geometry';

export class PlayInput {
  readonly controls: Controls;
  private realTime = 0;
  /** latest committed aim (for the laser and camera when the stick is released) */
  aim: number | null = null;

  constructor(
    private hud: Hud,
    private sfx: Sfx,
    private settings: () => Settings,
    private world: () => World | null,
  ) {
    const c = new Controls(hud.touch, hud.moveStick, hud.aimStick, hud.cancelZone);
    this.controls = c;
    c.bindFireButton(hud.fireBtn);
    c.bindTap(hud.adsBtn, () => c.toggleAds());
    c.bindTap(hud.reloadBtn, () => c.requestReload());
    c.bindGadgetButton(hud.gadgetBtn);
    c.bindHoldButton(hud.interactBtn, (held) => c.setInteract(held));
    c.bindTap(hud.tagBtn, () => c.requestTag());
    c.bindTap(hud.slideBtn, () => c.requestSlide());
    c.bindTap(hud.turretBtn, () => c.requestTurret());
    c.bindGadgetButton(hud.missileBtn, 'missile');
    c.missileAllowed = () => {
      const w = this.world();
      const a = this.human();
      const ok = !!w && !!a && a.alive && (w.phase === 'action' || w.phase === 'armed') && w.cardCharges[a.team].missile > 0;
      if (!ok) this.sfx.play('invalid');
      return ok;
    };
    c.missileCommitAction = (p) => {
      const t = this.missileTarget(p);
      return t ? { type: 'missile', x: t.x, y: t.y } : null;
    };
    c.gadgetPreviewAllowed = () => this.previewAllowed();
    c.gadgetTapAction = () => this.tap();
    c.gadgetCommitAction = (p) => this.commit(p);
  }

  dispose() {
    this.controls.reset();
    this.controls.dispose();
  }

  private human() {
    return this.world()?.human();
  }

  tick(dt: number) {
    this.realTime += dt;
  }

  // ---------- gadgets ----------

  private previewAllowed(): boolean {
    const w = this.world();
    const a = this.human();
    if (!w || !a || !a.alive) return false;
    if (w.phase === 'prep' && a.side === 'attack' && w.cfg.mode !== 'range') return false;
    if (a.operatorId === 'ram') {
      if (w.entities.some((e) => e.kind === 'sled' && e.ownerId === a.id)) return false;
      const v = validateRamLaunch(w, a);
      if (!v.ok) {
        this.hud.toast(v.reason);
        this.sfx.play('invalid');
      }
      return v.ok;
    }
    if (a.operatorId === 'hinge') return a.gadgetCharges > 0 && !w.entities.some((e) => e.kind === 'hinge' && e.ownerId === a.id);
    return false;
  }

  private tap(): GadgetCommand | null {
    const w = this.world();
    const a = this.human();
    if (!w || !a || !a.alive) return null;
    if (a.operatorId === 'ram') {
      if (w.entities.some((e) => e.kind === 'sled' && e.ownerId === a.id)) return { type: 'ramDeploy' };
      return null;
    }
    if (a.operatorId === 'hinge') {
      const hg = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
      if (hg) {
        if (dist(a.pos, hg.center) > HINGE_REMOTE_RANGE) {
          this.hud.toast('Too far from your wall (6 tiles)');
          this.sfx.play('invalid');
          return null;
        }
        return { type: 'hingeRotate' };
      }
    }
    return null;
  }

  private hingeTarget(p: GadgetPreview): { pos: Vec; vertical: boolean } | null {
    const a = this.human();
    if (!a) return null;
    let off: Vec;
    if (p.worldTarget && !this.controls.usingTouch) off = { x: p.worldTarget.x - a.pos.x, y: p.worldTarget.y - a.pos.y };
    else off = { x: (p.dir.x / 110) * 3, y: (p.dir.y / 110) * 3 };
    const len = Math.hypot(off.x, off.y);
    if (len < 0.3) off = { x: Math.cos(a.facing) * 1.6, y: Math.sin(a.facing) * 1.6 };
    else if (len > 3) off = { x: (off.x / len) * 3, y: (off.y / len) * 3 };
    // snap to half tiles so the wall lines up with the floor grid
    const pos = { x: Math.round((a.pos.x + off.x) * 2) / 2, y: Math.round((a.pos.y + off.y) * 2) / 2 };
    const vertical = Math.abs(off.x) > Math.abs(off.y);
    return { pos, vertical };
  }

  private ramAngle(p: GadgetPreview): number {
    const a = this.human()!;
    if (Math.hypot(p.dir.x, p.dir.y) < 16) return a.facing;
    return Math.atan2(p.dir.y, p.dir.x);
  }

  private commit(p: GadgetPreview): GadgetCommand | null {
    const w = this.world();
    const a = this.human();
    if (!w || !a || !a.alive) return null;
    if (a.operatorId === 'ram') return { type: 'ramLaunch', angle: this.ramAngle(p) };
    if (a.operatorId === 'hinge') {
      const t = this.hingeTarget(p);
      if (!t) return null;
      const v = validateHingePlacement(w, a, t.pos, t.vertical);
      if (!v.ok) {
        this.hud.toast(v.reason);
        this.sfx.play('invalid');
        return null;
      }
      return { type: 'hingePlace', x: t.pos.x, y: t.pos.y, vertical: t.vertical };
    }
    return null;
  }

  /** Geometry as the player's team knows it (previews must not reveal hidden changes). */
  private knownGeo(w: World): GeoState {
    return {
      map: w.map,
      soft: w.soft.map((s, i) => ({ ...s, state: w.knownSoft[0][i] })),
      barricades: w.barricades.map((b, i) => (b && b.team === 0 ? b : w.knownBarricade[0][i] ? b ?? { hp: 40, team: 1, damaged: false } : null)),
      entities: w.entities.filter((e) => e.team === 0 || w.visibleEntities[0].has(e.id)),
      prepConfine: null,
    };
  }

  /** Missile aim: drag distance maps to range (or the mouse point), clamped to the strike range. */
  private missileTarget(p: GadgetPreview): Vec | null {
    const a = this.human();
    if (!a) return null;
    let off: Vec;
    if (p.worldTarget && !this.controls.usingTouch) off = { x: p.worldTarget.x - a.pos.x, y: p.worldTarget.y - a.pos.y };
    else off = { x: (p.dir.x / 100) * 8, y: (p.dir.y / 100) * 8 };
    const len = Math.hypot(off.x, off.y);
    if (len < 0.5) off = { x: Math.cos(a.facing) * 6, y: Math.sin(a.facing) * 6 };
    else if (len > MISSILE_RANGE) off = { x: (off.x / len) * MISSILE_RANGE, y: (off.y / len) * MISSILE_RANGE };
    return { x: a.pos.x + off.x, y: a.pos.y + off.y };
  }

  preview(): PreviewState {
    const c = this.controls;
    const w = this.world();
    const a = this.human();
    if (!w || !a || !a.alive || !c.gadget.active) return { kind: 'none' };
    if (c.previewKind === 'missile') {
      const t = this.missileTarget(c.gadget);
      return t ? { kind: 'missile', missilePos: t } : { kind: 'none' };
    }
    if (a.operatorId === 'ram') {
      const ang = this.ramAngle(c.gadget);
      const pv = previewSledPath(this.knownGeo(w), a.pos, ang);
      const breach = pv.breachGroup >= 0 ? w.map.softGroups[pv.breachGroup].center : pv.breachDoor >= 0 ? w.map.doors[pv.breachDoor].center : null;
      return { kind: 'sled', sledPoints: pv.points, sledBreach: breach, sledStop: pv.stop, sledHard: pv.hard };
    }
    if (a.operatorId === 'hinge') {
      const t = this.hingeTarget(c.gadget);
      if (!t) return { kind: 'none' };
      const v = validateHingePlacement(w, a, t.pos, t.vertical);
      if (!v.ok && this.realTime % 0.5 < 0.02) this.hud.toast(v.reason);
      return { kind: 'hinge', hingePos: t.pos, hingeVertical: t.vertical, hingeValid: v.ok };
    }
    return { kind: 'none' };
  }

  gadgetUi(): GadgetUi | null {
    const w = this.world();
    const a = this.human();
    if (!w || !a) return null;
    if (a.operatorId === 'ram') {
      const sled = w.entities.find((e): e is SledEntity => e.kind === 'sled' && e.ownerId === a.id);
      if (sled) return { icon: 'brake', label: 'Brake', pips: 0, pipsMax: 1, enabled: true, cooldown: 0 };
      const v = validateRamLaunch(w, a);
      return { icon: 'sled', label: a.gadgetCharges > 0 ? 'Sled' : 'Used', pips: a.gadgetCharges, pipsMax: 1, enabled: v.ok, cooldown: 0 };
    }
    if (a.operatorId === 'hinge') {
      const hg = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
      if (hg) {
        const cd = hg.state !== 'idle' ? 1 : Math.max(0, (hg.cooldownUntil - w.tick) / (4 * 60));
        return { icon: 'rotate', label: 'Swing', pips: 1, pipsMax: 1, enabled: hg.state === 'idle' && cd === 0 && dist(a.pos, hg.center) <= HINGE_REMOTE_RANGE, cooldown: cd };
      }
      return { icon: 'hinge', label: a.gadgetCharges > 0 ? 'Pivot wall' : 'Gone', pips: a.gadgetCharges, pipsMax: 1, enabled: a.gadgetCharges > 0, cooldown: 0 };
    }
    return null;
  }

  // ---------- intents ----------

  /** Gentle pull toward a visible enemy near the aim line (touch only; never through cover or fog). */
  private aimAssist(w: World, intent: ActorIntent) {
    const a = w.human();
    const mode = this.settings().aimAssist;
    if (!a || intent.aim === null) return;
    // Aimbot card: a hard snap onto enemies you can see, on any input
    const bot = lvl(w.cards[a.team], 'aimbot');
    if (!bot && (mode === 'off' || !this.controls.usingTouch)) return;
    const deg = bot ? AIMBOT_CONE[bot] : (mode === 'low' ? 6 : 10) + (intent.ads ? 4 : 0);
    const cone = (deg * Math.PI) / 180;
    let best: { d: number; ang: number } | null = null;
    for (const e of w.actors) {
      if (e.team === 0 || !e.alive || !w.visible[0].has(e.id)) continue;
      const d = dist(a.pos, e.pos);
      if (d > a.weapon.effective_range_tiles * 1.5) continue;
      if (!canSee(w, a.pos, e.pos)) continue;
      const ang = angleTo(a.pos, e.pos);
      const diff = normAngle(ang - intent.aim);
      if (Math.abs(diff) > cone) continue;
      if (!best || Math.abs(diff) < Math.abs(best.ang)) best = { d, ang: diff };
    }
    // stronger when firing (sticky), lighter while just steering
    if (best) intent.aim = intent.aim + best.ang * (bot ? 0.9 : intent.fire ? 0.6 : 0.3);
  }

  /** Intent for this tick. `droneMode` routes the move stick to the player's drone. */
  produce(w: World, droneMode: boolean): ActorIntent {
    const it = this.controls.produce();
    const tag = this.controls.takeTag();
    if (droneMode) {
      it.drone = { move: it.move, tag };
      it.move = { x: 0, y: 0 };
      it.fire = false;
      it.ads = false;
      it.aim = null;
      it.gadget = null;
      it.interact = false;
      return it;
    }
    this.aimAssist(w, it);
    if (it.aim !== null) this.aim = it.aim;
    return it;
  }

  /** Live drones on the player's team in a stable order (own first). */
  teamDrones(w: World): DroneEntity[] {
    const h = w.human();
    return w.entities
      .filter((e): e is DroneEntity => e.kind === 'drone' && e.team === 0)
      .sort((a, b) => (a.ownerId === h?.id ? -1 : 0) - (b.ownerId === h?.id ? -1 : 0) || a.ownerId - b.ownerId);
  }
}
