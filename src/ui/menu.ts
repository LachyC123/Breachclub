// Main menu: tabbed home (PLAY / OPERATORS / TRAINING / SETTINGS) in a tactical-shooter style.
import { h, portrait, figureCanvas } from './dom';
import { OPERATORS, operatorById, displayName, SQUADMATES } from '../content/defs';
import type { Settings } from '../app/settings';
import type { Difficulty } from '../sim/world';
import { settingsPanel } from './settingsPanel';

export type Playlist = 'quick' | 'standard' | 'range' | 'sit_attack' | 'sit_defence';
export type HomeTab = 'play' | 'operators' | 'training' | 'settings';

export interface MenuActions {
  play: (p: Playlist, difficulty: Difficulty, startSide: 'attack' | 'defence') => void;
  settingsChanged: (s: Settings) => void;
  sound: (kind: 'tap' | 'confirm' | 'back') => void;
}

/** Gadget and role text for every playable operator (signature specialists and recruits). */
export const OP_INFO: Record<string, { role: string; gadget: string; ability: string; how: string; counters: string; weapons: Array<'carbine' | 'smg' | 'scattergun'> }> = {
  ram: {
    role: 'BREACHER',
    gadget: 'BUMPER SLED',
    ability: 'Send moving cover through a soft wall, follow it in, then brake to unfold a shield.',
    how: 'Hold GADGET and drag to aim the route, release to launch. Tap GADGET again to brake.',
    counters: 'Shoot the sled (60 HP), sidestep it, or swing a pivot wall across its lane.',
    weapons: ['carbine', 'scattergun'],
  },
  hinge: {
    role: 'ANCHOR',
    gadget: 'PIVOT WALL',
    ability: 'Place a 2-tile wall, then swing it 90° to close one angle and open another.',
    how: 'Hold GADGET and drag to place it. Tap GADGET to swing it (within 6 tiles).',
    counters: 'Shoot it down (160 HP), ram it with a sled, or take the angle it exposes.',
    weapons: ['carbine', 'smg'],
  },
  recruit_mo: { role: 'ENTRY', gadget: 'BREACH CHARGE', ability: 'Standard-issue charge that blows open a soft wall or barricade.', how: 'Stand at a dashed wall panel and hold INTERACT to plant it.', counters: 'Reinforce the wall or punish the plant.', weapons: ['smg', 'carbine', 'scattergun'] },
  recruit_tess: { role: 'SUPPORT', gadget: 'BREACH CHARGE', ability: 'Close-range specialist with a standard breach charge.', how: 'Stand at a dashed wall panel and hold INTERACT to plant it.', counters: 'Hold long angles she cannot reach.', weapons: ['scattergun', 'smg', 'carbine'] },
  recruit_dex: { role: 'ROAMER', gadget: 'REINFORCEMENTS', ability: 'Shares the team’s reinforcements and barricades.', how: 'Hold INTERACT at a dashed wall or doorway during preparation.', counters: 'Breach the walls he did not reinforce.', weapons: ['smg', 'carbine', 'scattergun'] },
  recruit_june: { role: 'SUPPORT', gadget: 'REINFORCEMENTS', ability: 'Close-quarters defender who shares the team’s reinforcements.', how: 'Hold INTERACT at a dashed wall or doorway during preparation.', counters: 'Clear her corners from range.', weapons: ['scattergun', 'smg', 'carbine'] },
};

export function lookOf(op: string): string {
  return SQUADMATES.find((s) => s.id === op)?.look ?? op;
}

function tabBar(active: HomeTab, go: (t: HomeTab) => void): HTMLElement {
  const tabs: Array<[HomeTab, string]> = [
    ['play', 'PLAY'],
    ['operators', 'OPERATORS'],
    ['training', 'TRAINING'],
    ['settings', 'SETTINGS'],
  ];
  return h(
    'nav',
    { class: 'tabs' },
    h('div', { class: 'brand' }, 'BREACH', h('span', {}, 'CLUB')),
    ...tabs.map(([id, label]) => h('button', { class: `tab ${id === active ? 'on' : ''}`, onclick: () => go(id) }, label)),
  );
}

function playlistCard(cls: string, kicker: string, title: string, sub: string, meta: string, onClick: () => void, art?: HTMLElement): HTMLElement {
  return h('button', { class: `pl-card ${cls}`, onclick: onClick }, art ? h('div', { class: 'pl-art' }, art) : null, h('div', { class: 'pl-text' }, h('div', { class: 'pl-kicker' }, kicker), h('div', { class: 'pl-title' }, title), h('div', { class: 'pl-sub' }, sub), h('div', { class: 'pl-meta' }, meta)));
}

function segmented<T extends string>(label: string, opts: Array<[T, string]>, get: () => T, set: (v: T) => void, tap: () => void): HTMLElement {
  const row = h('div', { class: 'seg' });
  const draw = () => {
    row.innerHTML = '';
    for (const [v, l] of opts)
      row.appendChild(
        h(
          'button',
          {
            class: get() === v ? 'on' : '',
            onclick: () => {
              set(v);
              tap();
              draw();
            },
          },
          l,
        ),
      );
  };
  draw();
  return h('div', { class: 'seg-wrap' }, h('div', { class: 'seg-label' }, label), row);
}

function squadArt(ops: string[]): HTMLElement {
  return h('div', { class: 'pl-squad' }, ...ops.map((o) => h('img', { class: 'pix', src: portrait(lookOf(o)), alt: '' })));
}

export function homeScreen(settings: Settings, tab: HomeTab, on: MenuActions): HTMLElement {
  const root = h('div', { class: 'menu' });
  const state = { tab, difficulty: settings.difficulty, side: 'attack' as 'attack' | 'defence' };
  const render = () => {
    root.innerHTML = '';
    root.appendChild(
      tabBar(state.tab, (t) => {
        on.sound('tap');
        state.tab = t;
        render();
      }),
    );
    const body = h('div', { class: 'menu-body' });
    root.appendChild(body);
    if (state.tab === 'play') {
      body.append(
        h('div', { class: 'section-title' }, 'PLAYLISTS', h('small', {}, '3v3 vs bots · Spin Cycle')),
        h(
          'div',
          { class: 'pl-grid' },
          playlistCard('quick', 'UNRANKED', 'QUICK MATCH', 'First to 2 rounds · sides swap', 'Short prep · full gadgets', () => (on.sound('confirm'), on.play('quick', state.difficulty, state.side)), squadArt(['ram', 'recruit_mo', 'recruit_tess'])),
          playlistCard('standard', 'TACTICAL', 'STANDARD', 'First to 3 rounds · sides swap', 'Full prep · drone phase', () => (on.sound('confirm'), on.play('standard', state.difficulty, state.side)), squadArt(['hinge', 'recruit_dex', 'recruit_june'])),
        ),
        h(
          'div',
          { class: 'opts-row' },
          segmented<Difficulty>(
            'BOT DIFFICULTY',
            [
              ['rookie', 'ROOKIE'],
              ['club', 'CLUB'],
              ['expert', 'EXPERT'],
            ],
            () => state.difficulty,
            (v) => {
              state.difficulty = v;
              settings.difficulty = v;
              on.settingsChanged(settings);
            },
            () => on.sound('tap'),
          ),
          segmented<'attack' | 'defence'>(
            'START ON',
            [
              ['attack', 'ATTACK'],
              ['defence', 'DEFENCE'],
            ],
            () => state.side,
            (v) => (state.side = v),
            () => on.sound('tap'),
          ),
        ),
      );
    } else if (state.tab === 'training') {
      body.append(
        h('div', { class: 'section-title' }, 'TRAINING', h('small', {}, 'Practise without a clock')),
        h(
          'div',
          { class: 'pl-grid three' },
          playlistCard('range', 'FREE PRACTICE', 'SHOOTING RANGE', 'Lanes of pop-up targets and a breach house', 'Respawning targets · walls regrow', () => (on.sound('confirm'), on.play('range', state.difficulty, 'attack'))),
          playlistCard('sit-a', 'SITUATION', 'BREACH & ARM', 'One round on attack — drone, breach, arm', 'Single life squad · no swap', () => (on.sound('confirm'), on.play('sit_attack', state.difficulty, 'attack'))),
          playlistCard('sit-d', 'SITUATION', 'HOLD THE OFFICE', 'One round on defence — fortify and hold', 'Single life squad · no swap', () => (on.sound('confirm'), on.play('sit_defence', state.difficulty, 'defence'))),
        ),
        h('p', { class: 'fine' }, 'Range controls: everything works as in a match. Targets pop back up, walls and barricades regrow, gadgets refill after a few seconds.'),
      );
    } else if (state.tab === 'operators') {
      body.append(operatorsBrowser());
    } else {
      body.append(
        settingsPanel(settings, (s) => {
          on.settingsChanged(s);
          on.sound('tap');
        }),
      );
    }
  };
  render();
  return root;
}

/** Operator roster: playable ones first, then the designed-but-locked roster. */
export function operatorsBrowser(): HTMLElement {
  const playable = ['ram', 'recruit_mo', 'recruit_tess', 'hinge', 'recruit_dex', 'recruit_june'];
  const locked = OPERATORS.filter((o) => !playable.includes(o.id));
  const detail = h('div', { class: 'op-detail' });
  const show = (op: string) => {
    detail.innerHTML = '';
    const info = OP_INFO[op];
    const def = operatorById(op);
    const side = def?.side ?? SQUADMATES.find((s) => s.id === op)?.side ?? 'attack';
    detail.append(
      h('div', { class: 'od-fig' }, figureCanvas(lookOf(op), 4)),
      h(
        'div',
        { class: 'od-text' },
        h('div', { class: `od-side ${side}` }, side === 'attack' ? 'ATTACKER' : 'DEFENDER', ' · ', info.role),
        h('div', { class: 'od-name' }, displayName(op)),
        h('div', { class: 'od-gadget' }, info.gadget),
        h('p', {}, info.ability),
        h('p', { class: 'dim' }, h('b', {}, 'HOW: '), info.how),
        h('p', { class: 'dim' }, h('b', {}, 'COUNTER: '), info.counters),
        def ? h('p', { class: 'dim' }, def.personality) : null,
      ),
    );
    grid.querySelectorAll('.op-tile').forEach((t) => t.classList.toggle('on', (t as HTMLElement).dataset.op === op));
  };
  const tile = (op: string, isLocked: boolean, side: string) =>
    h(
      'button',
      { class: `op-tile ${side} ${isLocked ? 'locked' : ''}`, 'data-op': op, onclick: () => !isLocked && show(op) },
      h('img', { class: `pix ${isLocked ? 'sil' : ''}`, src: portrait(isLocked ? 'mo' : lookOf(op)), alt: '' }),
      h('span', {}, isLocked ? operatorById(op)?.name ?? op : displayName(op)),
      isLocked ? h('em', {}, 'SOON') : null,
    );
  const grid = h(
    'div',
    { class: 'op-grid' },
    h('div', { class: 'og-label attack' }, 'ATTACK'),
    ...playable.filter((o) => (operatorById(o)?.side ?? SQUADMATES.find((s) => s.id === o)?.side) === 'attack').map((o) => tile(o, false, 'attack')),
    ...locked.filter((o) => o.side === 'attack').map((o) => tile(o.id, true, 'attack')),
    h('div', { class: 'og-label defence' }, 'DEFENCE'),
    ...playable.filter((o) => (operatorById(o)?.side ?? SQUADMATES.find((s) => s.id === o)?.side) === 'defence').map((o) => tile(o, false, 'defence')),
    ...locked.filter((o) => o.side === 'defence').map((o) => tile(o.id, true, 'defence')),
  );
  const wrap = h('div', { class: 'op-browser' }, grid, detail);
  show('ram');
  return wrap;
}
