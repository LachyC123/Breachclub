// Menu screens: title, play setup, operator cards, settings, pause, takeover, results.
import { h, iconImg, portrait, figureCanvas } from './dom';
import { operatorById } from '../content/defs';
import type { Settings } from '../app/settings';
import type { Difficulty } from '../sim/world';

export interface SetupChoice {
  side: 'attack' | 'defence';
  difficulty: Difficulty;
  entry: string;
  single: boolean;
}

const OP_CARD: Record<string, { ability: string; strength: string; limit: string; counters: string; how: string }> = {
  ram: {
    ability: 'Bumper sled: send moving cover through a soft wall, follow it, then brake to unfold a shield.',
    strength: 'Opens a new route and brings its own cover through it.',
    limit: 'One sled. Drives straight, stops at reinforced or solid walls. The shield protects both teams.',
    counters: 'Shoot the sled (60 HP), sidestep, or swing a Hinge wall across its lane.',
    how: 'Hold Gadget and drag to aim the route. Release to launch. Tap Gadget again to brake.',
  },
  hinge: {
    ability: 'Pivot wall: place a 2-tile wall, then swing it 90° to close one angle and open another.',
    strength: 'Turns one doorway fight into a timing puzzle for attackers.',
    limit: 'One wall. Rotation needs its whole swing clear and recovers for 4s. It never crushes anyone.',
    counters: 'Shoot it down (160 HP), ram it with a sled, or take the angle it exposes.',
    how: 'Hold Gadget and drag to place (the wall lies across your drag). Tap Gadget to swing it.',
  },
};

export function titleScreen(on: { play: () => void; practice: () => void; operators: () => void; settings: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'title-logo' }, 'BREACH CLUB'),
    h('div', { class: 'title-sub' }, '3v3 breach & defend · Spin Cycle laundrette'),
    h('div', { class: 'row', style: 'margin-bottom:16px' }, figureCanvas('ram', 3), figureCanvas('hinge', 3), figureCanvas('tess', 2), figureCanvas('june', 2)),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', onclick: on.play }, 'Play match'),
      h('button', { class: 'btn teal', onclick: on.practice }, 'Practice round'),
      h('button', { class: 'btn', onclick: on.operators }, 'Operators'),
      h('button', { class: 'btn ghost', onclick: on.settings }, 'Settings'),
    ),
    h('p', { class: 'small-print', style: 'margin-top:14px' }, 'Single-player against bots · settings stay on this device'),
  );
}

export function setupScreen(single: boolean, settings: Settings, on: { start: (c: SetupChoice) => void; back: () => void }): HTMLElement {
  const choice: SetupChoice = { side: 'attack', difficulty: settings.difficulty, entry: 'front', single };
  const sideRow = h('div', { class: 'row' });
  const diffRow = h('div', { class: 'row' });
  const entryRow = h('div', { class: 'row' });
  const card = h('div', { class: 'panel' });
  const renderCard = () => {
    card.innerHTML = '';
    const op = choice.side === 'attack' ? 'ram' : 'hinge';
    const def = operatorById(op)!;
    const info = OP_CARD[op];
    card.append(
      h('div', { class: 'opcard' }, figureCanvas(op, 2), h('div', {}, h('div', { class: 'name' }, def.name, ' ', h('span', { class: 'gadget' }, `— ${def.gadget}`)), h('p', {}, info.ability), h('p', { class: 'muted' }, info.how))),
      h('div', { class: 'label' }, 'Squad'),
      h(
        'div',
        { class: 'row', style: 'justify-content:flex-start' },
        ...(choice.side === 'attack' ? ['ram', 'mo', 'tess'] : ['hinge', 'dex', 'june']).map((l, i) =>
          h('div', { class: 'mate', style: 'width:70px' }, h('img', { src: portrait(l), class: 'pix', alt: '' }), h('div', { class: 'nm' }, i === 0 ? (l === 'ram' ? 'RAM' : 'HINGE') : l.toUpperCase()), h('div', { class: 'st' }, i === 0 ? 'you' : 'basic')),
        ),
      ),
      h('p', { class: 'small-print', style: 'text-align:left' }, 'Slice build: squadmates are temporary basic operators with the side-standard tool (breach charge on attack, shared reinforcements and barricades on defence).'),
    );
  };
  const seg = <T extends string>(row: HTMLElement, opts: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
    const draw = () => {
      row.innerHTML = '';
      for (const [v, label] of opts) row.appendChild(h('button', { class: `btn seg ${get() === v ? 'selected' : 'ghost'}`, onclick: () => (set(v), draw(), renderCard(), drawEntry()) }, label));
    };
    draw();
  };
  const drawEntry = () => {
    entryRow.style.display = choice.side === 'attack' ? 'flex' : 'none';
    entryLabel.style.display = choice.side === 'attack' ? 'block' : 'none';
  };
  const entryLabel = h('div', { class: 'label' }, 'Attack entry');
  seg(sideRow, [['attack', 'Attack first'], ['defence', 'Defend first']], () => choice.side, (v) => (choice.side = v));
  seg(diffRow, [['rookie', 'Rookie'], ['club', 'Club'], ['expert', 'Expert']], () => choice.difficulty, (v) => (choice.difficulty = v));
  seg(entryRow, [['front', 'Front doors'], ['window', 'Service window'], ['rear', 'Rear stock door']], () => choice.entry as 'front', (v) => (choice.entry = v));
  renderCard();
  drawEntry();
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'setup-grid' },
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, single ? 'Practice round' : 'Match — first to 3'),
        h('div', { class: 'label' }, 'Map'),
        h('div', {}, 'Spin Cycle — rainy laundrette, office console'),
        h('div', { class: 'label' }, single ? 'Side' : 'Starting side'),
        sideRow,
        h('div', { class: 'label' }, 'Bot difficulty'),
        diffRow,
        entryLabel,
        entryRow,
      ),
      h('div', { class: 'col' }, card, h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost', onclick: on.back }, 'Back'), h('button', { class: 'btn primary', onclick: () => on.start(choice) }, 'Start'))),
    ),
  );
}

export function operatorsScreen(on: { back: () => void }): HTMLElement {
  const card = (op: string) => {
    const def = operatorById(op)!;
    const info = OP_CARD[op];
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'opcard' }, figureCanvas(op, 3), h('div', {}, h('div', { class: 'name' }, def.name), h('div', { class: 'gadget' }, def.gadget), h('p', {}, info.ability))),
      h('p', {}, h('b', {}, 'Strength: '), info.strength),
      h('p', {}, h('b', {}, 'Limit: '), info.limit),
      h('p', {}, h('b', {}, 'Counters: '), info.counters),
      h('p', { class: 'muted' }, info.how),
      h('p', { class: 'muted' }, def.personality),
    );
  };
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'setup-grid' }, card('ram'), card('hinge')),
    h('p', { class: 'small-print' }, 'Ten more operators are designed (Spool, Echo, Stitch, Magnet and the expansion six). They arrive one at a time, each with its own gadget, bot behaviour and counters.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: on.back }, 'Back')),
  );
}

export function settingsScreen(s: Settings, on: { change: (s: Settings) => void; back: () => void }): HTMLElement {
  const rows: HTMLElement[] = [];
  const slider = (key: keyof Settings, label: string) => {
    const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(s[key]) }) as HTMLInputElement;
    input.addEventListener('input', () => {
      (s as unknown as Record<string, unknown>)[key] = Number(input.value);
      on.change(s);
    });
    rows.push(h('div', { class: 'settings-row' }, h('span', {}, label), input));
  };
  const toggle = (key: keyof Settings, label: string) => {
    const b = h('button', { class: 'btn ghost toggle' }, s[key] ? 'On' : 'Off');
    b.addEventListener('click', () => {
      (s as unknown as Record<string, unknown>)[key] = !s[key];
      b.textContent = s[key] ? 'On' : 'Off';
      on.change(s);
    });
    rows.push(h('div', { class: 'settings-row' }, h('span', {}, label), b));
  };
  const cycle = <T extends string | number>(key: keyof Settings, label: string, opts: Array<[T, string]>) => {
    const b = h('button', { class: 'btn ghost toggle' });
    const draw = () => (b.textContent = opts.find(([v]) => v === s[key])?.[1] ?? String(s[key]));
    draw();
    b.addEventListener('click', () => {
      const i = opts.findIndex(([v]) => v === s[key]);
      (s as unknown as Record<string, unknown>)[key] = opts[(i + 1) % opts.length][0];
      draw();
      on.change(s);
    });
    rows.push(h('div', { class: 'settings-row' }, h('span', {}, label), b));
  };
  slider('master', 'Master volume');
  slider('weapons', 'Weapons');
  slider('world', 'World & gadgets');
  slider('ambience', 'Rain & ambience');
  slider('music', 'Music');
  slider('ui', 'Interface');
  toggle('muted', 'Mute all');
  cycle('aimAssist', 'Aim assist', [
    ['off', 'Off'],
    ['low', 'Low'],
    ['standard', 'Standard'],
  ]);
  toggle('leftHanded', 'Left-handed layout');
  toggle('reducedShake', 'Reduce screen shake');
  toggle('reducedFlash', 'Reduce flashes');
  toggle('captions', 'Sound captions');
  cycle('textScale', 'Text size', [
    [1, 'Normal'],
    [1.15, 'Large'],
    [1.3, 'Larger'],
  ]);
  const resetTut = h('button', { class: 'btn ghost toggle' }, 'Replay');
  resetTut.addEventListener('click', () => {
    s.tutorialDone = false;
    on.change(s);
    resetTut.textContent = 'Will show';
  });
  rows.push(h('div', { class: 'settings-row' }, h('span', {}, 'First-match tips'), resetTut));
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'panel', style: 'width:min(560px,100%)' }, h('h2', {}, 'Settings'), ...rows, h('p', { class: 'small-print', style: 'text-align:left;margin-top:8px' }, 'Settings are stored in this browser only. Clearing site data resets them.')),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: on.back }, 'Back')),
  );
}

export function pauseScreen(on: { resume: () => void; restart: () => void; settings: () => void; quit: () => void }, note: string): HTMLElement {
  return h(
    'div',
    { class: 'screen dim' },
    h('div', { class: 'title-logo', style: 'font-size:48px' }, 'Paused'),
    h('p', { class: 'small-print' }, note),
    h('div', { class: 'col', style: 'min-width:260px' }, h('button', { class: 'btn primary', onclick: on.resume }, 'Resume'), h('button', { class: 'btn', onclick: on.restart }, 'Restart round'), h('button', { class: 'btn ghost', onclick: on.settings }, 'Settings'), h('button', { class: 'btn ghost', onclick: on.quit }, 'Quit to title')),
  );
}

export function takeoverScreen(mates: Array<{ id: number; name: string; look: string; hp: number; note: string }>, onPick: (id: number) => void): HTMLElement {
  return h(
    'div',
    { class: 'screen dim' },
    h('div', { class: 'title-logo', style: 'font-size:40px' }, 'You went down'),
    h('p', { class: 'small-print' }, 'Take over a teammate where they stand — same health, ammo and gadget.'),
    h(
      'div',
      { class: 'takeover' },
      ...mates.map((m) => h('button', { class: 'btn', onclick: () => onPick(m.id) }, h('img', { src: portrait(m.look), class: 'pix', alt: '' }), h('span', {}, m.name), h('small', {}, `${m.hp} HP · ${m.note}`))),
    ),
  );
}

export function roundResultScreen(win: boolean, reason: string, highlight: string, score: [number, number], on: { next: () => void }, nextLabel: string): HTMLElement {
  return h(
    'div',
    { class: 'screen dim' },
    h('div', { class: `result-big ${win ? 'win' : 'lose'}` }, win ? 'ROUND WON' : 'ROUND LOST'),
    h('div', { class: 'result-reason' }, reason),
    highlight ? h('div', { class: 'highlight' }, highlight) : null,
    h('div', { class: 'result-reason' }, `Score ${score[0]} – ${score[1]}`),
    h('button', { class: 'btn primary', onclick: on.next }, nextLabel),
  );
}

export function matchEndScreen(win: boolean, score: [number, number], lines: string[], on: { rematch: () => void; title: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: `result-big ${win ? 'win' : 'lose'}` }, win ? 'MATCH WON' : 'MATCH LOST'),
    h('div', { class: 'result-reason' }, `Final score ${score[0]} – ${score[1]}`),
    h('div', { class: 'panel', style: 'max-width:520px' }, ...lines.map((l) => h('p', { style: 'margin:4px 0' }, l))),
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: on.rematch }, 'Rematch'), h('button', { class: 'btn ghost', onclick: on.title }, 'Title')),
  );
}

export { iconImg };
