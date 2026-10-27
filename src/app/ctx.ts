// What a game-mode runner (match, range) needs from the app shell.
import type Phaser from 'phaser';
import type { WorldView } from '../render/view';
import type { Sfx } from '../audio/sfx';
import type { Settings } from './settings';

export interface AppCtx {
  scene: Phaser.Scene;
  view: WorldView;
  ui: HTMLElement;
  sfx: Sfx;
  settings: Settings;
  /** persist + apply the current settings */
  settingsChanged(): void;
  /** leave the mode and return to the main menu */
  home(): void;
  debug: Record<string, unknown>;
}

export interface Runner {
  frame(dt: number): void;
  /** pause with an optional note (app switch, rotation); no-op when already paused or in menus */
  pause(note: string): void;
  /** Escape / back key */
  escape(): void;
  destroy(): void;
}
