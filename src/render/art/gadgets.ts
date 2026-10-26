// Gadget, effect, marker and UI icon art.
import { P } from '../palette';
import { Pix, rotateDesign } from '../pixel';

export const SLED_ANGLES = 16;
export const SLED_SIZE = 20;
export const COVER_ANGLES = 16;
export const COVER_SIZE = 30;
export const HINGE_STEPS = 19; // 0..90 degrees in 5 degree steps
export const HINGE_SIZE = 38;

function sledDesign(): Pix {
  // facing +x; squat salvage sled with bumper and fat wheels
  const p = new Pix(16, 12);
  p.rect(1, 1, 3, 3, P.ink).rect(1, 8, 3, 3, P.ink).rect(10, 1, 3, 3, P.ink).rect(10, 8, 3, 3, P.ink);
  p.rect(2, 3, 11, 6, P.yellow);
  p.hl(2, 12, 3, P.amberLight);
  p.hl(2, 12, 8, P.amberDark);
  for (let x = 3; x < 12; x += 3) p.px(x, 5, P.navy2).px(x + 1, 6, P.navy2);
  p.rect(13, 1, 3, 10, P.coral);
  p.vl(15, 1, 10, P.coralDark);
  p.vl(13, 1, 10, P.coralLight);
  p.px(0, 5, P.slate).px(0, 6, P.slate);
  return p;
}

export function buildSledSheet(): HTMLCanvasElement {
  const d = sledDesign();
  const sheet = new Pix(SLED_SIZE * SLED_ANGLES, SLED_SIZE);
  for (let i = 0; i < SLED_ANGLES; i++) {
    const r = rotateDesign(d, (i / SLED_ANGLES) * Math.PI * 2, SLED_SIZE);
    r.outline(P.outline);
    sheet.draw(r, i * SLED_SIZE, 0);
  }
  return sheet.c;
}

function coverDesign(): Pix {
  // unfolded bumper shield: 1.5 tiles long
  const p = new Pix(24, 7);
  p.rect(0, 0, 24, 7, P.metal);
  p.hl(0, 23, 0, P.metalLight);
  p.hl(0, 23, 6, P.slate);
  for (let x = 1; x < 23; x += 4) {
    p.px(x, 2, P.amber).px(x + 1, 3, P.amber).px(x + 2, 4, P.amber);
  }
  p.rect(0, 0, 2, 7, P.coral).rect(22, 0, 2, 7, P.coral);
  p.px(12, 3, P.navy2);
  return p;
}

export function buildCoverSheet(): HTMLCanvasElement {
  const d = coverDesign();
  const sheet = new Pix(COVER_SIZE * COVER_ANGLES, COVER_SIZE);
  for (let i = 0; i < COVER_ANGLES; i++) {
    const r = rotateDesign(d, (i / COVER_ANGLES) * Math.PI * 2, COVER_SIZE);
    r.outline(P.outline);
    sheet.draw(r, i * COVER_SIZE, 0);
  }
  return sheet.c;
}

function hingeDesign(warn: boolean): Pix {
  // 2-tile pivot wall: violet painted door panels, cream trim, amber pivot bolt
  const p = new Pix(32, 6);
  p.rect(0, 0, 32, 6, P.violet);
  p.hl(0, 31, 0, P.violetLight);
  p.hl(0, 31, 5, P.violetDark);
  p.vl(0, 0, 5, P.cream).vl(31, 0, 5, P.cream);
  p.vl(10, 1, 4, P.violetDark).vl(21, 1, 4, P.violetDark);
  p.rect(14, 1, 4, 4, P.amber);
  p.px(15, 2, P.amberLight).px(16, 3, P.amberDark);
  if (warn) {
    for (const x of [4, 24]) {
      p.px(x, 2, P.amberLight).px(x + 1, 1, P.amberLight).px(x + 1, 3, P.amberLight).px(x + 2, 2, P.amberLight);
    }
  }
  return p;
}

/** frames: [normal 0..90deg..., warning 0..90deg...] */
export function buildHingeSheet(): HTMLCanvasElement {
  const sheet = new Pix(HINGE_SIZE * HINGE_STEPS, HINGE_SIZE * 2);
  for (const [row, warn] of [
    [0, false],
    [1, true],
  ] as Array<[number, boolean]>) {
    const d = hingeDesign(warn);
    for (let i = 0; i < HINGE_STEPS; i++) {
      const r = rotateDesign(d, ((i * 5) / 180) * Math.PI, HINGE_SIZE);
      r.outline(P.outline);
      sheet.draw(r, i * HINGE_SIZE, row * HINGE_SIZE);
    }
  }
  return sheet.c;
}

export function buildCharge(blink: boolean): HTMLCanvasElement {
  const p = new Pix(8, 8);
  p.rect(1, 2, 6, 5, P.amber);
  p.hl(1, 6, 2, P.amberLight);
  p.rect(2, 4, 4, 2, P.navy2);
  p.px(3, 1, P.slate).px(4, 1, P.slate);
  p.px(5, 4, blink ? P.coralLight : P.coralDeep);
  p.outline(P.outline);
  return p.c;
}

export function buildMuzzle(frame: number): HTMLCanvasElement {
  const p = new Pix(9, 9);
  const c = 4;
  const r = frame === 0 ? 4 : frame === 1 ? 3 : 2;
  p.ellipse(c, c, r - 1, r - 1, P.amber);
  p.hl(c - r, c + r, c, P.amberLight);
  p.vl(c, c - r, c + r, P.amberLight);
  p.ellipse(c, c, 1, 1, P.white);
  return p.c;
}

export function buildDust(frame: number): HTMLCanvasElement {
  const p = new Pix(16, 16);
  const r = 3 + frame * 2;
  const cols = [P.cream2, P.cream, P.creamDark, P.tan];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39;
    const d = (i % 5) * (r / 5);
    const x = 8 + Math.cos(a) * d;
    const y = 8 + Math.sin(a) * d;
    if ((i + frame) % 4 === 3 && frame > 1) continue;
    p.rect(x, y, 2, 2, cols[(i + frame) % 4]);
  }
  return p.c;
}

/** Team ring under actors: shapes accompany colour (ally circle, enemy diamond ticks). */
export function buildRing(kind: 'player' | 'ally' | 'enemy' | 'ghost'): HTMLCanvasElement {
  const p = new Pix(18, 9);
  const col = kind === 'player' ? P.amber : kind === 'ally' ? P.tealLight : kind === 'enemy' ? P.coral : P.coralLight;
  // pixel ellipse outline
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    if (kind === 'ghost' && a % 4 >= 2) continue;
    p.px(Math.round(9 + Math.cos(t) * 7.5 - 0.5), Math.round(4 + Math.sin(t) * 3.5 - 0.5), col);
  }
  if (kind === 'enemy') {
    p.px(0, 4, col).px(1, 3, col).px(1, 5, col);
    p.px(17, 4, col).px(16, 3, col).px(16, 5, col);
  }
  if (kind === 'player') {
    p.hl(6, 11, 8, col);
  }
  return p.c;
}

// ---------- UI icons (16x16, scaled up by CSS with pixelated rendering) ----------

export type IconName =
  | 'sled'
  | 'hinge'
  | 'rotate'
  | 'breach'
  | 'arm'
  | 'shutoff'
  | 'reinforce'
  | 'barricade'
  | 'remove'
  | 'vault'
  | 'reload'
  | 'orders'
  | 'pause'
  | 'follow'
  | 'hold'
  | 'auto'
  | 'brake'
  | 'ready'
  | 'cancel'
  | 'sound';

export function buildIcon(name: IconName): HTMLCanvasElement {
  const p = new Pix(16, 16);
  const C = P.cream2;
  const A = P.amber;
  switch (name) {
    case 'sled': {
      p.rect(2, 6, 9, 5, P.yellow).hl(2, 10, 6, P.amberLight);
      p.rect(11, 4, 3, 9, P.coral);
      p.rect(2, 11, 3, 2, P.ink).rect(8, 11, 3, 2, P.ink).rect(2, 4, 3, 2, P.ink).rect(8, 4, 3, 2, P.ink);
      p.px(0, 8, C).px(1, 8, C);
      break;
    }
    case 'brake': {
      p.rect(3, 7, 10, 3, P.metal).hl(3, 12, 7, P.metalLight);
      p.rect(2, 6, 2, 5, P.coral).rect(12, 6, 2, 5, P.coral);
      p.vl(8, 2, 5, A).px(7, 4, A).px(9, 4, A);
      p.vl(8, 11, 14, A).px(7, 12, A).px(9, 12, A);
      break;
    }
    case 'hinge':
    case 'rotate': {
      p.rect(2, 7, 12, 3, P.violet).hl(2, 13, 7, P.violetLight);
      p.rect(7, 7, 3, 3, A);
      if (name === 'rotate') {
        p.line(11, 2, 14, 5, A).px(14, 3, A).px(13, 2, A);
        p.line(5, 14, 2, 11, A).px(2, 13, A).px(3, 14, A);
      }
      break;
    }
    case 'breach': {
      p.rect(4, 5, 8, 7, A).hl(4, 11, 5, P.amberLight);
      p.rect(5, 8, 6, 2, P.navy2);
      p.px(10, 7, P.coralLight);
      p.line(6, 4, 8, 1, P.slate3).px(9, 1, P.coral);
      break;
    }
    case 'arm': {
      p.rect(2, 4, 12, 9, C).rect(3, 5, 7, 5, P.teal);
      p.hl(3, 9, 6, P.tealLight);
      p.px(12, 6, A).px(12, 9, P.coral);
      p.vl(13, 1, 4, P.slate2);
      break;
    }
    case 'shutoff': {
      p.ring(8, 9, 5, C);
      p.rect(7, 2, 3, 7, C);
      p.rect(7, 3, 3, 1, P.coral);
      break;
    }
    case 'reinforce': {
      p.rect(3, 2, 10, 12, P.metal).hl(3, 12, 2, P.metalLight);
      for (let x = 3; x < 13; x += 4) p.line(x, 13, x + 3, 9, A);
      p.px(5, 4, P.navy2).px(10, 4, P.navy2);
      break;
    }
    case 'barricade':
    case 'remove': {
      for (let r = 0; r < 3; r++) p.rect(1, 4 + r * 3, 14, 2, r % 2 ? P.brown : P.tan);
      p.vl(3, 2, 13, P.brownDark).vl(12, 2, 13, P.brownDark);
      if (name === 'remove') p.line(2, 2, 13, 13, P.coral).line(3, 2, 14, 13, P.coral);
      break;
    }
    case 'vault': {
      p.rect(6, 6, 4, 9, P.glass).vl(6, 6, 14, P.metalLight);
      p.line(1, 11, 7, 3, C).line(7, 3, 14, 11, C);
      p.px(13, 9, C).px(14, 10, C).px(12, 11, C);
      break;
    }
    case 'reload': {
      p.rect(5, 2, 6, 12, P.slate3).rect(6, 3, 4, 3, A).rect(6, 7, 4, 3, A).rect(6, 11, 4, 2, A);
      break;
    }
    case 'orders': {
      for (const y of [3, 7, 11]) p.line(3, y + 3, 8, y, C).line(8, y, 13, y + 3, C);
      break;
    }
    case 'pause': {
      p.rect(4, 3, 3, 10, C).rect(9, 3, 3, 10, C);
      break;
    }
    case 'follow': {
      p.ellipse(8, 5, 2, 2, C).rect(6, 8, 5, 5, C);
      p.line(1, 12, 4, 9, A).px(4, 10, A).px(3, 9, A);
      break;
    }
    case 'hold': {
      p.rect(3, 3, 10, 10, P.navy2).ring(8, 8, 5, A).rect(7, 7, 2, 2, A);
      break;
    }
    case 'auto': {
      p.ring(8, 8, 6, C);
      p.line(8, 8, 8, 3, A).line(8, 8, 12, 10, A);
      break;
    }
    case 'ready': {
      p.line(3, 8, 6, 11, P.tealLight).line(6, 11, 13, 4, P.tealLight).line(3, 9, 6, 12, P.tealLight).line(6, 12, 13, 5, P.tealLight);
      break;
    }
    case 'cancel': {
      p.line(3, 3, 12, 12, P.coral).line(4, 3, 13, 12, P.coral).line(12, 3, 3, 12, P.coral).line(13, 3, 4, 12, P.coral);
      break;
    }
    case 'sound': {
      p.rect(2, 6, 3, 4, C).line(5, 6, 8, 3, C).line(5, 9, 8, 12, C).vl(8, 3, 12, C);
      p.vl(11, 5, 10, A).vl(13, 3, 12, A);
      break;
    }
  }
  p.outline(P.outline);
  return p.c;
}
