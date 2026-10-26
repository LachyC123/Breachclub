// World presentation: reads simulation state + events, never mutates them.
// Enemy actors, gadgets and effects are only drawn when the player's team can actually see them.
import Phaser from 'phaser';
import { P, hex } from './palette';
import { bakeMap, buildProps, softPanelSprite, barricadeSprite, consoleSprite, washerFrames, T } from './art/env';
import { buildCharacterSheet, buildDeadSprite, buildWeaponSheet, dirIndex, weaponFrame, FRAME_W, FRAME_H, COLS, LOOKS, weaponLength, GUN_SIZE, WEAPON_ANGLES } from './art/chars';
import {
  buildSledSheet,
  buildCoverSheet,
  buildHingeSheet,
  buildCharge,
  buildPuck,
  buildMuzzle,
  buildDust,
  buildRing,
  SLED_SIZE,
  SLED_ANGLES,
  COVER_SIZE,
  COVER_ANGLES,
  HINGE_SIZE,
  HINGE_STEPS,
} from './art/gadgets';
import type { World } from '../sim/world';
import type { Actor, SimEvent, Vec, HingeEntity, Obb } from '../sim/types';
import { raycast, type GeoState, obbCorners } from '../sim/geometry';
import { canSee, PUCK_VISION } from '../sim/perception';
import { RULES } from '../content/defs';

const VISION = RULES.vision_tiles;

export interface PreviewState {
  kind: 'none' | 'sled' | 'hinge';
  sledPoints?: Vec[];
  sledBreach?: Vec | null;
  sledStop?: Vec;
  sledHard?: boolean;
  hingePos?: Vec;
  hingeVertical?: boolean;
  hingeValid?: boolean;
}

interface ActorView {
  body: Phaser.GameObjects.Sprite;
  gun: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Image;
  ghost: Phaser.GameObjects.Sprite;
  ghostRing: Phaser.GameObjects.Image;
  flashUntil: number;
  deadShown: boolean;
  look: string;
  weapon: string;
}

interface Particle {
  img: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grav: number;
}

interface Tracer {
  a: Vec;
  b: Vec;
  t: number;
  col: number;
}

interface SoundArc {
  ang: number;
  spread: number;
  kind: string;
  t: number;
}

const DEPTH_FLOOR = 0;
const DEPTH_WALLDYN = 5;
const DEPTH_FX = 9000;
const DEPTH_FOG = 20000;
const DEPTH_OVER = 30000;

function addSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, fw: number, fh: number) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.addCanvas(key, canvas)!;
  const cols = Math.floor(canvas.width / fw);
  const rows = Math.floor(canvas.height / fh);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
}

function addCanvas(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
}

/** Generate every texture once per game (art is authored procedurally at native resolution). */
export function generateTextures(scene: Phaser.Scene, world: World) {
  addCanvas(scene, 'map', bakeMap(world.map));
  for (const id of Object.keys(LOOKS)) {
    addSheet(scene, `char_${id}`, buildCharacterSheet(id), FRAME_W, FRAME_H);
    addCanvas(scene, `dead_${id}`, buildDeadSprite(id));
  }
  for (const w of ['smg', 'carbine', 'scattergun']) addSheet(scene, `gun_${w}`, buildWeaponSheet(w), GUN_SIZE, GUN_SIZE);
  addSheet(scene, 'sled', buildSledSheet(), SLED_SIZE, SLED_SIZE);
  addSheet(scene, 'cover', buildCoverSheet(), COVER_SIZE, COVER_SIZE);
  addSheet(scene, 'hinge', buildHingeSheet(), HINGE_SIZE, HINGE_SIZE);
  addCanvas(scene, 'puck0', buildPuck(false));
  addCanvas(scene, 'puck1', buildPuck(true));
  addCanvas(scene, 'charge0', buildCharge(false));
  addCanvas(scene, 'charge1', buildCharge(true));
  for (let f = 0; f < 3; f++) addCanvas(scene, `muzzle${f}`, buildMuzzle(f));
  for (let f = 0; f < 4; f++) addCanvas(scene, `dust${f}`, buildDust(f));
  for (const k of ['player', 'ally', 'enemy', 'ghost'] as const) addCanvas(scene, `ring_${k}`, buildRing(k));
  for (const s of ['idle', 'arming', 'armed'] as const) for (const b of [0, 1]) addCanvas(scene, `console_${s}_${b}`, consoleSprite(s, b).c);
  for (let v = 0; v < 3; v++) washerFrames(v).forEach((c, f) => addCanvas(scene, `washer_${v}_${f}`, c));
}

export class WorldView {
  private scene: Phaser.Scene;
  world!: World;
  private base!: Phaser.GameObjects.Image;
  private props: Array<{ img: Phaser.GameObjects.Image; key: string; variant: number }> = [];
  private consoleImg: Phaser.GameObjects.Image | null = null;
  private softImgs: Phaser.GameObjects.Image[] = [];
  private softKeys: string[] = [];
  private barImgs: (Phaser.GameObjects.Image | null)[] = [];
  private barKeys: string[] = [];
  private actors = new Map<number, ActorView>();
  private ents = new Map<number, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image>();
  private fogTex!: Phaser.Textures.CanvasTexture;
  private fogImg!: Phaser.GameObjects.Image;
  private fogCtx!: CanvasRenderingContext2D;
  private fx!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private flashes: Array<{ img: Phaser.GameObjects.Image; t: number }> = [];
  private dusts: Array<{ img: Phaser.GameObjects.Image; t: number }> = [];
  private arcs: SoundArc[] = [];
  private blockedCells: { cells: Vec[]; t: number } | null = null;
  private rain: Array<{ x: number; y: number; s: number }> = [];
  private time = 0;
  private frame = 0;
  private shake = { x: 0, y: 0, t: 0, mag: 0 };
  private camPos: Vec | null = null;
  reducedShake = false;
  reducedFlash = false;
  private polyCache: Vec[][] = [];
  private corpseVisible = new Map<number, boolean>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Build the presentation for a fresh round (clean restart: everything is recreated). */
  attach(world: World) {
    this.destroyAll();
    this.world = world;
    const s = this.scene;
    const m = world.map;
    this.base = s.add.image(0, 0, 'map').setOrigin(0).setDepth(DEPTH_FLOOR);
    for (const pr of buildProps(m)) {
      let key = pr.key;
      let variant = 0;
      if (pr.key.startsWith('washer_')) {
        variant = Number(pr.key.split('_')[1]);
        key = `washer_${variant}_0`;
      } else if (pr.key === 'console') key = 'console_idle_0';
      else addCanvas(s, `prop_${pr.key}`, pr.canvas), (key = `prop_${pr.key}`);
      const img = s.add.image(pr.x, pr.y, key).setOrigin(0, 1).setDepth(100 + pr.depthY);
      this.props.push({ img, key: pr.key, variant });
      if (pr.key === 'console') this.consoleImg = img;
    }
    this.softImgs = m.softGroups.map((g) => {
      const c0 = g.cells[0];
      return s.add.image((c0 % m.w) * T, Math.floor(c0 / m.w) * T, '__DEFAULT').setOrigin(0).setDepth(DEPTH_WALLDYN);
    });
    this.softKeys = m.softGroups.map(() => '');
    this.barImgs = m.doors.map(() => null);
    this.barKeys = m.doors.map(() => '');
    const fogKey = 'fog';
    if (s.textures.exists(fogKey)) s.textures.remove(fogKey);
    this.fogTex = s.textures.createCanvas(fogKey, m.w * T, m.h * T)!;
    this.fogCtx = this.fogTex.getContext();
    this.fogImg = s.add.image(0, 0, fogKey).setOrigin(0).setDepth(DEPTH_FOG);
    this.fx = s.add.graphics().setDepth(DEPTH_FX);
    this.over = s.add.graphics().setDepth(DEPTH_OVER);
    this.rain = [];
    for (let i = 0; i < 140; i++) this.rain.push({ x: Math.random() * m.w * T, y: Math.random() * m.h * T, s: 0.6 + Math.random() * 0.6 });
    this.camPos = null;
    this.polyCache = [];
  }

  destroyAll() {
    const kill = (o: { destroy(): void } | null | undefined) => o?.destroy();
    kill(this.base);
    this.props.forEach((p) => p.img.destroy());
    this.props = [];
    this.consoleImg = null;
    this.softImgs.forEach(kill);
    this.softImgs = [];
    this.barImgs.forEach(kill);
    this.barImgs = [];
    for (const a of this.actors.values()) [a.body, a.gun, a.ring, a.ghost, a.ghostRing].forEach(kill);
    this.actors.clear();
    for (const e of this.ents.values()) e.destroy();
    this.ents.clear();
    kill(this.fogImg);
    kill(this.fx);
    kill(this.over);
    this.particles.forEach((p) => p.img.destroy());
    this.particles = [];
    this.flashes.forEach((f) => f.img.destroy());
    this.flashes = [];
    this.dusts.forEach((f) => f.img.destroy());
    this.dusts = [];
    this.tracers = [];
    this.arcs = [];
    this.blockedCells = null;
    this.corpseVisible.clear();
  }

  /** count of live display objects (restart regression check) */
  objectCount(): number {
    return this.scene.children.length;
  }

  // ---------- events -> effects ----------

  onEvents(events: SimEvent[]) {
    const w = this.world;
    const vis = (id: number) => {
      const a = w.actor(id);
      return !!a && (a.team === 0 || w.visible[0].has(id));
    };
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (!vis(e.actorId)) break;
          const a = w.actor(e.actorId)!;
          this.tracers.push({ a: e.from, b: e.to, t: 0.07, col: a.team === 0 ? hex(P.amberLight) : hex(P.coralLight) });
          if (this.flashes.length < 12) {
            const len = weaponLength(a.weapon.id) / T;
            const mx = (a.pos.x + Math.cos(a.facing) * (0.2 + len)) * T;
            const my = (a.pos.y + Math.sin(a.facing) * (0.15 + len)) * T - 4;
            const img = this.scene.add.image(mx, my, `muzzle${Math.floor(Math.random() * 2)}`).setDepth(DEPTH_FX + 2);
            img.setBlendMode(Phaser.BlendModes.ADD);
            this.flashes.push({ img, t: 0.05 });
          }
          const av = this.actors.get(e.actorId);
          if (av) av.body.y += 0; // recoil handled in render via lastShot
          break;
        }
        case 'surfaceHit': {
          if (!this.pointVisible(e.pos)) break;
          const col = e.material === 'soft' ? (e.reinforced ? P.metalLight : P.cream) : e.material === 'barricade' ? P.tan : e.material === 'gadget' ? P.amberLight : e.material === 'prop' ? P.tealLight : P.slate3;
          this.burst(e.pos, 4, col, 30, 0.25);
          break;
        }
        case 'damage': {
          const v = this.actors.get(e.actorId);
          if (v && vis(e.actorId)) {
            v.flashUntil = this.time + 0.08;
            const a = w.actor(e.actorId)!;
            this.burst(a.pos, 3, P.white, 25, 0.18);
          }
          break;
        }
        case 'wallBreached': {
          const g = w.map.softGroups[e.group];
          const seen = this.pointVisible(g.center) || w.actor(e.by)?.team === 0;
          if (seen) {
            for (const c of g.cells) this.burst({ x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 }, 14, P.cream, 90, 0.7, 120);
            this.dust(g.center);
          }
          this.addShake(seen ? 2 : 1, 0.25);
          break;
        }
        case 'barricadeBroken': {
          const d = w.map.doors[e.door];
          if (this.pointVisible(d.center) || w.actor(e.by)?.team === 0) {
            for (const c of d.cells) this.burst({ x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 }, 10, P.tan, 70, 0.6, 100);
            this.dust(d.center);
          }
          break;
        }
        case 'coverDeployed':
        case 'hingePlaced': {
          const ent = w.entities.find((x) => x.id === (e.type === 'coverDeployed' ? e.coverId : e.hingeId));
          if (ent && (ent.team === 0 || w.visibleEntities[0].has(ent.id))) {
            const c = ent.kind === 'cover' ? { x: ent.obb.cx, y: ent.obb.cy } : ent.kind === 'hinge' ? ent.center : { x: 0, y: 0 };
            this.burst(c, 8, P.amberLight, 45, 0.3);
          }
          break;
        }
        case 'sledDestroyed':
        case 'coverDestroyed':
        case 'hingeDestroyed': {
          if (this.pointVisible(e.pos)) {
            this.burst(e.pos, 12, e.type === 'hingeDestroyed' ? P.violetLight : P.metal, 70, 0.5, 80);
            this.dust(e.pos);
          }
          break;
        }
        case 'sledHitActor': {
          const a = w.actor(e.actorId);
          if (a && vis(a.id)) this.burst(a.pos, 6, P.yellow, 50, 0.3);
          this.addShake(1, 0.12);
          break;
        }
        case 'hingeBlocked': {
          const h = w.entities.find((x) => x.id === e.hingeId);
          if (h && h.team === 0) this.blockedCells = { cells: e.cells, t: 1.2 };
          break;
        }
        case 'death': {
          const a = w.actor(e.actorId);
          if (a && vis(a.id)) this.burst(a.pos, 8, P.cream2, 40, 0.4);
          if (a && a.team === 0) this.addShake(1.5, 0.2);
          break;
        }
        case 'sound': {
          // HUD arc: heard enemy sounds near the human, direction only (never exact position)
          break;
        }
      }
    }
  }

  /** feed heard-sound records for the arc indicator */
  pushSoundArc(ang: number, spread: number, kind: string) {
    this.arcs.push({ ang, spread, kind, t: 1.4 });
    if (this.arcs.length > 8) this.arcs.shift();
  }

  private addShake(mag: number, t: number) {
    if (this.reducedShake) return;
    this.shake.mag = Math.max(this.shake.mag, mag);
    this.shake.t = Math.max(this.shake.t, t);
  }

  private burst(p: Vec, n: number, col: string, speed: number, life: number, grav = 0) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= 120) {
        const old = this.particles.shift()!;
        old.img.destroy();
      }
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      const size = Math.random() < 0.3 ? 2 : 1;
      const img = this.scene.add.rectangle(p.x * T, p.y * T - 4, size, size, hex(col)).setDepth(DEPTH_FX + 1).setOrigin(0);
      this.particles.push({ img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - grav * 0.4, life: life * (0.6 + Math.random() * 0.4), max: life, grav });
    }
  }

  private dust(p: Vec) {
    if (this.dusts.length > 6) return;
    const img = this.scene.add.image(p.x * T, p.y * T - 4, 'dust0').setDepth(DEPTH_FX).setScale(2);
    this.dusts.push({ img, t: 0 });
  }

  private pointVisible(p: Vec): boolean {
    const w = this.world;
    return w.actors.some((a) => a.team === 0 && a.alive && canSee(w, a.pos, p));
  }

  // ---------- per-frame render ----------

  render(alpha: number, dt: number, humanId: number, preview: PreviewState, spectate: Vec | null) {
    const w = this.world;
    if (!w) return;
    this.time += dt;
    this.frame++;
    const lerp = (a: Vec, b: Vec): Vec => ({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha });

    // dynamic walls from the team's knowledge (unobserved changes stay unknown)
    w.map.softGroups.forEach((g, i) => {
      const st = w.knownSoft[0][i];
      const key = `soft_${g.id}_${st}`;
      if (this.softKeys[i] !== key) {
        const below = Math.floor(g.cells[0] / w.map.w) + 1;
        const ext = below < w.map.h && w.map.roomOf[below * w.map.w + (g.cells[0] % w.map.w)] >= 0 && !w.map.rooms[w.map.roomOf[below * w.map.w + (g.cells[0] % w.map.w)]].interior;
        addCanvas(this.scene, key, softPanelSprite(g.cells.length, g.horizontal, st, ext, i * 7 + 3).c);
        this.softImgs[i].setTexture(key);
        this.softKeys[i] = key;
      }
    });
    w.map.doors.forEach((d, i) => {
      const bar = w.barricades[i];
      const known = bar && (bar.team === 0 || w.knownBarricade[0][i]);
      const key = known ? `bar_${d.id}_${bar!.damaged ? 1 : 0}` : '';
      if (this.barKeys[i] !== key) {
        this.barImgs[i]?.destroy();
        this.barImgs[i] = null;
        if (key) {
          addCanvas(this.scene, key, barricadeSprite(d.cells.length, d.horizontal, bar!.damaged).c);
          const c0 = d.cells[0];
          this.barImgs[i] = this.scene.add
            .image((c0 % w.map.w) * T, Math.floor(c0 / w.map.w) * T - (d.horizontal ? 2 : 0), key)
            .setOrigin(0)
            .setDepth(100 + Math.floor(c0 / w.map.w) * T + T);
        }
        this.barKeys[i] = key;
      }
      if (!known && this.barImgs[i]) {
        this.barImgs[i]!.destroy();
        this.barImgs[i] = null;
      }
    });

    // ambient prop animation
    for (const p of this.props) {
      if (p.key.startsWith('washer_')) {
        const f = Math.floor(this.time * 6 + p.variant) % 4;
        p.img.setTexture(`washer_${p.variant}_${f}`);
      }
    }
    if (this.consoleImg) {
      const anyArming = w.actors.some((a) => a.alive && a.interaction && (a.interaction.kind === 'arm' || a.interaction.kind === 'shutoff') && (a.team === 0 || w.visible[0].has(a.id)));
      const st = w.phase === 'armed' ? 'armed' : anyArming ? 'arming' : 'idle';
      this.consoleImg.setTexture(`console_${st}_${Math.floor(this.time * (st === 'armed' ? 6 : 2)) % 2}`);
    }

    // actors
    for (const a of w.actors) this.renderActor(a, lerp(a.prevPos, a.pos), humanId);

    // gadgets
    const live = new Set<number>();
    for (const e of w.entities) {
      live.add(e.id);
      const seen = e.team === 0 || w.visibleEntities[0].has(e.id);
      let spr = this.ents.get(e.id) as Phaser.GameObjects.Sprite | undefined;
      if (!spr) {
        const key = e.kind === 'charge' ? 'charge0' : e.kind === 'puck' ? 'puck0' : e.kind;
        spr = this.scene.add.sprite(0, 0, key, e.kind === 'charge' || e.kind === 'puck' ? undefined : 0);
        this.ents.set(e.id, spr);
      }
      spr.setVisible(seen);
      if (!seen) continue;
      if (e.kind === 'sled') {
        const fr = Math.round((((e.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / SLED_ANGLES)) % SLED_ANGLES;
        spr.setFrame(fr).setPosition(e.pos.x * T, e.pos.y * T).setDepth(100 + e.pos.y * T);
      } else if (e.kind === 'cover') {
        const fr = Math.round((((e.obb.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / COVER_ANGLES)) % COVER_ANGLES;
        spr.setFrame(fr).setPosition(e.obb.cx * T, e.obb.cy * T).setDepth(100 + e.obb.cy * T + 2);
        spr.setAlpha(w.tick > e.expiresTick - 120 && Math.floor(this.time * 8) % 2 ? 0.6 : 1);
      } else if (e.kind === 'hinge') {
        let deg = ((((e.angle * 180) / Math.PI) % 180) + 180) % 180;
        if (deg > 90) deg = 180 - deg;
        const step = Math.round(deg / 5);
        const warn = e.state !== 'idle' ? 1 : 0;
        spr.setFrame(warn * HINGE_STEPS + Math.min(HINGE_STEPS - 1, step)).setPosition(e.center.x * T, e.center.y * T).setDepth(100 + e.center.y * T + 3);
        // mirror for angles in the second quadrant
        const a = (((e.angle % Math.PI) + Math.PI) % Math.PI);
        spr.setFlipX(a > Math.PI / 2 + 0.01);
      } else if (e.kind === 'puck') {
        spr.setTexture(Math.floor(this.time * 3) % 2 ? 'puck1' : 'puck0').setPosition(e.pos.x * T, e.pos.y * T).setDepth(100 + e.pos.y * T);
      } else if (e.kind === 'charge') {
        spr.setTexture(Math.floor(this.time * 8) % 2 ? 'charge1' : 'charge0').setPosition(e.pos.x * T, e.pos.y * T).setDepth(100 + e.pos.y * T);
      }
    }
    for (const [id, spr] of this.ents)
      if (!live.has(id)) {
        spr.destroy();
        this.ents.delete(id);
      }

    this.updateFx(dt);
    if (this.frame % 2 === 0 || this.polyCache.length === 0) this.drawFog();
    this.drawOverlay(humanId, preview);
    this.drawRain(dt);
    this.updateCamera(humanId, spectate, dt);
  }

  private renderActor(a: Actor, p: Vec, humanId: number) {
    const w = this.world;
    let v = this.actors.get(a.id);
    if (!v) {
      const s = this.scene;
      v = {
        body: s.add.sprite(0, 0, `char_${a.look}`, 0).setOrigin(0.5, 29 / 32),
        gun: s.add.sprite(0, 0, `gun_${a.weapon.id}`, 0),
        ring: s.add.image(0, 0, a.team === 0 ? 'ring_ally' : 'ring_enemy'),
        ghost: s.add.sprite(0, 0, `char_${a.look}`, 0).setOrigin(0.5, 29 / 32).setDepth(DEPTH_OVER - 2).setAlpha(0.35),
        ghostRing: s.add.image(0, 0, 'ring_ghost').setDepth(DEPTH_OVER - 3),
        flashUntil: 0,
        deadShown: false,
        look: a.look,
        weapon: a.weapon.id,
      };
      v.ghost.setTint(hex(P.coralLight)).setTintMode(Phaser.TintModes.FILL);
      this.actors.set(a.id, v);
    }
    const px = p.x * T;
    const py = p.y * T + 5;
    const visible = a.team === 0 || w.visible[0].has(a.id);
    // ---- last-known snapshot for unseen enemies ----
    const ls = a.team !== 0 ? w.lastSeen[0].get(a.id) : undefined;
    const age = ls ? (w.tick - ls.tick) / 60 : 99;
    const showGhost = a.alive && !visible && ls && age < 6;
    v.ghost.setVisible(!!showGhost);
    v.ghostRing.setVisible(!!showGhost);
    if (showGhost && ls) {
      const fade = Math.max(0, 1 - age / 6);
      v.ghost.setPosition(ls.pos.x * T, ls.pos.y * T + 5).setFrame(dirIndex(ls.facing) * COLS).setAlpha(0.32 * fade);
      v.ghostRing.setPosition(ls.pos.x * T, ls.pos.y * T + 5).setAlpha(fade);
    }

    if (!a.alive) {
      v.gun.setVisible(false);
      v.ring.setVisible(false);
      if (!v.deadShown) {
        v.body.setTexture(`dead_${a.look}`).setOrigin(0.5, 0.7).clearTint();
        v.deadShown = true;
      }
      // enemy corpses only where the team can see them
      if (a.team !== 0 && this.frame % 10 === 0) this.corpseVisible.set(a.id, this.pointVisible(a.pos));
      const show = a.team === 0 || !!this.corpseVisible.get(a.id);
      const since = (w.tick - a.diedTick) / 60;
      v.body.setVisible(show).setPosition(px, py).setDepth(99 + py - 8).setAlpha(since > 2 ? 0.5 : 0.9);
      return;
    }
    v.body.setVisible(visible);
    v.gun.setVisible(visible);
    v.ring.setVisible(visible);
    if (!visible) return;
    const d = dirIndex(a.facing);
    const speed = Math.hypot(a.vel.x, a.vel.y);
    let col: number;
    if (a.vaulting) col = 3;
    else if (speed > 0.3) col = 2 + (Math.floor(this.time * 9 + a.id) % 4);
    else col = Math.floor(this.time * 1.6 + a.id * 0.37) % 2;
    // recoil kick: body nudged opposite the facing for a frame after a shot
    const kick = w.tick < a.nextShotTick - Math.max(1, Math.round(a.weapon.interval_seconds * 60)) + 3 ? 1 : 0;
    const kx = -Math.cos(a.facing) * kick;
    const ky = -Math.sin(a.facing) * kick;
    const vaultLift = a.vaulting ? -4 * Math.sin(Math.min(1, (w.tick - a.vaulting.startTick) / (a.vaulting.endTick - a.vaulting.startTick)) * Math.PI) : 0;
    v.body.setFrame(d * COLS + col).setPosition(Math.round(px + kx), Math.round(py + ky + vaultLift)).setDepth(100 + py);
    v.ring.setTexture(a.id === humanId ? 'ring_player' : a.team === 0 ? 'ring_ally' : 'ring_enemy').setPosition(Math.round(px), Math.round(py)).setDepth(100 + py - 20);
    const gx = px + Math.cos(a.facing) * 4 + kx;
    const gy = py - 9 + Math.sin(a.facing) * 3 + ky + vaultLift;
    const behind = Math.sin(a.facing) < -0.3;
    v.gun.setFrame(weaponFrame(a.facing)).setPosition(Math.round(gx), Math.round(gy)).setDepth(100 + py + (behind ? -0.5 : 0.5));
    v.gun.setVisible(!a.interaction || a.interaction.kind === 'vault' ? !a.vaulting : true);
    if (this.time < v.flashUntil) {
      v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else v.body.clearTint();
    void WEAPON_ANGLES;
  }

  private updateFx(dt: number) {
    const g = this.fx;
    g.clear();
    for (const t of this.tracers) {
      g.lineStyle(1, t.col, Math.min(1, t.t / 0.05));
      g.lineBetween(t.a.x * T, t.a.y * T - 4, t.b.x * T, t.b.y * T - 4);
      t.t -= dt;
    }
    this.tracers = this.tracers.filter((t) => t.t > 0);
    for (const f of this.flashes) {
      f.t -= dt;
      if (f.t <= 0) f.img.destroy();
    }
    this.flashes = this.flashes.filter((f) => f.t > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.grav * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setAlpha(Math.max(0, p.life / p.max));
      if (p.life <= 0) p.img.destroy();
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const d of this.dusts) {
      d.t += dt;
      const f = Math.min(3, Math.floor(d.t / 0.06));
      d.img.setTexture(`dust${f}`).setAlpha(Math.max(0, 1 - d.t / 0.3));
      if (d.t > 0.3) d.img.destroy();
    }
    this.dusts = this.dusts.filter((d) => d.t <= 0.3);
    if (this.blockedCells) {
      this.blockedCells.t -= dt;
      if (this.blockedCells.t <= 0) this.blockedCells = null;
    }
    for (const a of this.arcs) a.t -= dt;
    this.arcs = this.arcs.filter((a) => a.t > 0);
  }

  /** Visibility polygons of the player's living team, cut out of a subdued blueprint fog. */
  private drawFog() {
    const w = this.world;
    const ctx = this.fogCtx;
    const W = w.map.w * T;
    const H = w.map.h * T;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16, 20, 34, 0.80)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    const eyes: Array<{ pos: Vec; range: number }> = w.actors.filter((a) => a.team === 0 && a.alive).map((a) => ({ pos: a.pos, range: VISION }));
    const puck = w.entities.find((e) => e.kind === 'puck' && e.team === 0);
    if (puck && puck.kind === 'puck') eyes.push({ pos: puck.pos, range: PUCK_VISION });
    const obs = w.obstacles();
    this.polyCache = [];
    for (const e of eyes) {
      const pts: Vec[] = [];
      const N = 300;
      const R = e.range;
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const end = { x: e.pos.x + dx * R, y: e.pos.y + dy * R };
        const hit = raycast(w as GeoState, e.pos, end, 'sight', { obs });
        let d = hit ? hit.t * R : R;
        // reveal the face of the surface that stopped the ray
        if (hit) d = Math.min(R, d + 0.55);
        pts.push({ x: e.pos.x + dx * d, y: e.pos.y + dy * d });
      }
      this.polyCache.push(pts);
      ctx.beginPath();
      ctx.moveTo(pts[0].x * T, pts[0].y * T);
      for (const p of pts) ctx.lineTo(Math.round(p.x * T), Math.round(p.y * T));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fogTex.refresh();
  }

  private drawOverlay(humanId: number, pv: PreviewState) {
    const g = this.over;
    const w = this.world;
    g.clear();
    const human = w.actor(humanId);
    // objective marker (always known)
    const cc = w.map.console.center;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    g.lineStyle(1, w.phase === 'armed' ? hex(P.coral) : hex(P.amber), 0.5 + 0.4 * pulse);
    g.strokeRect(cc.x * T - 18, cc.y * T - 14, 36, 24);
    // interaction progress rings above actors the team can see
    for (const a of w.actors) {
      if (!a.alive || !a.interaction || a.interaction.kind === 'vault') continue;
      if (a.team !== 0 && !w.visible[0].has(a.id)) continue;
      const t = Math.min(1, (w.tick - a.interaction.startTick) / a.interaction.durationTicks);
      const x = a.pos.x * T;
      const y = a.pos.y * T - 26;
      g.lineStyle(3, hex(P.ink), 0.8);
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.strokePath();
      g.lineStyle(2, a.team === 0 ? hex(P.amber) : hex(P.coral), 1);
      g.beginPath();
      g.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      g.strokePath();
    }
    // health bars on hurt visible actors
    for (const a of w.actors) {
      if (!a.alive || a.hp >= 100 || a.id === humanId) continue;
      if (a.team !== 0 && !w.visible[0].has(a.id)) continue;
      const x = Math.round(a.pos.x * T - 7);
      const y = Math.round(a.pos.y * T - 22);
      g.fillStyle(hex(P.ink), 0.85).fillRect(x - 1, y - 1, 16, 4);
      g.fillStyle(a.team === 0 ? hex(P.tealLight) : hex(P.coral), 1).fillRect(x, y, Math.round((14 * a.hp) / 100), 2);
    }
    // sled route preview: dotted path ending at hard walls
    if (pv.kind === 'sled' && pv.sledPoints && pv.sledPoints.length) {
      for (let i = 0; i < pv.sledPoints.length; i++) {
        const p = pv.sledPoints[i];
        g.fillStyle(hex(P.amberLight), 0.95).fillRect(Math.round(p.x * T) - 1, Math.round(p.y * T) - 1, 2, 2);
      }
      if (pv.sledBreach) {
        g.lineStyle(2, hex(P.amber), 0.9).strokeCircle(pv.sledBreach.x * T, pv.sledBreach.y * T, 7 + pulse * 2);
      }
      if (pv.sledStop) {
        const s = pv.sledStop;
        if (pv.sledHard) {
          g.lineStyle(2, hex(P.coral), 1);
          g.lineBetween(s.x * T - 4, s.y * T - 4, s.x * T + 4, s.y * T + 4);
          g.lineBetween(s.x * T + 4, s.y * T - 4, s.x * T - 4, s.y * T + 4);
        } else {
          g.lineStyle(2, hex(P.amberLight), 0.8).strokeCircle(s.x * T, s.y * T, 4);
        }
      }
    }
    if (pv.kind === 'hinge' && pv.hingePos) {
      const o: Obb = { cx: pv.hingePos.x, cy: pv.hingePos.y, hx: 1, hy: 0.16, angle: pv.hingeVertical ? Math.PI / 2 : 0 };
      const cs = obbCorners(o);
      g.fillStyle(pv.hingeValid ? hex(P.violetLight) : hex(P.coral), 0.55);
      g.beginPath();
      g.moveTo(cs[0].x * T, cs[0].y * T);
      for (const c of cs) g.lineTo(c.x * T, c.y * T);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, pv.hingeValid ? hex(P.white) : hex(P.coral), 0.9);
      g.strokeCircle(pv.hingePos.x * T, pv.hingePos.y * T, T + 2);
    }
    // owned hinge wall: show remote range and swing arc
    const myHinge = w.entities.find((e): e is HingeEntity => e.kind === 'hinge' && e.ownerId === humanId);
    if (myHinge && human) {
      const ready = myHinge.state === 'idle' && w.tick >= myHinge.cooldownUntil;
      g.lineStyle(1, ready ? hex(P.violetLight) : hex(P.slate3), 0.5);
      const from = myHinge.angle;
      const to = myHinge.orient === 0 ? from + Math.PI / 2 : from - Math.PI / 2;
      for (const base of [0, Math.PI]) {
        g.beginPath();
        g.arc(myHinge.center.x * T, myHinge.center.y * T, T, Math.min(from, to) + base, Math.max(from, to) + base);
        g.strokePath();
      }
    }
    if (this.blockedCells) {
      g.lineStyle(2, hex(P.coral), Math.min(1, this.blockedCells.t * 2));
      for (const c of this.blockedCells.cells) g.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2);
    }
    // sound arcs around the human: approximate direction + type colour
    if (human && human.alive) {
      for (const a of this.arcs) {
        const col = a.kind === 'shot' ? P.coral : a.kind === 'breach' ? P.amber : a.kind === 'gadget' ? P.violetLight : P.cream;
        g.lineStyle(3, hex(col), Math.min(1, a.t));
        g.beginPath();
        g.arc(human.pos.x * T, human.pos.y * T - 6, 26, a.ang - a.spread, a.ang + a.spread);
        g.strokePath();
      }
    }
  }

  private drawRain(dt: number) {
    const w = this.world;
    const g = this.fx;
    g.lineStyle(1, hex(P.glassLight), 0.35);
    for (const r of this.rain) {
      r.y += 160 * r.s * dt;
      r.x -= 30 * r.s * dt;
      if (r.y > w.map.h * T) {
        r.y = -4;
        r.x = Math.random() * w.map.w * T;
      }
      if (r.x < 0) r.x += w.map.w * T;
      const cx = Math.floor(r.x / T);
      const cy = Math.floor(r.y / T);
      if (cx < 0 || cy < 0 || cx >= w.map.w || cy >= w.map.h) continue;
      if (w.map.interior[cy * w.map.w + cx]) continue;
      g.lineBetween(r.x, r.y, r.x - 1, r.y + 3);
    }
  }

  private updateCamera(humanId: number, spectate: Vec | null, dt: number) {
    const w = this.world;
    const cam = this.scene.cameras.main;
    const h = w.actor(humanId);
    let target: Vec = spectate ?? (h ? { x: h.pos.x * T, y: h.pos.y * T } : { x: w.map.console.center.x * T, y: w.map.console.center.y * T });
    if (!spectate && h) {
      // lead the camera slightly toward where the player is aiming
      target = { x: target.x + Math.cos(h.facing) * 18, y: target.y + Math.sin(h.facing) * 12 };
    }
    if (!this.camPos) this.camPos = { ...target };
    const k = 1 - Math.pow(0.0005, dt);
    this.camPos.x += (target.x - this.camPos.x) * k;
    this.camPos.y += (target.y - this.camPos.y) * k;
    let sx = 0;
    let sy = 0;
    if (this.shake.t > 0) {
      this.shake.t -= dt;
      sx = (Math.random() - 0.5) * 2 * this.shake.mag;
      sy = (Math.random() - 0.5) * 2 * this.shake.mag;
      if (this.shake.t <= 0) this.shake.mag = 0;
    }
    cam.centerOn(Math.round(this.camPos.x + sx), Math.round(this.camPos.y + sy));
  }

  worldToScreen(p: Vec): Vec {
    const cam = this.scene.cameras.main;
    return { x: (p.x * T - cam.worldView.x) * cam.zoom, y: (p.y * T - cam.worldView.y) * cam.zoom };
  }

  screenToWorld(x: number, y: number): Vec {
    const cam = this.scene.cameras.main;
    return { x: (x / cam.zoom + cam.worldView.x) / T, y: (y / cam.zoom + cam.worldView.y) / T };
  }
}
