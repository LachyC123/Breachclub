// App shell: Phaser boot, main menu with bots playing behind it, settings, and the active
// game-mode runner (match or shooting range). Pausing on app switch / rotation lives here.
import Phaser from 'phaser';
import { FixedStepper, type MatchConfig } from './session';
import { World } from '../sim/world';
import { AIDirector } from '../ai/brain';
import { WorldView, generateTextures } from '../render/view';
import { homeScreen, type HomeTab, type Playlist } from '../ui/menu';
import { Sfx } from '../audio/sfx';
import { loadSettings, saveSettings, type Settings } from './settings';
import { MatchRunner } from './matchRunner';
import { RangeRunner } from './rangeRunner';
import type { AppCtx, Runner } from './ctx';
import type { Difficulty } from '../sim/world';

class GameScene extends Phaser.Scene {
  app!: App;
  constructor() {
    super('game');
  }
  create() {
    this.app.onSceneReady(this);
  }
  update(_t: number, delta: number) {
    this.app.frame(delta);
  }
}

const PLAYLIST_NAME: Record<Playlist, string> = {
  quick: 'QUICK MATCH',
  standard: 'STANDARD',
  range: 'SHOOTING RANGE',
  sit_attack: 'SITUATION · BREACH & ARM',
  sit_defence: 'SITUATION · HOLD THE OFFICE',
};

export class App {
  readonly game: Phaser.Game;
  private scene!: Phaser.Scene;
  private view!: WorldView;
  private ui: HTMLElement;
  private menu: HTMLElement | null = null;
  private sfx = new Sfx();
  settings: Settings = loadSettings();
  runner: Runner | null = null;
  private attract: { world: World; ai: AIDirector } | null = null;
  private stepper = new FixedStepper();
  private realTime = 0;
  private tab: HomeTab = 'play';
  /** test bridge (development only) */
  debug: Record<string, unknown> = {};

  constructor(parent: HTMLElement, ui: HTMLElement) {
    this.ui = ui;
    this.applySettings();
    const scene = new GameScene();
    scene.app = this;
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: '#11151f',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: [scene],
      fps: { target: 60 },
      banner: false,
      audio: { noAudio: true },
    } as Phaser.Types.Core.GameConfig);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.sfx.suspend();
        this.runner?.pause('Paused while the game was in the background.');
      } else this.sfx.resume();
    });
    window.addEventListener('resize', () => {
      this.view?.fit();
      // portrait is unsupported: the rotate overlay shows and play pauses
      if (window.innerHeight > window.innerWidth && window.innerWidth < 900) this.runner?.pause('Paused while the phone was in portrait.');
    });
    window.addEventListener('orientationchange', () => this.runner?.pause('Paused while the screen rotated.'));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.runner?.escape();
    });
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  onSceneReady(scene: Phaser.Scene) {
    this.scene = scene;
    generateTextures(scene);
    this.view = new WorldView(scene);
    this.applySettings();
    this.showHome();
  }

  private applySettings() {
    const s = this.settings;
    document.body.classList.toggle('left-handed', s.leftHanded);
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    this.sfx.setVolume('master', s.master);
    this.sfx.setVolume('weapons', s.weapons);
    this.sfx.setVolume('world', s.world);
    this.sfx.setVolume('ui', s.ui);
    this.sfx.setVolume('ambience', s.ambience);
    this.sfx.setVolume('music', s.music);
    this.sfx.setMuted(s.muted);
    if (this.view) {
      this.view.reducedShake = s.reducedShake;
      this.view.reducedFlash = s.reducedFlash;
    }
  }

  private ctx(): AppCtx {
    return {
      scene: this.scene,
      view: this.view,
      ui: this.ui,
      sfx: this.sfx,
      settings: this.settings,
      settingsChanged: () => {
        saveSettings(this.settings);
        this.applySettings();
      },
      home: () => this.showHome(),
      debug: this.debug,
    };
  }

  // ---------- menu ----------

  showHome(tab: HomeTab = this.tab) {
    this.runner?.destroy();
    this.runner = null;
    this.tab = tab;
    this.startAttract();
    this.sfx.setMusic('calm');
    this.sfx.setAmbience(true);
    this.menu?.remove();
    this.menu = homeScreen(this.settings, tab, {
      play: (p, d, side) => this.launch(p, d, side),
      settingsChanged: (s) => {
        this.settings = s;
        saveSettings(s);
        this.applySettings();
      },
      sound: (k) => this.sfx.play(k === 'tap' ? 'ui_tap' : k === 'confirm' ? 'ui_confirm' : 'ui_back'),
    });
    this.ui.appendChild(this.menu);
  }

  private launch(p: Playlist, difficulty: Difficulty, side: 'attack' | 'defence') {
    this.menu?.remove();
    this.menu = null;
    this.attract = null;
    this.settings.difficulty = difficulty;
    saveSettings(this.settings);
    if (p === 'range') {
      this.runner = new RangeRunner(this.ctx());
      return;
    }
    const cfg: MatchConfig = {
      seed: (Math.random() * 1e9) >>> 0,
      difficulty,
      playerStartSide: p === 'sit_attack' ? 'attack' : p === 'sit_defence' ? 'defence' : side,
      winsNeeded: p === 'quick' ? 2 : p === 'standard' ? 3 : 1,
      prepSeconds: p === 'quick' ? 20 : undefined,
    };
    this.runner = new MatchRunner(this.ctx(), { cfg, modeName: PLAYLIST_NAME[p] });
  }

  /** Bots play a round behind the menu. */
  private startAttract() {
    const w = new World({ seed: (Math.random() * 1e6) >>> 0, attackTeam: 0, squads: [['ram', 'recruit_mo', 'recruit_tess'], ['hinge', 'recruit_dex', 'recruit_june']], humanIndex: -1, attackEntry: ['front', 'rear', 'window'][Math.floor(Math.random() * 3)], difficulty: 'club', prepSeconds: 0 });
    this.attract = { world: w, ai: new AIDirector(w) };
    this.view.attach(w);
    this.view.fit();
  }

  // ---------- loop ----------

  frame(deltaMs: number) {
    if (!this.view) return;
    const dt = Math.min(0.1, deltaMs / 1000);
    this.realTime += dt;
    if (this.runner) return this.runner.frame(dt);
    const a = this.attract;
    if (!a) return;
    this.stepper.advance(dt, () => {
      if (a.world.phase === 'ended') return;
      a.world.step(a.ai.think());
      this.view.onEvents(a.world.events);
    });
    if (a.world.phase === 'ended' && this.realTime % 6 < dt) this.startAttract();
    const living = a.world.actors.filter((x) => x.alive);
    const focus = living[Math.floor(this.realTime / 8) % Math.max(1, living.length)];
    this.view.render(this.stepper.alpha, dt, { humanId: -1, preview: { kind: 'none' }, focus: focus ? focus.pos : a.world.map.console.center, droneId: null, ads: false, laser: null });
  }
}
