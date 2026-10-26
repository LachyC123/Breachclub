// App controller: screen flow, fixed-step driving, input -> intents, events -> audio/fx/captions,
// death takeover, pause and clean restart. Simulation stays independent of all of this.
import Phaser from 'phaser';
import { Match, FixedStepper, type MatchConfig } from './session';
import { World } from '../sim/world';
import { AIDirector } from '../ai/brain';
import { WorldView, generateTextures, type PreviewState } from '../render/view';
import { T } from '../render/art/env';
import { Hud, type GadgetUi } from '../ui/hud';
import { Controls, type GadgetPreview } from '../ui/controls';
import { Callouts } from '../ui/callouts';
import { h, iconImg } from '../ui/dom';
import * as S from '../ui/screens';
import { Sfx, type SfxName } from '../audio/sfx';
import { loadSettings, saveSettings, type Settings } from './settings';
import { bestInteract } from '../sim/interact';
import { previewSledPath, validateHingePlacement, validateRamLaunch, HINGE_REMOTE_RANGE } from '../sim/gadgets';
import { canSee } from '../sim/perception';
import { angleTo, dist, normAngle, type GeoState } from '../sim/geometry';
import { roomAt } from '../sim/mapdata';
import { REASON_TEXT } from '../sim/rules';
import type { ActorIntent, GadgetCommand, SimEvent, Vec, HingeEntity, SledEntity, PuckEntity } from '../sim/types';
import type { Order } from '../ai/brain';

type State = 'menu' | 'playing' | 'paused' | 'takeover' | 'result' | 'spectate';

interface HintStep {
  id: string;
  text: string;
  when: (w: World) => boolean;
}

class GameScene extends Phaser.Scene {
  app!: App;
  constructor() {
    super('game');
  }
  create() {
    this.app.onSceneReady(this);
  }
  update(_t: number, delta: number) {
    this.app.frame(delta);
  }
}

export class App {
  readonly game: Phaser.Game;
  private scene!: Phaser.Scene;
  private view!: WorldView;
  private ui: HTMLElement;
  private screen: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private hud: Hud | null = null;
  private controls: Controls | null = null;
  private callouts: Callouts | null = null;
  private sfx = new Sfx();
  settings: Settings = loadSettings();
  match: Match | null = null;
  private attract: { world: World; ai: AIDirector } | null = null;
  private stepper = new FixedStepper();
  state: State = 'menu';
  private lastCfg: MatchConfig | null = null;
  private takeoverAt = -1;
  private takeoverAuto = -1;
  private resultAt = -1;
  private realTime = 0;
  private lowTimeSec = -1;
  private stats = { sledBreach: '', humanKills: 0, humanArmed: false, humanShutoff: -1, hingeTurns: 0, takeovers: 0, coverStops: 0 };
  private hintSteps: HintStep[] = [];
  private hintDone = new Set<string>();
  private ordersPanel: HTMLElement | null = null;
  private pauseReturn: State = 'playing';
  private drivingPuck = false;
  /** test bridge (development only) */
  debug: Record<string, unknown> = {};

  constructor(parent: HTMLElement, ui: HTMLElement) {
    this.ui = ui;
    this.applySettings();
    const scene = new GameScene();
    scene.app = this;
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: '#151a28',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: [scene],
      fps: { target: 60 },
      banner: false,
      audio: { noAudio: true },
    } as Phaser.Types.Core.GameConfig);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.sfx.suspend();
        if (this.state === 'playing' || this.state === 'spectate') this.pause('The game paused while it was in the background.');
      } else this.sfx.resume();
    });
    window.addEventListener('resize', () => {
      this.fitCamera();
      // portrait is unsupported: the rotate overlay shows and play pauses
      if (window.innerHeight > window.innerWidth && window.innerWidth < 900 && (this.state === 'playing' || this.state === 'spectate')) this.pause('Paused while the phone was in portrait.');
    });
    window.addEventListener('orientationchange', () => {
      if (this.state === 'playing') this.pause('Paused while the screen rotated.');
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.controls?.escape()) return;
        if (this.state === 'playing' || this.state === 'spectate') this.pause('');
        else if (this.state === 'paused') this.resume();
      }
      if (e.key === 'Tab' && this.state === 'playing') {
        e.preventDefault();
        this.toggleOrders();
      }
    });
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  onSceneReady(scene: Phaser.Scene) {
    this.scene = scene;
    const w = new World({ seed: 7, attackTeam: 0, squads: [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']], humanIndex: -1, attackEntry: 'front', difficulty: 'club', prepSeconds: 6 });
    generateTextures(scene, w);
    this.view = new WorldView(scene);
    this.applySettings();
    this.showTitle();
  }

  private applySettings() {
    const s = this.settings;
    document.body.classList.toggle('left-handed', s.leftHanded);
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    this.sfx.setVolume('master', s.master);
    this.sfx.setVolume('weapons', s.weapons);
    this.sfx.setVolume('world', s.world);
    this.sfx.setVolume('ui', s.ui);
    this.sfx.setVolume('ambience', s.ambience);
    this.sfx.setVolume('music', s.music);
    this.sfx.setMuted(s.muted);
    if (this.view) {
      this.view.reducedShake = s.reducedShake;
      this.view.reducedFlash = s.reducedFlash;
    }
    if (this.callouts) this.callouts.enabledSoundCaptions = s.captions;
  }

  private fitCamera() {
    if (!this.scene) return;
    const cam = this.scene.cameras.main;
    const hgt = window.innerHeight;
    // integer zoom keeps world pixels crisp; ~12-14 tiles of height on a phone
    const zoom = Math.max(2, Math.floor(hgt / 190));
    cam.setZoom(zoom);
  }

  // ---------- screens ----------

  private setScreen(el: HTMLElement | null) {
    this.screen?.remove();
    this.screen = el;
    if (el) this.ui.appendChild(el);
  }

  private click(name: SfxName = 'ui_tap') {
    this.sfx.play(name);
  }

  showTitle() {
    this.teardownMatch();
    this.state = 'menu';
    this.startAttract();
    this.sfx.setMusic('calm');
    this.sfx.setAmbience(true);
    this.setScreen(
      S.titleScreen({
        play: () => (this.click('ui_confirm'), this.showSetup(false)),
        practice: () => (this.click('ui_confirm'), this.showSetup(true)),
        operators: () => (this.click(), this.setScreen(S.operatorsScreen({ back: () => (this.click('ui_back'), this.showTitle()) }))),
        settings: () => (this.click(), this.showSettings(() => this.showTitle())),
      }),
    );
  }

  private showSettings(back: () => void) {
    this.setScreen(
      S.settingsScreen(this.settings, {
        change: (s) => {
          this.settings = s;
          saveSettings(s);
          this.applySettings();
          this.click();
        },
        back: () => (this.click('ui_back'), back()),
      }),
    );
  }

  private showSetup(single: boolean) {
    this.setScreen(
      S.setupScreen(single, this.settings, {
        back: () => (this.click('ui_back'), this.showTitle()),
        start: (c) => {
          this.click('ui_confirm');
          this.settings.difficulty = c.difficulty;
          saveSettings(this.settings);
          this.startMatch({
            seed: (Math.random() * 1e9) >>> 0,
            difficulty: c.difficulty,
            playerStartSide: c.side,
            attackOperator: 'ram',
            defenceOperator: 'hinge',
            attackEntry: c.entry,
            singleRound: c.single,
          });
        },
      }),
    );
  }

  // ---------- attract mode (bots play behind the title) ----------

  private startAttract() {
    const w = new World({ seed: (Math.random() * 1e6) >>> 0, attackTeam: 0, squads: [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']], humanIndex: -1, attackEntry: ['front', 'rear', 'window'][Math.floor(Math.random() * 3)], difficulty: 'club', prepSeconds: 4 });
    this.attract = { world: w, ai: new AIDirector(w) };
    this.view.attach(w);
    this.fitCamera();
  }

  // ---------- match lifecycle ----------

  startMatch(cfg: MatchConfig) {
    this.teardownMatch();
    this.attract = null;
    this.lastCfg = cfg;
    this.match = new Match(cfg);
    this.setScreen(null);
    this.buildHud();
    this.beginRound();
  }

  private buildHud() {
    this.hud?.destroy();
    this.hud = new Hud(this.ui);
    const hud = this.hud;
    this.controls = new Controls(hud.touch, hud.moveStick, hud.aimStick, hud.cancelZone);
    const c = this.controls;
    c.bindGadgetButton(hud.gadgetBtn);
    c.bindHoldButton(hud.interactBtn, (held) => c.setInteract(held));
    c.bindTap(hud.reloadBtn, () => c.requestReload());
    c.bindTap(hud.ordersBtn, () => this.toggleOrders());
    hud.pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.pause('');
    });
    hud.readyBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.match?.world.requestPrepReady();
      this.click('ui_confirm');
      hud.toast('Ready — action in 3 seconds', true);
    });
    c.gadgetPreviewAllowed = () => this.gadgetPreviewAllowed();
    c.gadgetTapAction = () => this.gadgetTap();
    c.gadgetCommitAction = (p) => this.gadgetCommit(p);
    this.callouts?.clear();
    this.callouts = new Callouts(hud.root);
    this.callouts.enabledSoundCaptions = this.settings.captions;
  }

  private beginRound() {
    const m = this.match!;
    this.view.attach(m.world);
    this.fitCamera();
    this.stepper.reset();
    this.controls?.reset();
    this.callouts?.clear();
    this.closeOrders();
    this.takeoverAt = -1;
    this.takeoverAuto = -1;
    this.resultAt = -1;
    this.lowTimeSec = -1;
    this.drivingPuck = false;
    this.stats = { sledBreach: '', humanKills: 0, humanArmed: false, humanShutoff: -1, hingeTurns: 0, takeovers: 0, coverStops: 0 };
    this.state = 'playing';
    this.setScreen(null);
    this.sfx.setMusic('calm');
    this.sfx.setAmbience(true);
    this.sfx.play('prep_start');
    const side = m.world.sideOf(0);
    this.hud?.banner(side === 'attack' ? 'ATTACK' : 'DEFEND', `Round ${m.roundIndex + 1} · ${side === 'attack' ? 'Prep — choose your approach' : 'Prep — fortify the office'}`, 2200);
    this.setupHints(side);
    this.callouts?.show('', side === 'attack' ? 'Prep: the console is in the office (north-west). Ready up when set.' : 'Prep: reinforce walls and barricade doors. Two approaches always stay open.', 'system');
  }

  private teardownMatch() {
    this.closeOrders();
    this.hud?.destroy();
    this.hud = null;
    this.controls?.reset();
    this.controls = null;
    this.callouts = null;
    this.match = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  restartRound() {
    if (!this.match) return;
    this.overlay?.remove();
    this.overlay = null;
    this.match.startRound(); // same round index, fresh seeded state; score untouched
    this.beginRound();
  }

  pause(note: string) {
    if (this.state !== 'playing' && this.state !== 'spectate') return;
    this.pauseReturn = this.state;
    this.state = 'paused';
    this.controls?.reset();
    this.closeOrders();
    this.showPause(note);
  }

  private showPause(note: string) {
    this.setScreen(
      S.pauseScreen(
        {
          resume: () => this.resume(),
          restart: () => (this.click('ui_confirm'), this.restartRound()),
          settings: () => this.showSettings(() => this.showPause(note)),
          quit: () => (this.click('ui_back'), this.showTitle()),
        },
        (note ? note + ' ' : '') + 'Reloading the page restarts this round from its start.',
      ),
    );
  }

  resume() {
    if (this.state !== 'paused') return;
    this.click('ui_confirm');
    this.setScreen(null);
    this.controls?.reset();
    this.stepper.reset();
    this.state = this.pauseReturn;
  }

  // ---------- orders ----------

  private toggleOrders() {
    if (this.ordersPanel) return this.closeOrders();
    if (!this.match || !this.hud) return;
    const give = (o: Order, label: string) => {
      const w = this.match!.world;
      for (const a of w.actors) if (a.team === 0 && a.alive && a.controller === 'bot') this.match!.ai.setOrder(a.id, o.kind === 'hold' ? { kind: 'hold', pos: { ...a.pos } } : o);
      this.hud?.toast(`Squad: ${label}`, true);
      this.click('ui_confirm');
      this.closeOrders();
    };
    const btn = (icon: Parameters<typeof iconImg>[0], label: string, o: Order) => {
      const b = h('button', { class: 'btn ghost' }, iconImg(icon), label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        give(o, label);
      });
      return b;
    };
    this.ordersPanel = h('div', { class: 'orders' }, h('div', { class: 'label' }, 'Orders — all teammates'), btn('follow', 'Follow me', { kind: 'follow' }), btn('hold', 'Hold here', { kind: 'hold', pos: { x: 0, y: 0 } }), btn('auto', 'Play objective', { kind: 'auto' }));
    this.hud.root.appendChild(this.ordersPanel);
  }

  private closeOrders() {
    this.ordersPanel?.remove();
    this.ordersPanel = null;
  }

  // ---------- gadgets ----------

  private human() {
    const w = this.match?.world;
    return w?.human();
  }

  private puck(w: World): PuckEntity | undefined {
    return w.entities.find((e): e is PuckEntity => e.kind === 'puck' && e.team === 0);
  }

  private gadgetPreviewAllowed(): boolean {
    const w = this.match?.world;
    const a = this.human();
    if (!w || !a || !a.alive) return false;
    if (w.phase === 'prep' && a.side === 'attack') return false;
    if (a.operatorId === 'ram') {
      if (w.entities.some((e) => e.kind === 'sled' && e.ownerId === a.id)) return false;
      const v = validateRamLaunch(w, a);
      if (!v.ok) {
        this.hud?.toast(v.reason);
        this.sfx.play('invalid');
      }
      return v.ok;
    }
    if (a.operatorId === 'hinge') return a.gadgetCharges > 0 && !w.entities.some((e) => e.kind === 'hinge' && e.ownerId === a.id);
    return false;
  }

  private gadgetTap(): GadgetCommand | null {
    const w = this.match?.world;
    const a = this.human();
    if (!w || !a || !a.alive) return null;
    if (w.phase === 'prep' && a.side === 'attack') {
      if (!this.puck(w)) {
        this.hud?.toast('The puck was destroyed');
        this.sfx.play('invalid');
        return null;
      }
      this.drivingPuck = !this.drivingPuck;
      this.hintDone.add('puck');
      this.hud?.toast(this.drivingPuck ? 'Driving the scouting puck — tap again to return' : 'Back with the squad', true);
      this.click('ui_confirm');
      return null;
    }
    if (a.operatorId === 'ram') {
      if (w.entities.some((e) => e.kind === 'sled' && e.ownerId === a.id)) return { type: 'ramDeploy' };
      return null;
    }
    if (a.operatorId === 'hinge') {
      const hg = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === a.id);
      if (hg) {
        if (dist(a.pos, hg.center) > HINGE_REMOTE_RANGE) {
          this.hud?.toast('Too far from your wall (6 tiles)');
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
    if (p.worldTarget && !this.controls?.usingTouch) off = { x: p.worldTarget.x - a.pos.x, y: p.worldTarget.y - a.pos.y };
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

  private gadgetCommit(p: GadgetPreview): GadgetCommand | null {
    const w = this.match?.world;
    const a = this.human();
    if (!w || !a || !a.alive) return null;
    if (a.operatorId === 'ram') return { type: 'ramLaunch', angle: this.ramAngle(p) };
    if (a.operatorId === 'hinge') {
      const t = this.hingeTarget(p);
      if (!t) return null;
      const v = validateHingePlacement(w, a, t.pos, t.vertical);
      if (!v.ok) {
        this.hud?.toast(v.reason);
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

  private preview(): PreviewState {
    const c = this.controls;
    const w = this.match?.world;
    const a = this.human();
    if (!c || !w || !a || !a.alive || !c.gadget.active) return { kind: 'none' };
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
      if (!v.ok && this.realTime % 0.5 < 0.02) this.hud?.toast(v.reason);
      return { kind: 'hinge', hingePos: t.pos, hingeVertical: t.vertical, hingeValid: v.ok };
    }
    return { kind: 'none' };
  }

  private gadgetUi(): GadgetUi | null {
    const w = this.match?.world;
    const a = this.human();
    if (!w || !a) return null;
    if (w.phase === 'prep' && a.side === 'attack') {
      const pk = this.puck(w);
      return { icon: 'puck', label: !pk ? 'Lost' : this.drivingPuck ? 'Return' : 'Puck', pips: pk ? 1 : 0, pipsMax: 1, enabled: !!pk, cooldown: 0 };
    }
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
        return { icon: 'rotate', label: 'Rotate', pips: 1, pipsMax: 1, enabled: hg.state === 'idle' && cd === 0 && dist(a.pos, hg.center) <= HINGE_REMOTE_RANGE, cooldown: cd };
      }
      return { icon: 'hinge', label: a.gadgetCharges > 0 ? 'Place' : 'Gone', pips: a.gadgetCharges, pipsMax: 1, enabled: a.gadgetCharges > 0, cooldown: 0 };
    }
    return null;
  }

  // ---------- hints (first-match guidance that fades after the action is done) ----------

  private setupHints(side: 'attack' | 'defence') {
    this.hintSteps = [];
    if (this.settings.tutorialDone) return;
    const c = () => this.controls!;
    const touch = () => c().usingTouch || 'ontouchstart' in window;
    this.hintSteps.push({ id: 'move', text: touch() ? 'Drag on the LEFT side to move' : 'Move with W A S D', when: () => c().movedOnce });
    this.hintSteps.push({ id: 'aim', text: touch() ? 'Drag on the RIGHT side to aim — you fire while dragging' : 'Aim with the mouse, hold left click to fire', when: () => c().aimedOnce });
    if (side === 'attack') {
      this.hintSteps.push({ id: 'puck', text: 'Prep: tap GADGET to drive the scouting puck inside (or let a teammate scout)', when: (w) => this.hintDone.has('puck') || w.phase !== 'prep' });
      this.hintSteps.push({ id: 'sled', text: touch() ? 'Hold GADGET and drag toward a dashed wall panel — release to send Ram’s sled' : 'Hold Q, aim at a dashed wall panel, release to send the sled', when: () => this.hintDone.has('sled') });
      this.hintSteps.push({ id: 'brake', text: touch() ? 'Tap GADGET again to brake — the sled unfolds into cover' : 'Tap Q again to brake — the sled unfolds into cover', when: () => this.hintDone.has('brake') });
      this.hintSteps.push({ id: 'arm', text: 'At the office console, hold INTERACT for 3s to arm it', when: (w) => w.phase === 'armed' });
    } else {
      this.hintSteps.push({ id: 'reinforce', text: 'Stand at a dashed wall panel and hold INTERACT to reinforce it', when: (w) => this.hintDone.has('reinforce') || w.phase !== 'prep' });
      this.hintSteps.push({ id: 'place', text: touch() ? 'Hold GADGET and drag to place Hinge’s wall (it lies across your drag)' : 'Hold Q and point to place Hinge’s wall', when: () => this.hintDone.has('place') });
      this.hintSteps.push({ id: 'rotate', text: touch() ? 'Tap GADGET to swing the wall — close one angle, open another' : 'Tap Q to swing the wall', when: () => this.hintDone.has('rotate') });
    }
  }

  private updateHints(w: World) {
    if (!this.hud) return;
    while (this.hintSteps.length && this.hintSteps[0].when(w)) this.hintSteps.shift();
    const step = this.hintSteps[0];
    // gadget hints only make sense once the gadget can be used
    if (step && (step.id === 'sled' || step.id === 'brake') && w.phase === 'prep') return this.hud.hint(null);
    if (step && step.id === 'brake' && !w.entities.some((e) => e.kind === 'sled' && e.ownerId === this.human()?.id)) return this.hud.hint(null);
    this.hud.hint(step && this.human()?.alive ? step.text : null);
    if (!this.hintSteps.length && !this.settings.tutorialDone && this.match && this.match.rounds.length > 0) {
      this.settings.tutorialDone = true;
      saveSettings(this.settings);
    }
  }

  // ---------- main loop ----------

  frame(deltaMs: number) {
    if (!this.view) return;
    const dt = Math.min(0.1, deltaMs / 1000);
    this.realTime += dt;
    if (this.attract && this.state === 'menu') {
      const a = this.attract;
      this.stepper.advance(dt, () => {
        if (a.world.phase === 'ended') return;
        a.world.step(a.ai.think());
        this.view.onEvents(a.world.events);
      });
      if (a.world.phase === 'ended' && this.realTime % 6 < dt) this.startAttract();
      const living = a.world.actors.filter((x) => x.alive);
      const focus = living[Math.floor(this.realTime / 8) % Math.max(1, living.length)];
      this.view.render(this.stepper.alpha, dt, -1, { kind: 'none' }, focus ? { x: focus.pos.x * T, y: focus.pos.y * T } : null);
      return;
    }
    const m = this.match;
    if (!m) return;
    const w = m.world;

    if (this.state === 'playing' || this.state === 'spectate') {
      const devSpeed = import.meta.env.DEV ? Number(this.debug.speed) || 1 : 1;
      const speed = (this.state === 'spectate' ? 3 : 1) * devSpeed;
      this.stepper.advance(dt * speed, () => {
        // a tick can end the round or open takeover; stop stepping once we leave play
        if (this.state === 'playing' || this.state === 'spectate') this.tick();
      }, 6 * Math.ceil(speed));
    }
    // death takeover timing (real time)
    if (this.takeoverAt > 0 && this.realTime >= this.takeoverAt && this.state === 'playing') {
      this.takeoverAt = -1;
      this.openTakeover();
    }
    if (this.state === 'takeover' && this.takeoverAuto > 0 && this.realTime >= this.takeoverAuto) {
      const first = w.actors.find((a) => a.team === 0 && a.alive);
      if (first) this.pickTakeover(first.id);
    }
    if (this.resultAt > 0 && this.realTime >= this.resultAt && (this.state === 'playing' || this.state === 'spectate')) {
      this.resultAt = -1;
      this.showRoundResult();
    }

    const human = w.human();
    const humanId = human?.id ?? -1;
    if (this.controls && human) {
      const scr = this.view.worldToScreen(human.pos);
      this.controls.playerScreen = { x: scr.x, y: scr.y - 8 };
      this.controls.mouseWorld = null;
    }
    const pk = this.drivingPuck ? this.puck(w) : undefined;
    const spectate = this.state === 'spectate' ? { x: w.map.console.center.x * T, y: w.map.console.center.y * T } : pk ? { x: pk.pos.x * T, y: pk.pos.y * T } : null;
    this.view.render(this.stepper.alpha, dt, humanId, this.preview(), spectate ?? (human && !human.alive ? { x: human.pos.x * T, y: human.pos.y * T } : null));
    if (this.controls) {
      const cam = this.scene.cameras.main;
      void cam;
    }
    if (this.hud) {
      this.hud.root.classList.toggle('previewing', !!this.controls?.gadget.active);
      const statuses = this.statuses();
      const interact = human && human.alive ? bestInteract(w, human) : null;
      this.hud.update(w, humanId, m.score, statuses, interact, this.gadgetUi());
      this.updateHints(w);
    }
  }

  private statuses(): Map<number, string> {
    const out = new Map<number, string>();
    const m = this.match;
    if (!m) return out;
    for (const [id, b] of m.ai.bots) out.set(id, b.status);
    return out;
  }

  private aimAssist(w: World, intent: ActorIntent) {
    const a = w.human();
    if (!a || intent.aim === null || !intent.fire || this.settings.aimAssist === 'off' || !this.controls?.usingTouch) return;
    const cone = ((this.settings.aimAssist === 'low' ? 4 : 8) * Math.PI) / 180;
    let best: { d: number; ang: number } | null = null;
    for (const e of w.actors) {
      if (e.team === 0 || !e.alive || !w.visible[0].has(e.id)) continue;
      const d = dist(a.pos, e.pos);
      if (d > a.weapon.effective_range_tiles * 1.3) continue;
      if (!canSee(w, a.pos, e.pos)) continue; // never through cover or fog
      const ang = angleTo(a.pos, e.pos);
      const diff = normAngle(ang - intent.aim);
      if (Math.abs(diff) > cone) continue;
      if (!best || Math.abs(diff) < Math.abs(best.ang)) best = { d, ang: diff };
    }
    if (best) intent.aim = intent.aim + best.ang * 0.55;
  }

  /** One fixed simulation tick. */
  private tick() {
    const m = this.match!;
    const w = m.world;
    // after the round ends nothing advances; never re-read the final tick's events
    if (w.phase === 'ended') return;
    let intent: ActorIntent | null = null;
    if (this.controls && this.state === 'playing') {
      intent = this.controls.produce();
      this.aimAssist(w, intent);
      const h = w.human();
      if (import.meta.env.DEV && this.debug.autopilot && h) intent = m.ai.intentFor(h.id);
      if (this.drivingPuck && (w.phase !== 'prep' || !this.puck(w))) this.drivingPuck = false;
      if (this.drivingPuck) {
        intent.puck = intent.move;
        intent.move = { x: 0, y: 0 };
        intent.fire = false;
      }
    }
    const ended = m.step(intent);
    const events = w.events;
    this.view.onEvents(events);
    this.handleEvents(w, events);
    this.callouts?.onTick(w, events, w.human()?.id ?? -1, this.statuses());
    if (ended) {
      const win = w.result!.winner === 0;
      this.hud?.banner(win ? 'ROUND WON' : 'ROUND LOST', REASON_TEXT[w.result!.reason] ?? '', 1800);
      this.sfx.play(win ? 'round_win' : 'round_lose');
      this.resultAt = this.realTime + 1.6;
      this.takeoverAt = -1;
      if (this.state === 'takeover') this.state = 'playing';
    }
    // nobody left on the player's team while the broadcast runs: fast spectate
    if (!ended && w.phase === 'armed' && w.alive(0).length === 0 && this.state === 'playing') {
      this.state = 'spectate';
      this.takeoverAt = -1;
      this.hud?.banner('SPECTATING', 'Your squad is down — the broadcast plays out', 2000);
    }
  }

  private listener(w: World): Vec {
    const h = w.human();
    return h ? h.pos : w.map.console.center;
  }

  private playAt(w: World, name: SfxName, pos: Vec, radius: number, muffled = false, volume = 1) {
    const l = this.listener(w);
    const d = dist(l, pos);
    const vol = Math.max(0.12, 1 - d / (radius * 1.3)) * volume;
    const viewW = window.innerWidth / (this.scene.cameras.main.zoom * T);
    const pan = Math.max(-1, Math.min(1, (pos.x - l.x) / (viewW * 0.6)));
    this.sfx.play(name, { pan, volume: vol, muffled });
  }

  private handleEvents(w: World, events: SimEvent[]) {
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
      if (e.type === 'barricadePlaced') {
        for (const a of w.actors) if (a.team === e.team) gadgetName.set(a.id, 'barricade_place');
      }
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
          if (src && src.id === human?.id) name = name;
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
          name = gadgetName.get(s.sourceId) ?? 'sled_motor';
          break;
        default:
          name = null;
      }
      if (name) this.playAt(w, name, s.pos, s.radius, muffled, s.kind === 'step' && src?.id === human?.id ? 0.55 : 1);
      // HUD sound arc for heard enemy sounds (approximate direction only)
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
          if (a.id === human?.id) {
            const src = w.actor(e.sourceId);
            // direction indicator only toward a source the team can see, else a vague hit flash
            if (src && w.visible[0].has(src.id)) this.hud?.damageFrom(angleTo(a.pos, src.pos));
            else this.hud?.damageFrom(a.facing + Math.PI);
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
          if (a && (a.team === 0 || w.visible[0].has(a.id))) this.playAt(w, 'death', a.pos, 12);
          if (a && a.id === human?.id) this.onHumanDeath();
          const k = w.actor(e.killerId);
          if (k && k.id === human?.id && a && a.team !== 0) this.stats.humanKills++;
          break;
        }
        case 'gadgetInvalid':
          if (e.actorId === human?.id) {
            this.hud?.toast(e.reason);
            this.sfx.play('invalid');
          }
          break;
        case 'hingeBlocked': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.ownerId === human?.id) {
            this.hud?.toast(`${e.reason} — no cooldown used`);
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
          if (w.entities.length >= 0 && human && dist(human.pos, e.pos) < 12) this.playAt(w, 'sled_thud', e.pos, 10);
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
          if (a && a.id === human?.id && e.cause === 'sled') this.stats.sledBreach = roomAt(w.map, w.map.softGroups[e.group].center)?.name ?? 'a';
          break;
        }
        case 'vault':
          if (e.actorId === human?.id) this.sfx.play('vault');
          break;
        case 'armed':
          this.sfx.play('armed_alarm');
          this.sfx.setMusic('tense');
          if (e.actorId === human?.id) this.stats.humanArmed = true;
          this.hud?.banner(w.sideOf(0) === 'attack' ? 'TRANSMITTER ARMED' : 'CONSOLE ARMED', w.sideOf(0) === 'attack' ? 'Hold the office for 30 seconds' : 'Shut it off before the broadcast ends', 2000);
          break;
        case 'shutoff':
          this.sfx.play('shutoff');
          if (e.actorId === human?.id) this.stats.humanShutoff = Math.ceil(w.secondsLeft());
          break;
        case 'phase':
          if (e.phase === 'action') {
            this.sfx.play('action_start');
            this.sfx.setMusic('tense');
            this.hud?.banner('ACTION', w.sideOf(0) === 'attack' ? 'Breach and arm the console' : 'Hold the office', 1400);
          }
          break;
        case 'sledLaunched':
          if (e.actorId === human?.id) this.hintDone.add('sled');
          break;
        case 'coverDeployed': {
          const c = w.entities.find((x) => x.id === e.coverId);
          if (c && c.ownerId === human?.id) this.hintDone.add('brake');
          break;
        }
        case 'sledHitActor':
          this.playAt(w, 'sled_thud', w.actor(e.actorId)?.pos ?? this.listener(w), 10);
          break;
        case 'interactDone':
          if (e.actorId === human?.id && e.kind === 'reinforce') this.hintDone.add('reinforce');
          if (e.actorId === human?.id && (e.kind === 'reinforce' || e.kind === 'barricade')) this.hud?.toast(e.kind === 'reinforce' ? 'Wall reinforced' : 'Barricade placed', true);
          break;
        case 'hingePlaced':
          if (e.actorId === human?.id) this.hintDone.add('place');
          break;
        case 'hingeRotateStart': {
          const hg = w.entities.find((x) => x.id === e.hingeId);
          if (hg && hg.ownerId === human?.id) this.hintDone.add('rotate');
          break;
        }
        case 'puckDestroyed': {
          const own = w.attackTeam === 0;
          if (own) {
            this.hud?.toast('Scouting puck destroyed');
            this.drivingPuck = false;
          }
          if (own || this.pointSeen(w, e.pos)) this.playAt(w, 'cover_break', e.pos, 10);
          break;
        }
        case 'interactCancel':
          if (e.actorId === human?.id && e.reason !== 'Released') this.hud?.toast(`Interrupted — ${e.reason.toLowerCase()}`);
          break;
      }
    }
    // low-time ticks in the last 10 seconds of a running clock
    if ((w.phase === 'action' || w.phase === 'armed') && w.secondsLeft() <= 10) {
      const s = Math.ceil(w.secondsLeft());
      if (s !== this.lowTimeSec) {
        this.lowTimeSec = s;
        this.sfx.play('low_time', { volume: 0.6 });
      }
    }
  }

  private pointSeen(w: World, p: Vec): boolean {
    return w.actors.some((a) => a.team === 0 && a.alive && canSee(w, a.pos, p));
  }

  private onHumanDeath() {
    this.controls?.reset();
    this.closeOrders();
    const w = this.match!.world;
    if (w.phase === 'ended') return;
    if (w.alive(0).length > 0) this.takeoverAt = this.realTime + 0.6;
  }

  private openTakeover() {
    const w = this.match!.world;
    if (w.phase === 'ended') return;
    const mates = w.actors.filter((a) => a.team === 0 && a.alive);
    if (!mates.length) return;
    this.state = 'takeover';
    this.takeoverAuto = this.realTime + 1.0;
    this.sfx.play('takeover');
    const note = (id: number) => {
      const a = w.actor(id)!;
      return `${a.mag}/${a.reserve} ammo${a.gadgetCharges > 0 ? ' · gadget ready' : ''}`;
    };
    this.overlay = S.takeoverScreen(
      mates.map((a) => ({ id: a.id, name: a.name, look: a.look, hp: a.hp, note: note(a.id) })),
      (id) => this.pickTakeover(id),
    );
    this.ui.appendChild(this.overlay);
  }

  private pickTakeover(id: number) {
    const m = this.match!;
    this.overlay?.remove();
    this.overlay = null;
    this.takeoverAuto = -1;
    if (!m.world.takeOver(id)) return;
    m.ai.clearFor(id);
    this.controls?.reset();
    this.stats.takeovers++;
    this.state = 'playing';
    this.stepper.reset();
    const a = m.world.actor(id)!;
    this.hud?.banner(`NOW PLAYING ${a.name}`, `${a.hp} HP`, 1200);
    this.click('ui_confirm');
  }

  private highlight(w: World): string {
    const s = this.stats;
    if (s.humanShutoff >= 0) return `You shut off the broadcast with ${s.humanShutoff}s left.`;
    if (s.sledBreach) return `Your sled opened a new route into the ${s.sledBreach.toLowerCase()}.`;
    if (s.humanArmed) return 'You armed the transmitter yourself.';
    if (s.humanKills >= 2) return `You took down ${s.humanKills} opponents.`;
    if (s.hingeTurns > 0 && w.sideOf(0) === 'defence') return `Your squad swung the pivot wall ${s.hingeTurns} time${s.hingeTurns > 1 ? 's' : ''}.`;
    if (s.takeovers > 0) return `You took over a teammate ${s.takeovers > 1 ? `${s.takeovers} times` : 'and kept fighting'}.`;
    if (s.humanKills === 1) return 'You took down one opponent.';
    return '';
  }

  private showRoundResult() {
    const m = this.match!;
    const w = m.world;
    if (!w.result) return;
    this.state = 'result';
    this.controls?.reset();
    const win = w.result.winner === 0;
    const last = m.matchOver;
    this.overlay?.remove();
    this.overlay = S.roundResultScreen(win, REASON_TEXT[w.result.reason] ?? w.result.reason, this.highlight(w), m.score, { next: () => this.nextRound() }, last ? 'See results' : 'Next round — swap sides');
    this.ui.appendChild(this.overlay);
    // auto-advance after 5 seconds (tap skips)
    const token = w;
    setTimeout(() => {
      if (this.match && this.match.world === token && this.state === 'result') this.nextRound();
    }, 5000);
  }

  private nextRound() {
    const m = this.match;
    if (!m) return;
    this.overlay?.remove();
    this.overlay = null;
    this.click('ui_confirm');
    if (m.matchOver) return this.showMatchEnd();
    m.nextRound();
    this.beginRound();
  }

  private showMatchEnd() {
    const m = this.match!;
    const win = m.score[0] > m.score[1];
    const lines = m.rounds.map((r, i) => `Round ${i + 1} · ${r.playerSide === 'attack' ? 'Attack' : 'Defence'} · ${r.winner === 0 ? 'won' : 'lost'} — ${REASON_TEXT[r.reason] ?? r.reason}`);
    const cfg = this.lastCfg!;
    this.state = 'menu';
    this.hud?.destroy();
    this.hud = null;
    this.sfx.setMusic('calm');
    if (!this.settings.tutorialDone) {
      this.settings.tutorialDone = true;
      saveSettings(this.settings);
    }
    this.setScreen(
      S.matchEndScreen(win, m.score, lines, {
        rematch: () => this.startMatch({ ...cfg, seed: (Math.random() * 1e9) >>> 0 }),
        title: () => this.showTitle(),
      }),
    );
  }
}
