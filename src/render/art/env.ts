// Spin Cycle environment art: floors, 3/4 walls, props, signage. Authored procedurally at
// 16px tiles with the BREACH CLUB palette; deterministic per-cell variation via hash().
import { P } from '../palette';
import { Pix, hash } from '../pixel';
import { CellKind, type MapData } from '../../sim/mapdata';

export const T = 16;
const FACE_TOP = 6; // wall top band height; the remaining 10px is the wall face

type Floor = 'tile' | 'wood' | 'concrete' | 'lino' | 'asphalt' | 'cobble' | 'sidewalk';

export function floorKindAt(m: MapData, x: number, y: number): Floor {
  const ri = m.roomOf[y * m.w + x];
  if (ri < 0) return 'concrete';
  const room = m.rooms[ri];
  if (room.id === 'street') return y === 23 ? 'sidewalk' : 'asphalt';
  return room.floor as Floor;
}

function drawFloor(p: Pix, ox: number, oy: number, kind: Floor, cx: number, cy: number) {
  const h = (i: number) => hash(cx, cy, i);
  switch (kind) {
    case 'tile': {
      // laundrette checker: cream / warm dark cream with tan grout and grime
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const dark = (cx * 2 + i + cy * 2 + j) % 2 === 1;
          p.rect(ox + i * 8, oy + j * 8, 8, 8, dark ? P.creamDark : P.cream2);
          p.hl(ox + i * 8, ox + i * 8 + 7, oy + j * 8, dark ? P.tan : P.cream);
          p.vl(ox + i * 8, oy + j * 8, oy + j * 8 + 7, dark ? P.tan : P.cream);
        }
      p.speckle(ox, oy, 16, 16, P.tan, 0.025, cx * 31 + cy);
      if (h(1) < 0.12) p.line(ox + 3, oy + 2, ox + 6, oy + 6, P.tan); // cracked tile
      break;
    }
    case 'wood': {
      for (let r = 0; r < 4; r++) {
        const y = oy + r * 4;
        const shade = hash(cx, cy * 4 + r, 2) < 0.5 ? P.brown : '#946f4c';
        p.rect(ox, y, 16, 4, shade);
        p.hl(ox, ox + 15, y, P.brownDark);
        const joint = Math.floor(hash(cx, cy * 4 + r, 3) * 16);
        p.vl(ox + joint, y, y + 3, P.brownDark);
        p.px(ox + ((joint + 5) % 16), y + 2, P.tan);
      }
      p.speckle(ox, oy, 16, 16, P.brownDark, 0.03, cx * 17 + cy);
      break;
    }
    case 'concrete': {
      p.rect(ox, oy, 16, 16, P.slate3);
      p.speckle(ox, oy, 16, 16, P.slate2, 0.08, cx * 7 + cy * 3);
      p.speckle(ox, oy, 16, 16, P.fog, 0.03, cx * 11 + cy * 5);
      if (cx % 3 === 0) p.vl(ox, oy, oy + 15, P.slate2);
      if (cy % 3 === 0) p.hl(ox, ox + 15, oy, P.slate2);
      if (h(4) < 0.15) p.line(ox + 4, oy + 12, ox + 11, oy + 9, P.slate2);
      break;
    }
    case 'lino': {
      p.rect(ox, oy, 16, 16, P.tealDark);
      p.speckle(ox, oy, 16, 16, P.tealDeep, 0.1, cx * 5 + cy * 9);
      p.speckle(ox, oy, 16, 16, P.teal, 0.04, cx * 13 + cy * 2);
      p.hl(ox, ox + 15, oy, P.tealDeep);
      p.vl(ox, oy, oy + 15, P.tealDeep);
      break;
    }
    case 'sidewalk': {
      p.rect(ox, oy, 16, 16, P.slate2);
      p.rect(ox + 1, oy + 1, 14, 14, '#646e90');
      p.speckle(ox, oy, 16, 16, P.slate, 0.07, cx * 3 + cy);
      p.hl(ox, ox + 15, oy + 15, P.navy2); // curb
      p.hl(ox, ox + 15, oy + 14, P.slate3);
      break;
    }
    case 'asphalt': {
      p.rect(ox, oy, 16, 16, P.asphalt);
      p.speckle(ox, oy, 16, 16, P.asphalt2, 0.18, cx * 19 + cy * 7);
      p.speckle(ox, oy, 16, 16, P.slate, 0.03, cx * 23 + cy * 3);
      if (cy === 26 && cx % 3 !== 2) p.rect(ox + 2, oy + 7, 12, 2, P.amberDark); // lane dash
      if (h(5) < 0.16) {
        // rain puddle with sky sheen
        const px = ox + 2 + Math.floor(h(6) * 6);
        const py = oy + 3 + Math.floor(h(7) * 8);
        p.ellipse(px + 3, py + 2, 4, 2, P.puddle);
        p.hl(px + 1, px + 3, py + 1, P.glass);
        p.px(px + 5, py + 3, P.glassLight);
      }
      break;
    }
    case 'cobble': {
      // wet night cobbles: rounded setts with dark mortar and the odd puddle
      p.rect(ox, oy, 16, 16, P.navy);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 3; i++) {
          const off = j % 2 ? 3 : 0;
          const sx = ox + ((i * 6 + off) % 18) - 1;
          const sy = oy + j * 4;
          const c = hash(cx * 4 + i, cy * 4 + j, 8) < 0.5 ? P.slate : '#465074';
          p.rect(sx + 1, sy, 4, 3, c);
          p.hl(sx + 1, sx + 4, sy, P.slate2);
          p.px(sx + 4, sy + 2, P.navy2);
        }
      if (h(9) < 0.12) {
        p.ellipse(ox + 8, oy + 9, 4, 2, P.puddle);
        p.px(ox + 6, oy + 8, P.glassLight);
      }
      break;
    }
  }
}

function isWallish(m: MapData, x: number, y: number) {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
  const k = m.kind[y * m.w + x] as CellKind;
  return k === CellKind.Wall || k === CellKind.Window || k === CellKind.Soft;
}

function exteriorBelow(m: MapData, x: number, y: number) {
  if (y + 1 >= m.h) return true;
  const ri = m.roomOf[(y + 1) * m.w + x];
  return ri >= 0 && !m.rooms[ri].interior;
}

/** Wall face: interior plaster with teal wainscot, or exterior brick. */
export function drawWallFace(p: Pix, ox: number, oy: number, exterior: boolean, cx: number) {
  const fy = oy + FACE_TOP;
  if (exterior) {
    p.rect(ox, fy, 16, 10, P.coralDark);
    for (let r = 0; r < 3; r++) {
      const y = fy + r * 3 + 1;
      p.hl(ox, ox + 15, y + 2, P.coralDeep);
      const off = (r + cx) % 2 ? 4 : 0;
      for (let i = off; i < 16; i += 8) p.vl(ox + i, y, y + 1, P.coralDeep);
    }
    p.hl(ox, ox + 15, fy, P.coral);
    p.hl(ox, ox + 15, oy + 15, P.coralDeep);
  } else {
    p.rect(ox, fy, 16, 10, P.cream);
    p.hl(ox, ox + 15, fy, P.cream2);
    p.rect(ox, fy + 5, 16, 5, P.teal);
    p.hl(ox, ox + 15, fy + 5, P.tealLight);
    p.hl(ox, ox + 15, oy + 15, P.tealDeep);
    if (cx % 4 === 0) p.vl(ox + 7, fy + 6, oy + 14, P.tealDark);
  }
}

export function drawWallTop(p: Pix, ox: number, oy: number, h: number, edges: { l: boolean; r: boolean; t: boolean }) {
  p.rect(ox, oy, 16, h, P.ink);
  // subtle top masonry rhythm
  for (let i = 2; i < 16; i += 5) p.px(ox + i, oy + Math.min(h - 1, 2), P.navy2);
  if (edges.t) p.hl(ox, ox + 15, oy, P.slate2);
  if (edges.l) p.vl(ox, oy, oy + h - 1, P.slate);
  if (edges.r) p.vl(ox + 15, oy, oy + h - 1, P.slate);
  if (h === 16 && !edges.t) p.hl(ox, ox + 15, oy + 15, P.navy);
}

/** Bake floors and static walls/windows (soft panels and barricades are dynamic sprites). */
export function bakeMap(m: MapData): HTMLCanvasElement {
  const p = new Pix(m.w * T, m.h * T);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      const k = m.kind[i] as CellKind;
      let kind: Floor;
      if (m.roomOf[i] >= 0) kind = floorKindAt(m, x, y);
      else {
        // walls/doors/panels: borrow the floor of the room below (else above)
        const below = y + 1 < m.h && m.roomOf[(y + 1) * m.w + x] >= 0 ? floorKindAt(m, x, y + 1) : y > 0 && m.roomOf[(y - 1) * m.w + x] >= 0 ? floorKindAt(m, x, y - 1) : 'concrete';
        kind = below;
        if (k === CellKind.Door && m.doors[m.doorOf[i]].horizontal === false) {
          const right = x + 1 < m.w ? m.roomOf[y * m.w + x + 1] : -1;
          if (right >= 0) kind = floorKindAt(m, x + 1, y);
        }
      }
      drawFloor(p, x * T, y * T, kind, x, y);
      if (k === CellKind.Door) {
        const d = m.doors[m.doorOf[i]];
        if (d.horizontal) {
          p.hl(x * T, x * T + 15, y * T + 1, P.brownDark);
          p.hl(x * T, x * T + 15, y * T + 14, P.brownDark);
        } else {
          p.vl(x * T + 1, y * T, y * T + 15, P.brownDark);
          p.vl(x * T + 14, y * T, y * T + 15, P.brownDark);
        }
        if (d.protected) {
          // painted "keep clear" chevrons on protected approaches
          p.px(x * T + 7, y * T + 7, P.amberDark).px(x * T + 8, y * T + 8, P.amberDark).px(x * T + 6, y * T + 8, P.amberDark);
        }
      }
    }
  // contact shadows under walls and props
  for (let y = 1; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const above = m.kind[(y - 1) * m.w + x] as CellKind;
      const here = m.kind[y * m.w + x] as CellKind;
      if ((above === CellKind.Wall || above === CellKind.Window || above === CellKind.Prop) && here !== CellKind.Wall && here !== CellKind.Window) {
        p.g.globalAlpha = 0.35;
        p.rect(x * T, y * T, 16, 3, P.ink);
        p.g.globalAlpha = 0.18;
        p.rect(x * T, y * T + 3, 16, 2, P.ink);
        p.g.globalAlpha = 1;
      }
    }
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const k = m.kind[y * m.w + x] as CellKind;
      if (k !== CellKind.Wall && k !== CellKind.Window) continue;
      const faceVisible = !isWallish(m, x, y + 1) && m.kind[Math.min(m.h - 1, y + 1) * m.w + x] !== CellKind.Door;
      const edges = { l: !isWallish(m, x - 1, y), r: !isWallish(m, x + 1, y), t: !isWallish(m, x, y - 1) };
      if (k === CellKind.Window) {
        drawWallTop(p, x * T, y * T, 16, edges);
        // vertical sash window seen from above: glass strip with frame and rain streaks
        p.rect(x * T + 5, y * T, 6, 16, P.glass);
        p.vl(x * T + 5, y * T, y * T + 15, P.metalLight);
        p.vl(x * T + 10, y * T, y * T + 15, P.slate);
        p.px(x * T + 7, y * T + 3, P.glassLight).px(x * T + 8, y * T + 9, P.glassLight).px(x * T + 7, y * T + 12, P.glassLight);
        p.hl(x * T + 5, x * T + 10, y * T + (y % 2 ? 15 : 0), P.metal);
        continue;
      }
      if (faceVisible) {
        drawWallTop(p, x * T, y * T, FACE_TOP, edges);
        drawWallFace(p, x * T, y * T, exteriorBelow(m, x, y), x);
      } else drawWallTop(p, x * T, y * T, 16, edges);
    }
  decorate(p, m);
  return p.c;
}

// ---------- tiny pixel font for signage (3x5) ----------
const FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  E: ['111', '100', '110', '100', '111'],
  I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  S: ['011', '100', '010', '001', '110'],
  Y: ['101', '101', '010', '010', '010'],
  F: ['111', '100', '110', '100', '100'],
  T: ['111', '010', '010', '010', '010'],
  R: ['110', '101', '110', '101', '101'],
  K: ['101', '110', '100', '110', '101'],
  ' ': ['000', '000', '000', '000', '000'],
};

export function pixelText(p: Pix, x: number, y: number, text: string, col: string, glow?: string) {
  let cx = x;
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[' '];
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++)
        if (g[j][i] === '1') {
          if (glow) {
            p.g.globalAlpha = 0.35;
            p.rect(cx + i - 1, y + j - 1, 3, 3, glow);
            p.g.globalAlpha = 1;
          }
        }
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') p.px(cx + i, y + j, col);
    cx += 4;
  }
}

function decorate(p: Pix, m: MapData) {
  // SPIN CYCLE fascia above the street frontage (wall row y=22, x 21..30)
  const fy = 22 * T + FACE_TOP;
  p.rect(21 * T + 2, fy, 9 * T - 4, 9, P.navy);
  p.hl(21 * T + 2, 30 * T - 3, fy, P.slate2);
  pixelText(p, 21 * T + 22, fy + 2, 'SPIN CYCLE', P.coralLight, P.coral);
  // OPEN neon beside the front door
  p.rect(13 * T + 4, fy + 1, 20, 8, P.ink);
  pixelText(p, 13 * T + 6, fy + 2, 'OPEN', P.amberLight, P.amber);
  // awning stripes over the west shopfront
  for (let x = 3 * T; x < 12 * T; x += 4) p.rect(x, fy, 2, 3, P.cream2);
  p.hl(3 * T, 12 * T - 1, fy + 3, P.coralDeep);
  // street-side neon reflections in puddles near the sign
  for (let i = 0; i < 6; i++) p.px(22 * T + i * 18 + 4, 24 * T + 6 + (i % 2), P.coralLight);
  // a few flyers and leaves in the alley, manhole on the street
  p.ellipse(26 * T + 8, 26 * T + 6, 5, 3, P.navy2);
  p.ring(26 * T + 8, 26 * T + 6, 4, P.slate);
  p.hl(26 * T + 5, 26 * T + 11, 26 * T + 6, P.slate);
  p.rect(33 * T + 3, 3 * T + 9, 4, 3, P.cream).px(33 * T + 4, 3 * T + 10, P.tan);
  p.rect(1 * T + 2, 9 * T + 4, 3, 2, P.amberDark);
  p.rect(20 * T + 6, 1 * T + 5, 4, 3, P.cream2).px(20 * T + 7, 1 * T + 6, P.coral);
  // office rug under the console area
  p.g.globalAlpha = 0.85;
  p.rect(4 * T + 4, 7 * T, 5 * T, 3 * T - 6, P.coralDeep);
  p.g.globalAlpha = 1;
  for (let x = 4 * T + 6; x < 9 * T; x += 4) p.px(x, 7 * T + 2, P.coral).px(x + 2, 10 * T - 9, P.coral);
  // stockroom painted floor guide
  for (let y = 3 * T; y < 11 * T; y += 6) p.rect(23 * T + 7, y, 2, 3, P.amber);
  // service mop bucket stain
  p.g.globalAlpha = 0.4;
  p.ellipse(3 * T + 10, 20 * T + 8, 6, 3, P.tealLight);
  p.g.globalAlpha = 1;
  void m;
}

// ---------- props ----------

export interface PropSprite {
  key: string;
  canvas: HTMLCanvasElement;
  /** world pixel position of the sprite's bottom-left */
  x: number;
  y: number;
  /** y used for depth sorting (world px) */
  depthY: number;
}

function washer(frame: number, variant: number): Pix {
  const p = new Pix(16, 21);
  // body (teal), top panel lighter, porthole with laundry
  p.rect(1, 4, 14, 17, P.teal);
  p.rect(1, 0, 14, 5, P.tealLight);
  p.hl(1, 14, 0, P.white);
  p.rect(2, 1, 6, 2, P.tealDeep); // control strip
  p.px(10, 2, P.amber).px(12, 2, variant % 2 ? P.coral : P.mint);
  p.vl(14, 4, 20, P.tealDark);
  p.hl(1, 14, 20, P.tealDeep);
  p.hl(1, 14, 5, P.tealDark);
  // porthole
  p.ellipse(8, 12, 5, 5, P.metalLight);
  p.ellipse(8, 12, 4, 4, P.navy2);
  const cols = [P.coral, P.cream2, P.amber, P.tealLight];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + frame * 0.8 + variant;
    p.rect(Math.round(8 + Math.cos(a) * 2) - 1, Math.round(12 + Math.sin(a) * 2) - 1, 2, 2, cols[(i + variant) % 4]);
  }
  p.px(6, 10, P.glassLight).px(7, 9, P.glassLight);
  p.outline(P.outline);
  return p;
}

function shelf(variant: number): Pix {
  const p = new Pix(16, 22);
  p.rect(1, 2, 14, 20, P.slate);
  p.vl(1, 2, 21, P.slate2).vl(14, 2, 21, P.navy2);
  for (let r = 0; r < 3; r++) {
    const y = 4 + r * 6;
    p.hl(1, 14, y + 4, P.metal);
    let x = 2;
    let k = 0;
    while (x < 13) {
      const w = 3 + Math.floor(hash(variant, r * 7 + k, 4) * 3);
      const c = [P.tan, P.creamDark, P.brown, P.coralLight][Math.floor(hash(variant, r * 7 + k, 5) * 4)];
      p.rect(x, y + 1, Math.min(w, 13 - x), 3, c);
      p.hl(x, x + Math.min(w, 13 - x) - 1, y + 1, P.cream);
      x += w + 1;
      k++;
    }
  }
  p.rect(1, 0, 14, 3, P.slate2);
  p.hl(1, 14, 0, P.slate3);
  p.outline(P.outline);
  return p;
}

function desk(): Pix {
  const p = new Pix(48, 22);
  p.rect(1, 2, 46, 13, P.brown);
  p.hl(1, 46, 2, P.tan);
  p.rect(1, 15, 46, 6, P.brownDark);
  p.hl(1, 46, 15, P.brownDeep);
  p.vl(3, 15, 20, P.brownDeep).vl(44, 15, 20, P.brownDeep);
  // papers, keyboard, mug, lamp
  p.rect(18, 5, 7, 5, P.cream2).rect(20, 6, 7, 5, P.cream).hl(21, 25, 8, P.slate3);
  p.rect(28, 9, 10, 3, P.slate).hl(28, 37, 9, P.slate2);
  p.ellipse(42, 7, 2, 2, P.coral);
  p.px(42, 6, P.coralLight);
  // desk lamp (warm landmark)
  p.rect(6, 9, 4, 2, P.navy2);
  p.line(8, 9, 11, 4, P.navy2);
  p.ellipse(11, 4, 3, 2, P.amber);
  p.hl(9, 13, 3, P.amberLight);
  p.outline(P.outline);
  return p;
}

/** Archive console: idle teal screen, arming amber, armed coral alarm. */
export function consoleSprite(state: 'idle' | 'arming' | 'armed', blink: number): Pix {
  const p = new Pix(32, 26);
  p.rect(1, 6, 30, 19, P.cream);
  p.rect(1, 2, 30, 6, P.cream2);
  p.hl(1, 30, 2, P.white);
  p.rect(1, 20, 30, 5, P.creamDark);
  p.hl(1, 30, 20, P.tan);
  p.vl(30, 6, 24, P.tan);
  // amber hazard trim
  for (let x = 2; x < 30; x += 4) p.rect(x, 22, 2, 2, P.amber);
  // screen
  const scr = state === 'idle' ? P.teal : state === 'arming' ? P.amber : blink % 2 ? P.coral : P.coralDark;
  const scr2 = state === 'idle' ? P.tealLight : state === 'arming' ? P.amberLight : P.coralLight;
  p.rect(4, 8, 17, 10, P.navy);
  p.rect(5, 9, 15, 8, scr);
  for (let y = 10; y < 17; y += 2) p.hl(5, 19, y, scr2);
  if (state === 'idle') pixelText(p, 7, 10, 'ON', P.navy);
  // dial bank + antenna
  p.ellipse(25, 11, 2, 2, P.slate);
  p.px(25, 10, P.amberLight);
  p.ellipse(25, 16, 2, 2, P.slate);
  p.vl(27, 0, 4, P.slate2);
  p.px(27, 0, blink % 2 ? (state === 'armed' ? P.coral : P.amber) : P.amberDark);
  p.outline(P.outline);
  return p;
}

function cart(): Pix {
  const p = new Pix(16, 18);
  p.rect(2, 2, 12, 11, P.cream);
  p.hl(2, 13, 2, P.cream2);
  p.rect(3, 4, 10, 7, P.creamDark);
  p.px(5, 5, P.coral).px(9, 6, P.teal).px(7, 8, P.amber);
  p.rect(1, 1, 14, 1, P.metalLight);
  p.vl(1, 1, 14, P.metal).vl(14, 1, 14, P.metal);
  p.hl(1, 14, 13, P.metal);
  p.rect(2, 15, 2, 2, P.navy).rect(12, 15, 2, 2, P.navy);
  p.outline(P.outline);
  return p;
}

function table(): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 2, 16, 10, P.creamDark);
  p.hl(0, 15, 2, P.cream);
  p.rect(0, 12, 16, 3, P.tan);
  p.rect(2, 4, 5, 3, P.coral).hl(2, 6, 4, P.coralLight);
  p.rect(8, 5, 6, 3, P.teal).hl(8, 13, 5, P.tealLight);
  p.rect(4, 8, 6, 2, P.cream2);
  p.outline(P.outline);
  return p;
}

function car(): Pix {
  const p = new Pix(64, 36);
  p.ellipse(32, 30, 30, 4, P.ink);
  p.rect(3, 6, 58, 22, P.coralDark);
  p.rect(4, 4, 56, 20, P.coral);
  p.hl(4, 59, 4, P.coralLight);
  p.rect(18, 7, 26, 13, P.navy2); // cabin glass
  p.rect(20, 8, 22, 4, P.glass);
  p.hl(21, 30, 9, P.glassLight);
  p.rect(18, 7, 26, 1, P.coralDeep);
  p.rect(5, 9, 3, 6, P.amberLight).rect(56, 9, 3, 6, P.red);
  p.rect(8, 26, 8, 4, P.ink).rect(48, 26, 8, 4, P.ink);
  // rain beads
  for (let i = 0; i < 9; i++) p.px(6 + ((i * 13) % 52), 6 + ((i * 7) % 14), P.coralLight);
  p.outline(P.outline);
  return p;
}

function bins(): Pix {
  const p = new Pix(32, 20);
  p.rect(1, 4, 30, 15, P.tealDeep);
  p.rect(1, 1, 30, 5, P.tealDark);
  p.hl(1, 30, 1, P.teal);
  p.vl(15, 4, 18, P.navy);
  p.rect(5, 9, 6, 2, P.navy).rect(20, 9, 6, 2, P.navy);
  p.px(8, 2, P.cream).px(23, 3, P.cream2);
  p.outline(P.outline);
  return p;
}

/** Build prop sprites from the map's prop cells (multi-cell props grouped). */
export function buildProps(m: MapData): PropSprite[] {
  const out: PropSprite[] = [];
  const seen = new Set<number>();
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (seen.has(i)) continue;
      const kind = m.prop[i];
      if (!kind) continue;
      // grow a horizontal run of the same prop for desks/cars/bins/console
      const run = (k: string) => {
        let n = 0;
        while (x + n < m.w && m.prop[y * m.w + x + n] === k) n++;
        return n;
      };
      const bottom = (rows: number) => (y + rows) * T;
      switch (kind) {
        case 'washer': {
          seen.add(i);
          out.push({ key: `washer_${(x + y) % 3}`, canvas: washer(0, (x + y) % 3).c, x: x * T, y: bottom(1), depthY: bottom(1) });
          break;
        }
        case 'shelf':
          seen.add(i);
          out.push({ key: `shelf_${x}_${y}`, canvas: shelf(x * 7 + y).c, x: x * T, y: bottom(1), depthY: bottom(1) });
          break;
        case 'desk': {
          const n = run('desk');
          for (let k = 0; k < n; k++) seen.add(i + k);
          out.push({ key: 'desk', canvas: desk().c, x: x * T, y: bottom(1) + 2, depthY: bottom(1) });
          break;
        }
        case 'console': {
          const n = run('console');
          for (let k = 0; k < n; k++) seen.add(i + k);
          out.push({ key: 'console', canvas: consoleSprite('idle', 0).c, x: x * T, y: bottom(1) + 4, depthY: bottom(1) });
          break;
        }
        case 'cart':
          seen.add(i);
          out.push({ key: 'cart', canvas: cart().c, x: x * T, y: bottom(1) + 1, depthY: bottom(1) });
          break;
        case 'table': {
          const n = run('table');
          for (let k = 0; k < n; k++) {
            seen.add(i + k);
            out.push({ key: 'table', canvas: table().c, x: (x + k) * T, y: bottom(1), depthY: bottom(1) });
          }
          break;
        }
        case 'car': {
          const n = run('car');
          for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) seen.add((y + r) * m.w + x + k);
          out.push({ key: 'car', canvas: car().c, x: x * T, y: bottom(2) + 2, depthY: bottom(2) });
          break;
        }
        case 'bins': {
          const n = run('bins');
          for (let k = 0; k < n; k++) seen.add(i + k);
          out.push({ key: 'bins', canvas: bins().c, x: x * T, y: bottom(1) + 2, depthY: bottom(1) });
          break;
        }
      }
    }
  return out;
}

export function washerFrames(variant: number): HTMLCanvasElement[] {
  return [0, 1, 2, 3].map((f) => washer(f, variant).c);
}

// ---------- dynamic wall pieces ----------

/** Soft panel group sprite: intact (marked plaster), reinforced (steel), or breached rubble. */
export function softPanelSprite(cells: number, horizontal: boolean, state: 'intact' | 'reinforced' | 'breached', exteriorFace: boolean, seed: number): Pix {
  const len = cells * T;
  const p = horizontal ? new Pix(len, T) : new Pix(T, len);
  if (state === 'breached') {
    // jagged rubble lip and scattered chunks; floor shows through
    for (let i = 0; i < 26; i++) {
      const a = hash(i, seed, 1);
      const b = hash(i, seed, 2);
      const x = horizontal ? Math.floor(a * len) : Math.floor(a * T);
      const y = horizontal ? Math.floor(b * T) : Math.floor(b * len);
      const c = [P.cream, P.creamDark, P.tan, P.brownDark][i % 4];
      p.rect(x, y, 2 + (i % 2), 2, c);
    }
    if (horizontal) {
      p.rect(0, 0, 2, T, P.navy2).rect(len - 2, 0, 2, T, P.navy2);
    } else {
      p.rect(0, 0, T, 2, P.navy2).rect(0, len - 2, T, 2, P.navy2);
    }
    return p;
  }
  if (horizontal) {
    // top band then face
    p.rect(0, 0, len, FACE_TOP, state === 'reinforced' ? P.slate : P.navy2);
    p.hl(0, len - 1, 0, state === 'reinforced' ? P.metal : P.slate2);
    if (state === 'intact') {
      p.rect(0, FACE_TOP, len, 10, exteriorFace ? P.coralLight : P.cream2);
      // marked breachable material: dashed coral outline and crack hatching
      for (let x = 1; x < len - 1; x += 3) p.px(x, FACE_TOP + 1, P.coral).px(x, T - 2, P.coral);
      p.vl(1, FACE_TOP + 1, T - 2, P.coral).vl(len - 2, FACE_TOP + 1, T - 2, P.coral);
      for (let k = 0; k < cells; k++) {
        const ox = k * T;
        p.line(ox + 4, FACE_TOP + 3, ox + 7, FACE_TOP + 7, P.tan);
        p.line(ox + 7, FACE_TOP + 7, ox + 10, FACE_TOP + 5, P.tan);
      }
      p.hl(0, len - 1, T - 1, P.tan);
    } else {
      p.rect(0, FACE_TOP, len, 10, P.metal);
      p.hl(0, len - 1, FACE_TOP, P.metalLight);
      for (let x = 0; x < len; x += 6) {
        p.line(x, T - 1, x + 3, FACE_TOP + 4, P.amber);
        p.line(x + 1, T - 1, x + 4, FACE_TOP + 4, P.amber);
      }
      for (let x = 3; x < len; x += 8) p.px(x, FACE_TOP + 2, P.navy2);
      p.hl(0, len - 1, T - 1, P.slate);
    }
  } else {
    p.rect(0, 0, T, len, state === 'reinforced' ? P.slate : P.navy2);
    p.rect(4, 0, 8, len, state === 'reinforced' ? P.metal : P.cream2);
    for (let y = 1; y < len; y += 3) p.px(4, y, state === 'reinforced' ? P.amber : P.coral).px(11, y, state === 'reinforced' ? P.amber : P.coral);
  }
  return p;
}

export function barricadeSprite(cells: number, horizontal: boolean, damaged: boolean): Pix {
  const len = cells * T;
  const p = horizontal ? new Pix(len, T + 2) : new Pix(T, len);
  if (horizontal) {
    for (let r = 0; r < 3; r++) {
      const y = 3 + r * 4;
      const tilt = r === 1 ? 1 : 0;
      p.rect(0, y + tilt, len, 3, r % 2 ? P.brown : '#9a7752');
      p.hl(0, len - 1, y + tilt, P.tan);
      for (let x = 4; x < len; x += 11) p.px(x, y + 1 + tilt, P.metal);
    }
    p.vl(2, 1, 16, P.brownDark).vl(len - 3, 1, 16, P.brownDark);
    if (damaged) for (let x = 6; x < len; x += 9) p.rect(x, 6, 2, 3, P.brownDeep);
  } else {
    for (let r = 0; r < 3; r++) {
      const x = 3 + r * 4;
      p.rect(x, 0, 3, len, r % 2 ? P.brown : '#9a7752');
      p.vl(x, 0, len - 1, P.tan);
      for (let y = 4; y < len; y += 11) p.px(x + 1, y, P.metal);
    }
    if (damaged) for (let y = 6; y < len; y += 9) p.rect(6, y, 3, 2, P.brownDeep);
  }
  p.outline(P.outline);
  return p;
}
