// Development-only art review page (not part of the game build).
import { buildSpinCycle } from '../sim/mapdata';
import { bakeMap, buildProps, softPanelSprite, barricadeSprite, consoleSprite, washerFrames } from '../render/art/env';
import { buildCharacterSheet, buildDeadSprite, buildPortrait, buildWeaponSheet, LOOKS } from '../render/art/chars';
import { buildSledSheet, buildCoverSheet, buildHingeSheet, buildCharge, buildMuzzle, buildDust, buildRing, buildIcon, type IconName } from '../render/art/gadgets';

const root = document.getElementById('root')!;
const show = (title: string, c: HTMLCanvasElement, scale: number) => {
  const h = document.createElement('h3');
  h.textContent = title;
  root.appendChild(h);
  c.style.width = `${c.width * scale}px`;
  c.style.height = `${c.height * scale}px`;
  root.appendChild(c);
};
const which = new URLSearchParams(location.search).get('v') ?? 'all';
const m = buildSpinCycle();
if (which === 'map' || which === 'all') {
  const base = bakeMap(m);
  const ctx = base.getContext('2d')!;
  for (const pr of buildProps(m)) ctx.drawImage(pr.canvas, pr.x, pr.y - pr.canvas.height);
  for (const g of m.softGroups) {
    const c0 = g.cells[0];
    const s = softPanelSprite(g.cells.length, g.horizontal, g.id === 'a' ? 'reinforced' : g.id === 'b' ? 'breached' : 'intact', g.id === 'c', 3);
    ctx.drawImage(s.c, (c0 % m.w) * 16, Math.floor(c0 / m.w) * 16);
  }
  for (const d of m.doors) {
    if (d.protected) continue;
    const c0 = d.cells[0];
    const s = barricadeSprite(d.cells.length, d.horizontal, d.id === '2');
    ctx.drawImage(s.c, (c0 % m.w) * 16, Math.floor(c0 / m.w) * 16);
  }
  show('map', base, which === 'map' ? 2 : 1.5);
}
if (which === 'chars' || which === 'all') {
  for (const id of Object.keys(LOOKS)) {
    show(id, buildCharacterSheet(id), 4);
    show('dead', buildDeadSprite(id), 4);
    show('portrait', buildPortrait(id), 4);
  }
  for (const wpn of ['smg', 'carbine', 'scattergun']) show(wpn, buildWeaponSheet(wpn), 3);
}
if (which === 'gadgets' || which === 'all') {
  show('sled', buildSledSheet(), 4);
  show('cover', buildCoverSheet(), 3);
  show('hinge', buildHingeSheet(), 2);
  show('charge', buildCharge(true), 6);
  for (let f = 0; f < 3; f++) show('muzzle', buildMuzzle(f), 6);
  for (let f = 0; f < 4; f++) show('dust', buildDust(f), 4);
  for (const k of ['player', 'ally', 'enemy', 'ghost'] as const) show(k, buildRing(k), 6);
  for (const s of ['idle', 'arming', 'armed'] as const) show('console', consoleSprite(s, 1).c, 4);
  for (const f of washerFrames(1)) show('washer', f, 4);
  const icons: IconName[] = ['sled', 'brake', 'hinge', 'rotate', 'breach', 'arm', 'shutoff', 'reinforce', 'barricade', 'remove', 'vault', 'reload', 'orders', 'pause', 'follow', 'hold', 'auto', 'ready', 'cancel', 'sound'];
  for (const i of icons) show(i, buildIcon(i), 4);
}
