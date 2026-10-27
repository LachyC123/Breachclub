// Operator and squadmate sprites: 24x32 frames, eight facings (five authored, three mirrored),
// idle (2) + walk (4) frames, plus a collapse frame. Weapons are a separate 16-angle aim layer.
import { P } from '../palette';
import { Pix } from '../pixel';

export const FRAME_W = 24;
export const FRAME_H = 32;
export const FEET_Y = 29;
export const COLS = 6; // idle0 idle1 walk0..3

export interface Look {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: 'swept' | 'bun' | 'cap' | 'beanie' | 'bandana' | 'bob';
  hat?: string;
  top: string;
  topShade: string;
  topLight: string;
  under?: string;
  pants: string;
  pantsShade: string;
  shoes: string;
  long?: boolean;
  pack?: 'wheel' | 'door' | 'bag' | 'none';
  pad?: string;
  scarf?: string;
}

export const LOOKS: Record<string, Look> = {
  ram: {
    skin: P.skin2,
    skinShade: P.skin3,
    hair: P.brownDark,
    hairShade: P.brownDeep,
    hairStyle: 'swept',
    top: P.coral,
    topShade: P.coralDark,
    topLight: P.coralLight,
    under: P.teal,
    pants: P.navy2,
    pantsShade: P.navy,
    shoes: P.cream,
    pack: 'wheel',
  },
  hinge: {
    skin: P.skin3,
    skinShade: P.skin4,
    hair: P.ink,
    hairShade: P.navy,
    hairStyle: 'bun',
    top: P.violet,
    topShade: P.violetDark,
    topLight: P.violetLight,
    pants: P.navy2,
    pantsShade: P.navy,
    shoes: P.brownDark,
    long: true,
    pack: 'door',
    pad: P.amber,
  },
  mo: {
    skin: P.skin2,
    skinShade: P.skin3,
    hair: P.ink,
    hairShade: P.navy,
    hairStyle: 'cap',
    hat: P.navy2,
    top: P.teal,
    topShade: P.tealDark,
    topLight: P.tealLight,
    pants: P.slate,
    pantsShade: P.navy2,
    shoes: P.white,
    pack: 'bag',
  },
  tess: {
    skin: P.skin4,
    skinShade: '#55341f',
    hair: P.ink,
    hairShade: P.navy,
    hairStyle: 'bandana',
    hat: P.coral,
    top: P.amber,
    topShade: P.amberDark,
    topLight: P.amberLight,
    under: P.cream,
    pants: P.brownDark,
    pantsShade: P.brownDeep,
    shoes: P.ink,
    pack: 'none',
  },
  dex: {
    skin: P.skin1,
    skinShade: P.skin2,
    hair: P.coralDark,
    hairShade: P.coralDeep,
    hairStyle: 'beanie',
    hat: P.navy2,
    top: P.green,
    topShade: P.greenDark,
    topLight: P.mint,
    pants: P.green,
    pantsShade: P.greenDark,
    shoes: P.brownDark,
    pack: 'none',
  },
  june: {
    skin: P.skin2,
    skinShade: P.skin3,
    hair: P.amberLight,
    hairShade: P.amberDark,
    hairStyle: 'bob',
    top: P.coralDeep,
    topShade: '#5a2028',
    topLight: P.coral,
    pants: P.navy2,
    pantsShade: P.navy,
    shoes: P.ink,
    long: true,
    pack: 'none',
    scarf: P.cream,
  },
  // shooting-range target: a padded canvas mannequin with a painted bullseye (original art)
  dummy: {
    skin: P.tan,
    skinShade: P.brown,
    hair: P.creamDark,
    hairShade: P.tan,
    hairStyle: 'beanie',
    hat: P.coral,
    top: P.cream,
    topShade: P.creamDark,
    topLight: P.cream2,
    under: P.coral,
    pants: P.slate,
    pantsShade: P.navy2,
    shoes: P.ink,
    pack: 'none',
  },
};

/** facing index: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE */
export function dirIndex(angle: number): number {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI / 4)) % 8;
}

type View = 'S' | 'SE' | 'E' | 'NE' | 'N';
const VIEW_OF: Array<{ view: View; flip: boolean }> = [
  { view: 'E', flip: false },
  { view: 'SE', flip: false },
  { view: 'S', flip: false },
  { view: 'SE', flip: true },
  { view: 'E', flip: true },
  { view: 'NE', flip: true },
  { view: 'N', flip: false },
  { view: 'NE', flip: false },
];

function drawBody(look: Look, view: View, frame: number): Pix {
  const p = new Pix(FRAME_W, FRAME_H);
  const walking = frame >= 2;
  const wf = frame - 2;
  const bob = walking ? (wf % 2 === 1 ? -1 : 0) : frame === 1 ? -1 : 0;
  const side = view === 'E';
  const back = view === 'N' || view === 'NE';

  // ---- pack behind body (visible when facing away or sideways) ----
  const drawPackBehind = () => {
    if (look.pack === 'door') {
      // folding door carried vertically: tall panel above the shoulders
      const x = side ? 5 : back ? 8 : 15;
      p.rect(x, 2 + bob, 7, 18, P.creamDark);
      p.vl(x, 2 + bob, 19 + bob, P.cream2);
      p.hl(x, x + 6, 2 + bob, P.cream2);
      p.hl(x + 1, x + 5, 8 + bob, P.tan).hl(x + 1, x + 5, 14 + bob, P.tan);
      p.px(x + 3, 5 + bob, P.amber).px(x + 3, 11 + bob, P.amber);
    }
  };
  const drawPackFront = () => {
    if (look.pack === 'wheel') {
      if (back) {
        p.ellipse(12, 17 + bob, 5, 5, P.yellow);
        p.ellipse(12, 17 + bob, 3, 3, P.navy2);
        p.ellipse(12, 17 + bob, 1, 1, P.metalLight);
        p.px(9, 14 + bob, P.amberLight).px(10, 13 + bob, P.amberLight);
      } else if (side) {
        p.rect(5, 13 + bob, 4, 9, P.yellow);
        p.vl(5, 13 + bob, 21 + bob, P.amberDark);
        p.px(6, 16 + bob, P.navy2).px(6, 18 + bob, P.navy2);
      } else {
        // straps + wheel rims peeking over shoulders
        p.rect(6, 13 + bob, 2, 3, P.yellow).rect(16, 13 + bob, 2, 3, P.yellow);
      }
    }
    if (look.pack === 'bag' && back) {
      p.rect(9, 15 + bob, 6, 6, P.tealDeep);
      p.hl(9, 14, 15 + bob, P.tealDark);
    }
  };

  if (!back) drawPackBehind();

  // ---- legs ----
  const legY = 22;
  const legLen = 6;
  if (side) {
    const s = walking ? [2, 0, -2, 0][wf] : 0;
    p.rect(11 - s, legY, 2, legLen, look.pantsShade);
    p.rect(11 + s, legY, 2, legLen, look.pants);
    p.rect(11 - s, legY + legLen - 1, 3, 1, look.shoes);
    p.rect(11 + s, legY + legLen - 1, 3, 1, look.shoes);
  } else {
    const l = walking ? [0, -1, 0, 0][wf] : 0;
    const r = walking ? [0, 0, 0, -1][wf] : 0;
    p.rect(9, legY, 2, legLen + l, look.pants);
    p.rect(13, legY, 2, legLen + r, look.pants);
    p.vl(10, legY, legY + legLen + l - 1, look.pantsShade);
    p.vl(14, legY, legY + legLen + r - 1, look.pantsShade);
    p.rect(9, legY + legLen - 1 + l, 2, 1, look.shoes);
    p.rect(13, legY + legLen - 1 + r, 2, 1, look.shoes);
  }

  // ---- torso ----
  const tx = side ? 8 : 7;
  const tw = side ? 8 : 10;
  const ty = 14 + bob;
  const th = look.long ? 12 : 9;
  p.rect(tx, ty, tw, th, look.top);
  p.vl(tx + tw - 1, ty, ty + th - 1, look.topShade);
  p.hl(tx, tx + tw - 1, ty + th - 1, look.topShade);
  p.hl(tx + 1, tx + tw - 2, ty, look.topLight);
  if (look.under && !back) {
    // cropped jacket over shirt / vest over shirt
    p.rect(tx + 3, ty + 1, tw - 6, th - 2, look.under);
    p.vl(tx + 3, ty + 1, ty + th - 2, look.topShade);
  }
  if (look.long && !side) {
    // apron/coat split
    p.vl(12, ty + 6, ty + th - 1, look.topShade);
  }
  if (look.scarf) p.rect(tx + 1, ty, tw - 2, 2, look.scarf);
  // belt
  if (!look.long) p.hl(tx, tx + tw - 1, ty + th - 2, look.pantsShade);
  // arms/sleeves
  if (side) {
    p.rect(tx + 2, ty + 2, 3, 5, look.topShade);
  } else {
    p.rect(tx - 1, ty + 1, 2, 6, look.topShade);
    p.rect(tx + tw - 1, ty + 1, 2, 6, look.topShade);
    p.px(tx - 1, ty + 7, look.skinShade).px(tx + tw, ty + 7, look.skinShade);
  }
  if (look.pad) p.rect(side ? tx + 1 : tx + tw - 2, ty - 1, 4, 3, look.pad);

  // ---- head ----
  const hx = side ? 9 : 8;
  const hy = 5 + bob;
  p.rect(hx, hy + 1, 8, 8, look.skin);
  p.hl(hx + 1, hx + 6, hy, look.skin);
  p.vl(hx + 7, hy + 1, hy + 8, look.skinShade);
  p.hl(hx, hx + 7, hy + 8, look.skinShade);
  // neck shadow
  p.hl(hx + 2, hx + 5, hy + 9, look.skinShade);

  // face
  if (view === 'S') {
    p.px(hx + 2, hy + 5, P.ink).px(hx + 5, hy + 5, P.ink);
    p.px(hx + 1, hy + 6, P.coralLight).px(hx + 6, hy + 6, P.coralLight);
  } else if (view === 'SE') {
    p.px(hx + 4, hy + 5, P.ink).px(hx + 6, hy + 5, P.ink);
  } else if (view === 'E') {
    p.px(hx + 6, hy + 5, P.ink);
    p.px(hx + 7, hy + 6, look.skinShade);
  }

  // hair
  const H = look.hair;
  const HS = look.hairShade;
  switch (look.hairStyle) {
    case 'swept':
      p.rect(hx, hy - 1, 8, 4, H);
      p.hl(hx + 1, hx + 7, hy - 2, H);
      if (side) p.rect(hx - 1, hy, 3, 5, H);
      if (back) p.rect(hx, hy, 8, 7, H);
      p.hl(hx + 1, hx + 6, hy - 1, HS);
      p.px(hx + 6, hy - 2, P.tan);
      break;
    case 'bun':
      p.rect(hx, hy - 1, 8, 3, H);
      p.ellipse(hx + 4, hy - 3, 2, 2, H);
      p.px(hx + 3, hy - 4, HS);
      if (back) p.rect(hx, hy, 8, 6, H);
      if (side) p.rect(hx - 1, hy, 2, 4, H);
      break;
    case 'cap':
      p.rect(hx, hy - 1, 8, 3, look.hat!);
      p.hl(hx, hx + 7, hy - 1, P.slate);
      if (view === 'S' || view === 'SE') p.rect(hx + (view === 'SE' ? 2 : 0), hy + 2, 8, 1, look.hat!);
      if (side) p.rect(hx + 5, hy + 2, 4, 1, look.hat!);
      if (back) p.rect(hx, hy, 8, 5, H);
      break;
    case 'beanie':
      p.rect(hx, hy - 2, 8, 5, look.hat!);
      p.hl(hx, hx + 7, hy + 2, P.slate);
      p.px(hx + 3, hy - 3, P.slate2);
      if (back) p.rect(hx, hy + 3, 8, 3, H);
      break;
    case 'bandana':
      p.rect(hx, hy - 1, 8, 3, look.hat!);
      p.hl(hx, hx + 7, hy - 1, P.coralLight);
      if (back || side) p.rect(hx - 1, hy + 1, 2, 3, look.hat!);
      if (back) p.rect(hx, hy + 2, 8, 4, H);
      break;
    case 'bob':
      p.rect(hx - 1, hy - 1, 10, 4, H);
      p.rect(hx - 1, hy + 2, 2, 5, H);
      p.rect(hx + 7, hy + 2, 2, 5, H);
      p.hl(hx, hx + 7, hy - 1, look.hairShade);
      if (back) p.rect(hx, hy, 8, 8, H);
      break;
  }
  if (back) p.vl(hx + 7, hy, hy + 6, HS);

  drawPackFront();
  if (back && look.pack === 'door') {
    // carried on the back: visible beside the head, slung across the shoulders
    const x = view === 'N' ? 13 : 12;
    p.rect(x, 3 + bob, 6, 17, P.creamDark);
    p.vl(x, 3 + bob, 19 + bob, P.cream2);
    p.hl(x, x + 5, 3 + bob, P.cream2);
    p.hl(x + 1, x + 4, 9 + bob, P.tan).hl(x + 1, x + 4, 15 + bob, P.tan);
    p.px(x + 3, 6 + bob, P.amber).px(x + 3, 12 + bob, P.amber);
  }
  p.outline(P.outline);
  return p;
}

/** A spritesheet canvas: rows = 8 facings, cols = idle0 idle1 walk0..3. */
export function buildCharacterSheet(lookId: string): HTMLCanvasElement {
  const look = LOOKS[lookId] ?? LOOKS.mo;
  const sheet = new Pix(FRAME_W * COLS, FRAME_H * 8);
  for (let d = 0; d < 8; d++) {
    const { view, flip } = VIEW_OF[d];
    for (let f = 0; f < COLS; f++) {
      const body = drawBody(look, view, f);
      sheet.draw(body, f * FRAME_W, d * FRAME_H, flip);
    }
  }
  return sheet.c;
}

/** Collapse frame (readable, no gore). */
export function buildDeadSprite(lookId: string): HTMLCanvasElement {
  const look = LOOKS[lookId] ?? LOOKS.mo;
  const p = new Pix(28, 16);
  // lying on side: legs left, head right
  p.rect(3, 8, 7, 3, look.pants);
  p.rect(3, 11, 7, 2, look.pantsShade);
  p.rect(1, 9, 2, 3, look.shoes);
  p.rect(10, 6, 9, 7, look.top);
  p.hl(10, 18, 12, look.topShade);
  p.rect(19, 5, 6, 6, look.skin);
  p.rect(19, 4, 6, 3, look.hair);
  if (look.hat) p.rect(19, 4, 6, 2, look.hat);
  p.rect(13, 3, 4, 3, look.topShade); // arm
  p.outline(P.outline);
  return p.c;
}

/** Head portrait for HUD cards. */
export function buildPortrait(lookId: string): HTMLCanvasElement {
  const look = LOOKS[lookId] ?? LOOKS.mo;
  const body = drawBody(look, 'S', 0);
  const p = new Pix(16, 16);
  p.g.drawImage(body.c, 4, 1, 16, 16, 0, 0, 16, 16);
  return p.c;
}

// ---------- weapons (aim layer) ----------

export const WEAPON_ANGLES = 16;
export const GUN_SIZE = 24;

const GUN: Record<string, { len: number; thick: boolean; body: string; accent: string }> = {
  smg: { len: 7, thick: false, body: P.slate3, accent: P.metalLight },
  carbine: { len: 10, thick: false, body: P.metal, accent: P.brown },
  scattergun: { len: 9, thick: true, body: P.metalLight, accent: P.brown },
};

export function buildWeaponSheet(weaponId: string): HTMLCanvasElement {
  const g = GUN[weaponId] ?? GUN.smg;
  const sheet = new Pix(GUN_SIZE * WEAPON_ANGLES, GUN_SIZE);
  for (let i = 0; i < WEAPON_ANGLES; i++) {
    const a = (i / WEAPON_ANGLES) * Math.PI * 2;
    const p = new Pix(GUN_SIZE, GUN_SIZE);
    const cx = 12;
    const cy = 12;
    const ex = cx + Math.cos(a) * g.len;
    const ey = cy + Math.sin(a) * g.len;
    // stock behind the grip
    p.line(cx - Math.cos(a) * 2, cy - Math.sin(a) * 2, cx, cy, g.accent);
    p.line(cx, cy, ex, ey, g.body);
    if (g.thick) p.line(cx + 1 * -Math.sin(a), cy + 1 * Math.cos(a), ex - Math.cos(a) * 2 - Math.sin(a), ey - Math.sin(a) * 2 + Math.cos(a), g.accent);
    else p.px(cx + Math.cos(a) * (g.len * 0.5), cy + Math.sin(a) * (g.len * 0.5) + 1, g.accent);
    // gloved hands
    p.px(cx, cy, P.navy).px(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, P.navy);
    p.outline(P.outline);
    sheet.draw(p, i * GUN_SIZE, 0);
  }
  return sheet.c;
}

export function weaponFrame(angle: number): number {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / ((Math.PI * 2) / WEAPON_ANGLES)) % WEAPON_ANGLES;
}

export function weaponLength(weaponId: string): number {
  return (GUN[weaponId] ?? GUN.smg).len;
}
