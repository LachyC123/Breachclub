// Match-flow screens: loading, operator select, spawn select, pause, scoreboard,
// round summary and match end. Pure DOM; callers own timing and state.
import { h, portrait, figureCanvas } from './dom';
import { displayName } from '../content/defs';
import { OP_INFO, lookOf } from './menu';
import type { World } from '../sim/world';
import type { Actor, Vec } from '../sim/types';
import type { MapData } from '../sim/mapdata';

const WEAPON_LABEL: Record<string, string> = { carbine: 'CARBINE', smg: 'POCKET SMG', scattergun: 'SCATTERGUN' };
const WEAPON_NOTE: Record<string, string> = { carbine: 'Accurate · 25 dmg · 18 rds', smg: 'Fast fire · 18 dmg · 24 rds', scattergun: 'Close range · 5 pellets · 6 rds' };

export function loadingScreen(info: { mode: string; mapName: string; sub: string; objective: string; difficulty: string; squads: [string[], string[]] }): HTMLElement {
  const squad = (ops: string[], cls: string) => h('div', { class: `ld-squad ${cls}` }, ...ops.map((o) => h('div', { class: 'ld-op' }, h('img', { class: 'pix', src: portrait(lookOf(o)), alt: '' }), h('span', {}, displayName(o)))));
  return h(
    'div',
    { class: 'loading' },
    h('div', { class: 'ld-mode' }, info.mode),
    h('div', { class: 'ld-map' }, info.mapName),
    h('div', { class: 'ld-sub' }, info.sub),
    h('div', { class: 'ld-vs' }, squad(info.squads[0], 'own'), h('div', { class: 'ld-x' }, 'VS'), squad(info.squads[1], 'foe')),
    h('div', { class: 'ld-obj' }, h('b', {}, 'OBJECTIVE '), info.objective),
    h('div', { class: 'ld-foot' }, `BOTS: ${info.difficulty.toUpperCase()}`, h('span', { class: 'ld-bar' }, h('i'))),
  );
}

export interface OpSelectResult {
  op: string;
  weapon: 'carbine' | 'smg' | 'scattergun';
}

/** Per-round operator + loadout select with an auto-lock countdown. */
export function opSelectScreen(cfg: { round: number; side: 'attack' | 'defence'; ops: string[]; locked: Array<{ id: string; name: string }>; initial: OpSelectResult; seconds: number; score: [number, number] }, on: { confirm: (r: OpSelectResult) => void; tap: () => void }): HTMLElement {
  const sel: OpSelectResult = { ...cfg.initial };
  const detail = h('div', { class: 'os-detail' });
  const grid = h('div', { class: 'os-grid' });
  const timerEl = h('div', { class: 'os-timer' }, String(cfg.seconds));
  let done = false;
  const confirm = () => {
    if (done) return;
    done = true;
    clearInterval(iv);
    on.confirm({ ...sel });
  };
  const drawDetail = () => {
    detail.innerHTML = '';
    const info = OP_INFO[sel.op];
    if (!info.weapons.includes(sel.weapon)) sel.weapon = info.weapons[0];
    const loadout = h('div', { class: 'os-loadout' });
    for (const wpn of info.weapons)
      loadout.appendChild(
        h(
          'button',
          {
            class: `os-wpn ${sel.weapon === wpn ? 'on' : ''}`,
            onclick: () => {
              sel.weapon = wpn;
              on.tap();
              drawDetail();
            },
          },
          h('b', {}, WEAPON_LABEL[wpn]),
          h('small', {}, WEAPON_NOTE[wpn]),
        ),
      );
    detail.append(
      h('div', { class: 'os-fig' }, figureCanvas(lookOf(sel.op), 3)),
      h(
        'div',
        { class: 'os-info' },
        h('div', { class: 'os-role' }, info.role),
        h('div', { class: 'os-name' }, displayName(sel.op)),
        h('div', { class: 'os-gadget' }, info.gadget),
        h('p', {}, info.ability),
        h('div', { class: 'os-label' }, 'PRIMARY'),
        loadout,
      ),
    );
  };
  const drawGrid = () => {
    grid.innerHTML = '';
    for (const op of cfg.ops)
      grid.appendChild(
        h(
          'button',
          {
            class: `os-tile ${sel.op === op ? 'on' : ''}`,
            onclick: () => {
              sel.op = op;
              on.tap();
              drawGrid();
              drawDetail();
            },
          },
          h('img', { class: 'pix', src: portrait(lookOf(op)), alt: '' }),
          h('span', {}, displayName(op)),
          h('em', {}, OP_INFO[op].gadget),
        ),
      );
    for (const l of cfg.locked) grid.appendChild(h('div', { class: 'os-tile locked' }, h('img', { class: 'pix sil', src: portrait('mo'), alt: '' }), h('span', {}, l.name), h('em', {}, 'LOCKED')));
  };
  drawGrid();
  drawDetail();
  let left = cfg.seconds;
  const iv = window.setInterval(() => {
    // a screen that was removed (quit, pause-leave) must never fire its countdown
    if (!root.isConnected) return clearInterval(iv);
    left--;
    timerEl.textContent = String(Math.max(0, left));
    timerEl.classList.toggle('low', left <= 5);
    if (left <= 0) confirm();
  }, 1000);
  const root: HTMLElement = h(
    'div',
    { class: `opselect ${cfg.side}` },
    h('div', { class: 'os-head' }, h('div', {}, h('div', { class: 'os-round' }, `ROUND ${cfg.round + 1} · ${cfg.score[0]} – ${cfg.score[1]}`), h('div', { class: 'os-title' }, cfg.side === 'attack' ? 'ATTACKERS' : 'DEFENDERS', h('small', {}, 'SELECT YOUR OPERATOR'))), timerEl),
    h('div', { class: 'os-body' }, grid, detail),
    h('div', { class: 'os-foot' }, h('span', { class: 'fine' }, 'Teammates take the operators you leave.'), h('button', { class: 'cta', onclick: () => (on.tap(), confirm()) }, 'CONFIRM')),
  );
  return root;
}

/** Attacker spawn select on an overview of the map. */
export function spawnSelectScreen(cfg: { map: MapData; mapCanvas: HTMLCanvasElement; initial: string; seconds: number }, on: { confirm: (entry: string) => void; tap: () => void }): HTMLElement {
  const m = cfg.map;
  let sel = cfg.initial;
  let done = false;
  const pct = (p: Vec) => ({ left: `${(p.x / m.w) * 100}%`, top: `${(p.y / m.h) * 100}%` });
  const img = cfg.mapCanvas.cloneNode(true) as HTMLCanvasElement;
  img.getContext('2d')!.drawImage(cfg.mapCanvas, 0, 0);
  img.className = 'ss-map pix';
  const board = h('div', { class: 'ss-board' }, img);
  const c = m.console.center;
  const obj = h('div', { class: 'ss-obj', style: `left:${pct(c).left};top:${pct(c).top}` }, h('span', {}, 'OBJECTIVE'));
  board.appendChild(obj);
  const pins = new Map<string, HTMLElement>();
  const list = h('div', { class: 'ss-list' });
  const confirm = () => {
    if (done) return;
    done = true;
    clearInterval(iv);
    on.confirm(sel);
  };
  const draw = () => {
    for (const [id, el] of pins) el.classList.toggle('on', id === sel);
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === sel));
  };
  for (const e of m.entries) {
    const p = { x: e.spots[0][0], y: e.spots[0][1] };
    const pin = h('button', { class: 'ss-pin', style: `left:${pct(p).left};top:${pct(p).top}`, onclick: () => ((sel = e.id), on.tap(), draw()) }, h('i'), h('span', {}, e.name.toUpperCase()));
    pins.set(e.id, pin);
    board.appendChild(pin);
    list.appendChild(h('button', { 'data-id': e.id, onclick: () => ((sel = e.id), on.tap(), draw()) }, e.name.toUpperCase()));
  }
  const timerEl = h('div', { class: 'os-timer' }, String(cfg.seconds));
  let left = cfg.seconds;
  const iv = window.setInterval(() => {
    if (!root.isConnected) return clearInterval(iv);
    left--;
    timerEl.textContent = String(Math.max(0, left));
    if (left <= 0) confirm();
  }, 1000);
  draw();
  const root: HTMLElement = h(
    'div',
    { class: 'spawnselect attack' },
    h('div', { class: 'os-head' }, h('div', {}, h('div', { class: 'os-round' }, m.name.toUpperCase()), h('div', { class: 'os-title' }, 'SELECT SPAWN', h('small', {}, 'WHERE YOUR SQUAD DEPLOYS'))), timerEl),
    h('div', { class: 'ss-body' }, board, h('div', { class: 'ss-side' }, list, h('button', { class: 'cta', onclick: () => (on.tap(), confirm()) }, 'DEPLOY'))),
  );
  return root;
}

export function pauseScreen(on: { resume: () => void; restart: (() => void) | null; settings: () => void; quit: () => void }, note: string, title = 'PAUSED'): HTMLElement {
  return h(
    'div',
    { class: 'overlay-screen' },
    h('div', { class: 'ov-panel' }, h('div', { class: 'ov-title' }, title), note ? h('p', { class: 'fine' }, note) : null, h('button', { class: 'cta', onclick: on.resume }, 'RESUME'), on.restart ? h('button', { class: 'ov-btn', onclick: on.restart }, 'RESTART ROUND') : null, h('button', { class: 'ov-btn', onclick: on.settings }, 'SETTINGS'), h('button', { class: 'ov-btn dim', onclick: on.quit }, 'LEAVE MATCH')),
  );
}

export function settingsOverlay(panel: HTMLElement, back: () => void): HTMLElement {
  return h('div', { class: 'overlay-screen' }, h('div', { class: 'ov-panel wide' }, h('div', { class: 'ov-title' }, 'SETTINGS'), panel, h('button', { class: 'cta', onclick: back }, 'BACK')));
}

function boardRows(w: World, team: 0 | 1, humanId: number, mvp: number): HTMLElement[] {
  return w.actors
    .filter((a) => a.team === team)
    .sort((a, b) => score(b) - score(a))
    .map((a) =>
      h(
        'div',
        { class: `sb-row ${a.alive ? '' : 'dead'} ${a.id === humanId ? 'me' : ''}` },
        h('img', { class: 'pix', src: portrait(a.look), alt: '' }),
        h('span', { class: 'sb-name' }, a.name, a.id === mvp ? h('em', {}, 'MVP') : null),
        h('span', {}, String(score(a))),
        h('span', {}, String(a.kills)),
        h('span', {}, String(a.deaths)),
        h('span', {}, String(a.assists)),
      ),
    );
}

/** Points: kills, assists, damage and objective play — enough to pick a fair MVP. */
export function score(a: Actor): number {
  return a.kills * 100 + a.assists * 40 + Math.round(a.damageDealt / 2);
}

export function mvpOf(w: World): number {
  let best = -1;
  let bestS = -1;
  for (const a of w.actors) {
    const s = score(a);
    if (s > bestS) {
      bestS = s;
      best = a.id;
    }
  }
  return bestS > 0 ? best : -1;
}

export function scoreboard(w: World, scoreTxt: [number, number], humanId: number, title = 'SCOREBOARD'): HTMLElement {
  const mvp = mvpOf(w);
  const head = () => h('div', { class: 'sb-row head' }, h('span'), h('span', { class: 'sb-name' }, 'OPERATOR'), h('span', {}, 'SCORE'), h('span', {}, 'K'), h('span', {}, 'D'), h('span', {}, 'A'));
  const side = (t: 0 | 1) => (w.sideOf(t) === 'attack' ? 'ATTACK' : 'DEFENCE');
  return h(
    'div',
    { class: 'scoreboard' },
    h('div', { class: 'sb-title' }, title),
    h('div', { class: 'sb-team own' }, h('div', { class: 'sb-th' }, `YOUR SQUAD · ${side(0)}`, h('b', {}, String(scoreTxt[0]))), head(), ...boardRows(w, 0, humanId, mvp)),
    h('div', { class: 'sb-team foe' }, h('div', { class: 'sb-th' }, `OPPONENTS · ${side(1)}`, h('b', {}, String(scoreTxt[1]))), head(), ...boardRows(w, 1, humanId, mvp)),
  );
}

export function roundEndScreen(cfg: { win: boolean; reason: string; highlight: string; w: World; score: [number, number]; humanId: number; nextLabel: string }, on: { next: () => void }): HTMLElement {
  const mvp = cfg.w.actor(mvpOf(cfg.w));
  return h(
    'div',
    { class: `roundend ${cfg.win ? 'win' : 'lose'}` },
    h('div', { class: 're-band' }, h('div', { class: 're-title' }, cfg.win ? 'ROUND WON' : 'ROUND LOST'), h('div', { class: 're-reason' }, cfg.reason.toUpperCase())),
    h(
      'div',
      { class: 're-mid' },
      mvp ? h('div', { class: 're-mvp' }, h('div', { class: 'os-label' }, 'ROUND MVP'), figureCanvas(mvp.look, 3), h('div', { class: 're-mvp-name' }, mvp.name), h('div', { class: 'fine' }, `${mvp.kills} K · ${mvp.assists} A · ${mvp.damageDealt} DMG`)) : null,
      h('div', { class: 're-board' }, scoreboard(cfg.w, cfg.score, cfg.humanId, `SCORE ${cfg.score[0]} – ${cfg.score[1]}`), cfg.highlight ? h('div', { class: 're-high' }, cfg.highlight) : null),
    ),
    h('button', { class: 'cta', onclick: on.next }, cfg.nextLabel),
  );
}

export function matchEndScreen(cfg: { win: boolean; score: [number, number]; lines: Array<{ side: string; won: boolean; reason: string }>; totals: Array<{ name: string; look: string; k: number; d: number; a: number; me: boolean }> }, on: { rematch: () => void; home: () => void }): HTMLElement {
  return h(
    'div',
    { class: `matchend ${cfg.win ? 'win' : 'lose'}` },
    h('div', { class: 'me-title' }, cfg.win ? 'VICTORY' : 'DEFEAT'),
    h('div', { class: 'me-score' }, `${cfg.score[0]} – ${cfg.score[1]}`),
    h(
      'div',
      { class: 'me-body' },
      h('div', { class: 'me-rounds' }, ...cfg.lines.map((l, i) => h('div', { class: `me-round ${l.won ? 'won' : 'lost'}` }, h('b', {}, `R${i + 1}`), h('span', {}, l.side), h('small', {}, l.reason)))),
      h('div', { class: 'me-totals' }, h('div', { class: 'sb-row head' }, h('span'), h('span', { class: 'sb-name' }, 'YOUR SQUAD'), h('span', {}, 'K'), h('span', {}, 'D'), h('span', {}, 'A')), ...cfg.totals.map((t) => h('div', { class: `sb-row ${t.me ? 'me' : ''}` }, h('img', { class: 'pix', src: portrait(t.look), alt: '' }), h('span', { class: 'sb-name' }, t.name), h('span', {}, String(t.k)), h('span', {}, String(t.d)), h('span', {}, String(t.a))))),
    ),
    h('div', { class: 'me-actions' }, h('button', { class: 'cta', onclick: on.rematch }, 'PLAY AGAIN'), h('button', { class: 'ov-btn', onclick: on.home }, 'MAIN MENU')),
  );
}

export function takeoverPicker(mates: Array<{ id: number; name: string; look: string; hp: number; note: string }>, onPick: (id: number) => void): HTMLElement {
  return h(
    'div',
    { class: 'takeover' },
    h('div', { class: 'to-title' }, 'TAKE OVER A TEAMMATE'),
    h('div', { class: 'to-row' }, ...mates.map((m) => h('button', { class: 'to-card', onclick: () => onPick(m.id) }, h('img', { class: 'pix', src: portrait(m.look), alt: '' }), h('b', {}, m.name), h('small', {}, `${m.hp} HP · ${m.note}`)))),
  );
}
