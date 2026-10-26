// Per-device settings in localStorage (a convenience; the game works without storage).
import type { Difficulty } from '../sim/world';

export interface Settings {
  master: number;
  weapons: number;
  world: number;
  ui: number;
  ambience: number;
  music: number;
  muted: boolean;
  aimAssist: 'off' | 'low' | 'standard';
  leftHanded: boolean;
  reducedShake: boolean;
  reducedFlash: boolean;
  captions: boolean;
  textScale: number;
  difficulty: Difficulty;
  tutorialDone: boolean;
}

const KEY = 'breachclub.settings.v1';

export const DEFAULTS: Settings = {
  master: 0.9,
  weapons: 0.8,
  world: 1,
  ui: 0.8,
  ambience: 0.7,
  music: 0.5,
  muted: false,
  aimAssist: 'standard',
  leftHanded: false,
  reducedShake: false,
  reducedFlash: false,
  captions: true,
  textScale: 1,
  difficulty: 'club',
  tutorialDone: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
