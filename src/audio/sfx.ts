/**
 * BREACH CLUB — runtime-synthesised sound effects, ambience and music.
 *
 * There are no audio assets: every sound is built on the fly from oscillators,
 * precomputed noise buffers, biquad filters and envelopes (plus a little FM for
 * metallic/bell tones). Each play gets slight pitch/filter jitter so repeats
 * don't sound robotic.
 *
 * Graph:
 *   voice -> [muffle lowpass] -> [stereo pan] -> category gain ─┐
 *   ambience/music -> category gain -> bed (duck) gain ─────────┤
 *                                                               └─> master -> compressor -> post -> soft clip -> out
 */

export type SfxName =
  | 'shot_smg' | 'shot_carbine' | 'shot_scattergun'
  | 'dry_fire' | 'reload_start' | 'reload_end'
  | 'hit_flesh' | 'hit_wall' | 'hit_soft' | 'hit_metal' | 'hit_wood'
  | 'step_tile' | 'step_wood' | 'step_concrete' | 'step_outdoor'
  | 'breach_boom' | 'charge_beep' | 'barricade_place' | 'barricade_break' | 'reinforce'
  | 'sled_motor' | 'sled_thud' | 'cover_unfold' | 'cover_break'
  | 'hinge_ratchet' | 'hinge_swing' | 'hinge_blocked' | 'hinge_place'
  | 'invalid' | 'death' | 'vault'
  | 'console_tick' | 'armed_alarm' | 'shutoff' | 'round_win' | 'round_lose'
  | 'ui_tap' | 'ui_confirm' | 'ui_back' | 'takeover' | 'prep_start' | 'action_start' | 'low_time'
  | 'hitmarker' | 'kill_confirm' | 'drone_tag' | 'drone_move' | 'slide' | 'stinger1' | 'stinger2' | 'stinger3' | 'turret_shot' | 'missile_siren' | 'pulse' | 'card_flip' | 'card_play';

export type SfxCategory = 'weapons' | 'world' | 'ui' | 'ambience' | 'music';

export interface PlayOpts {
  /** -1..1 stereo pan */
  pan?: number;
  /** 0..1 extra gain multiplier (distance attenuation computed by caller) */
  volume?: number;
  /** true when heard through walls: apply a lowpass ~700Hz */
  muffled?: boolean;
  /** pitch multiplier, default 1 */
  rate?: number;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const CATEGORY: Record<SfxName, SfxCategory> = {
  shot_smg: 'weapons', shot_carbine: 'weapons', shot_scattergun: 'weapons',
  dry_fire: 'weapons', reload_start: 'weapons', reload_end: 'weapons',
  hit_flesh: 'world', hit_wall: 'world', hit_soft: 'world', hit_metal: 'world', hit_wood: 'world',
  step_tile: 'world', step_wood: 'world', step_concrete: 'world', step_outdoor: 'world',
  breach_boom: 'world', charge_beep: 'world', barricade_place: 'world', barricade_break: 'world', reinforce: 'world',
  sled_motor: 'world', sled_thud: 'world', cover_unfold: 'world', cover_break: 'world',
  hinge_ratchet: 'world', hinge_swing: 'world', hinge_blocked: 'world', hinge_place: 'world',
  invalid: 'ui', death: 'world', vault: 'world',
  console_tick: 'world', armed_alarm: 'world', shutoff: 'world', round_win: 'ui', round_lose: 'ui',
  ui_tap: 'ui', ui_confirm: 'ui', ui_back: 'ui', takeover: 'ui', prep_start: 'ui', action_start: 'ui', low_time: 'ui',
  hitmarker: 'weapons', kill_confirm: 'weapons', drone_tag: 'ui', drone_move: 'world', slide: 'world', stinger1: 'ui', stinger2: 'ui', stinger3: 'ui', turret_shot: 'weapons', missile_siren: 'world', pulse: 'world', card_flip: 'ui', card_play: 'ui',
};

/** Internal mix trims per category (multiplied with the user's slider). */
const CAT_TRIM: Record<SfxCategory, number> = {
  weapons: 0.85,
  world: 1.0,
  ui: 0.75,
  ambience: 0.3,
  music: 0.2,
};

const GLOBAL_VOICES = 24;

function voiceCap(name: SfxName): number {
  if (name.startsWith('shot_')) return 8;
  if (name.startsWith('step_')) return 4;
  if (name.startsWith('hit_')) return 5;
  if (name === 'sled_motor' || name === 'console_tick' || name === 'armed_alarm') return 2;
  return 3;
}

/** Per-play pitch jitter (+/- half this fraction). UI and musical cues stay steady. */
function jitterFor(name: SfxName): number {
  const cat = CATEGORY[name];
  if (cat === 'ui' || name === 'armed_alarm' || name === 'charge_beep' || name === 'console_tick') return 0.008;
  if (name.startsWith('step_')) return 0.14;
  return 0.07;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type NoiseKind = 'white' | 'pink' | 'brown';
type NoiseBank = Record<NoiseKind, AudioBuffer>;

const rr = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length) % arr.length] as T;

function safeStop(s: AudioScheduledSourceNode, when: number): void {
  try {
    s.stop(when);
  } catch {
    /* already stopped / old Safari double-stop */
  }
}

function makeNoiseBank(ctx: BaseAudioContext): NoiseBank {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 3);
  const mk = (fill: (d: Float32Array) => void): AudioBuffer => {
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    fill(d);
    // Detrend so the buffer loops without a step at the seam (matters for brown).
    const n = d.length;
    const delta = (d[n - 1] as number) - (d[0] as number);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = (d[i] as number) - (delta * i) / (n - 1);
      d[i] = v;
      sum += v;
    }
    const mean = sum / n;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const v = (d[i] as number) - mean;
      d[i] = v;
      sq += v * v;
    }
    const rms = Math.sqrt(sq / n) || 1;
    const k = 0.3 / rms;
    for (let i = 0; i < n; i++) d[i] = clamp((d[i] as number) * k, -1, 1);
    return buf;
  };
  const white = mk((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const pink = mk((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  });
  const brown = mk((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
  });
  return { white, pink, brown };
}

function makeSoftClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax < 0.6 ? ax : 0.6 + 0.4 * Math.tanh((ax - 0.6) / 0.4);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

// ---------------------------------------------------------------------------
// Synth builder
// ---------------------------------------------------------------------------

interface Common {
  /** offset from voice start (s) */
  at?: number;
  /** attack (s) */
  a?: number;
  /** sustain at peak (s) */
  hold?: number;
  /** exponential decay (s) */
  d: number;
  peak: number;
  filt?: BiquadFilterType;
  ff?: number;
  ff1?: number;
  q?: number;
  /** filter sweep duration, default = whole envelope */
  fglide?: number;
  /** tremolo depth 0..1 */
  am?: number;
  amHz?: number;
}

interface ToneOpts extends Common {
  type?: OscillatorType;
  f: number;
  f1?: number;
  glide?: number;
  detune?: number;
  /** vibrato depth as fraction of frequency */
  vib?: number;
  vibHz?: number;
}

interface NoiseOpts extends Common {
  kind?: NoiseKind;
  rate?: number;
}

interface FmOpts extends Common {
  f: number;
  ratio: number;
  index: number;
  index1?: number;
  type?: OscillatorType;
}

interface GrainOpts {
  n: number;
  at?: number;
  spread: number;
  f: number;
  /** relative frequency jitter */
  fj?: number;
  q?: number;
  d: number;
  peak: number;
  /** grains get quieter over the spread */
  decay?: boolean;
  kind?: NoiseKind;
}

class Syn {
  end: number;
  private readonly nyq: number;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly t: number,
    readonly r: number,
    private readonly bank: NoiseBank,
    readonly srcs: AudioScheduledSourceNode[],
  ) {
    this.end = t;
    this.nyq = ctx.sampleRate * 0.45;
  }

  private hz(f: number): number {
    return clamp(f * this.r, 20, this.nyq);
  }

  /** Filter + envelope + optional tremolo, connected to out. Returns envelope end. */
  private finish(node: AudioNode, t: number, o: Common): number {
    const c = this.ctx;
    const a = Math.max(0.001, o.a ?? 0.001);
    const hold = o.hold ?? 0;
    const end = t + a + hold + Math.max(0.005, o.d);
    let n = node;
    if (o.filt) {
      const bq = c.createBiquadFilter();
      bq.type = o.filt;
      bq.frequency.setValueAtTime(this.hz(o.ff ?? 1000), t);
      if (o.ff1 !== undefined) {
        bq.frequency.exponentialRampToValueAtTime(this.hz(o.ff1), t + (o.fglide ?? end - t));
      }
      bq.Q.value = o.q ?? (o.filt === 'bandpass' ? 1 : 0.7);
      n.connect(bq);
      n = bq;
    }
    const g = c.createGain();
    const p = g.gain;
    const peak = Math.max(0.0002, o.peak);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) p.setValueAtTime(peak, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, end);
    n.connect(g);
    if (o.am && o.am > 0) {
      const depth = clamp(o.am, 0, 1) * 0.5;
      const trem = c.createGain();
      trem.gain.value = 1 - depth;
      const lfo = c.createOscillator();
      lfo.frequency.value = o.amHz ?? 20;
      const lg = c.createGain();
      lg.gain.value = depth;
      lfo.connect(lg);
      lg.connect(trem.gain);
      lfo.start(t);
      lfo.stop(end + 0.02);
      this.srcs.push(lfo);
      g.connect(trem);
      trem.connect(this.out);
    } else {
      g.connect(this.out);
    }
    if (end > this.end) this.end = end;
    return end;
  }

  tone(o: ToneOpts): void {
    const c = this.ctx;
    const t = this.t + (o.at ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    const f = this.hz(o.f);
    osc.frequency.setValueAtTime(f, t);
    const total = Math.max(0.001, o.a ?? 0.001) + (o.hold ?? 0) + o.d;
    if (o.f1 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(this.hz(o.f1), t + (o.glide ?? total));
    }
    if (o.detune) osc.detune.value = o.detune;
    const end = this.finish(osc, t, o);
    if (o.vib && o.vib > 0) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vibHz ?? 6;
      const lg = c.createGain();
      lg.gain.value = o.vib * f;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end + 0.02);
      this.srcs.push(lfo);
    }
    osc.start(t);
    osc.stop(end + 0.02);
    this.srcs.push(osc);
  }

  noise(o: NoiseOpts): void {
    const c = this.ctx;
    const t = this.t + (o.at ?? 0);
    const src = c.createBufferSource();
    const buf = this.bank[o.kind ?? 'white'];
    src.buffer = buf;
    if (o.rate !== undefined) src.playbackRate.value = o.rate;
    const end = this.finish(src, t, o);
    const len = end - t + 0.03;
    let offset = 0;
    if (len >= buf.duration - 0.05) src.loop = true;
    else offset = Math.random() * (buf.duration - len - 0.02);
    src.start(t, offset);
    src.stop(end + 0.02);
    this.srcs.push(src);
  }

  fm(o: FmOpts): void {
    const c = this.ctx;
    const t = this.t + (o.at ?? 0);
    const car = c.createOscillator();
    car.type = o.type ?? 'sine';
    const f = this.hz(o.f);
    car.frequency.setValueAtTime(f, t);
    const mod = c.createOscillator();
    const mf = f * o.ratio;
    mod.frequency.setValueAtTime(mf, t);
    const mg = c.createGain();
    const total = Math.max(0.001, o.a ?? 0.001) + (o.hold ?? 0) + o.d;
    mg.gain.setValueAtTime(Math.max(0.01, o.index * mf), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, (o.index1 ?? o.index * 0.1) * mf), t + total);
    mod.connect(mg);
    mg.connect(car.frequency);
    const end = this.finish(car, t, o);
    car.start(t);
    mod.start(t);
    car.stop(end + 0.02);
    mod.stop(end + 0.02);
    this.srcs.push(car, mod);
  }

  grains(o: GrainOpts): void {
    const base = o.at ?? 0;
    for (let k = 0; k < o.n; k++) {
      const u = Math.random();
      const fade = o.decay ? 1 - 0.75 * u : 1;
      const fj = o.fj ?? 0.3;
      this.noise({
        kind: o.kind ?? 'white',
        at: base + u * o.spread,
        d: o.d * rr(0.6, 1.4),
        peak: o.peak * rr(0.4, 1) * fade,
        filt: 'bandpass',
        ff: o.f * (1 + rr(-fj, fj)),
        q: o.q ?? 2,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Sound designs
// ---------------------------------------------------------------------------

const SYN: Record<SfxName, (s: Syn) => void> = {
  // ---- weapons -----------------------------------------------------------
  shot_smg: (s) => {
    // light, snappy: bright transient, short mid body, tight thump
    s.noise({ filt: 'highpass', ff: 3500, d: 0.018, peak: 0.7 });
    s.noise({ filt: 'bandpass', ff: rr(1500, 1850), ff1: 600, q: 0.9, d: 0.075, peak: 0.85 });
    s.tone({ f: 190, f1: 70, d: 0.06, peak: 0.55 });
    s.tone({ type: 'square', f: 2200, d: 0.012, peak: 0.07, filt: 'lowpass', ff: 5000 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 1500, at: 0.02, a: 0.005, d: 0.09, peak: 0.08 });
  },
  shot_carbine: (s) => {
    // heavier crack with a fuller low body and a short room tail
    s.noise({ filt: 'highpass', ff: 2500, d: 0.025, peak: 0.95 });
    s.noise({ filt: 'bandpass', ff: rr(1000, 1200), ff1: 380, q: 0.8, d: 0.17, peak: 0.9 });
    s.tone({ type: 'triangle', f: 420, f1: 110, d: 0.05, peak: 0.35 });
    s.tone({ f: 150, f1: 45, d: 0.14, peak: 0.85 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 1100, ff1: 450, at: 0.03, a: 0.02, d: 0.28, peak: 0.13 });
  },
  shot_scattergun: (s) => {
    // boomy: wide low thump + brown-noise body + pellet spray
    s.noise({ filt: 'highpass', ff: 1800, d: 0.035, peak: 0.85 });
    s.noise({ kind: 'brown', filt: 'lowpass', ff: 1300, ff1: 170, d: 0.38, peak: 1.1 });
    s.tone({ f: 120, f1: 36, d: 0.32, peak: 1.0 });
    s.tone({ type: 'triangle', f: 260, f1: 80, d: 0.08, peak: 0.3 });
    s.noise({ filt: 'bandpass', ff: 2600, q: 1.2, at: 0.008, d: 0.07, peak: 0.35 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 900, at: 0.05, a: 0.03, d: 0.4, peak: 0.13 });
    // pump: slide back, slide forward
    s.noise({ filt: 'bandpass', ff: 1900, q: 2.5, at: 0.3, d: 0.03, peak: 0.32 });
    s.tone({ type: 'square', f: 220, f1: 160, at: 0.3, d: 0.03, peak: 0.07, filt: 'lowpass', ff: 1500 });
    s.noise({ filt: 'bandpass', ff: 2400, q: 2.5, at: 0.4, d: 0.03, peak: 0.36 });
    s.tone({ type: 'square', f: 260, f1: 190, at: 0.4, d: 0.025, peak: 0.07, filt: 'lowpass', ff: 1500 });
  },
  dry_fire: (s) => {
    s.noise({ filt: 'bandpass', ff: 4200, q: 3, d: 0.012, peak: 0.45 });
    s.tone({ type: 'square', f: 1700, d: 0.01, peak: 0.1, filt: 'lowpass', ff: 4000 });
    s.noise({ filt: 'bandpass', ff: 2600, q: 3, at: 0.035, d: 0.015, peak: 0.25 });
  },
  reload_start: (s) => {
    s.noise({ filt: 'bandpass', ff: 3200, q: 4, d: 0.015, peak: 0.4 }); // release click
    s.noise({ filt: 'bandpass', ff: 1400, ff1: 900, q: 1.5, at: 0.03, a: 0.02, d: 0.08, peak: 0.25 }); // slide out
    s.tone({ type: 'triangle', f: 520, f1: 380, at: 0.03, d: 0.05, peak: 0.12 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 600, at: 0.14, d: 0.06, peak: 0.3 }); // pouch thunk
  },
  reload_end: (s) => {
    s.noise({ filt: 'bandpass', ff: 1600, q: 2, d: 0.03, peak: 0.45 }); // mag seat
    s.tone({ f: 260, f1: 160, d: 0.04, peak: 0.3 });
    s.noise({ filt: 'bandpass', ff: 2400, ff1: 1800, q: 2, at: 0.11, d: 0.035, peak: 0.55 }); // bolt
    s.tone({ type: 'square', f: 1250, at: 0.11, d: 0.015, peak: 0.1, filt: 'lowpass', ff: 3500 });
    s.noise({ filt: 'bandpass', ff: 3400, q: 3, at: 0.16, d: 0.02, peak: 0.35 }); // latch
  },

  // ---- impacts -----------------------------------------------------------
  hit_flesh: (s) => {
    s.tone({ f: 130, f1: 55, d: 0.08, peak: 0.7 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 800, d: 0.07, peak: 0.6 });
    s.noise({ filt: 'bandpass', ff: 1500, q: 1.2, d: 0.02, peak: 0.25 });
  },
  hit_wall: (s) => {
    // plaster: mid crack + crumbly grains
    s.noise({ filt: 'bandpass', ff: rr(1100, 1500), q: 1.1, d: 0.06, peak: 0.6 });
    s.tone({ type: 'triangle', f: 230, f1: 110, d: 0.04, peak: 0.25 });
    s.grains({ n: 5, at: 0.02, spread: 0.12, f: 3000, fj: 0.5, q: 2, d: 0.02, peak: 0.14, decay: true });
    s.noise({ kind: 'pink', filt: 'highpass', ff: 1800, at: 0.02, a: 0.01, d: 0.14, peak: 0.08 });
  },
  hit_soft: (s) => {
    // fabric / laundry bags: muted puff
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 900, ff1: 400, d: 0.07, peak: 0.45 });
    s.tone({ f: 110, f1: 70, d: 0.05, peak: 0.25 });
  },
  hit_metal: (s) => {
    // washing machine / steel: FM ping with inharmonic partials
    s.noise({ filt: 'highpass', ff: 3500, d: 0.015, peak: 0.45 });
    s.fm({ f: rr(1500, 1900), ratio: 1.41, index: 3, index1: 0.2, d: 0.28, peak: 0.22 });
    s.fm({ f: rr(2500, 2900), ratio: 2.1, index: 1.5, index1: 0.1, d: 0.18, peak: 0.12 });
    s.tone({ type: 'triangle', f: 640, f1: 600, d: 0.12, peak: 0.08 });
  },
  hit_wood: (s) => {
    s.noise({ filt: 'bandpass', ff: rr(650, 800), q: 3, d: 0.06, peak: 0.6 });
    s.tone({ type: 'triangle', f: 380, f1: 310, d: 0.07, peak: 0.35 });
    s.tone({ f: 760, d: 0.04, peak: 0.12 });
    s.noise({ filt: 'bandpass', ff: 2600, q: 2, d: 0.015, peak: 0.2 });
  },

  // ---- footsteps (soft, short, readable) ---------------------------------
  step_tile: (s) => {
    s.noise({ filt: 'bandpass', ff: rr(2600, 3300), q: 2.5, d: 0.022, peak: 0.32 });
    s.tone({ f: rr(150, 175), f1: 90, d: 0.045, peak: 0.32 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 700, d: 0.03, peak: 0.15 });
  },
  step_wood: (s) => {
    s.noise({ kind: 'pink', filt: 'bandpass', ff: rr(420, 560), q: 2, d: 0.06, peak: 0.55 });
    s.tone({ type: 'triangle', f: rr(190, 230), f1: 160, d: 0.06, peak: 0.25 });
    if (Math.random() < 0.25) {
      s.tone({ type: 'sawtooth', f: rr(300, 380), f1: 260, at: 0.03, a: 0.02, d: 0.08, peak: 0.03, filt: 'bandpass', ff: 1200, q: 6 });
    }
  },
  step_concrete: (s) => {
    s.noise({ kind: 'pink', filt: 'lowpass', ff: rr(1000, 1400), d: 0.045, peak: 0.45 });
    s.tone({ f: 120, f1: 70, d: 0.04, peak: 0.25 });
    s.noise({ filt: 'highpass', ff: 3500, at: 0.005, d: 0.03, peak: 0.07 }); // grit
  },
  step_outdoor: (s) => {
    // wet street: soft heel + splash + droplets
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 700, d: 0.04, peak: 0.3 });
    s.noise({ filt: 'bandpass', ff: rr(1500, 2000), ff1: 3200, q: 1.2, at: 0.008, a: 0.01, d: 0.08, peak: 0.28 });
    s.grains({ n: 2, at: 0.03, spread: 0.06, f: 4000, fj: 0.4, q: 3, d: 0.012, peak: 0.06 });
  },

  // ---- gadgets / world ---------------------------------------------------
  breach_boom: (s) => {
    // anticipatory crack
    s.noise({ filt: 'highpass', ff: 2800, d: 0.03, peak: 0.6 });
    s.tone({ type: 'square', f: 1900, d: 0.012, peak: 0.08, filt: 'lowpass', ff: 5000 });
    // low thump
    const T = 0.06;
    s.tone({ f: 85, f1: 28, at: T, d: 0.5, peak: 1.0 });
    s.tone({ type: 'triangle', f: 160, f1: 50, at: T, d: 0.18, peak: 0.45 });
    s.noise({ kind: 'brown', filt: 'lowpass', ff: 650, ff1: 120, at: T, d: 0.55, peak: 1.2 });
    s.noise({ filt: 'bandpass', ff: 900, ff1: 300, q: 0.7, at: T, d: 0.22, peak: 0.6 });
    // plaster crumble tail
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 2200, ff1: 1100, q: 0.6, at: T + 0.08, a: 0.06, d: 0.6, peak: 0.16 });
    s.grains({ n: 14, at: T + 0.08, spread: 0.6, f: 2400, fj: 0.6, q: 2.5, d: 0.025, peak: 0.2, decay: true });
    s.grains({ n: 4, at: T + 0.1, spread: 0.4, f: 420, fj: 0.3, q: 1.5, d: 0.05, peak: 0.3, decay: true, kind: 'pink' });
  },
  charge_beep: (s) => {
    for (const at of [0, 0.13]) {
      s.tone({ type: 'square', f: 1760, at, a: 0.002, hold: 0.04, d: 0.03, peak: 0.13, filt: 'lowpass', ff: 4500 });
      s.tone({ f: 3520, at, a: 0.002, hold: 0.03, d: 0.03, peak: 0.05 });
    }
  },
  barricade_place: (s) => {
    s.tone({ f: 120, f1: 70, d: 0.1, peak: 0.45 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 700, d: 0.09, peak: 0.45 });
    for (const at of [0.12, 0.22]) {
      s.noise({ filt: 'bandpass', ff: rr(850, 1000), q: 3, at, d: 0.05, peak: 0.5 });
      s.tone({ type: 'triangle', f: rr(480, 540), f1: 420, at, d: 0.05, peak: 0.25 });
    }
    s.tone({ f: 3100, at: 0.22, d: 0.08, peak: 0.035 }); // nail ping
  },
  barricade_break: (s) => {
    s.tone({ f: 110, f1: 40, d: 0.22, peak: 0.6 });
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 1200, ff1: 600, q: 0.8, d: 0.25, peak: 0.6 });
    s.grains({ n: 12, spread: 0.32, f: 1800, fj: 0.7, q: 4, d: 0.02, peak: 0.35, decay: true }); // splinters
    s.tone({ type: 'triangle', f: 420, f1: 300, at: 0.03, d: 0.08, peak: 0.2 });
  },
  reinforce: (s) => {
    // heavy panel slam then three hydraulic bolt clicks
    s.noise({ kind: 'brown', filt: 'lowpass', ff: 500, d: 0.2, peak: 0.8 });
    s.fm({ f: 210, ratio: 2.76, index: 5, index1: 0.3, d: 0.45, peak: 0.22 });
    s.fm({ f: 640, ratio: 1.53, index: 2, index1: 0.1, d: 0.3, peak: 0.09 });
    for (let k = 0; k < 3; k++) {
      const at = 0.25 + k * 0.06;
      s.noise({ filt: 'bandpass', ff: 3000 + k * 300, q: 4, at, d: 0.015, peak: 0.35 });
      s.tone({ type: 'square', f: 900 + k * 150, at, d: 0.012, peak: 0.06, filt: 'lowpass', ff: 3000 });
    }
  },
  sled_motor: (s) => {
    // short whirring wheel buzz; retriggered while moving so fades are soft
    const f = rr(92, 104);
    s.tone({ type: 'sawtooth', f, f1: f * 1.12, a: 0.035, hold: 0.19, d: 0.08, peak: 0.16, filt: 'bandpass', ff: 700, q: 1.5, am: 0.6, amHz: rr(26, 32) });
    s.tone({ type: 'square', f: f * 2.01, a: 0.035, hold: 0.19, d: 0.08, peak: 0.045, filt: 'lowpass', ff: 1400 });
    s.noise({ filt: 'bandpass', ff: 3200, q: 1.5, a: 0.035, hold: 0.19, d: 0.08, peak: 0.05, am: 0.8, amHz: 30 });
  },
  sled_thud: (s) => {
    s.tone({ f: 90, f1: 40, d: 0.2, peak: 0.8 });
    s.noise({ kind: 'brown', filt: 'lowpass', ff: 700, d: 0.16, peak: 0.8 });
    s.fm({ f: 420, ratio: 2.3, index: 3, index1: 0.2, at: 0.005, d: 0.2, peak: 0.08 });
    s.noise({ filt: 'bandpass', ff: 2200, q: 2, d: 0.03, peak: 0.25 });
  },
  cover_unfold: (s) => {
    // spring whip, hard clack, little boing, latch
    s.noise({ filt: 'bandpass', ff: 900, ff1: 3200, q: 2, a: 0.045, d: 0.025, peak: 0.18 });
    const T = 0.07;
    s.noise({ filt: 'bandpass', ff: 2100, q: 3, at: T, d: 0.035, peak: 0.7 });
    s.tone({ type: 'square', f: 820, at: T, d: 0.02, peak: 0.1, filt: 'lowpass', ff: 3000 });
    s.tone({ f: 260, f1: 120, at: T, d: 0.07, peak: 0.45 });
    s.tone({ type: 'triangle', f: 480, f1: 430, at: T + 0.005, d: 0.22, peak: 0.08, vib: 0.06, vibHz: 22 });
    s.noise({ filt: 'bandpass', ff: 3400, q: 4, at: T + 0.09, d: 0.015, peak: 0.3 });
  },
  cover_break: (s) => {
    s.tone({ f: 140, f1: 50, d: 0.16, peak: 0.6 });
    s.noise({ filt: 'bandpass', ff: 1800, ff1: 900, q: 0.9, d: 0.2, peak: 0.55 });
    s.fm({ f: 900, ratio: 1.7, index: 4, index1: 0.2, d: 0.25, peak: 0.09 });
    s.grains({ n: 8, at: 0.02, spread: 0.3, f: 2600, fj: 0.6, q: 3, d: 0.02, peak: 0.25, decay: true });
    s.tone({ type: 'triangle', f: 600, f1: 300, at: 0.03, d: 0.25, peak: 0.06, vib: 0.08, vibHz: 18 });
  },
  hinge_ratchet: (s) => {
    let at = 0;
    for (let k = 0; k < 6; k++) {
      s.noise({ filt: 'bandpass', ff: 3000 + k * 120, q: 5, at, d: 0.012, peak: 0.45 });
      s.tone({ type: 'square', f: 1400 + k * 40, at, d: 0.008, peak: 0.07, filt: 'lowpass', ff: 4000 });
      s.tone({ f: 420, at, d: 0.02, peak: 0.1 });
      at += 0.042 + rr(-0.006, 0.006);
    }
  },
  hinge_swing: (s) => {
    // heavy door creak (pulse train through a sweeping resonant band) + air whoosh + settle
    s.tone({ type: 'sawtooth', f: rr(38, 46), f1: 62, glide: 0.5, a: 0.08, hold: 0.25, d: 0.22, peak: 0.28, filt: 'bandpass', ff: 600, ff1: 1100, q: 7, vib: 0.12, vibHz: 7 });
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 350, ff1: 1400, fglide: 0.35, q: 0.8, a: 0.25, d: 0.3, peak: 0.35 });
    s.tone({ f: 85, f1: 45, at: 0.52, d: 0.12, peak: 0.55 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 600, at: 0.52, d: 0.08, peak: 0.35 });
  },
  hinge_blocked: (s) => {
    s.tone({ f: 120, f1: 70, d: 0.09, peak: 0.55 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 600, d: 0.08, peak: 0.4 });
    s.noise({ filt: 'bandpass', ff: 2800, q: 4, at: 0.02, d: 0.012, peak: 0.25 }); // pawl slip
    s.tone({ type: 'square', f: 98, at: 0.06, hold: 0.08, d: 0.06, peak: 0.12, filt: 'lowpass', ff: 900 }); // denial buzz
  },
  hinge_place: (s) => {
    s.noise({ filt: 'bandpass', ff: 2500, q: 3, d: 0.02, peak: 0.45 });
    s.fm({ f: 520, ratio: 1.5, index: 2.5, index1: 0.1, d: 0.18, peak: 0.15 });
    s.tone({ f: 160, f1: 90, d: 0.06, peak: 0.35 });
    s.tone({ f: 1320, f1: 1760, at: 0.08, d: 0.07, peak: 0.06 }); // armed chirp
  },

  // ---- misc ---------------------------------------------------------------
  invalid: (s) => {
    s.tone({ type: 'square', f: 233, hold: 0.04, d: 0.05, peak: 0.13, filt: 'lowpass', ff: 1400 });
    s.tone({ type: 'square', f: 185, at: 0.1, hold: 0.06, d: 0.07, peak: 0.13, filt: 'lowpass', ff: 1400 });
  },
  death: (s) => {
    s.tone({ f: 110, f1: 40, d: 0.28, peak: 0.6 });
    s.noise({ kind: 'brown', filt: 'lowpass', ff: 500, d: 0.25, peak: 0.7 });
    s.grains({ n: 3, at: 0.04, spread: 0.15, f: 1800, fj: 0.4, q: 2, d: 0.03, peak: 0.15 }); // gear rattle
    s.tone({ type: 'triangle', f: 520, f1: 130, at: 0.05, a: 0.01, d: 0.45, peak: 0.12, filt: 'lowpass', ff: 2000 }); // arcade "down" cue
  },
  vault: (s) => {
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 500, ff1: 1800, q: 1, a: 0.08, d: 0.1, peak: 0.25 });
    s.noise({ filt: 'bandpass', ff: 1500, q: 1.5, at: 0.02, d: 0.03, peak: 0.12 }); // hand on ledge
    s.tone({ f: 130, f1: 70, at: 0.2, d: 0.06, peak: 0.4 });
    s.noise({ kind: 'pink', filt: 'lowpass', ff: 900, at: 0.2, d: 0.05, peak: 0.3 });
  },

  // ---- objective ---------------------------------------------------------
  console_tick: (s) => {
    s.tone({ f: 2400, d: 0.025, peak: 0.12 });
    s.tone({ type: 'square', f: 1200, d: 0.01, peak: 0.04, filt: 'lowpass', ff: 3000 });
  },
  armed_alarm: (s) => {
    // tritone see-saw x4 with sub pulses, then a falling siren swoop (~0.95s)
    const notes = [880, 1245, 880, 1245];
    notes.forEach((f, i) => {
      const at = i * 0.13;
      s.tone({ type: 'square', f, at, a: 0.003, hold: 0.07, d: 0.04, peak: 0.12, filt: 'lowpass', ff: 3500 });
      s.tone({ type: 'triangle', f: f * 2, at, a: 0.003, hold: 0.07, d: 0.04, peak: 0.04 });
      s.tone({ f: 70, f1: 50, at, d: 0.08, peak: 0.25 });
    });
    s.tone({ type: 'sawtooth', f: 1760, f1: 1175, glide: 0.4, at: 0.54, a: 0.01, hold: 0.25, d: 0.15, peak: 0.07, filt: 'lowpass', ff: 3000 });
    s.tone({ type: 'square', f: 880, f1: 587, glide: 0.4, at: 0.54, a: 0.01, hold: 0.25, d: 0.15, peak: 0.07, filt: 'lowpass', ff: 2200 });
  },
  shutoff: (s) => {
    s.noise({ filt: 'bandpass', ff: 2200, q: 3, d: 0.02, peak: 0.4 }); // switch
    s.tone({ type: 'sawtooth', f: 440, f1: 50, glide: 0.55, a: 0.005, hold: 0.3, d: 0.25, peak: 0.12, filt: 'lowpass', ff: 2200, ff1: 200 });
    s.tone({ f: 880, f1: 110, glide: 0.5, hold: 0.25, d: 0.25, peak: 0.06 });
    s.tone({ f: 70, f1: 45, at: 0.5, d: 0.15, peak: 0.3 }); // clunk
  },

  // ---- UI / round flow ----------------------------------------------------
  round_win: (s) => {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      const last = i === seq.length - 1;
      s.tone({ type: 'triangle', f, at: i * 0.09, hold: last ? 0.15 : 0.02, d: last ? 0.5 : 0.12, peak: 0.16 });
      s.fm({ f, ratio: 2, index: 1.5, index1: 0.05, at: i * 0.09, d: last ? 0.6 : 0.2, peak: 0.06 });
    });
    s.tone({ f: 261.63, at: 0.27, a: 0.01, hold: 0.2, d: 0.4, peak: 0.15 });
    s.grains({ n: 4, at: 0.3, spread: 0.3, f: 7000, fj: 0.3, q: 6, d: 0.03, peak: 0.05 });
  },
  round_lose: (s) => {
    const seq = [392, 311.13, 261.63];
    seq.forEach((f, i) => {
      s.tone({ type: 'triangle', f, at: i * 0.16, hold: 0.08, d: 0.15, peak: 0.16, filt: 'lowpass', ff: 1800 });
    });
    for (const f of [130.81, 155.56, 196]) {
      s.tone({ type: 'triangle', f, f1: f * 0.97, at: 0.48, a: 0.02, hold: 0.2, d: 0.45, peak: 0.1, filt: 'lowpass', ff: 1200 });
    }
  },
  ui_tap: (s) => {
    s.tone({ f: 1250, f1: 1100, d: 0.035, peak: 0.16 });
    s.tone({ type: 'triangle', f: 2500, d: 0.015, peak: 0.04 });
  },
  ui_confirm: (s) => {
    s.tone({ type: 'triangle', f: 880, hold: 0.03, d: 0.05, peak: 0.16 });
    s.tone({ type: 'triangle', f: 1318.5, at: 0.07, hold: 0.04, d: 0.12, peak: 0.16 });
    s.tone({ f: 2637, at: 0.07, d: 0.08, peak: 0.03 });
  },
  ui_back: (s) => {
    s.tone({ type: 'triangle', f: 987.8, hold: 0.03, d: 0.05, peak: 0.15 });
    s.tone({ type: 'triangle', f: 659.3, at: 0.07, hold: 0.03, d: 0.1, peak: 0.15 });
  },
  takeover: (s) => {
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 400, ff1: 3500, q: 1.2, a: 0.12, d: 0.1, peak: 0.25 });
    s.fm({ f: 659.3, ratio: 2, index: 2, index1: 0.1, at: 0.15, d: 0.45, peak: 0.1 });
    s.fm({ f: 987.8, ratio: 2, index: 1.5, index1: 0.1, at: 0.19, d: 0.45, peak: 0.09 });
    s.tone({ type: 'triangle', f: 1318.5, at: 0.19, d: 0.3, peak: 0.05 });
  },
  prep_start: (s) => {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      s.fm({ f, ratio: 3, index: 1.2, index1: 0.05, at: i * 0.1, d: 0.7, peak: 0.09 });
      s.tone({ f, at: i * 0.1, d: 0.5, peak: 0.06 });
    });
    s.tone({ type: 'triangle', f: 130.81, a: 0.08, hold: 0.2, d: 0.5, peak: 0.1, filt: 'lowpass', ff: 600 });
  },
  action_start: (s) => {
    s.tone({ f: 80, f1: 38, d: 0.3, peak: 0.7 });
    s.noise({ kind: 'pink', filt: 'highpass', ff: 3000, a: 0.005, d: 0.35, peak: 0.12 });
    for (const f of [293.66, 349.23, 440]) {
      s.tone({ type: 'sawtooth', f, a: 0.005, hold: 0.08, d: 0.2, peak: 0.06, filt: 'lowpass', ff: 700, ff1: 4000, fglide: 0.1 });
    }
    s.tone({ type: 'square', f: 587.33, at: 0.12, hold: 0.05, d: 0.18, peak: 0.055, filt: 'lowpass', ff: 3000 });
  },
  turret_shot: (s) => {
    // thin mechanical chatter
    s.noise({ filt: 'bandpass', ff: 3200, q: 1.5, d: 0.03, peak: 0.5 });
    s.tone({ type: 'square', f: 420, f1: 180, d: 0.04, peak: 0.12, filt: 'lowpass', ff: 2400 });
  },
  missile_siren: (s) => {
    // falling whistle from high to low over the warning window
    s.tone({ type: 'sine', f: 2200, f1: 500, glide: 1.5, a: 0.05, hold: 1.4, d: 0.1, peak: 0.12 });
    s.tone({ type: 'triangle', f: 2210, f1: 505, glide: 1.5, a: 0.05, hold: 1.4, d: 0.1, peak: 0.06 });
    s.noise({ kind: 'pink', filt: 'highpass', ff: 3000, a: 1.0, at: 0.4, d: 0.3, peak: 0.08 });
  },
  pulse: (s) => {
    s.fm({ f: 880, ratio: 1.5, index: 3, index1: 0.2, d: 0.6, peak: 0.08 });
    s.tone({ f: 1760, f1: 1320, d: 0.25, peak: 0.05 });
  },
  card_flip: (s) => {
    s.noise({ filt: 'bandpass', ff: 3000, ff1: 6000, q: 1.5, d: 0.05, peak: 0.3 });
    s.tone({ type: 'triangle', f: 1046.5, at: 0.03, d: 0.08, peak: 0.07 });
  },
  card_play: (s) => {
    [523.25, 783.99, 1046.5, 1568].forEach((f, i) => s.tone({ type: 'triangle', f, at: i * 0.06, hold: 0.03, d: 0.18, peak: 0.1 }));
    s.noise({ kind: 'pink', filt: 'highpass', ff: 4000, d: 0.3, peak: 0.08 });
  },
  stinger1: (s) => {
    s.tone({ type: 'square', f: 659.3, hold: 0.04, d: 0.08, peak: 0.08, filt: 'lowpass', ff: 3000 });
    s.tone({ type: 'square', f: 987.8, at: 0.07, hold: 0.06, d: 0.14, peak: 0.08, filt: 'lowpass', ff: 3000 });
  },
  stinger2: (s) => {
    s.noise({ kind: 'pink', filt: 'highpass', ff: 2500, a: 0.05, d: 0.25, peak: 0.12 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => s.tone({ type: 'square', f, at: i * 0.05, hold: 0.04, d: 0.16, peak: 0.07, filt: 'lowpass', ff: 3500 }));
    s.tone({ f: 90, f1: 45, d: 0.3, peak: 0.5 });
  },
  stinger3: (s) => {
    s.tone({ f: 70, f1: 32, d: 0.5, peak: 0.8 });
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 800, ff1: 5000, q: 0.7, a: 0.08, d: 0.5, peak: 0.25 });
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => s.tone({ type: 'sawtooth', f, at: 0.04 + i * 0.045, hold: 0.06, d: 0.3, peak: 0.05, filt: 'lowpass', ff: 4000 }));
    s.fm({ f: 1046.5, ratio: 2, index: 2, index1: 0.1, at: 0.3, d: 0.6, peak: 0.08 });
  },
  slide: (s) => {
    // fabric-on-floor whoosh with a scuff
    s.noise({ kind: 'pink', filt: 'bandpass', ff: 900, ff1: 2600, q: 0.8, a: 0.02, d: 0.28, peak: 0.45 });
    s.noise({ filt: 'highpass', ff: 3000, at: 0.02, d: 0.12, peak: 0.12 });
  },
  hitmarker: (s) => {
    // short dry tick: confirms a hit without masking the gunfire
    s.noise({ filt: 'bandpass', ff: 4200, q: 4, d: 0.018, peak: 0.35 });
    s.tone({ type: 'square', f: 2100, d: 0.02, peak: 0.04, filt: 'lowpass', ff: 5000 });
  },
  kill_confirm: (s) => {
    s.noise({ filt: 'bandpass', ff: 3200, q: 3, d: 0.03, peak: 0.45 });
    s.tone({ type: 'triangle', f: 740, f1: 1480, glide: 0.06, d: 0.12, peak: 0.12 });
    s.tone({ f: 120, f1: 60, d: 0.12, peak: 0.25 });
  },
  drone_tag: (s) => {
    s.tone({ type: 'square', f: 1568, hold: 0.02, d: 0.04, peak: 0.06, filt: 'lowpass', ff: 4000 });
    s.tone({ type: 'square', f: 2093, at: 0.06, hold: 0.02, d: 0.06, peak: 0.06, filt: 'lowpass', ff: 4000 });
  },
  drone_move: (s) => {
    // small electric motor whine with tyre grit
    s.tone({ type: 'sawtooth', f: 180, f1: 240, glide: 0.15, a: 0.02, hold: 0.06, d: 0.08, peak: 0.05, filt: 'lowpass', ff: 900 });
    s.noise({ filt: 'highpass', ff: 5000, a: 0.01, d: 0.06, peak: 0.04 });
  },
  low_time: (s) => {
    // tick-tock warning, lower + slower than charge_beep
    s.tone({ type: 'square', f: 1174.7, a: 0.002, hold: 0.04, d: 0.05, peak: 0.1, filt: 'lowpass', ff: 3000 });
    s.tone({ f: 1174.7, a: 0.002, hold: 0.04, d: 0.05, peak: 0.08 });
    s.tone({ type: 'square', f: 880, at: 0.17, a: 0.002, hold: 0.04, d: 0.06, peak: 0.1, filt: 'lowpass', ff: 3000 });
    s.tone({ f: 880, at: 0.17, a: 0.002, hold: 0.04, d: 0.06, peak: 0.08 });
  },
};

// ---------------------------------------------------------------------------
// Music data
// ---------------------------------------------------------------------------

interface CalmBar {
  bass: number;
  chord: readonly number[];
  mel: readonly number[];
}

/** Dm9 – G13sus – Cmaj9 – Am7: warm, unresolved lo-fi loop. */
const CALM: readonly CalmBar[] = [
  { bass: 38, chord: [53, 57, 60, 64], mel: [69, 72, 74, 76] },
  { bass: 43, chord: [53, 59, 64, 69], mel: [71, 74, 76, 79] },
  { bass: 36, chord: [52, 55, 59, 62], mel: [67, 71, 72, 74, 76] },
  { bass: 45, chord: [55, 60, 64, 67], mel: [69, 72, 76, 79] },
];
const CALM_BPM = 72;
const TENSE_BPM = 112;
const TENSE_ROOTS = [38, 38, 34, 36]; // D D Bb C

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface Voice {
  name: SfxName;
  start: number;
  end: number;
  vol: number;
  input: GainNode;
  chain: AudioNode[];
  srcs: AudioScheduledSourceNode[];
  dead: boolean;
}

interface Graph {
  master: GainNode;
  bed: GainNode;
  cats: Record<SfxCategory, GainNode>;
}

interface MusicState {
  mode: 'calm' | 'tense';
  out: GainNode;
  timer: number;
  next: number;
  step: number;
}

interface AmbState {
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  dripTimer: number;
  carTimer: number;
}

type CtxCtor = new (opts?: AudioContextOptions) => AudioContext;

export class Sfx {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private bank: NoiseBank | null = null;
  private canPan = false;
  private failed = false;
  private didUnlock = false;
  private voices: Voice[] = [];

  private vols: Record<SfxCategory | 'master', number> = {
    master: 1, weapons: 1, world: 1, ui: 1, ambience: 1, music: 1,
  };
  private muted = false;

  private wantAmbience = false;
  private amb: AmbState | null = null;
  private wantMusic: 'off' | 'calm' | 'tense' = 'off';
  private music: MusicState | null = null;

  get unlocked(): boolean {
    return this.ctx !== null && this.didUnlock;
  }

  // ---- lifecycle -----------------------------------------------------------

  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const g = globalThis as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
        const Ctor = g.AudioContext ?? g.webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        let ctx: AudioContext;
        try {
          ctx = new Ctor({ latencyHint: 'interactive' });
        } catch {
          ctx = new Ctor();
        }
        this.ctx = ctx;
        this.canPan = typeof (ctx as unknown as { createStereoPanner?: unknown }).createStereoPanner === 'function';
        this.bank = makeNoiseBank(ctx);
        this.graph = this.buildGraph(ctx);
        this.applyVolumes(true);
      }
      const ctx = this.ctx;
      // iOS: play a silent 1-sample buffer inside the gesture to fully unlock output.
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      this.didUnlock = true;
      this.resumeCtx();
      this.applyAmbience();
      this.applyMusic();
    } catch {
      if (!this.ctx) this.failed = true;
    }
  }

  suspend(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const p = ctx.suspend();
      if (p) p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (!this.didUnlock) return;
    this.resumeCtx();
  }

  private resumeCtx(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p) p.catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  private running(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || !this.graph || !this.bank || !this.didUnlock) return null;
    if (ctx.state !== 'running') return null;
    return ctx;
  }

  private buildGraph(ctx: AudioContext): Graph {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    const post = ctx.createGain();
    post.gain.value = 1.15;
    const clip = ctx.createWaveShaper();
    clip.curve = makeSoftClipCurve();
    master.connect(comp);
    comp.connect(post);
    post.connect(clip);
    clip.connect(ctx.destination);

    const bed = ctx.createGain();
    bed.connect(master);
    const mk = (dest: AudioNode): GainNode => {
      const g = ctx.createGain();
      g.connect(dest);
      return g;
    };
    const cats: Record<SfxCategory, GainNode> = {
      weapons: mk(master),
      world: mk(master),
      ui: mk(master),
      ambience: mk(bed),
      music: mk(bed),
    };
    return { master, bed, cats };
  }

  // ---- volume ----------------------------------------------------------------

  setVolume(cat: SfxCategory | 'master', v: number): void {
    this.vols[cat] = clamp(Number.isFinite(v) ? v : 1, 0, 1);
    this.applyVolumes(false);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes(false);
  }

  private applyVolumes(instant: boolean): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    const set = (p: AudioParam, v: number): void => {
      if (instant) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(v, now);
      } else {
        p.setTargetAtTime(v, now, 0.03);
      }
    };
    const mv = this.vols.master;
    set(g.master.gain, this.muted ? 0 : mv * mv * 0.9);
    for (const c of Object.keys(g.cats) as SfxCategory[]) {
      const v = this.vols[c];
      set(g.cats[c].gain, CAT_TRIM[c] * v * v);
    }
  }

  duck(amount: number, seconds: number): void {
    const ctx = this.running();
    const g = this.graph;
    if (!ctx || !g) return;
    try {
      const now = ctx.currentTime;
      const target = 1 - clamp(amount, 0, 1) * 0.95;
      const p = g.bed.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(target, now, 0.03);
      p.setTargetAtTime(1, now + Math.max(0.05, seconds), 0.35);
    } catch {
      /* ignore */
    }
  }

  // ---- one-shots -----------------------------------------------------------

  play(name: SfxName, opts?: PlayOpts): void {
    const ctx = this.running();
    if (!ctx) return;
    try {
      this.playInner(ctx, name, opts ?? {});
    } catch {
      /* never throw from audio */
    }
  }

  private playInner(ctx: AudioContext, name: SfxName, opts: PlayOpts): void {
    const g = this.graph;
    const bank = this.bank;
    const synth = SYN[name];
    if (!g || !bank || !synth) return;
    const vol = clamp(opts.volume ?? 1, 0, 1);
    if (vol < 0.004) return;
    const now = ctx.currentTime;
    this.prune(now);

    // Per-name cap (and drop exact duplicates fired in the same few ms).
    let sameCount = 0;
    let oldestSame: Voice | null = null;
    for (const v of this.voices) {
      if (v.dead || v.name !== name) continue;
      if (now - v.start < 0.006 && v.vol >= vol) return;
      sameCount++;
      if (!oldestSame || v.start < oldestSame.start) oldestSame = v;
    }
    if (oldestSame && sameCount >= voiceCap(name)) this.kill(oldestSame, now);

    // Global cap: drop the quietest / most-finished voice.
    let alive = 0;
    for (const v of this.voices) if (!v.dead) alive++;
    while (alive >= GLOBAL_VOICES) {
      let worst: Voice | null = null;
      let worstScore = Infinity;
      for (const v of this.voices) {
        if (v.dead) continue;
        const remain = clamp((v.end - now) / Math.max(0.01, v.end - v.start), 0, 1);
        const score = v.vol * (0.25 + remain);
        if (score < worstScore) {
          worstScore = score;
          worst = v;
        }
      }
      if (!worst) break;
      this.kill(worst, now);
      alive--;
    }

    const input = ctx.createGain();
    const chain: AudioNode[] = [input];
    let tail: AudioNode = input;
    input.gain.value = opts.muffled ? vol * 0.8 : vol;
    if (opts.muffled) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.Q.value = 0.5;
      tail.connect(lp);
      tail = lp;
      chain.push(lp);
    }
    const pan = clamp(opts.pan ?? 0, -1, 1);
    if (this.canPan && Math.abs(pan) > 0.01) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p);
      tail = p;
      chain.push(p);
    }
    tail.connect(g.cats[CATEGORY[name]]);

    const j = jitterFor(name);
    const rate = clamp(opts.rate ?? 1, 0.25, 4) * (1 + (Math.random() - 0.5) * j);
    const srcs: AudioScheduledSourceNode[] = [];
    const t = now + 0.004;
    const s = new Syn(ctx, input, t, rate, bank, srcs);
    synth(s);
    this.voices.push({ name, start: now, end: s.end + 0.05, vol, input, chain, srcs, dead: false });
  }

  private kill(v: Voice, now: number): void {
    v.dead = true;
    try {
      const p = v.input.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 0.025);
    } catch {
      /* ignore */
    }
    for (const s of v.srcs) safeStop(s, now + 0.035);
    v.end = Math.min(v.end, now + 0.05);
  }

  private prune(now: number): void {
    if (this.voices.length === 0) return;
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.end + 0.1 < now) {
        for (const n of v.chain) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      } else {
        keep.push(v);
      }
    }
    this.voices = keep;
  }

  // ---- ambience -------------------------------------------------------------

  setAmbience(on: boolean): void {
    this.wantAmbience = on;
    this.applyAmbience();
  }

  private applyAmbience(): void {
    try {
      if (!this.wantAmbience) {
        this.stopAmbience();
        return;
      }
      if (this.amb) return;
      const ctx = this.ctx;
      if (!ctx || !this.graph || !this.bank || !this.didUnlock) return;
      this.startAmbience(ctx, this.graph, this.bank);
    } catch {
      /* ignore */
    }
  }

  private startAmbience(c: AudioContext, g: Graph, bank: NoiseBank): void {
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + 2.5);
    out.connect(g.cats.ambience);
    const srcs: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [out];

    const loop = (kind: NoiseKind, rate: number): AudioBufferSourceNode => {
      const s = c.createBufferSource();
      s.buffer = bank[kind];
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(now, Math.random() * 2);
      srcs.push(s);
      return s;
    };
    const bq = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      nodes.push(b);
      return b;
    };
    const gain = (v: number): GainNode => {
      const n = c.createGain();
      n.gain.value = v;
      nodes.push(n);
      return n;
    };
    const lfo = (hz: number, depth: number, target: AudioParam): void => {
      const o = c.createOscillator();
      o.frequency.value = hz;
      const lg = gain(depth);
      o.connect(lg);
      lg.connect(target);
      o.start(now);
      srcs.push(o);
    };
    /** Panner into the bed. Persistent ones are tracked; transient ones disconnect themselves. */
    const panTo = (p: number, releaseMs = 0): AudioNode => {
      if (!this.canPan) return out;
      const n = c.createStereoPanner();
      n.pan.value = p;
      n.connect(out);
      if (releaseMs > 0) setTimeout(() => n.disconnect(), releaseMs);
      else nodes.push(n);
      return n;
    };

    // Rain body, two decorrelated sides with slowly breathing brightness.
    [-0.7, 0.7].forEach((p, i) => {
      const src = loop('pink', i ? 0.93 : 1);
      const hp = bq('highpass', 380);
      const lp = bq('lowpass', 4200);
      const gg = gain(0.42);
      lfo(0.05 + i * 0.03, 900, lp.frequency);
      lfo(0.11 + i * 0.04, 0.08, gg.gain);
      src.connect(hp);
      hp.connect(lp);
      lp.connect(gg);
      gg.connect(panTo(p));
    });
    // Fine patter on awnings/glass.
    {
      const src = loop('white', 1);
      const bp = bq('bandpass', 6500, 0.6);
      const gg = gain(0.06);
      lfo(0.17, 0.025, gg.gain);
      src.connect(bp);
      bp.connect(gg);
      gg.connect(out);
    }
    // Distant city rumble.
    {
      const src = loop('brown', 0.8);
      const lp = bq('lowpass', 150);
      const gg = gain(0.55);
      lfo(0.037, 0.22, gg.gain);
      src.connect(lp);
      lp.connect(gg);
      gg.connect(out);
    }

    const st: AmbState = { out, srcs, nodes, dripTimer: 0, carTimer: 0 };
    this.amb = st;

    const drip = (): void => {
      if (this.amb !== st) return;
      const ctx = this.running();
      if (ctx && this.bank) {
        const dest = panTo(rr(-0.9, 0.9), 400);
        const s = new Syn(ctx, dest, ctx.currentTime + 0.01, 1, this.bank, []);
        const f = rr(1100, 2600);
        s.tone({ f, f1: f * rr(1.4, 1.9), glide: 0.03, d: rr(0.04, 0.07), peak: rr(0.025, 0.07) });
        if (Math.random() < 0.3) {
          s.noise({ filt: 'bandpass', ff: rr(2000, 4000), q: 2, at: 0.01, d: 0.04, peak: 0.04 });
        }
      }
      st.dripTimer = setTimeout(drip, rr(350, 1800));
    };
    const car = (): void => {
      if (this.amb !== st) return;
      const ctx = this.running();
      if (ctx && this.bank) {
        const t0 = ctx.currentTime + 0.05;
        const dir = Math.random() < 0.5 ? -1 : 1;
        let dest: AudioNode = out;
        if (this.canPan) {
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(-0.85 * dir, t0);
          p.pan.linearRampToValueAtTime(0.85 * dir, t0 + 6);
          p.connect(out);
          setTimeout(() => p.disconnect(), 7000);
          dest = p;
        }
        const s = new Syn(ctx, dest, t0, rr(0.9, 1.1), this.bank, []);
        s.noise({ kind: 'pink', filt: 'bandpass', ff: 600, q: 0.7, a: 2.8, d: 3, peak: 0.22 });
        s.noise({ filt: 'bandpass', ff: 2800, q: 0.8, a: 2.8, d: 2.6, peak: 0.07 }); // wet tyres
        s.tone({ type: 'sawtooth', f: 62, f1: 50, a: 2.8, d: 2.8, peak: 0.035, filt: 'lowpass', ff: 220 });
      }
      st.carTimer = setTimeout(car, rr(9000, 24000));
    };
    st.dripTimer = setTimeout(drip, 800);
    st.carTimer = setTimeout(car, rr(3000, 9000));
  }

  private stopAmbience(): void {
    const st = this.amb;
    const ctx = this.ctx;
    if (!st) return;
    this.amb = null;
    clearTimeout(st.dripTimer);
    clearTimeout(st.carTimer);
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const p = st.out.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 1);
      for (const s of st.srcs) safeStop(s, now + 1.1);
      setTimeout(() => {
        for (const n of st.nodes) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  // ---- music ----------------------------------------------------------------

  setMusic(mode: 'off' | 'calm' | 'tense'): void {
    this.wantMusic = mode;
    this.applyMusic();
  }

  private applyMusic(): void {
    try {
      const mode = this.wantMusic;
      if (this.music && this.music.mode === mode) return;
      if (mode === 'off') {
        this.stopMusic();
        return;
      }
      const ctx = this.ctx;
      const g = this.graph;
      if (!ctx || !g || !this.didUnlock) return;
      this.stopMusic();
      const now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.linearRampToValueAtTime(1, now + 1.5);
      out.connect(g.cats.music);
      const st: MusicState = { mode, out, timer: 0, next: now + 0.15, step: 0 };
      st.timer = setInterval(() => this.musicTick(st), 60);
      this.music = st;
    } catch {
      /* ignore */
    }
  }

  private stopMusic(): void {
    const st = this.music;
    if (!st) return;
    this.music = null;
    clearInterval(st.timer);
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const p = st.out.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 0.8);
      setTimeout(() => {
        try {
          st.out.disconnect();
        } catch {
          /* ignore */
        }
      }, 2500);
    } catch {
      /* ignore */
    }
  }

  private musicTick(st: MusicState): void {
    if (this.music !== st) return;
    const ctx = this.running();
    const bank = this.bank;
    if (!ctx || !bank) return;
    try {
      const now = ctx.currentTime;
      this.prune(now);
      if (st.next < now - 0.2) st.next = now + 0.05; // recovered from suspend/throttle
      const stepDur = st.mode === 'calm' ? 60 / CALM_BPM / 2 : 60 / TENSE_BPM / 4;
      while (st.next < now + 0.3) {
        if (st.mode === 'calm') this.calmStep(ctx, bank, st, st.step, st.next, stepDur);
        else this.tenseStep(ctx, bank, st, st.step, st.next, stepDur);
        st.next += stepDur;
        st.step++;
      }
    } catch {
      /* ignore */
    }
  }

  /** Lo-fi: swung eighths, soft kick/snare, pad chords, round bass, sparse keys. */
  private calmStep(ctx: AudioContext, bank: NoiseBank, st: MusicState, step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 8) % CALM.length;
    const beat = step % 8;
    const ch = CALM[bar] as CalmBar;
    const tt = t + (beat % 2 === 1 ? sd * 0.18 : 0);
    const s = new Syn(ctx, st.out, tt, 1, bank, []);
    if (beat === 0) {
      for (const m of ch.chord) {
        const f = mtof(m);
        s.tone({ type: 'triangle', f, a: 0.35, hold: sd * 5, d: sd * 3, peak: 0.06, filt: 'lowpass', ff: 900, detune: rr(-8, 8) });
        s.tone({ f: f * 1.003, a: 0.4, hold: sd * 5, d: sd * 3, peak: 0.04 });
      }
      s.tone({ type: 'triangle', f: mtof(ch.bass), a: 0.02, hold: sd * 2.5, d: sd * 1.5, peak: 0.35, filt: 'lowpass', ff: 320 });
      s.tone({ f: 95, f1: 42, d: 0.22, peak: 0.3 });
    }
    if (beat === 5) {
      s.tone({ type: 'triangle', f: mtof(ch.bass + (Math.random() < 0.5 ? 7 : 12)), a: 0.02, hold: sd * 0.8, d: sd, peak: 0.25, filt: 'lowpass', ff: 320 });
    }
    if (beat === 3 && Math.random() < 0.3) s.tone({ f: 90, f1: 45, d: 0.18, peak: 0.18 });
    if (beat === 4) {
      s.noise({ kind: 'pink', filt: 'bandpass', ff: 1800, q: 0.8, d: 0.12, peak: 0.1 });
      s.tone({ f: 200, f1: 150, d: 0.06, peak: 0.06 });
    }
    if (beat % 2 === 1 || Math.random() < 0.25) {
      s.noise({ filt: 'highpass', ff: 7000, d: 0.03, peak: 0.04 * rr(0.5, 1) });
    }
    if ((beat === 2 || beat === 3 || beat === 6 || beat === 7) && Math.random() < 0.22) {
      s.fm({ f: mtof(pick(ch.mel)), ratio: 1, index: 1.2, index1: 0.1, a: 0.005, d: 0.6, peak: 0.05 });
    }
  }

  /** Tense: driving sixteenth pulse, filtered saw bass, ticking hats, quiet minor-second drone. */
  private tenseStep(ctx: AudioContext, bank: NoiseBank, st: MusicState, step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 16) % TENSE_ROOTS.length;
    const ss = step % 16;
    const root = TENSE_ROOTS[bar] as number;
    const s = new Syn(ctx, st.out, t, 1, bank, []);
    if (ss % 2 === 0) {
      const up = ss === 6 || ss === 14 ? 12 : 0;
      s.tone({ type: 'sawtooth', f: mtof(root + up), a: 0.004, d: 0.12, peak: ss === 0 ? 0.24 : 0.16, filt: 'lowpass', ff: 380 + 260 * (ss / 16), q: 4 });
    }
    if (ss === 0 || ss === 8 || (ss === 10 && bar % 2 === 1)) s.tone({ f: 80, f1: 38, d: 0.18, peak: 0.32 });
    if (ss === 4 || ss === 12) s.noise({ filt: 'bandpass', ff: 2500, q: 2, d: 0.05, peak: 0.08 });
    if (ss % 2 === 1) s.noise({ filt: 'highpass', ff: 8000, d: 0.02, peak: ss % 4 === 3 ? 0.035 : 0.022 });
    if (ss === 0) {
      s.tone({ f: mtof(root + 24), a: 0.5, hold: sd * 12, d: sd * 3, peak: 0.03 });
      s.tone({ f: mtof(root + 25), a: 0.8, hold: sd * 10, d: sd * 3, peak: 0.012 });
      if (bar === 3) {
        for (const iv of [12, 15, 18]) {
          s.tone({ type: 'square', f: mtof(root + iv), a: 0.005, d: 0.25, peak: 0.03, filt: 'lowpass', ff: 1200 });
        }
      }
    }
  }
}
