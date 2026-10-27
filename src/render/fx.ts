// Combat juice layer: shell casings, smoke, sparks, muzzle light, shockwaves and persistent
// decals (bullet holes, scorch, blood). Presentation only: callers decide what the player's
// team could see before asking for an effect.
import Phaser from 'phaser';
import { P, hex } from './palette';
import { T } from './art/env';
import type { MapData } from '../sim/mapdata';
import type { Vec } from '../sim/types';

interface Casing {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
  shell: boolean;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  grow: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: number;
  a: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  t: number;
  dur: number;
  col: number;
}

// 3x5 pixel digits for floating damage numbers (rows top to bottom, 3 bits each)
const DIGITS: Record<string, number[]> = {
  '+': [0, 2, 7, 2, 0],
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
};

interface FloatNum {
  x: number;
  y: number;
  text: string;
  t: number;
  big: boolean;
  col: string;
}

const DEPTH_DECAL = 2;
const DEPTH_JUICE = 9001;
const DEPTH_LIGHT = 9003;

/** Pixel-stepped radial glow (keeps the light pop in the art style). */
export function buildLightTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d >= 1) continue;
      // four hard bands instead of a smooth gradient
      const band = Math.floor((1 - d) * 4) / 4;
      g.fillStyle = `rgba(255, 220, 150, ${(band * 0.55).toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    }
  return c;
}

export class Fx {
  private g!: Phaser.GameObjects.Graphics;
  private decalTex: Phaser.Textures.CanvasTexture | null = null;
  private decalImg: Phaser.GameObjects.Image | null = null;
  private dctx: CanvasRenderingContext2D | null = null;
  private decalDirty = false;
  private casings: Casing[] = [];
  private puffs: Puff[] = [];
  private sparkList: Spark[] = [];
  private rings: Ring[] = [];
  private nums: FloatNum[] = [];
  private lights: Array<{ img: Phaser.GameObjects.Image; t: number; dur: number; s: number }> = [];

  constructor(private scene: Phaser.Scene) {}

  attach(map: MapData) {
    this.destroy();
    const s = this.scene;
    const key = 'decals';
    if (s.textures.exists(key)) s.textures.remove(key);
    this.decalTex = s.textures.createCanvas(key, map.w * T, map.h * T)!;
    this.dctx = this.decalTex.getContext();
    this.dctx.imageSmoothingEnabled = false;
    this.decalImg = s.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH_DECAL);
    this.g = s.add.graphics().setDepth(DEPTH_JUICE);
  }

  destroy() {
    this.g?.destroy();
    this.decalImg?.destroy();
    this.decalImg = null;
    this.decalTex = null;
    this.dctx = null;
    for (const l of this.lights) l.img.destroy();
    this.lights = [];
    this.casings = [];
    this.puffs = [];
    this.sparkList = [];
    this.rings = [];
    this.nums = [];
  }

  // ---------- emitters (positions in tiles) ----------

  /** Brass (or a red shotgun shell) kicked out to the right of the gun, bouncing to rest. */
  casing(p: Vec, facing: number, shell: boolean) {
    if (this.casings.length > 90) this.casings.shift();
    const side = facing + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const sp = 40 + Math.random() * 30;
    this.casings.push({ x: p.x * T + Math.cos(facing) * 4, y: p.y * T + Math.sin(facing) * 3 - 2, z: 8, vx: Math.cos(side) * sp, vy: Math.sin(side) * sp * 0.6, vz: 40 + Math.random() * 30, spin: Math.random() * 4, life: shell ? 9 : 6, shell });
  }

  muzzleLight(p: Vec, scale: number) {
    if (this.lights.length > 10) return;
    const img = this.scene.add.image(p.x * T, p.y * T - 6, 'fxlight').setDepth(DEPTH_LIGHT).setBlendMode(Phaser.BlendModes.ADD).setScale(scale);
    this.lights.push({ img, t: 0, dur: 0.06 + scale * 0.015, s: scale });
  }

  smoke(p: Vec, n: number, size: number, dir: number | null = null, col: string = P.cream2) {
    for (let i = 0; i < n; i++) {
      if (this.puffs.length > 120) this.puffs.shift();
      const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 0.7;
      const sp = (dir === null ? 10 : 22) * (0.4 + Math.random());
      const life = 0.5 + Math.random() * 0.6 * size;
      this.puffs.push({ x: p.x * T + (Math.random() - 0.5) * 3, y: p.y * T - 5 + (Math.random() - 0.5) * 3, r: 1.5 + Math.random() * size, grow: 4 + size * 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, life, max: life, col: hex(col), a: 0.35 });
    }
  }

  sparks(p: Vec, n: number, col: string, speed = 90, normal: number | null = null) {
    for (let i = 0; i < n; i++) {
      if (this.sparkList.length > 160) this.sparkList.shift();
      const a = normal === null ? Math.random() * Math.PI * 2 : normal + (Math.random() - 0.5) * 1.6;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const life = 0.12 + Math.random() * 0.18;
      this.sparkList.push({ x: p.x * T, y: p.y * T - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, col: hex(col) });
    }
  }

  shockwave(p: Vec, radiusTiles: number, col: string = P.cream2) {
    this.rings.push({ x: p.x * T, y: p.y * T - 4, r: 2, max: radiusTiles * T, t: 0, dur: 0.35, col: hex(col) });
  }

  /** Floating damage number above a target (big and red on a kill). */
  number(p: Vec, n: number, big: boolean, col: string = big ? P.coral : P.white, prefix = '') {
    if (this.nums.length > 16) this.nums.shift();
    this.nums.push({ x: p.x * T + (Math.random() - 0.5) * 6, y: p.y * T - 22, text: prefix + String(Math.max(1, Math.round(n))), t: 0, big, col });
  }

  private drawNumber(n: FloatNum) {
    const g = this.g;
    const s = n.big ? 2 : 1;
    const k = n.t / (n.big ? 0.9 : 0.6);
    const alpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    // pop: overshoot then settle, rising as it fades
    const pop = n.t < 0.08 ? 1 + (0.08 - n.t) * 6 : 1;
    const sc = Math.max(1, Math.round(s * pop));
    const w = n.text.length * 4 * sc - sc;
    let x = Math.round(n.x - w / 2);
    const y = Math.round(n.y - n.t * 22);
    for (const ch of n.text) {
      const rows = DIGITS[ch];
      if (!rows) continue;
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) {
          if (!(rows[r] & (4 >> c))) continue;
          // dark outline under each lit pixel keeps it readable on any floor
          g.fillStyle(hex(P.ink), alpha).fillRect(x + c * sc + 1, y + r * sc + 1, sc, sc);
          g.fillStyle(hex(n.col), alpha).fillRect(x + c * sc, y + r * sc, sc, sc);
        }
      x += 4 * sc;
    }
  }

  // ---------- decals ----------

  bulletHole(p: Vec, material: string) {
    const c = this.dctx;
    if (!c) return;
    const x = Math.round(p.x * T);
    const y = Math.round(p.y * T - 2);
    if (material === 'soft' || material === 'barricade') {
      c.fillStyle = 'rgba(40, 26, 18, 0.85)';
      c.fillRect(x, y, 2, 2);
      c.fillStyle = 'rgba(255, 240, 210, 0.5)';
      c.fillRect(x - 1, y - 1, 1, 1);
    } else {
      c.fillStyle = 'rgba(12, 14, 22, 0.8)';
      c.fillRect(x, y, 1, 1);
      c.fillStyle = 'rgba(200, 205, 220, 0.35)';
      c.fillRect(x + 1, y, 1, 1);
    }
    this.decalDirty = true;
  }

  blood(p: Vec, dir: number, amount: number) {
    const c = this.dctx;
    if (!c) return;
    for (let i = 0; i < amount; i++) {
      const d = Math.random() * (3 + amount * 0.6);
      const a = dir + (Math.random() - 0.5) * 1.1;
      const x = Math.round(p.x * T + Math.cos(a) * d);
      const y = Math.round(p.y * T + 4 + Math.sin(a) * d * 0.6);
      c.fillStyle = Math.random() < 0.5 ? 'rgba(120, 22, 30, 0.75)' : 'rgba(160, 36, 40, 0.6)';
      c.fillRect(x, y, Math.random() < 0.3 ? 2 : 1, 1);
    }
    this.decalDirty = true;
  }

  /** A body's pool: a stepped dark ellipse under where they fell. */
  pool(p: Vec) {
    const c = this.dctx;
    if (!c) return;
    const cx = Math.round(p.x * T);
    const cy = Math.round(p.y * T + 4);
    for (let y = -3; y <= 3; y++)
      for (let x = -6; x <= 6; x++) {
        if ((x * x) / 36 + (y * y) / 9 > 1 - Math.random() * 0.25) continue;
        c.fillStyle = 'rgba(105, 18, 28, 0.55)';
        c.fillRect(cx + x, cy + y, 1, 1);
      }
    this.decalDirty = true;
  }

  scorch(p: Vec, r: number) {
    const c = this.dctx;
    if (!c) return;
    const R = r * T;
    for (let i = 0; i < R * R * 1.4; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * R;
      c.fillStyle = `rgba(14, 12, 16, ${(0.55 * (1 - d / R)).toFixed(2)})`;
      c.fillRect(Math.round(p.x * T + Math.cos(a) * d), Math.round(p.y * T + Math.sin(a) * d), 1, 1);
    }
    this.decalDirty = true;
  }

  // ---------- per frame ----------

  update(dt: number) {
    const g = this.g;
    if (!g) return;
    g.clear();
    if (this.decalDirty && this.decalTex) {
      this.decalTex.refresh();
      this.decalDirty = false;
    }
    // casings: simple ballistic hop with a couple of bounces, then they lie on the floor and fade
    for (const c of this.casings) {
      c.life -= dt;
      if (c.z > 0 || c.vz > 0) {
        c.vz -= 260 * dt;
        c.z += c.vz * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.spin += dt * 20;
        if (c.z <= 0) {
          c.z = 0;
          if (Math.abs(c.vz) > 30) {
            c.vz = -c.vz * 0.35;
            c.vx *= 0.5;
            c.vy *= 0.5;
          } else c.vz = 0;
        }
      }
      const alpha = Math.min(1, c.life / 1.5);
      const col = c.shell ? hex(P.coral) : hex(P.amberLight);
      g.fillStyle(col, alpha);
      const flat = Math.floor(c.spin) % 2 === 0;
      if (c.shell) g.fillRect(Math.round(c.x), Math.round(c.y - c.z), flat ? 3 : 2, flat ? 2 : 3);
      else g.fillRect(Math.round(c.x), Math.round(c.y - c.z), flat ? 2 : 1, flat ? 1 : 2);
      if (c.shell) g.fillStyle(hex(P.amber), alpha).fillRect(Math.round(c.x), Math.round(c.y - c.z), 1, 1);
    }
    this.casings = this.casings.filter((c) => c.life > 0);
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.r += p.grow * dt;
      g.fillStyle(p.col, p.a * Math.max(0, p.life / p.max));
      g.fillCircle(Math.round(p.x), Math.round(p.y), Math.round(p.r));
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    for (const s of this.sparkList) {
      s.life -= dt;
      const ox = s.x;
      const oy = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      g.lineStyle(1, s.col, Math.max(0, s.life / s.max));
      g.lineBetween(ox, oy, s.x, s.y);
    }
    this.sparkList = this.sparkList.filter((s) => s.life > 0);
    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const rad = r.r + (r.max - r.r) * (1 - (1 - k) * (1 - k));
      g.lineStyle(Math.max(1, Math.round(3 * (1 - k))), r.col, 0.8 * (1 - k));
      g.strokeCircle(r.x, r.y, rad);
    }
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const l of this.lights) {
      l.t += dt;
      const k = l.t / l.dur;
      l.img.setAlpha(Math.max(0, 1 - k)).setScale(l.s * (1 + k * 0.3));
      if (k >= 1) l.img.destroy();
    }
    this.lights = this.lights.filter((l) => l.t < l.dur);
    for (const n of this.nums) {
      n.t += dt;
      this.drawNumber(n);
    }
    this.nums = this.nums.filter((n) => n.t < (n.big ? 0.9 : 0.6));
  }
}
