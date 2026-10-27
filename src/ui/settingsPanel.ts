// Settings grouped like a shooter's options menu: controls, audio, accessibility.
import { h } from './dom';
import type { Settings } from '../app/settings';

export function settingsPanel(s: Settings, change: (s: Settings) => void): HTMLElement {
  const groups: Record<string, HTMLElement[]> = { CONTROLS: [], AUDIO: [], ACCESSIBILITY: [] };
  const row = (g: string, label: string, ctl: HTMLElement) => groups[g].push(h('div', { class: 'set-row' }, h('span', {}, label), ctl));
  const slider = (g: string, key: keyof Settings, label: string) => {
    const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(s[key]) }) as HTMLInputElement;
    input.addEventListener('input', () => {
      (s as unknown as Record<string, unknown>)[key] = Number(input.value);
      change(s);
    });
    row(g, label, input);
  };
  const toggle = (g: string, key: keyof Settings, label: string) => {
    const b = h('button', { class: 'set-btn' }, s[key] ? 'ON' : 'OFF');
    b.addEventListener('click', () => {
      (s as unknown as Record<string, unknown>)[key] = !s[key];
      b.textContent = s[key] ? 'ON' : 'OFF';
      b.classList.toggle('on', !!s[key]);
      change(s);
    });
    b.classList.toggle('on', !!s[key]);
    row(g, label, b);
  };
  const cycle = <T extends string | number>(g: string, key: keyof Settings, label: string, opts: Array<[T, string]>) => {
    const b = h('button', { class: 'set-btn on' });
    const draw = () => (b.textContent = opts.find(([v]) => v === s[key])?.[1] ?? String(s[key]));
    draw();
    b.addEventListener('click', () => {
      const i = opts.findIndex(([v]) => v === s[key]);
      (s as unknown as Record<string, unknown>)[key] = opts[(i + 1) % opts.length][0];
      draw();
      change(s);
    });
    row(g, label, b);
  };
  cycle('CONTROLS', 'aimAssist', 'Aim assist', [
    ['off', 'OFF'],
    ['low', 'LOW'],
    ['standard', 'STANDARD'],
  ]);
  toggle('CONTROLS', 'leftHanded', 'Left-handed layout');
  const resetTut = h('button', { class: 'set-btn' }, 'REPLAY');
  resetTut.addEventListener('click', () => {
    s.tutorialDone = false;
    change(s);
    resetTut.textContent = 'WILL SHOW';
  });
  row('CONTROLS', 'First-match tips', resetTut);
  slider('AUDIO', 'master', 'Master volume');
  slider('AUDIO', 'weapons', 'Weapons');
  slider('AUDIO', 'world', 'World & gadgets');
  slider('AUDIO', 'ambience', 'Rain & ambience');
  slider('AUDIO', 'music', 'Music');
  slider('AUDIO', 'ui', 'Interface');
  toggle('AUDIO', 'muted', 'Mute all');
  toggle('ACCESSIBILITY', 'reducedShake', 'Reduce screen shake');
  toggle('ACCESSIBILITY', 'reducedFlash', 'Reduce flashes');
  toggle('ACCESSIBILITY', 'captions', 'Sound captions');
  cycle('ACCESSIBILITY', 'textScale', 'Text size', [
    [1, 'NORMAL'],
    [1.15, 'LARGE'],
    [1.3, 'LARGER'],
  ]);
  return h(
    'div',
    { class: 'settings' },
    ...Object.entries(groups).map(([g, rows]) => h('section', {}, h('div', { class: 'set-head' }, g), ...rows)),
    h('p', { class: 'fine' }, 'Settings are stored in this browser only.'),
  );
}
