// Shooting range / Training Grounds: no clock, respawning pop-up targets, a breach house whose
// walls and barricade regrow, and live accuracy stats. Same controls and gadgets as a match.
import type { AppCtx, Runner } from './ctx';
import { FixedStepper } from './session';
import { PlayInput } from './playInput';
import { Feedback } from './feedback';
import { Hud } from '../ui/hud';
import { h } from '../ui/dom';
import * as S from '../ui/screens';
import { OP_INFO } from '../ui/menu';
import { settingsPanel } from '../ui/settingsPanel';
import { World } from '../sim/world';
import { RANGE_TARGETS } from '../content/rangeMap';
import { bestInteract } from '../sim/interact';
import type { OpSelectResult } from '../ui/screens';

const RANGE_OPS = ['ram', 'recruit_mo', 'recruit_tess', 'hinge', 'recruit_dex', 'recruit_june'];

export class RangeRunner implements Runner {
  private world!: World;
  private hud: Hud;
  private input: PlayInput;
  private fb: Feedback;
  private stepper = new FixedStepper();
  private state: 'select' | 'playing' | 'paused' = 'select';
  private screen: HTMLElement | null = null;
  private statsEl: HTMLElement;
  private loadoutBtn: HTMLElement;
  private pick: OpSelectResult = { op: 'ram', weapon: 'carbine' };
  private shots = 0;
  private hits = 0;
  private elims = 0;
  private lastCount = '';
  private hitstop = 0;

  constructor(private ctx: AppCtx) {
    this.hud = new Hud(ctx.ui);
    this.hud.root.style.display = 'none';
    this.input = new PlayInput(this.hud, ctx.sfx, () => ctx.settings, () => this.world ?? null);
    this.fb = new Feedback(ctx.sfx, this.hud, ctx.view, () => ctx.scene.cameras.main.zoom);
    this.fb.onHumanKill = () => (this.hitstop = 0.07);
    this.statsEl = h('div', { class: 'range-stats' });
    this.loadoutBtn = h('button', { class: 'chip-btn loadout' }, 'CHANGE OPERATOR');
    this.loadoutBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.select();
    });
    this.hud.root.append(this.statsEl, this.loadoutBtn);
    this.hud.pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.pause('');
    });
    this.makeWorld();
    this.select();
  }

  destroy() {
    this.input.dispose();
    this.hud.destroy();
    this.screen?.remove();
  }

  private setScreen(el: HTMLElement | null) {
    this.screen?.remove();
    this.screen = el;
    if (el) this.ctx.ui.appendChild(el);
  }

  private makeWorld() {
    this.world = new World({
      seed: 1,
      attackTeam: 0,
      squads: [[this.pick.op], RANGE_TARGETS.map(() => 'dummy')],
      humanIndex: 0,
      attackEntry: 'line',
      difficulty: 'club',
      prepSeconds: 0,
      mapId: 'range',
      mode: 'range',
      humanWeapon: this.pick.weapon,
    });
    this.ctx.view.attach(this.world);
    this.ctx.view.fit();
    this.shots = 0;
    this.hits = 0;
    this.elims = 0;
    this.lastCount = '';
  }

  private select() {
    this.state = 'select';
    this.input.controls.reset();
    this.hud.root.style.display = 'none';
    const info = OP_INFO[this.pick.op];
    this.setScreen(
      S.opSelectScreen(
        { round: 0, side: 'attack', ops: RANGE_OPS, locked: [], initial: { op: this.pick.op, weapon: info.weapons.includes(this.pick.weapon) ? this.pick.weapon : info.weapons[0] }, seconds: 99, score: [0, 0] },
        {
          tap: () => this.ctx.sfx.play('ui_tap'),
          confirm: (r) => {
            this.ctx.sfx.play('ui_confirm');
            this.pick = r;
            this.makeWorld();
            this.setScreen(null);
            this.hud.root.style.display = '';
            this.state = 'playing';
            this.stepper.reset();
            this.ctx.sfx.setMusic('calm');
            this.hud.banner('TRAINING GROUNDS', 'Lanes on the left · breach house on the right', 1800, 'small');
          },
        },
      ),
    );
    // the select screen is shared with matches: relabel it for the range
    const title = this.screen?.querySelector('.os-round');
    if (title) title.textContent = 'SHOOTING RANGE';
  }

  pause(note: string) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.controls.reset();
    this.showPause(note);
  }

  private showPause(note: string) {
    this.setScreen(
      S.pauseScreen(
        {
          resume: () => this.resume(),
          restart: () => {
            this.makeWorld();
            this.resume();
          },
          settings: () =>
            this.setScreen(
              S.settingsOverlay(
                settingsPanel(this.ctx.settings, () => this.ctx.settingsChanged()),
                () => this.showPause(note),
              ),
            ),
          quit: () => this.ctx.home(),
        },
        note,
        'RANGE PAUSED',
      ),
    );
  }

  private resume() {
    this.setScreen(null);
    this.input.controls.reset();
    this.stepper.reset();
    this.state = 'playing';
  }

  escape() {
    if (this.input.controls.escape()) return;
    if (this.state === 'paused') this.resume();
    else this.pause('');
  }

  frame(dt: number) {
    this.input.tick(dt);
    const w = this.world;
    const view = this.ctx.view;
    if (this.state === 'playing') {
      if (this.hitstop > 0) this.hitstop -= dt;
      else this.stepper.advance(dt, () => this.tick());
    }
    const human = w.human();
    if (human) {
      const scr = view.worldToScreen(human.pos);
      this.input.controls.playerScreen = { x: scr.x, y: scr.y - 8 * this.ctx.scene.cameras.main.zoom };
      this.input.controls.mouseWorld = view.screenToWorld(this.input.controls.mouseScreen.x, this.input.controls.mouseScreen.y);
    }
    const playing = this.state === 'playing' && !!human?.alive;
    view.render(this.stepper.alpha, dt, { humanId: human?.id ?? -1, preview: playing ? this.input.preview() : { kind: 'none' }, focus: null, droneId: null, ads: playing && !!human?.ads, laser: playing ? human!.facing : null });
    if (this.state === 'select') return;
    this.hud.root.classList.toggle('previewing', this.input.controls.gadget.active);
    this.hud.update({ w, humanId: human?.id ?? -1, score: [0, 0], round: 0, statuses: new Map(), interact: human ? bestInteract(w, human) : null, gadget: this.input.gadgetUi(), ads: !!human?.ads, drone: null, range: true });
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    const txt = `${this.shots}|${this.hits}|${this.elims}`;
    if (txt !== this.lastCount) {
      this.lastCount = txt;
      this.statsEl.innerHTML = '';
      this.statsEl.append(h('div', {}, h('b', {}, String(this.elims)), h('small', {}, 'TARGETS')), h('div', {}, h('b', {}, `${acc}%`), h('small', {}, 'ACCURACY')), h('div', {}, h('b', {}, String(this.hits)), h('small', {}, 'HITS')));
    }
  }

  private tick() {
    const w = this.world;
    const h = w.human();
    const intents = new Map();
    if (h && h.alive) intents.set(h.id, this.input.produce(w, false));
    w.step(intents);
    // per trigger pull, so a scattergun's five pellets count as one shot
    let shot = false;
    let hit = false;
    for (const e of w.events) {
      if (e.type === 'shot' && e.actorId === h?.id) shot = true;
      if (e.type === 'damage' && e.sourceId === h?.id && e.actorId !== h?.id) hit = true;
      if (e.type === 'death' && e.killerId === h?.id) this.elims++;
    }
    if (shot) this.shots++;
    if (shot && hit) this.hits++;
    this.ctx.view.onEvents(w.events);
    this.fb.handle(w, w.events);
  }
}
