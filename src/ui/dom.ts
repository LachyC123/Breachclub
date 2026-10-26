import { buildIcon, type IconName } from '../render/art/gadgets';
import { buildPortrait, buildCharacterSheet, FRAME_W, FRAME_H, COLS } from '../render/art/chars';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const iconCache = new Map<string, string>();
export function icon(name: IconName): string {
  let u = iconCache.get(name);
  if (!u) {
    u = buildIcon(name).toDataURL();
    iconCache.set(name, u);
  }
  return u;
}

export function iconImg(name: IconName, cls = ''): HTMLImageElement {
  return h('img', { src: icon(name), class: `pix ${cls}`, alt: '' });
}

const portraitCache = new Map<string, string>();
export function portrait(look: string): string {
  let u = portraitCache.get(look);
  if (!u) {
    u = buildPortrait(look).toDataURL();
    portraitCache.set(look, u);
  }
  return u;
}

/** Animated operator figure for cards (walk cycle, facing the viewer). */
export function figureCanvas(look: string, scale = 3): HTMLCanvasElement {
  const sheet = buildCharacterSheet(look);
  const c = document.createElement('canvas');
  c.width = FRAME_W;
  c.height = FRAME_H;
  c.style.width = `${FRAME_W * scale}px`;
  c.style.height = `${FRAME_H * scale}px`;
  const g = c.getContext('2d')!;
  let f = 0;
  const tick = () => {
    if (!c.isConnected && f > 2) return;
    g.clearRect(0, 0, FRAME_W, FRAME_H);
    const dir = Math.floor(f / 16) % 8;
    const col = 2 + (f % 4);
    g.drawImage(sheet, col * FRAME_W, dir * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
    f++;
    setTimeout(tick, 140);
  };
  tick();
  void COLS;
  return c;
}
