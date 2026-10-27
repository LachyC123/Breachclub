// Wild cards: each round both teams draft one card; cards last the whole match and a card drafted
// again levels up (max 3). Lasts one match only (never permanent progression). Stable ids.
export type CardId = 'adrenaline' | 'hollow' | 'kevlar' | 'quickdraw' | 'vampire' | 'poison' | 'aimbot' | 'turret' | 'missile' | 'pulse' | 'ghost' | 'explosive';

export type Rarity = 'common' | 'rare' | 'epic';

export interface CardDef {
  id: CardId;
  name: string;
  rarity: Rarity;
  /** active cards give the team charges each round (a button to use them) */
  active: boolean;
  /** one line per level 1..3 */
  levels: [string, string, string];
  flavour: string;
}

export const CARDS: CardDef[] = [
  { id: 'adrenaline', name: 'ADRENALINE', rarity: 'common', active: false, levels: ['+12% move speed', '+20% move speed', '+28% move speed'], flavour: 'Your squad runs hot.' },
  { id: 'hollow', name: 'HOLLOW POINTS', rarity: 'common', active: false, levels: ['+12% gun damage', '+20% gun damage', '+28% gun damage'], flavour: 'Every bullet hits harder.' },
  { id: 'kevlar', name: 'KEVLAR', rarity: 'common', active: false, levels: ['+25 max health', '+40 max health', '+60 max health'], flavour: 'Start every round armoured up.' },
  { id: 'quickdraw', name: 'QUICKDRAW', rarity: 'common', active: false, levels: ['Reload 30% faster, +1 spare mag', 'Reload 45% faster, +2 spare mags', 'Reload 60% faster, +3 spare mags'], flavour: 'Never caught swapping mags.' },
  { id: 'vampire', name: 'VAMPIRE', rarity: 'rare', active: false, levels: ['Kills heal 35', 'Kills heal 60', 'Kills heal to full'], flavour: 'Take their health with you.' },
  { id: 'ghost', name: 'GHOST STEP', rarity: 'rare', active: false, levels: ['Footsteps carry half as far', 'Silent footsteps', 'Silent footsteps and reloads, quieter shots'], flavour: 'They will not hear you coming.' },
  { id: 'pulse', name: 'RECON PULSE', rarity: 'rare', active: false, levels: ['Ping every enemy every 16 s', 'Ping every enemy every 12 s', 'Ping every enemy every 9 s'], flavour: 'They know you know.' },
  { id: 'poison', name: 'POISON ROUNDS', rarity: 'epic', active: false, levels: ['Hits poison: 4 dmg/s for 3 s', 'Hits poison: 6 dmg/s for 3 s', 'Hits poison: 8 dmg/s for 3 s'], flavour: 'Every scratch keeps hurting.' },
  { id: 'explosive', name: 'EXPLOSIVE ROUNDS', rarity: 'epic', active: false, levels: ['Every 6th bullet explodes', 'Every 5th bullet explodes', 'Every 4th bullet explodes'], flavour: 'Some bullets go bang.' },
  { id: 'aimbot', name: 'AIMBOT', rarity: 'epic', active: false, levels: ['Aim snaps to enemies you can see (20°)', 'Stronger snap (28°)', 'Hard lock (36°)'], flavour: 'Only on what you can actually see.' },
  { id: 'turret', name: 'SENTRY TURRET', rarity: 'epic', active: true, levels: ['1 turret per round', '2 turrets per round', '3 turrets per round'], flavour: 'Drop an auto-gun that guards an angle for 30 s.' },
  { id: 'missile', name: 'MISSILE STRIKE', rarity: 'epic', active: true, levels: ['1 strike per round', '2 strikes per round', '3 strikes per round'], flavour: 'Call a missile anywhere you can see on the map. 1.6 s warning.' },
];

export const cardById = (id: CardId): CardDef => CARDS.find((c) => c.id === id)!;

export type TeamCards = Partial<Record<CardId, number>>;

const WEIGHT: Record<Rarity, number> = { common: 5, rare: 3, epic: 2 };

/** Deal `n` distinct cards (seeded), skipping cards the team already has at level 3. */
export function dealCards(rand: () => number, owned: TeamCards, n = 3): CardId[] {
  const pool = CARDS.filter((c) => (owned[c.id] ?? 0) < 3);
  const out: CardId[] = [];
  while (out.length < n && out.length < pool.length) {
    const avail = pool.filter((c) => !out.includes(c.id));
    const total = avail.reduce((s, c) => s + WEIGHT[c.rarity], 0);
    let r = rand() * total;
    for (const c of avail) {
      r -= WEIGHT[c.rarity];
      if (r <= 0) {
        out.push(c.id);
        break;
      }
    }
    if (r > 0) out.push(avail[avail.length - 1].id);
  }
  return out;
}

export const lvl = (cards: TeamCards | undefined, id: CardId): number => cards?.[id] ?? 0;
