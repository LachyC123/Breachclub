// Wild card draft: three face-down cards each round. Flip them, see what your squad votes for,
// play one (a card you already hold levels up), then see what the opponents drafted.
import { h, iconImg, portrait } from './dom';
import { cardById, type CardId, type TeamCards } from '../content/cards';
import type { IconName } from '../render/art/gadgets';

export const cardIcon = (id: CardId) => `card_${id}` as IconName;

export function cardFace(id: CardId, owned: number, extra: Node | null = null): HTMLElement {
  const c = cardById(id);
  const next = Math.min(3, owned + 1);
  return h(
    'div',
    { class: `wc-face ${c.rarity}` },
    h('div', { class: 'wc-rarity' }, c.rarity.toUpperCase(), c.active ? h('span', {}, ' · ACTIVE') : null),
    h('div', { class: 'wc-icon' }, iconImg(cardIcon(id))),
    h('div', { class: 'wc-name' }, c.name),
    h('div', { class: 'wc-level' }, owned ? `LV ${owned} → ${next}` : 'NEW', ...[1, 2, 3].map((i) => h('i', { class: i <= next ? 'on' : '' }))),
    h('div', { class: 'wc-desc' }, c.levels[next - 1]),
    h('div', { class: 'wc-flav' }, c.flavour),
    extra,
  );
}

/** Small chip strip of held cards (draft footer and HUD). */
export function cardStrip(cards: TeamCards, cls = ''): HTMLElement {
  const ids = Object.keys(cards) as CardId[];
  return h('div', { class: `wc-strip ${cls}` }, ...ids.map((id) => h('div', { class: `wc-chip ${cardById(id).rarity}`, title: cardById(id).name }, iconImg(cardIcon(id)), h('b', {}, String(cards[id])))));
}

export interface DraftCfg {
  round: number;
  hand: CardId[];
  owned: TeamCards;
  enemyOwned: TeamCards;
  /** each teammate's vote (index into hand) */
  votes: Array<{ look: string; name: string; pick: number }>;
  seconds: number;
}

export function draftScreen(cfg: DraftCfg, on: { flip: () => void; tap: () => void; play: (id: CardId) => void }): HTMLElement {
  let chosen = -1;
  let done = false;
  const flipped = cfg.hand.map(() => false);
  const cards: HTMLElement[] = [];
  const playBtn = h('button', { class: 'cta', disabled: true }, 'PLAY CARD');
  const timerEl = h('div', { class: 'os-timer' }, String(cfg.seconds));
  const flip = (i: number) => {
    if (flipped[i]) return;
    flipped[i] = true;
    cards[i].classList.add('flipped');
    on.flip();
    // teammate votes appear once the card is face up
    const voters = cfg.votes.filter((v) => v.pick === i);
    if (voters.length) cards[i].querySelector('.wc-votes')!.append(...voters.map((v) => h('img', { class: 'pix', src: portrait(v.look), alt: v.name, title: `${v.name} votes this` })));
  };
  const select = (i: number) => {
    if (!flipped[i]) return flip(i);
    chosen = i;
    on.tap();
    cards.forEach((c, j) => c.classList.toggle('chosen', j === i));
    playBtn.removeAttribute('disabled');
  };
  const play = () => {
    if (done) return;
    if (chosen < 0) {
      // auto: reveal everything and take the squad's favourite
      cfg.hand.forEach((_, i) => flip(i));
      const tally = cfg.hand.map((_, i) => cfg.votes.filter((v) => v.pick === i).length);
      chosen = tally.indexOf(Math.max(...tally));
    }
    done = true;
    clearInterval(iv);
    on.play(cfg.hand[chosen]);
  };
  cfg.hand.forEach((id, i) => {
    const el = h(
      'button',
      { class: 'wc-card', onclick: () => select(i) },
      h('div', { class: 'wc-inner' }, h('div', { class: 'wc-back' }, h('div', { class: 'wc-back-mark' }, '?'), h('small', {}, 'TAP TO FLIP')), cardFace(id, cfg.owned[id] ?? 0, h('div', { class: 'wc-votes' }))),
    );
    cards.push(el);
  });
  playBtn.addEventListener('click', play);
  const revealAll = h('button', { class: 'ov-btn', onclick: () => cfg.hand.forEach((_, i) => flip(i)) }, 'REVEAL ALL');
  let left = cfg.seconds;
  const iv = window.setInterval(() => {
    if (!root.isConnected) return clearInterval(iv);
    left--;
    timerEl.textContent = String(Math.max(0, left));
    timerEl.classList.toggle('low', left <= 5);
    if (left <= 0) play();
  }, 1000);
  const root: HTMLElement = h(
    'div',
    { class: 'draft' },
    h('div', { class: 'os-head' }, h('div', {}, h('div', { class: 'os-round' }, `ROUND ${cfg.round + 1}`), h('div', { class: 'os-title' }, 'WILD CARD DRAFT', h('small', {}, 'PICK ONE FOR YOUR SQUAD · DUPLICATES LEVEL UP'))), timerEl),
    h('div', { class: 'wc-row' }, ...cards),
    h(
      'div',
      { class: 'os-foot' },
      h('div', { class: 'wc-decks' }, h('span', { class: 'own' }, 'YOUR DECK'), cardStrip(cfg.owned), h('span', { class: 'foe' }, 'ENEMY DECK'), cardStrip(cfg.enemyOwned)),
      h('div', { class: 'row' }, revealAll, playBtn),
    ),
  );
  return root;
}

/** Brief reveal of what the opponents drafted. */
export function enemyRevealScreen(id: CardId, level: number): HTMLElement {
  const c = cardById(id);
  return h('div', { class: 'draft reveal' }, h('div', { class: 'wc-reveal-title' }, 'OPPONENTS DRAFTED'), h('div', { class: 'wc-card flipped static' }, h('div', { class: 'wc-inner' }, h('div', { class: 'wc-back' }), cardFace(id, level - 1))), h('div', { class: 'fine' }, level > 1 ? `${c.name} is now level ${level}` : 'A new card for them'));
}
