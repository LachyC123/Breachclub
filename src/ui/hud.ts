// In-match HUD (DOM over the pixel world). Tactical-shooter layout:
// top strip = squads, score, round clock and phase; top-right kill feed; bottom-left vitals;
// right thumb cluster = FIRE / ADS / RELOAD / GADGET / INTERACT (TAG / NEXT CAM while droning).
import { h, iconImg, icon, portrait } from './dom';
import type { IconName } from '../render/art/gadgets';
import type { World } from '../sim/world';
import type { InteractOption, TeamId } from '../sim/types';

export interface GadgetUi {
  icon: IconName;
  label: string;
  pips: number;
  pipsMax: number;
  enabled: boolean;
  cooldown: number; // 0..1 remaining
}

export interface DroneUi {
  /** which drone of the owner (1 or 2), and how many the owner had */
  slot: number;
  owner: string;
  own: boolean;
  left: number;
  tagReady: boolean;
  /** "DRONE 1/3" camera index among all live team drones */
  camIndex: number;
  camCount: number;
}

export type HudMode = 'play' | 'drone' | 'dead' | 'spectate';

export interface HudState {
  w: World;
  humanId: number;
  score: [number, number];
  round: number;
  statuses: Map<number, string>;
  interact: InteractOption | null;
  gadget: GadgetUi | null;
  ads: boolean;
  drone: DroneUi | null;
  /** shooting range: hide round clock and score */
  range?: boolean;
}

const WEAPON_NAME: Record<string, string> = { smg: 'POCKET SMG', carbine: 'CARBINE', scattergun: 'SCATTERGUN' };
const PHASE_NAME: Record<string, string> = { prep: 'PREPARATION', action: 'ACTION', armed: 'TRANSMITTER ARMED', ended: 'ROUND OVER' };

function ring(r: number) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('viewBox', '0 0 100 100');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '50');
  c.setAttribute('cy', '50');
  c.setAttribute('r', String(r));
  c.setAttribute('fill', 'none');
  c.setAttribute('stroke-width', '6');
  c.setAttribute('stroke-dasharray', `${2 * Math.PI * r}`);
  c.setAttribute('stroke-dashoffset', `${2 * Math.PI * r}`);
  c.setAttribute('transform', 'rotate(-90 50 50)');
  svg.appendChild(c);
  return { svg, c, len: 2 * Math.PI * r };
}

function act(cls: string, ic: IconName, label: string, extra: Array<Node> = []): HTMLElement {
  return h('div', { class: `act ${cls}` }, iconImg(ic), h('span', {}, label), ...extra);
}

export class Hud {
  root: HTMLElement;
  touch: HTMLElement;
  moveStick: HTMLElement;
  aimStick: HTMLElement;
  cancelZone: HTMLElement;
  fireBtn: HTMLElement;
  adsBtn: HTMLElement;
  reloadBtn: HTMLElement;
  gadgetBtn: HTMLElement;
  interactBtn: HTMLElement;
  tagBtn: HTMLElement;
  slideBtn: HTMLElement;
  nextBtn: HTMLElement;
  pauseBtn: HTMLElement;
  boardBtn: HTMLElement;
  ordersBtn: HTMLElement;
  readyBtn: HTMLElement;
  private cluster: HTMLElement;
  private teamL: HTMLElement;
  private teamR: HTMLElement;
  private scoreL: HTMLElement;
  private scoreR: HTMLElement;
  private clock: HTMLElement;
  private phase: HTMLElement;
  private roundEl: HTMLElement;
  private objective: HTMLElement;
  private resources: HTMLElement;
  private feed: HTMLElement;
  private vitals: HTMLElement;
  private vPortrait: HTMLImageElement;
  private vName: HTMLElement;
  private vHp: HTMLElement;
  private vBar: HTMLElement;
  private ammo: HTMLElement;
  private vignette: HTMLElement;
  private toastEl: HTMLElement;
  private hintEl: HTMLElement;
  private dmg: HTMLElement;
  private droneCam: HTMLElement;
  private droneLabel: HTMLElement;
  private droneSub: HTMLElement;
  private elimEl: HTMLElement;
  private hurtEl: HTMLElement;
  private popEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboTimer = 0;
  private ptsEl: HTMLElement;
  private announceEl: HTMLElement;
  private interactRing: ReturnType<typeof ring>;
  private gadgetRing: ReturnType<typeof ring>;
  private tagRing: ReturnType<typeof ring>;
  private cache = new Map<string, string>();
  private toastTimer = 0;
  private icons = new Map<number, { el: HTMLElement; bar: HTMLElement }>();
  private iconsWorld = -1;
  mode: HudMode = 'play';

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'hud' });
    this.touch = h('div', { class: 'touch-layer' });
    this.moveStick = h('div', { class: 'stick' }, h('i'));
    this.aimStick = h('div', { class: 'stick aim' }, h('i'));
    this.cancelZone = h('div', { class: 'cancel-zone' }, 'DRAG HERE TO CANCEL');

    // ---- top strip ----
    this.teamL = h('div', { class: 'team-icons left' });
    this.teamR = h('div', { class: 'team-icons right' });
    this.scoreL = h('div', { class: 'tscore left' }, '0');
    this.scoreR = h('div', { class: 'tscore right' }, '0');
    this.clock = h('div', { class: 'clock' }, '0:00');
    this.roundEl = h('div', { class: 'round-no' }, 'ROUND 1');
    this.phase = h('div', { class: 'phase' }, 'PREPARATION');
    const timer = h('div', { class: 'timer' }, this.roundEl, this.clock);
    this.objective = h('div', { class: 'objective' });
    this.resources = h('div', { class: 'resources' });
    this.readyBtn = h('button', { class: 'chip-btn' }, 'SKIP PREP');
    const top = h('div', { class: 'topstrip' }, h('div', { class: 'strip' }, this.teamL, this.scoreL, timer, this.scoreR, this.teamR), this.phase, this.objective, h('div', { class: 'prep-row' }, this.resources, this.readyBtn));

    // ---- top-left system buttons ----
    this.pauseBtn = h('button', { class: 'sys-btn', 'aria-label': 'Pause' }, iconImg('pause'));
    this.boardBtn = h('button', { class: 'sys-btn', 'aria-label': 'Scoreboard' }, iconImg('scoreboard'));
    this.ordersBtn = h('button', { class: 'sys-btn', 'aria-label': 'Squad orders' }, iconImg('orders'));
    const sys = h('div', { class: 'sys' }, this.pauseBtn, this.boardBtn, this.ordersBtn);

    this.feed = h('div', { class: 'killfeed' });

    // ---- vitals ----
    this.vPortrait = h('img', { class: 'pix', alt: '' }) as HTMLImageElement;
    this.vName = h('div', { class: 'v-name' });
    this.vHp = h('div', { class: 'v-hp' }, '100');
    this.vBar = h('i');
    this.vitals = h('div', { class: 'vitals' }, h('div', { class: 'v-port' }, this.vPortrait), h('div', { class: 'v-col' }, this.vName, h('div', { class: 'v-row' }, this.vHp, h('div', { class: 'v-bar' }, this.vBar))));

    // ---- thumb cluster ----
    this.interactRing = ring(46);
    this.gadgetRing = ring(46);
    this.tagRing = ring(46);
    this.fireBtn = act('fire', 'fire', 'FIRE');
    this.adsBtn = act('ads', 'ads', 'ADS');
    this.reloadBtn = act('reload', 'reload', 'RELOAD');
    this.gadgetBtn = act('gadget', 'sled', 'GADGET', [h('div', { class: 'pips' }), this.gadgetRing.svg]);
    this.interactBtn = act('interact', 'arm', 'INTERACT', [this.interactRing.svg]);
    this.tagBtn = act('tag', 'tag', 'TAG', [this.tagRing.svg]);
    this.slideBtn = act('slide', 'slide', 'SLIDE');
    this.nextBtn = act('next', 'next', 'NEXT CAM');
    this.ammo = h('div', { class: 'ammo' });
    this.cluster = h('div', { class: 'cluster' }, this.slideBtn, this.interactBtn, this.gadgetBtn, this.reloadBtn, this.adsBtn, this.fireBtn, this.tagBtn, this.nextBtn, this.ammo);

    // ---- overlays ----
    this.vignette = h('div', { class: 'lowhp-vignette' });
    this.toastEl = h('div', { class: 'toast' });
    this.hintEl = h('div', { class: 'hint' });
    this.dmg = h('div', { class: 'dmg-dir' }, h('i'));
    this.droneLabel = h('div', { class: 'dc-title' }, 'DRONE');
    this.droneSub = h('div', { class: 'dc-sub' });
    this.droneCam = h('div', { class: 'dronecam' }, h('div', { class: 'dc-scan' }), h('div', { class: 'dc-corners' }), h('div', { class: 'dc-head' }, h('span', { class: 'rec' }), this.droneLabel, this.droneSub), h('div', { class: 'dc-reticle' }));
    this.elimEl = h('div', { class: 'elim' });
    this.hurtEl = h('div', { class: 'hurt-flash' });
    this.popEl = h('div', { class: 'kill-pops' });
    this.comboEl = h('div', { class: 'combo' });
    this.ptsEl = h('div', { class: 'pts-chip' }, '0 PTS');
    this.announceEl = h('div', { class: 'announcer' });

    this.root.append(this.touch, this.droneCam, this.hurtEl, this.popEl, this.comboEl, this.ptsEl, this.announceEl, this.vignette, this.dmg, this.moveStick, this.aimStick, top, sys, this.feed, this.vitals, this.cluster, this.toastEl, this.cancelZone, this.hintEl, this.elimEl);
    parent.appendChild(this.root);
    this.setMode('play');
  }

  destroy() {
    this.root.remove();
  }

  private set(key: string, val: string, fn: () => void) {
    if (this.cache.get(key) === val) return;
    this.cache.set(key, val);
    fn();
  }

  setMode(m: HudMode) {
    this.mode = m;
    this.root.dataset.mode = m;
  }

  toast(text: string, ok = false) {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('ok', ok);
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1700);
  }

  hint(text: string | null) {
    this.set('hint', text ?? '', () => {
      if (text) this.hintEl.textContent = text;
      this.hintEl.classList.toggle('show', !!text);
    });
  }

  damageFrom(screenAngle: number) {
    const i = this.dmg.firstElementChild as HTMLElement;
    this.dmg.style.transform = `rotate(${screenAngle + Math.PI / 2}rad)`;
    i.style.transition = 'none';
    i.style.opacity = '0.95';
    void i.offsetWidth;
    i.style.transition = 'opacity 800ms';
    i.style.opacity = '0';
  }

  /** red edge flash scaled by how hard you were hit */
  hurt(amount: number) {
    const el = this.hurtEl;
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(0.9, 0.25 + amount / 40));
    void el.offsetWidth;
    el.style.transition = 'opacity 450ms';
    el.style.opacity = '0';
  }

  /** Arcade point popup ("ELIMINATED DEX +125") with the current combo. */
  pointsPop(label: string, points: number, combo: number) {
    const big = label.startsWith('ELIMINATED') || points >= 100;
    const el = h('div', { class: `kpop ${big ? 'big' : ''}` }, h('b', {}, label), ' ', h('em', {}, `+${points}`));
    this.popEl.appendChild(el);
    while (this.popEl.children.length > 4) this.popEl.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => el.remove(), 1900);
    this.comboEl.textContent = combo >= 2 ? `COMBO ×${Math.min(2, 1 + (combo - 1) * 0.25).toFixed(2).replace(/0$/, '')}` : '';
    this.comboEl.classList.remove('pulse');
    void this.comboEl.offsetWidth;
    if (combo >= 2) this.comboEl.classList.add('pulse');
    clearTimeout(this.comboTimer);
    this.comboTimer = window.setTimeout(() => (this.comboEl.textContent = ''), 5000);
  }

  setPoints(n: number) {
    this.set('pts', String(n), () => (this.ptsEl.textContent = `${n.toLocaleString()} PTS`));
  }

  /** Announcer banner: FIRST BLOOD, DOUBLE KILL, ACE, CLUTCH ... enemy ones read smaller and red. */
  announce(text: string, sub: string, tier: 1 | 2 | 3, enemy: boolean) {
    const el = h('div', { class: `announce t${tier} ${enemy ? 'enemy' : ''}` }, h('div', { class: 'an-main' }, enemy ? `ENEMY ${text}` : text), sub ? h('div', { class: 'an-sub' }, sub) : null);
    this.announceEl.innerHTML = '';
    this.announceEl.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1400 + tier * 300);
    setTimeout(() => el.remove(), 1900 + tier * 300);
  }

  banner(text: string, sub = '', ms = 1600, cls = '') {
    const b = h('div', { class: `banner ${cls}` }, h('div', { class: 'b-main' }, text), sub ? h('div', { class: 'b-sub' }, sub) : null);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), ms);
  }

  /** Kill feed line: killer ▸ victim, coloured by the viewer's team (own = teal, enemy = coral). */
  killfeed(killer: string, kTeam: TeamId | -1, victim: string, vTeam: TeamId, weapon: string, mine: boolean) {
    const side = (t: TeamId | -1) => (t === 0 ? 'own' : t === 1 ? 'foe' : 'neutral');
    const el = h('div', { class: `kf ${mine ? 'mine' : ''}` }, h('b', { class: side(kTeam) }, killer), h('span', { class: 'kf-w' }, weapon), h('b', { class: side(vTeam) }, victim));
    this.feed.appendChild(el);
    while (this.feed.children.length > 5) this.feed.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 5200);
    setTimeout(() => el.remove(), 5600);
  }

  /** "ELIMINATED BY …" panel after the player goes down; null hides it. */
  elim(info: { by: string; byLook: string | null; weapon: string; dist: number; sub: string } | null) {
    this.elimEl.innerHTML = '';
    this.elimEl.classList.toggle('show', !!info);
    if (!info) return;
    this.elimEl.append(
      h('div', { class: 'e-top' }, 'YOU WERE ELIMINATED'),
      h(
        'div',
        { class: 'e-row' },
        info.byLook ? h('img', { class: 'pix', src: portrait(info.byLook), alt: '' }) : null,
        h('div', {}, h('div', { class: 'e-by' }, `BY ${info.by}`), h('div', { class: 'e-meta' }, info.weapon ? `${info.weapon} · ${info.dist.toFixed(0)}m` : '')),
      ),
      h('div', { class: 'e-sub' }, info.sub),
    );
  }

  update(s: HudState) {
    const { w, humanId } = s;
    const human = w.actor(humanId);
    const side = w.sideOf(0);
    this.root.classList.toggle('side-attack', side === 'attack');
    this.root.classList.toggle('side-defence', side === 'defence');
    this.root.classList.toggle('range', !!s.range);

    // ---- top strip ----
    const secs = Math.max(0, Math.ceil(w.secondsLeft()));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.set('clock', clock + w.phase, () => {
      this.clock.textContent = s.range ? 'RANGE' : clock;
      this.clock.classList.toggle('armed', w.phase === 'armed');
      this.clock.classList.toggle('low', w.phase !== 'prep' && secs <= 10);
    });
    this.set('phase', w.phase + side, () => {
      this.phase.textContent = s.range ? 'TRAINING GROUNDS' : PHASE_NAME[w.phase] ?? '';
      this.phase.className = `phase ${w.phase}`;
    });
    this.set('round', String(s.round), () => (this.roundEl.textContent = s.range ? 'FREE' : `ROUND ${s.round + 1}`));
    this.set('score', `${s.score[0]}-${s.score[1]}`, () => {
      this.scoreL.textContent = String(s.score[0]);
      this.scoreR.textContent = String(s.score[1]);
    });
    let obj = '';
    if (s.range) obj = 'Shoot targets · breach the practice house · arm the console';
    else if (w.phase === 'prep') obj = side === 'attack' ? (w.objectiveFound[0] ? 'Objective located — tag defenders' : 'Find the objective with your drone') : 'Reinforce walls · barricade doors · set your gadget';
    else if (w.phase === 'action') obj = side === 'attack' ? 'Arm the transmitter console in the office' : 'Defend the office console';
    else if (w.phase === 'armed') obj = side === 'attack' ? 'Protect the console until the broadcast completes' : 'Shut off the console!';
    this.set('obj', obj, () => (this.objective.textContent = obj));
    const res = w.resources[0];
    const resTxt = w.phase === 'prep' && side === 'defence' && !s.range ? `REINFORCE ${res.reinforcements} · BARRICADES ${res.barricades}` : '';
    this.set('res', resTxt, () => {
      this.resources.textContent = resTxt;
      this.resources.style.display = resTxt ? '' : 'none';
    });
    this.set('ready', String(w.phase === 'prep' && !s.range), () => (this.readyBtn.style.display = w.phase === 'prep' && !s.range ? '' : 'none'));

    // squad icons: own team left, opponents right
    if (this.iconsWorld !== w.uid) {
      this.iconsWorld = w.uid;
      for (const k of [...this.cache.keys()]) if (k.startsWith('i')) this.cache.delete(k);
      this.teamL.innerHTML = '';
      this.teamR.innerHTML = '';
      this.icons.clear();
      for (const a of w.actors) {
        const bar = h('i');
        const el = h('div', { class: `ticon ${a.team === 0 ? 'own' : 'foe'}` }, h('img', { class: 'pix', src: portrait(a.look), alt: a.name }), h('div', { class: 'tbar' }, bar));
        (a.team === 0 ? this.teamL : this.teamR).appendChild(el);
        this.icons.set(a.id, { el, bar });
      }
    }
    for (const a of w.actors) {
      const ic = this.icons.get(a.id)!;
      const hp = a.team === 0 ? a.hp : 100;
      this.set(`i${a.id}`, `${a.alive}|${hp}|${a.id === humanId}`, () => {
        ic.el.classList.toggle('dead', !a.alive);
        ic.el.classList.toggle('me', a.id === humanId);
        ic.bar.style.width = `${a.alive ? hp : 0}%`;
      });
    }

    // ---- vitals ----
    if (human) {
      this.set('vlook', human.look + human.name, () => {
        this.vPortrait.src = portrait(human.look);
        this.vName.textContent = human.name;
      });
      this.set('vhp', `${human.hp}`, () => {
        this.vHp.textContent = String(Math.max(0, human.hp));
        this.vBar.style.width = `${Math.max(0, human.hp)}%`;
        this.vitals.classList.toggle('low', human.hp <= 35);
        this.vignette.style.opacity = human.alive && human.hp <= 35 ? '1' : '0';
      });
      const rl = human.reloadUntil >= 0;
      this.set('ammo', `${human.mag}|${human.reserve}|${rl}|${human.weapon.id}`, () => {
        this.ammo.innerHTML = '';
        this.ammo.append(
          h('span', { class: `mag ${human.mag === 0 ? 'empty' : human.mag <= human.weapon.magazine * 0.25 ? 'lowmag' : ''}` }, String(human.mag)),
          h('span', { class: 'res' }, ` / ${human.reserve}`),
          h('span', { class: 'wname' }, rl ? 'RELOADING' : WEAPON_NAME[human.weapon.id] ?? human.weapon.name),
        );
        this.reloadBtn.classList.toggle('urgent', human.mag === 0 && !rl);
      });
    }
    this.set('ads', String(s.ads), () => this.adsBtn.classList.toggle('on', s.ads));
    const slideReady = !!human && w.tick >= human.slideReadyTick;
    this.set('slide', String(slideReady), () => this.slideBtn.classList.toggle('disabled', !slideReady));

    // ---- contextual interact ----
    const ik = s.interact ? `${s.interact.kind}|${s.interact.enabled}|${s.interact.label}` : 'none';
    this.set('interact', ik, () => {
      const img = this.interactBtn.querySelector('img') as HTMLImageElement;
      const span = this.interactBtn.querySelector('span') as HTMLElement;
      const it = s.interact;
      this.interactBtn.classList.toggle('hidden', !it);
      if (!it) return;
      const map: Record<string, IconName> = { arm: 'arm', shutoff: 'shutoff', reinforce: 'reinforce', barricade: 'barricade', unbarricade: 'remove', breach: 'breach', vault: 'vault' };
      img.src = icon(map[it.kind] ?? 'arm');
      span.textContent = it.label.toUpperCase();
      this.interactBtn.classList.toggle('disabled', !it.enabled);
      this.interactBtn.classList.toggle('ready-glow', it.enabled && (it.kind === 'arm' || it.kind === 'shutoff'));
    });
    let prog = 0;
    if (human?.interaction) prog = Math.min(1, (w.tick - human.interaction.startTick) / human.interaction.durationTicks);
    this.set('iprog', prog.toFixed(2), () => {
      this.interactRing.c.setAttribute('stroke-dashoffset', String(this.interactRing.len * (1 - prog)));
      this.interactBtn.classList.toggle('active', prog > 0);
    });

    // ---- gadget ----
    const g = s.gadget;
    const gk = g ? `${g.icon}|${g.label}|${g.pips}|${g.enabled}|${g.cooldown.toFixed(2)}` : 'none';
    this.set('gadget', gk, () => {
      this.gadgetBtn.classList.toggle('hidden', !g);
      if (!g) return;
      (this.gadgetBtn.querySelector('img') as HTMLImageElement).src = icon(g.icon);
      (this.gadgetBtn.querySelector('span') as HTMLElement).textContent = g.label.toUpperCase();
      const pips = this.gadgetBtn.querySelector('.pips') as HTMLElement;
      pips.innerHTML = '';
      for (let i = 0; i < g.pipsMax; i++) pips.appendChild(h('i', { class: i < g.pips ? '' : 'used' }));
      this.gadgetBtn.classList.toggle('disabled', !g.enabled);
      this.gadgetRing.c.setAttribute('stroke-dashoffset', String(this.gadgetRing.len * (1 - g.cooldown)));
    });

    // ---- drone cam ----
    const d = s.drone;
    const dk = d ? `${d.slot}|${d.owner}|${d.own}|${d.left}|${d.tagReady}|${d.camIndex}|${d.camCount}` : 'none';
    this.set('drone', dk, () => {
      if (!d) return;
      this.droneLabel.textContent = `${d.own ? 'YOUR' : d.owner + "'S"} DRONE ${d.slot}/2`;
      this.droneSub.textContent = `CAM ${d.camIndex + 1}/${d.camCount}${d.own ? (d.left > 0 ? ` · ${d.left} SPARE` : ' · LAST DRONE') : ' · VIEW ONLY'}`;
      this.tagBtn.classList.toggle('disabled', !d.own || !d.tagReady);
      this.tagRing.c.setAttribute('stroke-dashoffset', String(d.tagReady ? 0 : this.tagRing.len));
      this.nextBtn.classList.toggle('disabled', d.camCount < 2);
    });
  }
}
