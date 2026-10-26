// Minimal pixel painter: integer-only drawing into small canvases at native resolution.
// No filtering, no anti-aliasing — every pixel placed deliberately.
export class Pix {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = document.createElement('canvas');
    this.c.width = w;
    this.c.height = h;
    this.g = this.c.getContext('2d', { willReadFrequently: true })!;
    this.g.imageSmoothingEnabled = false;
  }
  px(x: number, y: number, col: string) {
    this.g.fillStyle = col;
    this.g.fillRect(Math.round(x), Math.round(y), 1, 1);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, col: string) {
    if (w <= 0 || h <= 0) return this;
    this.g.fillStyle = col;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }
  /** horizontal line inclusive */
  hl(x0: number, x1: number, y: number, col: string) {
    return this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, col);
  }
  vl(x: number, y0: number, y1: number, col: string) {
    return this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, col);
  }
  /** Bresenham line */
  line(x0: number, y0: number, x1: number, y1: number, col: string) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }
  /** filled ellipse centred at (cx,cy) with radii rx, ry (pixel-snapped) */
  ellipse(cx: number, cy: number, rx: number, ry: number, col: string) {
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001))));
      this.hl(Math.round(cx - span), Math.round(cx + span), Math.round(cy + y), col);
    }
    return this;
  }
  ring(cx: number, cy: number, r: number, col: string) {
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [a, b] of [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ])
        this.px(cx + a, cy + b, col);
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
    return this;
  }
  /** deterministic speckle using a hash so tiles stay stable */
  speckle(x: number, y: number, w: number, h: number, col: string, density: number, seed: number) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (hash(i + x * 7, j + y * 13, seed) < density) this.px(x + i, y + j, col);
    return this;
  }
  /** add a 1px outline around all opaque pixels (outside only) */
  outline(col: string) {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && d[(y * this.w + x) * 4 + 3] > 0;
    const marks: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue;
        if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) marks.push([x, y]);
      }
    for (const [x, y] of marks) this.px(x, y, col);
    return this;
  }
  draw(src: Pix | HTMLCanvasElement, x: number, y: number, flipX = false) {
    const c = src instanceof Pix ? src.c : src;
    if (flipX) {
      this.g.save();
      this.g.translate(x + c.width, y);
      this.g.scale(-1, 1);
      this.g.drawImage(c, 0, 0);
      this.g.restore();
    } else this.g.drawImage(c, Math.round(x), Math.round(y));
    return this;
  }
  /** recolour every pixel of colour `from` to `to` */
  swap(from: string, to: string) {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const f = hexRgb(from);
    const t = hexRgb(to);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 0 && d[i] === f[0] && d[i + 1] === f[1] && d[i + 2] === f[2]) {
        d[i] = t[0];
        d[i + 1] = t[1];
        d[i + 2] = t[2];
      }
    this.g.putImageData(img, 0, 0);
    return this;
  }
  clear() {
    this.g.clearRect(0, 0, this.w, this.h);
    return this;
  }
}

export function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Rasterise a rotated design at native resolution: for each output pixel, inverse-rotate into
 * design space and sample the nearest design pixel. Keeps hard pixel edges (no smoothing).
 */
export function rotateDesign(design: Pix, angle: number, size: number): Pix {
  const out = new Pix(size, size);
  const src = design.g.getImageData(0, 0, design.w, design.h).data;
  const img = out.g.createImageData(size, size);
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const ox = size / 2;
  const oy = size / 2;
  const dx0 = design.w / 2;
  const dy0 = design.h / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const rx = x + 0.5 - ox;
      const ry = y + 0.5 - oy;
      const lx = Math.floor(rx * c - ry * s + dx0);
      const ly = Math.floor(rx * s + ry * c + dy0);
      if (lx < 0 || ly < 0 || lx >= design.w || ly >= design.h) continue;
      const si = (ly * design.w + lx) * 4;
      if (src[si + 3] === 0) continue;
      const di = (y * size + x) * 4;
      img.data[di] = src[si];
      img.data[di + 1] = src[si + 1];
      img.data[di + 2] = src[si + 2];
      img.data[di + 3] = src[si + 3];
    }
  out.g.putImageData(img, 0, 0);
  return out;
}
