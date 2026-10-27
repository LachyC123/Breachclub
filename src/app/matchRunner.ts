// One match against bots: loading -> per-round operator select -> attacker spawn select ->
// preparation (attackers on drone cams) -> action -> elimination/takeover -> round summary.
import { Match, FixedStepper, SIDE_SQUADS, type MatchConfig, type RoundPick } from './session';
import type { AppCtx, Runner } from './ctx';
import { PlayInput } from './playInput';
import { Feedback } from './feedback';
import { Hud, type DroneUi } from '../ui/hud';
import { Callouts } from '../ui/callouts';
import { h, iconImg } from '../ui/dom';
import * as S from '../ui/screens';
import { OP_INFO } from '../ui/menu';
import { settingsPanel } from '../ui/settingsPanel';
import { OPERATORS, PLAYABLE_SIGNATURE } from '../content/defs';
import { bakeMap } from '../render/art/env';
import { bestInteract } from '../sim/interact';
import { dist } from '../sim/geometry';
import { REASON_TEXT } from '../sim/rules';
import { saveSettings } from './settings';
import type { World } from '../sim/world';
import type { ActorIntent, Vec } from '../sim/types';
import type { Order } from '../ai/brain';
import { setAutopilot } from '../ai/control';
import { ScoreTracker } from './scoring';
import { draftScreen, enemyRevealScreen } from '../ui/draft';
import { cardById, dealCards } from '../content/cards';
import { Rng } from '../sim/rng';
import { lookOf } from '../ui/menu';
import { displayName } from '../content/defs';

type State = 'loading' | 'draft' | 'opselect' | 'spawn' | 'playing' | 'dead' | 'takeover' | 'spectate' | 'roundend' | 'matchend' | 'paused';

interface Hint {
  id: string;
  text: string;
  when: (w: World) => boolean;
  show?: (w: World) => boolean;
}

export interface MatchOptions {
  cfg: MatchConfig;
  /** shown on the loading screen */
  modeName: string;
}

export class MatchRunner implements Runner {
  private match: Match;
  private hud: Hud;
  private input: PlayInput;
  private fb: Feedback;
  private callouts: Callouts;
  private stepper = new FixedStepper();
  private state: State = 'loading';
  private pauseReturn: State = 'playing';
  private screen: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private board: HTMLElement | null = null;
  private orders: HTMLElement | null = null;
  private realTime = 0;
  private deadAt = -1;
  private killerId = -1;
  private takeoverAuto = -1;
  private roundEndAt = -1;
  private camIdx = 0;
  private hitstop = 0;
  private scoring = new ScoreTracker();
  /** points earned by whoever the player was controlling, this round and this match */
  private playerPts = 0;
  private matchPts = 0;
  private hints: Hint[] = [];
  private lastPick: RoundPick | null = null;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private ctx: AppCtx,
    private opts: MatchOptions,
  ) {
    this.match = new Match(opts.cfg);
    this.hud = new Hud(ctx.ui);
    this.hud.root.style.display = 'none';
    this.input = new PlayInput(this.hud, ctx.sfx, () => ctx.settings, () => this.match.world);
    this.fb = new Feedback(ctx.sfx, this.hud, ctx.view, () => ctx.scene.cameras.main.zoom);
    this.fb.onHumanDeath = (k) => this.onHumanDeath(k);
    this.fb.onDroneLost = () => (this.camIdx = 0);
    // hit-stop: the world freezes for a beat when you land a kill
    this.fb.onHumanKill = () => (this.hitstop = 0.07);
    this.callouts = new Callouts(this.hud.root);
    this.callouts.enabledSoundCaptions = ctx.settings.captions;
    this.wireHud();
    window.addEventListener('keydown', this.keyHandler);
    ctx.view.attach(this.match.world);
    ctx.view.fit();
    this.showLoading();
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.input.dispose();
    this.callouts.clear();
    this.hud.destroy();
    this.screen?.remove();
    this.overlay?.remove();
    this.board?.remove();
    this.orders?.remove();
  }

  private click(kind: 'tap' | 'confirm' | 'back' = 'tap') {
    this.ctx.sfx.play(kind === 'tap' ? 'ui_tap' : kind === 'confirm' ? 'ui_confirm' : 'ui_back');
  }

  private setScreen(el: HTMLElement | null) {
    this.screen?.remove();
    this.screen = el;
    if (el) this.ctx.ui.appendChild(el);
  }

  private setOverlay(el: HTMLElement | null) {
    this.overlay?.remove();
    this.overlay = el;
    if (el) this.ctx.ui.appendChild(el);
  }

  private wireHud() {
    const hud = this.hud;
    const tap = (el: HTMLElement, fn: () => void) =>
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    tap(hud.pauseBtn, () => this.pause(''));
    tap(hud.boardBtn, () => this.toggleBoard());
    tap(hud.ordersBtn, () => this.toggleOrders());
    tap(hud.nextBtn, () => this.nextCam());
    tap(hud.readyBtn, () => {
      this.match.world.requestPrepReady();
      this.click('confirm');
      hud.toast('Ready — action starts in a few seconds', true);
    });
  }

  private onKey(e: KeyboardEvent) {
    if (this.state !== 'playing' && this.state !== 'spectate' && this.state !== 'dead') return;
    const k = e.key.toLowerCase();
    if (k === 'tab') {
      e.preventDefault();
      this.toggleBoard();
    }
    if (k === 'c') this.toggleOrders();
    if (k === 'n' || k === ' ') this.nextCam();
  }

  // ---------- pre-round screens ----------

  private showLoading() {
    this.state = 'loading';
    const w = this.match.world;
    const side = this.match.playerSide();
    this.ctx.sfx.setMusic('calm');
    const el = S.loadingScreen({
      mode: this.opts.modeName,
      mapName: w.map.name.toUpperCase(),
      sub: 'LAUNDRETTE · RAINY NIGHT',
      objective: 'Arm (attack) or protect (defence) the transmitter console in the office.',
      difficulty: this.opts.cfg.difficulty,
      squads: [SIDE_SQUADS[side], SIDE_SQUADS[side === 'attack' ? 'defence' : 'attack']],
    });
    el.addEventListener('pointerdown', () => this.state === 'loading' && this.showDraft());
    this.setScreen(el);
    window.setTimeout(() => this.state === 'loading' && this.screen === el && this.showDraft(), 2600);
  }

  /** Wild card draft: your squad picks one of three face-down cards; the opponents pick too. */
  private showDraft() {
    this.state = 'draft';
    this.hud.root.style.display = 'none';
    this.setOverlay(null);
    const m = this.match;
    const rng = new Rng((m.cfg.seed ^ ((m.roundIndex + 1) * 7907)) >>> 0);
    const rand = () => rng.next();
    const hand = dealCards(rand, m.cards[0]);
    // opponents favour levelling what they have, then flashier cards
    const enemyHand = dealCards(rand, m.cards[1]);
    const enemyPick = enemyHand
      .map((id) => ({ id, s: (m.cards[1][id] ? 1.5 : 0) + (cardById(id).rarity === 'epic' ? 1.2 : cardById(id).rarity === 'rare' ? 0.6 : 0) + rand() }))
      .sort((a, b) => b.s - a.s)[0].id;
    const side = m.playerSide();
    const mates = SIDE_SQUADS[side].filter((o) => o !== (this.lastPick?.op ?? SIDE_SQUADS[side][0])).slice(0, 2);
    const votes = mates.map((op) => ({ look: lookOf(op), name: displayName(op), pick: Math.floor(rand() * hand.length) }));
    this.setScreen(
      draftScreen(
        { round: m.roundIndex, hand, owned: m.cards[0], enemyOwned: m.cards[1], votes, seconds: 20 },
        {
          flip: () => this.ctx.sfx.play('card_flip'),
          tap: () => this.click(),
          play: (id) => {
            this.ctx.sfx.play('card_play');
            m.addCard(0, id);
            m.addCard(1, enemyPick);
            const el = enemyRevealScreen(enemyPick, m.cards[1][enemyPick] ?? 1);
            el.addEventListener('pointerdown', () => this.state === 'draft' && this.showOpSelect());
            this.setScreen(el);
            window.setTimeout(() => this.state === 'draft' && this.screen === el && this.showOpSelect(), 1900);
          },
        },
      ),
    );
  }

  private showOpSelect() {
    this.state = 'opselect';
    this.hud.root.style.display = 'none';
    this.setOverlay(null);
    const m = this.match;
    const side = m.playerSide();
    const ops = SIDE_SQUADS[side];
    const prev = this.lastPick && ops.includes(this.lastPick.op) ? this.lastPick : null;
    const initialOp = prev?.op ?? ops.find((o) => PLAYABLE_SIGNATURE[side].includes(o)) ?? ops[0];
    const locked = OPERATORS.filter((o) => o.side === side && !ops.includes(o.id)).map((o) => ({ id: o.id, name: o.name }));
    this.ctx.sfx.play('prep_start');
    this.setScreen(
      S.opSelectScreen(
        { round: m.roundIndex, side, ops, locked, initial: { op: initialOp, weapon: prev?.weapon ?? OP_INFO[initialOp].weapons[0] }, seconds: 20, score: m.score },
        {
          tap: () => this.click(),
          confirm: (r) => {
            this.click('confirm');
            const pick: RoundPick = { op: r.op, weapon: r.weapon, entry: this.lastPick?.entry ?? 'front' };
            if (side === 'attack') this.showSpawnSelect(pick);
            else this.beginRound(pick);
          },
        },
      ),
    );
  }

  private showSpawnSelect(pick: RoundPick) {
    this.state = 'spawn';
    const map = this.match.world.map;
    this.setScreen(
      S.spawnSelectScreen(
        { map, mapCanvas: bakeMap(map), initial: pick.entry ?? 'front', seconds: 12 },
        {
          tap: () => this.click(),
          confirm: (entry) => {
            this.click('confirm');
            this.beginRound({ ...pick, entry });
          },
        },
      ),
    );
  }

  // ---------- round lifecycle ----------

  private beginRound(pick: RoundPick) {
    this.lastPick = pick;
    const m = this.match;
    m.startRound(pick);
    this.setScreen(null);
    this.setOverlay(null);
    this.closeBoard();
    this.closeOrders();
    this.ctx.view.attach(m.world);
    this.ctx.view.fit();
    this.hud.root.style.display = '';
    this.hud.elim(null);
    this.stepper.reset();
    this.input.controls.reset();
    this.callouts.clear();
    this.fb.reset();
    this.scoring.newRound();
    this.playerPts = 0;
    this.deadAt = -1;
    this.takeoverAuto = -1;
    this.roundEndAt = -1;
    this.camIdx = 0;
    this.state = 'playing';
    this.ctx.sfx.setMusic('calm');
    this.ctx.sfx.setAmbience(true);
    const side = m.world.sideOf(0);
    this.hud.banner(side === 'attack' ? 'ATTACK' : 'DEFENCE', side === 'attack' ? 'PREPARATION · DRONE PHASE' : 'PREPARATION · FORTIFY THE OFFICE', 2000, side);
    this.setupHints(side);
  }

  /** Restart the current round from its start (same pick), score untouched. */
  private restartRound() {
    if (!this.lastPick) return;
    this.beginRound(this.lastPick);
  }

  private onHumanDeath(killerId: number) {
    const w = this.match.world;
    this.input.controls.reset();
    this.closeOrders();
    if (w.phase === 'ended') return;
    this.state = 'dead';
    this.deadAt = this.realTime;
    this.killerId = killerId;
    const k = w.actor(killerId);
    const h = w.human();
    const mates = w.alive(0).length;
    this.hud.elim({
      by: k ? k.name : 'THE BREACH',
      byLook: k ? k.look : null,
      weapon: k ? (k.weapon.id === 'smg' ? 'POCKET SMG' : k.weapon.id.toUpperCase()) : '',
      dist: k && h ? dist(k.pos, h.pos) : 0,
      sub: mates > 0 ? 'Taking over a teammate…' : 'Your squad is down',
    });
  }

  private openTakeover() {
    const w = this.match.world;
    const mates = w.actors.filter((a) => a.team === 0 && a.alive);
    if (!mates.length || w.phase === 'ended') return;
    this.state = 'takeover';
    this.hud.elim(null);
    this.takeoverAuto = this.realTime + 2.2;
    this.ctx.sfx.play('takeover');
    const note = (id: number) => {
      const a = w.actor(id)!;
      return `${a.mag}/${a.reserve}${a.gadgetCharges > 0 ? ' · gadget' : ''}`;
    };
    this.setOverlay(S.takeoverPicker(mates.map((a) => ({ id: a.id, name: a.name, look: a.look, hp: a.hp, note: note(a.id) })), (id) => this.pickTakeover(id)));
  }

  private pickTakeover(id: number) {
    const m = this.match;
    this.setOverlay(null);
    this.takeoverAuto = -1;
    if (!m.world.takeOver(id)) return;
    m.ai.clearFor(id);
    this.input.controls.reset();
    this.fb.stats.takeovers++;
    this.hud.elim(null);
    this.state = 'playing';
    this.stepper.reset();
    const a = m.world.actor(id)!;
    this.hud.banner(`NOW PLAYING ${a.name}`, `${a.hp} HP`, 1200, 'small');
    this.click('confirm');
  }

  private showRoundEnd() {
    const m = this.match;
    const w = m.world;
    if (!w.result) return;
    this.state = 'roundend';
    this.input.controls.reset();
    this.closeBoard();
    this.closeOrders();
    this.hud.root.style.display = 'none';
    this.hud.elim(null);
    this.setOverlay(null);
    const win = w.result.winner === 0;
    const last = m.matchOver;
    const pts = this.scoring.pointsMap();
    const hid = w.human()?.id ?? -1;
    const perf = { points: this.playerPts, rank: ScoreTracker.rank(this.playerPts), medals: this.scoring.medals(w, hid, S.mvpOf(w, pts)) };
    const el = S.roundEndScreen({ win, reason: REASON_TEXT[w.result.reason] ?? w.result.reason, highlight: this.fb.highlight(w), w, score: m.score, humanId: hid, nextLabel: last ? 'MATCH RESULTS' : 'NEXT ROUND', pts, perf }, { next: () => this.nextRound() });
    this.setScreen(el);
    const token = w;
    window.setTimeout(() => {
      if (this.match.world === token && this.state === 'roundend') this.nextRound();
    }, 9000);
  }

  private totals = new Map<string, { name: string; look: string; k: number; d: number; a: number; me: boolean }>();

  private accumulate(w: World) {
    for (const a of w.actors) {
      if (a.team !== 0) continue;
      const t = this.totals.get(a.operatorId) ?? { name: a.name, look: a.look, k: 0, d: 0, a: 0, me: false };
      t.k += a.kills;
      t.d += a.deaths;
      t.a += a.assists;
      t.me = t.me || a.operatorId === this.lastPick?.op;
      this.totals.set(a.operatorId, t);
    }
  }

  private nextRound() {
    const m = this.match;
    this.click('confirm');
    this.accumulate(m.world);
    this.matchPts += this.playerPts;
    this.playerPts = 0;
    if (m.matchOver) return this.showMatchEnd();
    m.nextRound();
    this.showDraft();
  }

  private showMatchEnd() {
    const m = this.match;
    this.state = 'matchend';
    this.hud.root.style.display = 'none';
    this.ctx.sfx.setMusic('calm');
    if (!this.ctx.settings.tutorialDone) {
      this.ctx.settings.tutorialDone = true;
      saveSettings(this.ctx.settings);
    }
    const win = m.score[0] > m.score[1];
    this.ctx.sfx.play(win ? 'round_win' : 'round_lose');
    const lines = m.rounds.map((r) => ({ side: r.playerSide === 'attack' ? 'ATTACK' : 'DEFENCE', won: r.winner === 0, reason: REASON_TEXT[r.reason] ?? r.reason }));
    this.setScreen(
      S.matchEndScreen(
        { win, score: m.score, lines, totals: [...this.totals.values()].sort((a, b) => b.k - a.k), points: this.matchPts },
        {
          rematch: () => {
            this.click('confirm');
            const cfg = { ...this.opts.cfg, seed: (Math.random() * 1e9) >>> 0 };
            this.match = new Match(cfg);
            this.totals.clear();
            this.matchPts = 0;
            this.scoring = new ScoreTracker();
            this.lastPick = null;
            this.showDraft();
          },
          home: () => (this.click('back'), this.ctx.home()),
        },
      ),
    );
  }

  // ---------- pause, scoreboard, orders ----------

  pause(note: string) {
    if (this.state !== 'playing' && this.state !== 'spectate' && this.state !== 'dead' && this.state !== 'takeover') return;
    this.pauseReturn = this.state;
    this.state = 'paused';
    this.input.controls.reset();
    this.closeOrders();
    this.showPause(note);
  }

  private showPause(note: string) {
    this.setScreen(
      S.pauseScreen(
        {
          resume: () => this.resume(),
          restart: () => (this.click('confirm'), this.restartRound()),
          settings: () =>
            this.setScreen(
              S.settingsOverlay(
                settingsPanel(this.ctx.settings, () => {
                  this.ctx.settingsChanged();
                  this.callouts.enabledSoundCaptions = this.ctx.settings.captions;
                  this.click();
                }),
                () => (this.click('back'), this.showPause(note)),
              ),
            ),
          quit: () => (this.click('back'), this.ctx.home()),
        },
        (note ? note + ' ' : '') + `${this.match.score[0]} – ${this.match.score[1]} · Round ${this.match.roundIndex + 1}`,
      ),
    );
  }

  private resume() {
    if (this.state !== 'paused') return;
    this.click('confirm');
    this.setScreen(null);
    this.input.controls.reset();
    this.stepper.reset();
    this.state = this.pauseReturn;
  }

  escape() {
    if (this.input.controls.escape()) return;
    if (this.board) return this.closeBoard();
    if (this.state === 'paused') this.resume();
    else this.pause('');
  }

  private toggleBoard() {
    if (this.board) return this.closeBoard();
    const w = this.match.world;
    this.board = h('div', { class: 'board-pop' }, S.scoreboard(w, this.match.score, w.human()?.id ?? -1, 'SCOREBOARD', this.scoring.pointsMap()));
    this.board.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.closeBoard();
    });
    this.ctx.ui.appendChild(this.board);
  }

  private closeBoard() {
    this.board?.remove();
    this.board = null;
  }

  private toggleOrders() {
    if (this.orders) return this.closeOrders();
    if (this.state !== 'playing') return;
    const give = (o: Order, label: string) => {
      const w = this.match.world;
      for (const a of w.actors) if (a.team === 0 && a.alive && a.controller === 'bot') this.match.ai.setOrder(a.id, o.kind === 'hold' ? { kind: 'hold', pos: { ...a.pos } } : o);
      this.hud.toast(`SQUAD: ${label}`, true);
      this.click('confirm');
      this.closeOrders();
    };
    const btn = (icon: Parameters<typeof iconImg>[0], label: string, o: Order) => {
      const b = h('button', { class: 'ord-btn' }, iconImg(icon), label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        give(o, label);
      });
      return b;
    };
    this.orders = h('div', { class: 'orders' }, h('div', { class: 'ord-title' }, 'SQUAD ORDERS'), btn('follow', 'FOLLOW ME', { kind: 'follow' }), btn('hold', 'HOLD HERE', { kind: 'hold', pos: { x: 0, y: 0 } }), btn('push', 'PUSH OBJECTIVE', { kind: 'push' }), btn('auto', 'AUTO', { kind: 'auto' }));
    this.hud.root.appendChild(this.orders);
  }

  private closeOrders() {
    this.orders?.remove();
    this.orders = null;
  }

  // ---------- drone cams ----------

  private droneMode(w: World): boolean {
    const h = w.human();
    return this.state === 'playing' && w.phase === 'prep' && w.sideOf(0) === 'attack' && !!h && h.alive && this.input.teamDrones(w).length > 0;
  }

  private nextCam() {
    const w = this.match.world;
    const n = this.input.teamDrones(w).length;
    if (!this.droneMode(w) || n < 2) return;
    this.camIdx = (this.camIdx + 1) % n;
    this.click();
  }

  private droneUi(w: World): { ui: DroneUi; id: number; own: boolean } | null {
    if (!this.droneMode(w)) return null;
    const drones = this.input.teamDrones(w);
    if (this.camIdx >= drones.length) this.camIdx = 0;
    const d = drones[this.camIdx];
    const h = w.human()!;
    const owner = w.actor(d.ownerId)!;
    const own = d.ownerId === h.id;
    return { id: d.id, own, ui: { slot: d.slot, owner: owner.name, own, left: own ? h.drones : owner.drones, tagReady: w.tick >= h.tagReadyTick, camIndex: this.camIdx, camCount: drones.length } };
  }

  // ---------- hints ----------

  private setupHints(side: 'attack' | 'defence') {
    this.hints = [];
    if (this.ctx.settings.tutorialDone) return;
    const c = this.input.controls;
    const touch = () => c.usingTouch || 'ontouchstart' in window;
    const prepDrone = (w: World) => w.phase === 'prep' && side === 'attack';
    if (side === 'attack') {
      this.hints.push({ id: 'drive', text: touch() ? 'DRONE: drive with the LEFT stick to find the objective' : 'DRONE: drive with W A S D to find the objective', when: (w) => c.movedOnce || w.phase !== 'prep' });
      this.hints.push({ id: 'tag', text: touch() ? 'Tap TAG to ping every defender your drone can see' : 'Press F to ping every defender your drone can see', when: (w) => this.fb.done.has('tag') || w.phase !== 'prep' });
    }
    this.hints.push({ id: 'move', text: touch() ? 'Drag on the LEFT side to move' : 'Move with W A S D', when: () => c.movedOnce, show: (w) => !prepDrone(w) });
    this.hints.push({ id: 'aim', text: touch() ? 'Drag on the RIGHT side to aim · hold FIRE to shoot (drag it to steer)' : 'Aim with the mouse · left click fires · right click aims down sights', when: () => c.aimedOnce && c.firedOnce, show: (w) => !prepDrone(w) });
    if (side === 'attack') {
      this.hints.push({ id: 'sled', text: touch() ? 'Hold GADGET and drag toward a dashed wall — release to send the sled' : 'Hold Q, aim at a dashed wall, release to send the sled', when: (w) => this.fb.done.has('sled') || w.human()?.operatorId !== 'ram', show: (w) => w.phase !== 'prep' });
      this.hints.push({ id: 'brake', text: 'Tap GADGET again to brake — the sled unfolds into cover', when: () => this.fb.done.has('brake'), show: (w) => w.entities.some((e) => e.kind === 'sled' && e.ownerId === w.human()?.id) });
      this.hints.push({ id: 'arm', text: 'At the office console, hold INTERACT for 3s to arm it', when: (w) => w.phase === 'armed' });
    } else {
      this.hints.push({ id: 'reinforce', text: 'Stand at a dashed wall and hold INTERACT to reinforce it', when: (w) => this.fb.done.has('reinforce') || w.phase !== 'prep' });
      this.hints.push({ id: 'place', text: touch() ? 'Hold GADGET and drag to place the pivot wall' : 'Hold Q and point to place the pivot wall', when: (w) => this.fb.done.has('place') || w.human()?.operatorId !== 'hinge' });
      this.hints.push({ id: 'rotate', text: 'Tap GADGET to swing the wall — close one angle, open another', when: (w) => this.fb.done.has('rotate') || w.human()?.operatorId !== 'hinge' });
    }
  }

  private updateHints(w: World) {
    while (this.hints.length && this.hints[0].when(w)) this.hints.shift();
    const step = this.hints[0];
    const ok = step && w.human()?.alive && this.state === 'playing' && (!step.show || step.show(w));
    this.hud.hint(ok ? step.text : null);
  }

  // ---------- main loop ----------

  frame(dt: number) {
    this.realTime += dt;
    this.input.tick(dt);
    const m = this.match;
    const w = m.world;
    const view = this.ctx.view;
    const live = this.state === 'playing' || this.state === 'spectate' || this.state === 'dead' || this.state === 'takeover';
    if (live) {
      const devSpeed = import.meta.env.DEV ? Number(this.ctx.debug.speed) || 1 : 1;
      const speed = (this.state === 'spectate' ? 2 : 1) * devSpeed;
      if (this.hitstop > 0) this.hitstop -= dt;
      else this.stepper.advance(dt * speed, () => this.tick(), 6 * Math.ceil(speed));
    }
    if (this.state === 'dead' && this.realTime - this.deadAt > 1.8) {
      if (w.alive(0).length > 0) this.openTakeover();
      else {
        this.state = 'spectate';
        this.hud.elim(null);
        this.hud.banner('SPECTATING', 'Your squad is down', 1600, 'small');
      }
    }
    if (this.state === 'takeover' && this.takeoverAuto > 0 && this.realTime >= this.takeoverAuto) {
      const first = w.actors.find((a) => a.team === 0 && a.alive);
      if (first) this.pickTakeover(first.id);
    }
    if (this.roundEndAt > 0 && this.realTime >= this.roundEndAt && this.state !== 'paused') {
      this.roundEndAt = -1;
      this.showRoundEnd();
    }
    if (this.state === 'loading' || this.state === 'opselect' || this.state === 'spawn' || this.state === 'matchend') {
      view.render(0, dt, { humanId: -1, preview: { kind: 'none' }, focus: w.map.console.center, droneId: null, ads: false, laser: null });
      return;
    }

    const human = w.human();
    const humanId = human?.id ?? -1;
    const drone = this.droneUi(w);
    if (human) {
      const scr = view.worldToScreen(human.pos);
      this.input.controls.playerScreen = { x: scr.x, y: scr.y - 8 * this.ctx.scene.cameras.main.zoom };
      this.input.controls.mouseWorld = view.screenToWorld(this.input.controls.mouseScreen.x, this.input.controls.mouseScreen.y);
    }
    let focus: Vec | null = null;
    if (drone) {
      const d = w.entities.find((e) => e.id === drone.id);
      if (d && d.kind === 'drone') focus = d.pos;
    } else if (this.state === 'dead') {
      // look at whoever got you (if the team can see them), otherwise your body
      const k = w.actor(this.killerId);
      focus = k && k.alive && w.visible[0].has(k.id) ? k.pos : human?.pos ?? null;
    } else if (this.state === 'spectate') {
      const mate = w.alive(0)[0];
      focus = mate ? mate.pos : w.map.console.center;
    } else if (human && !human.alive) focus = human.pos;
    const playing = this.state === 'playing' && !!human?.alive && !drone;
    view.render(this.stepper.alpha, dt, {
      humanId,
      preview: playing ? this.input.preview() : { kind: 'none' },
      focus,
      droneId: drone?.id ?? null,
      ads: playing && !!human?.ads,
      laser: playing ? human!.facing : null,
    });
    this.hud.setMode(drone ? 'drone' : this.state === 'dead' || this.state === 'takeover' ? 'dead' : this.state === 'spectate' ? 'spectate' : 'play');
    this.hud.root.classList.toggle('previewing', this.input.controls.gadget.active);
    const interact = human && human.alive && !drone ? bestInteract(w, human) : null;
    this.hud.setPoints(this.playerPts);
    this.hud.update({ w, humanId, score: m.score, round: m.roundIndex, statuses: this.statuses(), interact, gadget: drone ? null : this.input.gadgetUi(), ads: !!human?.ads, drone: drone?.ui ?? null, cards: w.cards, charges: w.cardCharges[0] });
    this.updateHints(w);
  }

  private statuses(): Map<number, string> {
    const out = new Map<number, string>();
    for (const [id, b] of this.match.ai.bots) out.set(id, b.status);
    return out;
  }

  /** One fixed simulation tick. */
  private tick() {
    const m = this.match;
    const w = m.world;
    if (w.phase === 'ended') return;
    let intent: ActorIntent | null = null;
    const h = w.human();
    if (this.state === 'playing' && h && h.alive) {
      const drone = this.droneUi(w);
      intent = this.input.produce(w, !!drone);
      // viewing a teammate's drone: yours sits still
      if (drone && !drone.own && intent.drone) intent.drone = { move: { x: 0, y: 0 }, tag: false };
      if (import.meta.env.DEV && this.ctx.debug.autopilot) intent = m.ai.intentFor(h.id);
      else setAutopilot(h, false);
    }
    const ended = m.step(intent);
    const events = w.events;
    this.ctx.view.onEvents(events);
    this.fb.handle(w, events);
    this.callouts.onTick(w, events, w.human()?.id ?? -1, this.statuses());
    this.scoring.handle(w, events);
    const hid = w.human()?.id ?? -1;
    for (const aw of this.scoring.awards)
      if (aw.actorId === hid) {
        this.playerPts += aw.points;
        this.hud.pointsPop(aw.label, aw.points, aw.combo);
      }
    for (const an of this.scoring.announces) {
      const own = w.actor(an.actorId)?.team === 0;
      this.hud.announce(an.text, an.sub, own ? an.tier : 1, !own);
      this.ctx.sfx.play(own ? (`stinger${an.tier}` as 'stinger1') : 'stinger1', { volume: own ? 1 : 0.5 });
    }
    if (ended) {
      const win = w.result!.winner === 0;
      // last kill of the round gets the slow-motion close-up
      const last = [...events].reverse().find((e) => e.type === 'death');
      if (last && last.type === 'death') {
        const v = w.actor(last.actorId);
        if (v && (v.team === 0 || w.visible[0].has(v.id) || last.killerId === w.human()?.id)) this.ctx.view.finalKill(v.pos);
      }
      this.hud.banner(win ? 'ROUND WON' : 'ROUND LOST', REASON_TEXT[w.result!.reason] ?? '', 2000, win ? 'win' : 'lose');
      this.ctx.sfx.play(win ? 'round_win' : 'round_lose');
      this.roundEndAt = this.realTime + 2.2;
      this.input.controls.reset();
      // the round result replaces any death or takeover prompt
      this.hud.elim(null);
      this.setOverlay(null);
      if (this.state === 'dead' || this.state === 'takeover') this.state = 'spectate';
    }
  }
}
