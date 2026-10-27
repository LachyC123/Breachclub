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
  buildDrone,
  buildBarrel,
  buildTurret,
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
import { canSee, DRONE_VISION } from '../sim/perception';
import { RULES } from '../content/defs';
import { statsOf } from '../content/handling';
import { Fx, buildLightTexture } from './fx';
import { MISSILE_RADIUS, MISSILE_WARNING, TURRET_HP, TURRET_RANGE } from '../sim/cards';

const VISION = RULES.vision_tiles;

export interface PreviewState {
  kind: 'none' | 'sled' | 'hinge' | 'missile';
  missilePos?: Vec;
  sledPoints?: Vec[];
  sledBreach?: Vec | null;
  sledStop?: Vec;
  sledHard?: boolean;
  hingePos?: Vec;
  hingeVertical?: boolean;
  hingeValid?: boolean;
}

export interface RenderOpts {
  humanId: number;
  preview: PreviewState;
  /** camera focus override in world tiles (spectate, drone cam, killer look) */
  focus: Vec | null;
  /** drone cam: fog shows only this drone's vision */
  droneId: number | null;
  ads: boolean;
  /** draw the laser sight along this angle from the human's muzzle */
  laser: number | null;
}

interface HitMark {
  pos: Vec;
  t: number;
  kill: boolean;
}

interface ActorView {
  body: Phaser.GameObjects.Sprite;
  gun: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Image;
  ghost: Phaser.GameObjects.Sprite;
  ghostRing: Phaser.GameObjects.Image;
  flashUntil: number;
  deadShown: boolean;
  /** view-only knockback when the body drops (pixels, eased in over 0.25 s) */
  fall: { x: number; y: number; t: number } | null;
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
  max: number;
  col: number;
  /** head width in pixels and head length */
  w: number;
  head: number;
}

/** Per-weapon presentation: each gun has its own flash, tracer, smoke, brass and kick. */
const GUN_FX: Record<string, { flash: number; light: number; tracerT: number; tracerW: number; head: number; smoke: number; shell: boolean; kick: number; shake: number }> = {
  smg: { flash: 1, light: 0.8, tracerT: 0.06, tracerW: 1, head: 7, smoke: 0, shell: false, kick: 0.9, shake: 0 },
  carbine: { flash: 1.4, light: 1.15, tracerT: 0.1, tracerW: 2, head: 14, smoke: 1, shell: false, kick: 2.2, shake: 0.3 },
  scattergun: { flash: 2.2, light: 1.9, tracerT: 0.07, tracerW: 1, head: 5, smoke: 4, shell: true, kick: 5, shake: 1.2 },
};

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
export function generateTextures(scene: Phaser.Scene) {
  for (const id of Object.keys(LOOKS)) {
    addSheet(scene, `char_${id}`, buildCharacterSheet(id), FRAME_W, FRAME_H);
    addCanvas(scene, `dead_${id}`, buildDeadSprite(id));
  }
  for (const w of ['smg', 'carbine', 'scattergun']) addSheet(scene, `gun_${w}`, buildWeaponSheet(w), GUN_SIZE, GUN_SIZE);
  addSheet(scene, 'sled', buildSledSheet(), SLED_SIZE, SLED_SIZE);
  addSheet(scene, 'cover', buildCoverSheet(), COVER_SIZE, COVER_SIZE);
  addSheet(scene, 'hinge', buildHingeSheet(), HINGE_SIZE, HINGE_SIZE);
  for (const b of [0, 1]) for (const r of [0, 1]) addCanvas(scene, `drone_${b}_${r}`, buildDrone(!!b, r));
  addCanvas(scene, 'charge0', buildCharge(false));
  addCanvas(scene, 'charge1', buildCharge(true));
  for (let f = 0; f < 3; f++) addCanvas(scene, `muzzle${f}`, buildMuzzle(f));
  addCanvas(scene, 'fxlight', buildLightTexture());
  addCanvas(scene, 'barrel0', buildBarrel(false));
  addCanvas(scene, 'barrel1', buildBarrel(true));
  addCanvas(scene, 'turret_own', buildTurret(0));
  addCanvas(scene, 'turret_foe', buildTurret(1));
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
  private hits: HitMark[] = [];
  private humanId = -1;
  private zoom = 3;
  private juice: Fx;
  private kick = { x: 0, y: 0 };
  private shotThisTick = new Set<number>();
  private dmgThisTick = new Map<number, { amt: number; kill: boolean; pos: Vec; dot: boolean }>();
  /** slow-motion close-up on the round's final kill */
  private killcam: { pos: Vec; t: number } | null = null;
  /** wider view while aiming down sights */
  private adsZoom = 2;
  private curZoom = 3;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.juice = new Fx(scene);
  }

  /** Build the presentation for a fresh round (clean restart: everything is recreated). */
  attach(world: World) {
    this.destroyAll();
    this.world = world;
    const s = this.scene;
    const m = world.map;
    const mapKey = `map_${m.id}`;
    addCanvas(s, mapKey, bakeMap(m));
    this.base = s.add.image(0, 0, mapKey).setOrigin(0).setDepth(DEPTH_FLOOR);
    for (const pr of buildProps(m)) {
      let key = pr.key;
      let variant = 0;
      if (pr.key.startsWith('washer_')) {
        variant = Number(pr.key.split('_')[1]);
        key = `washer_${variant}_0`;
      } else if (pr.key === 'console') key = 'console_idle_0';
      else addCanvas(s, `prop_${m.id}_${pr.key}`, pr.canvas), (key = `prop_${m.id}_${pr.key}`);
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
    this.juice.attach(m);
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
    this.hits = [];
    this.juice.destroy();
  }

  /** count of live display objects (restart regression check) */
  objectCount(): number {
    return this.scene.children.length;
  }

  // ---------- events -> effects ----------

  onEvents(events: SimEvent[]) {
    const w = this.world;
    this.shotThisTick.clear();
    this.dmgThisTick.clear();
    const vis = (id: number) => {
      const a = w.actor(id);
      return !!a && (a.team === 0 || w.visible[0].has(id));
    };
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (!vis(e.actorId)) break;
          const a = w.actor(e.actorId)!;
          const gx = GUN_FX[a.weapon.id] ?? GUN_FX.smg;
          this.tracers.push({ a: e.from, b: e.to, t: gx.tracerT, max: gx.tracerT, col: a.team === 0 ? hex(P.amberLight) : hex(P.coralLight), w: gx.tracerW, head: gx.head });
          // once per trigger pull (a scattergun blast is five pellet events)
          if (this.shotThisTick.has(a.id)) break;
          this.shotThisTick.add(a.id);
          const len = weaponLength(a.weapon.id) / T;
          const muzzle = { x: a.pos.x + Math.cos(a.facing) * (0.2 + len), y: a.pos.y + Math.sin(a.facing) * (0.15 + len) };
          if (this.flashes.length < 12 && !this.reducedFlash) {
            const img = this.scene.add.image(muzzle.x * T, muzzle.y * T - 4, `muzzle${Math.floor(Math.random() * 2)}`).setDepth(DEPTH_FX + 2).setScale(gx.flash).setRotation(a.facing);
            img.setBlendMode(Phaser.BlendModes.ADD);
            this.flashes.push({ img, t: 0.03 + gx.flash * 0.015 });
            this.juice.muzzleLight(muzzle, gx.light);
          }
          if (gx.smoke) this.juice.smoke(muzzle, gx.smoke, gx.smoke > 2 ? 2.2 : 1, a.facing, P.cream);
          if (!gx.shell) this.juice.casing(a.pos, a.facing, false);
          else this.pendingShells.push({ id: a.id, at: this.time + 0.32 });
          if (a.id === this.humanId) {
            // recoil kick pushes the camera back along the barrel; heavy guns also shake
            this.kick.x -= Math.cos(a.facing) * gx.kick;
            this.kick.y -= Math.sin(a.facing) * gx.kick;
            if (gx.shake) this.addShake(gx.shake, 0.08);
          }
          break;
        }
        case 'surfaceHit': {
          if (!this.pointVisible(e.pos)) break;
          const col = e.material === 'soft' ? (e.reinforced ? P.metalLight : P.cream) : e.material === 'barricade' ? P.tan : e.material === 'gadget' ? P.amberLight : e.material === 'prop' ? P.tealLight : P.slate3;
          this.burst(e.pos, 4, col, 30, 0.25);
          const metal = e.material === 'gadget' || e.reinforced;
          // hard surfaces spark, soft ones puff plaster or wood dust
          if (metal || e.material === 'wall') this.juice.sparks(e.pos, metal ? 6 : 3, metal ? P.yellow : P.amberLight, metal ? 120 : 80);
          else this.juice.smoke(e.pos, 1, 0.8, null, e.material === 'barricade' ? P.tan : P.cream);
          if (e.material !== 'gadget') this.juice.bulletHole(e.pos, e.material);
          break;
        }
        case 'damage': {
          if (e.sourceId === this.humanId && e.sourceId !== e.actorId) {
            const t = w.actor(e.actorId);
            if (t && !e.dot) this.hits.push({ pos: { ...t.pos }, t: e.hpAfter <= 0 ? 0.45 : 0.22, kill: e.hpAfter <= 0 });
            if (this.hits.length > 8) this.hits.shift();
            // one number per target per tick (a scattergun blast is five pellets)
            if (t) {
              const d = this.dmgThisTick.get(t.id) ?? { amt: 0, kill: false, pos: { ...t.pos }, dot: !!e.dot };
              d.amt += e.amount;
              d.kill = d.kill || e.hpAfter <= 0;
              this.dmgThisTick.set(t.id, d);
            }
          }
          if (e.actorId === this.humanId) this.addShake(1.2, 0.1);
          const v = this.actors.get(e.actorId);
          if (v && vis(e.actorId)) {
            v.flashUntil = this.time + 0.08;
            const a = w.actor(e.actorId)!;
            const src = w.actor(e.sourceId);
            const dir = src ? Math.atan2(a.pos.y - src.pos.y, a.pos.x - src.pos.x) : Math.random() * Math.PI * 2;
            this.burst(a.pos, 3, P.white, 25, 0.18);
            this.burst(a.pos, 3 + Math.round(e.amount / 8), P.coralDeep, 55, 0.3, 90);
            this.juice.blood(a.pos, dir, 2 + Math.round(e.amount / 6));
          }
          break;
        }
        case 'wallBreached': {
          const g = w.map.softGroups[e.group];
          const seen = this.pointVisible(g.center) || w.actor(e.by)?.team === 0;
          if (seen) {
            for (const c of g.cells) {
              const cp = { x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 };
              this.burst(cp, 10, P.cream, 110, 0.8, 160, true);
              this.burst(cp, 6, P.tan, 80, 0.7, 160, true);
              this.burst(cp, 6, P.white, 60, 0.25);
              this.dust(cp);
              this.juice.smoke(cp, 4, 3, null, P.cream);
            }
            this.juice.shockwave(g.center, 3.5);
            if (e.cause === 'charge') this.juice.scorch(g.center, 1.6);
            this.juice.sparks(g.center, 14, P.amberLight, 160);
            if (!this.reducedFlash) this.flashAt(g.center);
          }
          this.addShake(seen ? 2 : 1, 0.25);
          break;
        }
        case 'barricadeBroken': {
          const d = w.map.doors[e.door];
          if (this.pointVisible(d.center) || w.actor(e.by)?.team === 0) {
            for (const c of d.cells) this.burst({ x: (c % w.map.w) + 0.5, y: Math.floor(c / w.map.w) + 0.5 }, 10, P.tan, 70, 0.6, 100);
            this.dust(d.center);
            this.juice.smoke(d.center, 5, 2, null, P.tan);
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
        case 'droneDestroyed':
        case 'sledDestroyed':
        case 'coverDestroyed':
        case 'hingeDestroyed': {
          if (this.pointVisible(e.pos) || (e.type === 'droneDestroyed' && w.actor(e.ownerId)?.team === 0)) {
            this.burst(e.pos, 12, e.type === 'hingeDestroyed' ? P.violetLight : P.metal, 70, 0.5, 80);
            this.dust(e.pos);
            this.juice.sparks(e.pos, 10, P.yellow, 110);
            this.juice.smoke(e.pos, 3, 1.5, null, P.slate3);
          }
          break;
        }
        case 'turretDeployed': {
          const t = w.entities.find((x) => x.id === e.turretId);
          if (t && t.kind === 'turret' && (t.team === 0 || w.visibleEntities[0].has(t.id))) {
            this.burst(t.pos, 10, P.amberLight, 50, 0.35);
            this.juice.shockwave(t.pos, 0.9, '#c79bff');
          }
          break;
        }
        case 'turretShot': {
          const t = w.entities.find((x) => x.id === e.turretId);
          if (!t || (t.team !== 0 && !w.visibleEntities[0].has(t.id))) break;
          this.tracers.push({ a: e.from, b: e.to, t: 0.06, max: 0.06, col: t.team === 0 ? hex(P.tealLight) : hex(P.coralLight), w: 1, head: 6 });
          this.juice.muzzleLight(e.from, 0.6);
          if (t.kind === 'turret' && Math.random() < 0.5) this.juice.casing(t.pos, Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x), false);
          break;
        }
        case 'turretDestroyed':
        case 'turretExpired': {
          {
            this.juice.sparks(e.pos, e.type === 'turretDestroyed' ? 14 : 5, P.yellow, 110);
            this.juice.smoke(e.pos, e.type === 'turretDestroyed' ? 4 : 2, 1.4, null, P.slate3);
          }
          break;
        }
        case 'pulse': {
          // sonar rings out from each of the pulsing team's operators you can see
          for (const a of w.actors) if (a.alive && a.team === e.team && (a.team === 0 || w.visible[0].has(a.id))) this.juice.shockwave(a.pos, 6, e.team === 0 ? P.tealLight : P.coral);
          break;
        }
        case 'healed': {
          const a = w.actor(e.actorId);
          if (a && (a.team === 0 || w.visible[0].has(a.id))) {
            this.juice.number(a.pos, e.amount, false, P.mint, '+');
            this.burst(a.pos, 8, P.mint, 40, 0.5);
          }
          break;
        }
        case 'sledHitActor': {
          const a = w.actor(e.actorId);
          if (a && vis(a.id)) this.burst(a.pos, 6, P.yellow, 50, 0.3);
          this.addShake(1, 0.12);
          break;
        }
        case 'explosion': {
          const seen = this.pointVisible(e.pos) || w.actor(e.by)?.team === 0;
          const big = e.radius > 1.5;
          if (seen) {
            // fireball, smoke column, debris, shockwave, scorch
            this.juice.smoke(e.pos, big ? 10 : 4, big ? 3 : 1.4, null, P.amber);
            this.juice.smoke(e.pos, big ? 8 : 3, big ? 3.5 : 1.5, null, P.slate3);
            this.juice.sparks(e.pos, big ? 26 : 10, P.yellow, big ? 200 : 120);
            this.burst(e.pos, big ? 18 : 8, P.coralLight, 120, 0.6, 160, true);
            this.juice.shockwave(e.pos, e.radius * 1.3, P.amberLight);
            this.juice.scorch(e.pos, Math.min(1.8, e.radius * 0.6));
            this.juice.muzzleLight(e.pos, big ? 5 : 2.5);
            if (!this.reducedFlash) this.flashAt(e.pos);
          }
          // you feel it more the closer you are
          const me = w.actor(this.humanId);
          const d = me ? Math.hypot(me.pos.x - e.pos.x, me.pos.y - e.pos.y) : 20;
          this.addShake(Math.max(0.6, (big ? 4 : 2) * (1 - Math.min(1, d / 14))), big ? 0.35 : 0.2);
          break;
        }
        case 'slide': {
          const a = w.actor(e.actorId);
          if (a && vis(a.id)) this.juice.smoke(a.pos, 3, 0.8, Math.atan2(-a.vel.y, -a.vel.x), P.cream);
          break;
        }
        case 'hingeBlocked': {
          const h = w.entities.find((x) => x.id === e.hingeId);
          if (h && h.team === 0) this.blockedCells = { cells: e.cells, t: 1.2 };
          break;
        }
        case 'death': {
          const a = w.actor(e.actorId);
          const k = w.actor(e.killerId);
          if (a && vis(a.id)) {
            this.burst(a.pos, 8, P.cream2, 40, 0.4);
            this.juice.pool(a.pos);
            // the body is thrown away from whoever got them
            const v = this.actors.get(a.id);
            const dir = k ? Math.atan2(a.pos.y - k.pos.y, a.pos.x - k.pos.x) : 0;
            const shove = k && k.weapon.id === 'scattergun' ? 9 : 5;
            if (v) v.fall = { x: Math.cos(dir) * shove, y: Math.sin(dir) * shove * 0.7, t: 0 };
          }
          if (a && a.team === 0) this.addShake(1.5, 0.2);
          if (a && k && k.id === this.humanId && a.team !== 0) {
            // your kill: a burst you feel
            this.juice.shockwave(a.pos, 1.6, P.coral);
            this.juice.sparks(a.pos, 12, P.coralLight, 130);
            this.addShake(2.2, 0.14);
          }
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

  /** Slow-motion punch-in on the round's last kill. */
  finalKill(pos: Vec) {
    this.killcam = { pos: { ...pos }, t: 1.6 };
  }

  /** pump action: the spent shell flies out a beat after the blast */
  private pendingShells: Array<{ id: number; at: number }> = [];
  private ejectShells() {
    const due = this.pendingShells.filter((p) => this.time >= p.at);
    if (!due.length) return;
    this.pendingShells = this.pendingShells.filter((p) => this.time < p.at);
    for (const p of due) {
      const a = this.world.actor(p.id);
      if (a && a.alive && (a.team === 0 || this.world.visible[0].has(a.id))) this.juice.casing(a.pos, a.facing, true);
    }
  }

  private addShake(mag: number, t: number) {
    if (this.reducedShake) return;
    this.shake.mag = Math.max(this.shake.mag, mag);
    this.shake.t = Math.max(this.shake.t, t);
  }

  private burst(p: Vec, n: number, col: string, speed: number, life: number, grav = 0, big = false) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= 120) {
        const old = this.particles.shift()!;
        old.img.destroy();
      }
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      const size = big ? 2 + Math.floor(Math.random() * 2) : Math.random() < 0.3 ? 2 : 1;
      const img = this.scene.add.rectangle(p.x * T, p.y * T - 4, size, size, hex(col)).setDepth(DEPTH_FX + 1).setOrigin(0);
      this.particles.push({ img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - grav * 0.4, life: life * (0.6 + Math.random() * 0.4), max: life, grav });
    }
  }

  private dust(p: Vec) {
    if (this.dusts.length > 8) return;
    const img = this.scene.add.image(p.x * T, p.y * T - 4, 'dust0').setDepth(DEPTH_FX).setScale(2);
    this.dusts.push({ img, t: 0 });
  }

  /** brief local light pop at a breach (skipped in reduced-flash mode) */
  private flashAt(p: Vec) {
    const img = this.scene.add.image(p.x * T, p.y * T - 4, 'muzzle0').setDepth(DEPTH_FX + 3).setScale(4).setAlpha(0.8);
    img.setBlendMode(Phaser.BlendModes.ADD);
    this.flashes.push({ img, t: 0.09 });
  }

  private pointVisible(p: Vec): boolean {
    const w = this.world;
    return w.actors.some((a) => a.team === 0 && a.alive && canSee(w, a.pos, p));
  }

  // ---------- per-frame render ----------

  render(alpha: number, dt: number, o: RenderOpts) {
    const w = this.world;
    if (!w) return;
    const humanId = o.humanId;
    this.humanId = humanId;
    this.time += dt;
    this.frame++;
    const lerp = (a: Vec, b: Vec): Vec => ({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha });

    // dynamic walls from the team's knowledge (unobserved changes stay unknown)
    w.map.softGroups.forEach((g, i) => {
      const st = w.knownSoft[0][i];
      const key = `soft_${w.map.id}_${g.id}_${st}`;
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
      const key = known ? `bar_${w.map.id}_${d.id}_${bar!.damaged ? 1 : 0}` : '';
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
      const seen = e.kind === 'barrel' || e.kind === 'missile' || e.team === 0 || w.visibleEntities[0].has(e.id);
      let spr = this.ents.get(e.id) as Phaser.GameObjects.Sprite | undefined;
      if (!spr) {
        const key = e.kind === 'charge' ? 'charge0' : e.kind === 'drone' ? 'drone_0_0' : e.kind === 'barrel' ? 'barrel0' : e.kind === 'turret' ? (e.team === 0 ? 'turret_own' : 'turret_foe') : e.kind === 'missile' ? 'fxlight' : e.kind;
        spr = this.scene.add.sprite(0, 0, key, e.kind === 'charge' || e.kind === 'drone' || e.kind === 'barrel' || e.kind === 'turret' || e.kind === 'missile' ? undefined : 0);
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
      } else if (e.kind === 'turret') {
        const expiring = e.expiresTick - w.tick < 180 && Math.floor(this.time * 8) % 2 === 0;
        spr.setOrigin(0.5, 0.7).setPosition(Math.round(e.pos.x * T), Math.round(e.pos.y * T)).setDepth(100 + e.pos.y * T).setAlpha(expiring ? 0.5 : 1);
      } else if (e.kind === 'missile') {
        spr.setVisible(false);
      } else if (e.kind === 'barrel') {
        // cooking off: flashes faster and faster, jitters
        const lit = e.fuseTick >= 0 && Math.floor(this.time * 18) % 2 === 0;
        const jit = e.fuseTick >= 0 ? Math.round((Math.random() - 0.5) * 2) : 0;
        spr.setTexture(lit ? 'barrel1' : 'barrel0').setOrigin(0.5, 0.8).setPosition(Math.round(e.pos.x * T) + jit, Math.round(e.pos.y * T)).setDepth(100 + e.pos.y * T);
        if (e.fuseTick >= 0 && this.frame % 3 === 0) this.juice.sparks({ x: e.pos.x, y: e.pos.y - 0.4 }, 2, P.yellow, 60, -Math.PI / 2);
      } else if (e.kind === 'drone') {
        const roll = Math.floor(e.stepAccum * 6) % 2;
        spr.setTexture(`drone_${Math.floor(this.time * 3) % 2}_${roll}`).setPosition(Math.round(e.pos.x * T), Math.round(e.pos.y * T)).setDepth(100 + e.pos.y * T);
      } else if (e.kind === 'charge') {
        spr.setTexture(Math.floor(this.time * 8) % 2 ? 'charge1' : 'charge0').setPosition(e.pos.x * T, e.pos.y * T).setDepth(100 + e.pos.y * T);
      }
    }
    for (const [id, spr] of this.ents)
      if (!live.has(id)) {
        spr.destroy();
        this.ents.delete(id);
      }

    this.updateFx(this.killcam ? dt * 0.3 : dt);
    this.ejectShells();
    for (const [, d] of this.dmgThisTick) this.juice.number(d.pos, d.amt, d.kill, d.kill ? P.coral : d.dot ? P.mint : P.white);
    this.dmgThisTick.clear();
    if (this.killcam) {
      this.killcam.t -= dt;
      if (this.killcam.t <= 0) this.killcam = null;
    }
    // the kill cam runs effects in slow motion
    this.juice.update(this.killcam ? dt * 0.3 : dt);
    if (this.frame % 2 === 0 || this.polyCache.length === 0) this.drawFog(o.droneId);
    this.drawOverlay(humanId, o.preview, o.laser, o.ads);
    this.drawRain(dt);
    this.updateCamera(humanId, o.focus, o.ads, dt);
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
        fall: null,
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
      let fx = 0;
      let fy = 0;
      if (v.fall) {
        v.fall.t = Math.min(1, v.fall.t + 1 / 15);
        const e = 1 - (1 - v.fall.t) * (1 - v.fall.t);
        fx = Math.round(v.fall.x * e);
        fy = Math.round(v.fall.y * e);
      }
      v.body.setVisible(show).setPosition(px + fx, py + fy).setDepth(99 + py - 8).setAlpha(since > 2 ? 0.5 : 0.9);
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
    // stride cadence follows the operator's speed rating (light ops scurry, heavies plod)
    else if (speed > 0.3) col = 2 + (Math.floor(this.time * (6 + statsOf(a.operatorId).speed * 2) + a.id) % 4);
    else col = Math.floor(this.time * 1.6 + a.id * 0.37) % 2;
    // recoil kick: body nudged opposite the facing for a frame after a shot
    const kick = w.tick < a.nextShotTick - Math.max(1, Math.round(a.weapon.interval_seconds * 60)) + (a.weapon.id === 'scattergun' ? 6 : 3) ? (a.weapon.id === 'scattergun' ? 2 : 1) : 0;
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
    // poisoned: green tint flicker and bubbles
    if (a.poison && this.frame % 6 === 0) this.juice.smoke({ x: a.pos.x, y: a.pos.y - 0.6 }, 1, 0.5, -Math.PI / 2, P.mint);
    if (this.time < v.flashUntil) {
      v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else v.body.clearTint();
    void WEAPON_ANGLES;
  }

  private updateFx(dt: number) {
    const g = this.fx;
    g.clear();
    for (const t of this.tracers) {
      // short bright head near the target over a faint trail: reads as hitscan, not a slow bullet
      const hx = t.b.x * T;
      const hy = t.b.y * T - 4;
      const fade = t.t / t.max;
      g.lineStyle(1, t.col, 0.45 * fade);
      g.lineBetween(t.a.x * T, t.a.y * T - 4, hx, hy);
      const len = Math.hypot(hx - t.a.x * T, hy - (t.a.y * T - 4)) || 1;
      const k = Math.min(1, t.head / len);
      g.lineStyle(t.w + 1, hex(P.white), Math.min(1, fade * 1.6));
      g.lineBetween(hx - (hx - t.a.x * T) * k, hy - (hy - (t.a.y * T - 4)) * k, hx, hy);
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
    for (const h of this.hits) h.t -= dt;
    this.hits = this.hits.filter((h) => h.t > 0);
  }

  /** Visibility polygons of the player's living team, cut out of a subdued blueprint fog. */
  private drawFog(droneId: number | null) {
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
    let eyes: Array<{ pos: Vec; range: number }> = w.actors.filter((a) => a.team === 0 && a.alive).map((a) => ({ pos: a.pos, range: VISION }));
    for (const e of w.entities) if (e.kind === 'drone' && e.team === 0) eyes.push({ pos: e.pos, range: DRONE_VISION });
    // drone cam: you only see what this drone's camera sees
    const cam = droneId !== null ? w.entities.find((e) => e.id === droneId) : undefined;
    if (cam && cam.kind === 'drone') eyes = [{ pos: cam.pos, range: DRONE_VISION }];
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

  private drawOverlay(humanId: number, pv: PreviewState, laser: number | null, ads: boolean) {
    const g = this.over;
    const w = this.world;
    g.clear();
    const human = w.actor(humanId);
    if (human && human.alive && laser !== null && pv.kind === 'none') this.drawLaser(g, human, laser, ads);
    // drone tags: pinned diamonds over pinged enemies (team knowledge only)
    for (const [id, m] of w.marks[0]) {
      const a = w.actor(id);
      if (!a || !a.alive) continue;
      const p = w.visible[0].has(id) ? a.pos : m.pos;
      const x = Math.round(p.x * T);
      const y = Math.round(p.y * T - 30 - Math.sin(this.time * 6) * 1.5);
      g.fillStyle(hex(P.coral), 0.95);
      g.fillTriangle(x, y - 5, x + 4, y, x - 4, y);
      g.fillTriangle(x, y + 5, x + 4, y, x - 4, y);
      g.fillStyle(hex(P.cream2), 1).fillRect(x - 1, y - 1, 2, 2);
      if (!w.visible[0].has(id)) g.lineStyle(1, hex(P.coral), 0.6).strokeCircle(p.x * T, p.y * T, 6);
    }
    // hit markers on what the player just hit
    for (const hm of this.hits) {
      const x = hm.pos.x * T;
      const y = hm.pos.y * T - 10;
      const s = hm.kill ? 5 : 3;
      g.lineStyle(hm.kill ? 2 : 1, hm.kill ? hex(P.coral) : hex(P.white), Math.min(1, hm.t * 6));
      for (const [dx, dy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
        g.lineBetween(x + dx * 2, y + dy * 2, x + dx * (2 + s), y + dy * (2 + s));
    }
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
    if (pv.kind === 'missile' && pv.missilePos && human) {
      const p = pv.missilePos;
      const r = MISSILE_RADIUS * T;
      // dashed line from you to the strike point, then the blast circle
      const steps = Math.floor(Math.hypot(p.x - human.pos.x, p.y - human.pos.y) * 2);
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        g.lineStyle(1, hex(P.coralLight), 0.7).lineBetween((human.pos.x + (p.x - human.pos.x) * t0) * T, (human.pos.y + (p.y - human.pos.y) * t0) * T, (human.pos.x + (p.x - human.pos.x) * t1) * T, (human.pos.y + (p.y - human.pos.y) * t1) * T);
      }
      g.fillStyle(hex(P.coral), 0.18).fillCircle(p.x * T, p.y * T, r);
      g.lineStyle(2, hex(P.coral), 0.9).strokeCircle(p.x * T, p.y * T, r);
      g.lineStyle(1, hex(P.white), 0.9).lineBetween(p.x * T - 5, p.y * T, p.x * T + 5, p.y * T).lineBetween(p.x * T, p.y * T - 5, p.x * T, p.y * T + 5);
    }
    // incoming missiles: everyone sees the danger zone fill up
    for (const e of w.entities) {
      if (e.kind !== 'missile') continue;
      const total = MISSILE_WARNING * 60;
      const k = Math.max(0, Math.min(1, 1 - (e.impactTick - w.tick) / total));
      const r = MISSILE_RADIUS * T;
      const blink = Math.floor(this.time * (6 + k * 14)) % 2 === 0;
      g.fillStyle(hex(P.coral), 0.12 + k * 0.2).fillCircle(e.pos.x * T, e.pos.y * T, r * k);
      g.lineStyle(2, hex(blink ? P.white : P.coral), 0.95).strokeCircle(e.pos.x * T, e.pos.y * T, r);
      g.lineStyle(1, hex(P.coral), 0.8).lineBetween(e.pos.x * T - r, e.pos.y * T, e.pos.x * T + r, e.pos.y * T).lineBetween(e.pos.x * T, e.pos.y * T - r, e.pos.x * T, e.pos.y * T + r);
      if (k > 0.82) {
        // the missile streaks in from the sky
        const f = (k - 0.82) / 0.18;
        const sx = e.pos.x * T - 60 * (1 - f);
        const sy = e.pos.y * T - 140 * (1 - f);
        g.lineStyle(3, hex(P.amberLight), 1).lineBetween(sx, sy, sx - 10, sy - 22);
        g.fillStyle(hex(P.white), 1).fillCircle(sx, sy, 2);
      }
    }
    // turrets: barrel line, own turret's reach, blink before expiring
    for (const e of w.entities) {
      if (e.kind !== 'turret' || (e.team !== 0 && !w.visibleEntities[0].has(e.id))) continue;
      const x = e.pos.x * T;
      const y = e.pos.y * T - 6;
      g.lineStyle(2, hex(P.metalLight), 1).lineBetween(x, y, x + Math.cos(e.facing) * 8, y + Math.sin(e.facing) * 8);
      if (e.team === 0) g.lineStyle(1, hex(P.tealLight), 0.18).strokeCircle(e.pos.x * T, e.pos.y * T, TURRET_RANGE * T);
      if (e.hp < TURRET_HP) {
        g.fillStyle(hex(P.ink), 0.85).fillRect(x - 7, y - 12, 14, 3);
        g.fillStyle(e.team === 0 ? hex(P.tealLight) : hex(P.coral), 1).fillRect(x - 6, y - 11, Math.round((12 * e.hp) / TURRET_HP), 1);
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

  /** Laser sight from the muzzle to the first thing that blocks sight; coral when it lies on a visible enemy. */
  private drawLaser(g: Phaser.GameObjects.Graphics, a: Actor, ang: number, ads: boolean) {
    const w = this.world;
    const len = weaponLength(a.weapon.id) / T;
    const from = { x: a.pos.x + Math.cos(ang) * (0.2 + len), y: a.pos.y + Math.sin(ang) * (0.15 + len) };
    const R = ads ? 12 : Math.min(9, a.weapon.effective_range_tiles * 1.4);
    const end = { x: from.x + Math.cos(ang) * R, y: from.y + Math.sin(ang) * R };
    const hit = raycast(w as GeoState, from, end, 'sight', { obs: w.obstacles() });
    const d = hit ? hit.t * R : R;
    let onEnemy = false;
    for (const e of w.actors) {
      if (e.team === 0 || !e.alive || !w.visible[0].has(e.id)) continue;
      const rx = e.pos.x - from.x;
      const ry = e.pos.y - from.y;
      const along = rx * Math.cos(ang) + ry * Math.sin(ang);
      const lat = Math.abs(-rx * Math.sin(ang) + ry * Math.cos(ang));
      if (along > 0 && along < d + 0.3 && lat < 0.42) onEnemy = true;
    }
    const col = onEnemy ? hex(P.coral) : hex(P.amberLight);
    const x0 = from.x * T;
    const y0 = from.y * T - 9;
    const x1 = from.x * T + Math.cos(ang) * d * T;
    const y1 = from.y * T - 9 + Math.sin(ang) * d * T;
    // dashed beam fading out with distance, bright dot where it lands
    const steps = Math.max(1, Math.floor((d * T) / 4));
    for (let i = 0; i < steps; i += 2) {
      const t0 = i / steps;
      const t1 = Math.min(1, (i + 1) / steps);
      g.lineStyle(1, col, (ads ? 0.75 : 0.45) * (1 - t0 * 0.6));
      g.lineBetween(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    }
    g.fillStyle(col, onEnemy ? 1 : 0.8).fillRect(Math.round(x1) - 1, Math.round(y1) - 1, 2, 2);
    if (ads) g.lineStyle(1, col, 0.7).strokeCircle(x1, y1, onEnemy ? 4 : 3);
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

  /** Integer zoom keeps pixels crisp: about eight and a half tiles of height on any screen.
   *  Aiming down sights pulls the camera out one step (a third more view) so you see further. */
  fit() {
    const cam = this.scene.cameras.main;
    this.zoom = Math.max(2, Math.min(8, Math.round(window.innerHeight / 135)));
    // phones (zoom 3) go to 2; tiny screens use 1.5 so ADS still widens the view
    this.adsZoom = this.zoom <= 2 ? 1.5 : Math.max(2, Math.round(this.zoom * 0.67));
    this.curZoom = this.zoom;
    cam.setZoom(this.zoom);
  }

  private updateCamera(humanId: number, focus: Vec | null, ads: boolean, dt: number) {
    const w = this.world;
    const cam = this.scene.cameras.main;
    const h = w.actor(humanId);
    // ease between the hip and ADS zoom (~0.2 s), then settle exactly on the step for crisp pixels
    const want = this.killcam ? this.zoom + 1 : ads && !focus && h?.alive ? this.adsZoom : this.zoom;
    if (this.killcam) focus = this.killcam.pos;
    this.curZoom += (want - this.curZoom) * (1 - Math.pow(0.0001, dt));
    if (Math.abs(want - this.curZoom) < 0.02) this.curZoom = want;
    if (cam.zoom !== this.curZoom) cam.setZoom(this.curZoom);
    const f = focus ?? (h ? h.pos : w.map.console.center);
    let target: Vec = { x: f.x * T, y: f.y * T - 6 };
    if (!focus && h && h.alive) {
      // look ahead where the player aims: further while aiming down sights
      const viewH = window.innerHeight / this.curZoom;
      const lead = (ads ? 4 : 1.6) * T;
      target = { x: target.x + Math.cos(h.facing) * lead, y: target.y + Math.sin(h.facing) * Math.min(lead, viewH * 0.3) };
    }
    if (!this.camPos) this.camPos = { ...target };
    const k = 1 - Math.pow(ads ? 0.004 : 0.0008, dt);
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
    const kd = Math.pow(0.0005, dt);
    this.kick.x *= kd;
    this.kick.y *= kd;
    cam.centerOn(Math.round(this.camPos.x + sx + this.kick.x), Math.round(this.camPos.y + sy + this.kick.y));
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
