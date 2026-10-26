// In-match HUD in DOM: crisp scalable text over the pixel world, large touch targets.
import { h, iconImg, icon, portrait } from './dom';
import type { IconName } from '../render/art/gadgets';
import type { World } from '../sim/world';
import type { InteractOption } from '../sim/types';

export interface GadgetUi {
  icon: IconName;
  label: string;
  pips: number;
  pipsMax: number;
  enabled: boolean;
  cooldown: number; // 0..1 remaining
  reason?: string;
}

export class Hud {
  root: HTMLElement;
  touch: HTMLElement;
  moveStick: HTMLElement;
  aimStick: HTMLElement;
  cancelZone: HTMLElement;
  gadgetBtn: HTMLElement;
  interactBtn: HTMLElement;
  reloadBtn: HTMLElement;
  ordersBtn: HTMLElement;
  pauseBtn: HTMLElement;
  readyBtn: HTMLElement;
  private side: HTMLElement;
  private clock: HTMLElement;
  private score: HTMLElement;
  private objective: HTMLElement;
  private squad: HTMLElement;
  private ammo: HTMLElement;
  private hp: HTMLElement;
  private vignette: HTMLElement;
  private reason: HTMLElement;
  private resources: HTMLElement;
  private hintEl: HTMLElement;
  private dmg: HTMLElement;
  private cache = new Map<string, string>();
  private reasonTimer = 0;
  private interactRing: SVGCircleElement;
  private gadgetRing: SVGCircleElement;
  private mates = new Map<number, { el: HTMLElement; hp: HTMLElement; st: HTMLElement }>();
  private matesWorld = -1;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'hud' });
    this.touch = h('div', { class: 'touch-layer' });
    this.moveStick = h('div', { class: 'stick' }, h('i'));
    this.aimStick = h('div', { class: 'stick aim' }, h('i'));
    this.cancelZone = h('div', { class: 'cancel-zone' }, 'Drag here to cancel');
    this.side = h('span', { class: 'side attack' }, 'ATTACK');
    this.clock = h('span', { class: 'clock' }, '0:00');
    this.score = h('span', { class: 'score' }, '0 - 0');
    this.objective = h('div', { class: 'objective-line' });
    this.resources = h('div', { class: 'resources' });
    this.readyBtn = h('button', { class: 'btn teal' }, 'Ready');
    const top = h('div', { class: 'hud-top' }, h('div', { class: 'clockbox' }, this.side, this.clock, this.score), this.objective, this.resources);
    this.squad = h('div', { class: 'squad' });
    this.pauseBtn = h('button', { class: 'btn ghost', 'aria-label': 'Pause' }, iconImg('pause'));
    const tr = h('div', { class: 'topright' }, this.pauseBtn);
    const ring = (r: number) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ring');
      svg.setAttribute('viewBox', '0 0 100 100');
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '50');
      c.setAttribute('cy', '50');
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', '#eab85b');
      c.setAttribute('stroke-width', '7');
      c.setAttribute('stroke-dasharray', `${2 * Math.PI * r}`);
      c.setAttribute('stroke-dashoffset', `${2 * Math.PI * r}`);
      c.setAttribute('transform', 'rotate(-90 50 50)');
      svg.appendChild(c);
      return { svg, c };
    };
    const ir = ring(44);
    const gr = ring(44);
    this.interactRing = ir.c;
    this.gadgetRing = gr.c;
    this.interactBtn = h('div', { class: 'act big', style: 'right:0;bottom:0' }, iconImg('arm'), h('span', {}, 'Interact'), ir.svg);
    this.gadgetBtn = h('div', { class: 'act big', style: 'right:92px;bottom:8px' }, iconImg('sled'), h('span', {}, 'Gadget'), h('div', { class: 'pips' }), gr.svg);
    this.reloadBtn = h('div', { class: 'act small', style: 'right:12px;bottom:96px' }, iconImg('reload'), h('span', {}, 'Reload'));
    this.ordersBtn = h('div', { class: 'act small', style: 'right:186px;bottom:86px' }, iconImg('orders'), h('span', {}, 'Orders'));
    const actions = h('div', { class: 'actions' }, this.interactBtn, this.gadgetBtn, this.reloadBtn, this.ordersBtn);
    this.ammo = h('div', { class: 'ammo' });
    this.hp = h('div', { class: 'hp-me' }, h('i', { style: 'width:100%' }));
    this.vignette = h('div', { class: 'lowhp-vignette' });
    this.reason = h('div', { class: 'reason' });
    this.hintEl = h('div', { class: 'hint', style: 'opacity:0' });
    this.dmg = h('div', { class: 'dmg-dir' }, h('i'));
    const readyWrap = h('div', { class: 'prep-ready' }, this.readyBtn);
    this.root.append(this.touch, this.vignette, this.dmg, this.moveStick, this.aimStick, top, this.squad, tr, actions, this.ammo, this.hp, this.reason, this.cancelZone, this.hintEl, readyWrap);
    parent.appendChild(this.root);
  }

  destroy() {
    this.root.remove();
  }

  private set(key: string, val: string, fn: () => void) {
    if (this.cache.get(key) === val) return;
    this.cache.set(key, val);
    fn();
  }

  toast(text: string, ok = false) {
    this.reason.textContent = text;
    this.reason.classList.toggle('ok', ok);
    this.reason.classList.add('show');
    clearTimeout(this.reasonTimer);
    this.reasonTimer = window.setTimeout(() => this.reason.classList.remove('show'), 1600);
  }

  hint(text: string | null) {
    this.set('hint', text ?? '', () => {
      if (text) this.hintEl.textContent = text;
      this.hintEl.style.opacity = text ? '1' : '0';
    });
  }

  damageFrom(screenAngle: number) {
    const i = this.dmg.firstElementChild as HTMLElement;
    this.dmg.style.transform = `rotate(${screenAngle + Math.PI / 2}rad)`;
    i.style.transition = 'none';
    i.style.opacity = '0.9';
    void i.offsetWidth;
    i.style.transition = 'opacity 700ms';
    i.style.opacity = '0';
  }

  banner(text: string, sub = '', ms = 1600) {
    const b = h('div', { class: 'banner' }, text, sub ? h('small', {}, sub) : null);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), ms);
  }

  update(w: World, humanId: number, score: [number, number], statuses: Map<number, string>, interact: InteractOption | null, gadget: GadgetUi | null) {
    const human = w.actor(humanId);
    const side = w.sideOf(0);
    this.set('side', side, () => {
      this.side.textContent = side === 'attack' ? 'ATTACK' : 'DEFEND';
      this.side.className = `side ${side}`;
    });
    const secs = Math.ceil(w.secondsLeft());
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.set('clock', clock + w.phase, () => {
      this.clock.textContent = clock;
      this.clock.classList.toggle('armed', w.phase === 'armed');
    });
    this.set('score', `${score[0]}-${score[1]}`, () => (this.score.textContent = `${score[0]} – ${score[1]}`));
    let obj = '';
    if (w.phase === 'prep') obj = side === 'attack' ? 'PREP — scout with the puck. Gadgets unlock at action.' : 'PREP — reinforce walls, barricade doors, set your gadget';
    else if (w.phase === 'action') obj = side === 'attack' ? 'Reach the office console and hold Interact to arm it' : 'Defend the office console';
    else if (w.phase === 'armed') obj = side === 'attack' ? 'BROADCASTING — keep the console armed!' : 'ARMED — hold Interact at the console to shut it off!';
    this.set('obj', obj, () => (this.objective.textContent = obj));
    const res = w.resources[0];
    const resTxt = w.phase === 'prep' && side === 'defence' ? `Reinforcements ${res.reinforcements} · Barricades ${res.barricades}` : '';
    this.set('res', resTxt, () => {
      this.resources.textContent = resTxt;
      this.resources.style.display = resTxt ? 'block' : 'none';
    });
    this.set('ready', String(w.phase === 'prep'), () => ((this.readyBtn.parentElement as HTMLElement).style.display = w.phase === 'prep' ? 'block' : 'none'));

    // squad cards
    const team = w.actors.filter((a) => a.team === 0);
    if (this.matesWorld !== w.uid || this.mates.size !== team.length) {
      this.matesWorld = w.uid;
      for (const k of [...this.cache.keys()]) if (k.startsWith('m')) this.cache.delete(k);
      this.squad.innerHTML = '';
      this.mates.clear();
      for (const a of team) {
        const hp = h('i', { style: 'width:100%' });
        const st = h('div', { class: 'st' });
        const el = h('div', { class: 'mate' }, h('img', { src: portrait(a.look), class: 'pix', alt: '' }), h('div', { class: 'nm' }, a.name), h('div', { class: 'hp' }, hp), st);
        this.squad.appendChild(el);
        this.mates.set(a.id, { el, hp, st });
      }
    }
    for (const a of team) {
      const m = this.mates.get(a.id)!;
      const st = a.alive ? (a.id === humanId ? 'YOU' : statuses.get(a.id) ?? '') : '';
      this.set(`m${a.id}`, `${a.hp}|${a.alive}|${st}|${a.id === humanId}`, () => {
        m.hp.style.width = `${a.hp}%`;
        m.st.textContent = st;
        m.el.classList.toggle('dead', !a.alive);
        m.el.classList.toggle('me', a.id === humanId);
      });
    }

    if (human) {
      const rl = human.reloadUntil >= 0;
      const ammoTxt = `${human.mag}|${human.reserve}|${rl}`;
      this.set('ammo', ammoTxt, () => {
        this.ammo.innerHTML = `${human.mag}<small> / ${human.reserve}</small>${rl ? '<span class="rl">RELOADING</span>' : human.mag === 0 ? '<span class="rl">EMPTY — tap Reload</span>' : ''}`;
      });
      this.set('hp', String(human.hp), () => {
        (this.hp.firstElementChild as HTMLElement).style.width = `${human.hp}%`;
        this.hp.classList.toggle('low', human.hp <= 35);
        this.vignette.style.opacity = human.alive && human.hp <= 35 ? '1' : '0';
      });
    }

    // contextual interact button
    const ik = interact ? `${interact.kind}|${interact.enabled}|${interact.label}` : 'none';
    this.set('interact', ik, () => {
      const img = this.interactBtn.querySelector('img') as HTMLImageElement;
      const span = this.interactBtn.querySelector('span') as HTMLElement;
      if (!interact) {
        img.src = icon('arm');
        span.textContent = 'Interact';
        this.interactBtn.classList.add('disabled');
        this.interactBtn.classList.remove('ready-glow');
      } else {
        const map: Record<string, IconName> = { arm: 'arm', shutoff: 'shutoff', reinforce: 'reinforce', barricade: 'barricade', unbarricade: 'remove', breach: 'breach', vault: 'vault' };
        img.src = icon(map[interact.kind] ?? 'arm');
        span.textContent = interact.label;
        this.interactBtn.classList.toggle('disabled', !interact.enabled);
        this.interactBtn.classList.toggle('ready-glow', interact.enabled);
      }
    });
    let prog = 0;
    if (human?.interaction) prog = Math.min(1, (w.tick - human.interaction.startTick) / human.interaction.durationTicks);
    this.set('iprog', prog.toFixed(2), () => {
      const len = 2 * Math.PI * 44;
      this.interactRing.setAttribute('stroke-dashoffset', String(len * (1 - prog)));
      this.interactBtn.classList.toggle('active', prog > 0);
    });

    // gadget button
    const gk = gadget ? `${gadget.icon}|${gadget.label}|${gadget.pips}|${gadget.enabled}|${gadget.cooldown.toFixed(2)}` : 'none';
    this.set('gadget', gk, () => {
      this.gadgetBtn.style.display = gadget ? 'flex' : 'none';
      if (!gadget) return;
      (this.gadgetBtn.querySelector('img') as HTMLImageElement).src = icon(gadget.icon);
      (this.gadgetBtn.querySelector('span') as HTMLElement).textContent = gadget.label;
      const pips = this.gadgetBtn.querySelector('.pips') as HTMLElement;
      pips.innerHTML = '';
      for (let i = 0; i < gadget.pipsMax; i++) pips.appendChild(h('i', { class: i < gadget.pips ? '' : 'used' }));
      this.gadgetBtn.classList.toggle('disabled', !gadget.enabled);
      const len = 2 * Math.PI * 44;
      this.gadgetRing.setAttribute('stroke-dashoffset', String(len * (1 - gadget.cooldown)));
    });
  }
}
