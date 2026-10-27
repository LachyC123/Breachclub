// CODM-style touch controls plus keyboard/mouse.
//  - left half: floating move stick
//  - right half: floating AIM stick (aims, never fires)
//  - FIRE button: hold to shoot; drag the thumb off it to steer aim while firing
//  - ADS toggle, Gadget (press-drag-release preview, tap for second action), Interact (hold), Reload
// Every pointer is tracked independently; everything resets on cancel, blur, rotation and death.
import type { ActorIntent, GadgetCommand, Vec } from '../sim/types';
import { emptyIntent } from '../sim/types';

export interface GadgetPreview {
  active: boolean;
  /** screen-space drag vector from the gadget button (or mouse offset on desktop) */
  dir: Vec;
  /** desktop: world target in tiles */
  worldTarget: Vec | null;
  overCancel: boolean;
}

const STICK_R = 58;
const AIM_DEADZONE = 10;
const FIRE_AIM_DEADZONE = 18;

export class Controls {
  move: Vec = { x: 0, y: 0 };
  aim: number | null = null;
  firing = false;
  ads = false;
  interactHeld = false;
  private reloadTap = false;
  private tagTap = false;
  private gadgetCmd: GadgetCommand | null = null;
  gadget: GadgetPreview = { active: false, dir: { x: 0, y: 0 }, worldTarget: null, overCancel: false };
  /** set by the runner: decides what a gadget press means right now */
  gadgetTapAction: () => GadgetCommand | null = () => null;
  gadgetCommitAction: (p: GadgetPreview) => GadgetCommand | null = () => null;
  gadgetPreviewAllowed: () => boolean = () => false;
  onAnyInput: () => void = () => {};
  usingTouch = false;
  /** true while the right stick or fire-drag is actively steering aim this frame */
  aimingActive = false;
  movedOnce = false;
  aimedOnce = false;
  firedOnce = false;

  private movePtr: number | null = null;
  private moveOrigin: Vec = { x: 0, y: 0 };
  private aimPtr: number | null = null;
  private aimOrigin: Vec = { x: 0, y: 0 };
  private firePtr: number | null = null;
  private fireOrigin: Vec = { x: 0, y: 0 };
  private gadgetPtr: number | null = null;
  private gadgetOrigin: Vec = { x: 0, y: 0 };
  private gadgetDownAt = 0;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, right: false, inside: false };
  private qHeld = false;
  /** world position under the mouse, supplied each frame */
  mouseWorld: Vec | null = null;
  playerScreen: Vec = { x: 0, y: 0 };
  private disposers: Array<() => void> = [];

  constructor(
    layer: HTMLElement,
    private moveStick: HTMLElement,
    private aimStick: HTMLElement,
    private cancelZone: HTMLElement,
  ) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(layer, 'pointerdown', this.onDown);
    on(window, 'pointermove', this.onMove, { passive: false });
    on(window, 'pointerup', this.onUp);
    on(window, 'pointercancel', this.onUp);
    on(window, 'blur', () => this.reset());
    on(window, 'keydown', this.onKey);
    on(window, 'keyup', this.onKeyUp);
    on(layer, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'orientationchange', () => this.reset());
  }

  dispose() {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  // ---------- buttons ----------

  bindFireButton(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyInput();
      this.usingTouch = e.pointerType === 'touch';
      if (this.firePtr !== null) return;
      this.firePtr = e.pointerId;
      const r = el.getBoundingClientRect();
      this.fireOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.firing = true;
      this.firedOnce = true;
      el.classList.add('pressed');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.firePtr) return;
      const dx = e.clientX - this.fireOrigin.x;
      const dy = e.clientY - this.fireOrigin.y;
      if (Math.hypot(dx, dy) > FIRE_AIM_DEADZONE) {
        this.aim = Math.atan2(dy, dx);
        this.aimingActive = true;
        this.aimedOnce = true;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.firePtr) return;
      this.firePtr = null;
      this.firing = false;
      this.aimingActive = this.aimPtr !== null;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  bindGadgetButton(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyInput();
      this.usingTouch = e.pointerType === 'touch';
      if (this.gadgetPtr !== null) return;
      this.gadgetPtr = e.pointerId;
      const r = el.getBoundingClientRect();
      this.gadgetOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.gadgetDownAt = performance.now();
      if (this.gadgetPreviewAllowed()) {
        this.gadget = { active: true, dir: { x: 0, y: 0 }, worldTarget: null, overCancel: false };
        this.firing = false;
        this.cancelZone.style.display = 'block';
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.gadgetPtr || !this.gadget.active) return;
      this.gadget.dir = { x: e.clientX - this.gadgetOrigin.x, y: e.clientY - this.gadgetOrigin.y };
      const cz = this.cancelZone.getBoundingClientRect();
      this.gadget.overCancel = e.clientX >= cz.left - 20 && e.clientX <= cz.right + 20 && e.clientY >= cz.top - 20 && e.clientY <= cz.bottom + 20;
      this.cancelZone.classList.toggle('hot', this.gadget.overCancel);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.gadgetPtr) return;
      this.gadgetPtr = null;
      if (this.gadget.active) {
        const cancel = this.gadget.overCancel || e.type === 'pointercancel';
        if (!cancel) this.gadgetCmd = this.gadgetCommitAction(this.gadget);
        this.endPreview();
      } else if (performance.now() - this.gadgetDownAt < 600) {
        this.gadgetCmd = this.gadgetTapAction();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  bindHoldButton(el: HTMLElement, set: (held: boolean) => void) {
    let ptr: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyInput();
      ptr = e.pointerId;
      set(true);
      el.classList.add('pressed');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== ptr) return;
      ptr = null;
      set(false);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  bindTap(el: HTMLElement, fn: () => void) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnyInput();
      fn();
    });
  }

  setInteract(held: boolean) {
    this.interactHeld = held;
  }

  requestReload() {
    this.reloadTap = true;
  }

  requestTag() {
    this.tagTap = true;
  }

  toggleAds() {
    this.ads = !this.ads;
  }

  private endPreview() {
    this.gadget = { active: false, dir: { x: 0, y: 0 }, worldTarget: null, overCancel: false };
    this.cancelZone.style.display = 'none';
    this.cancelZone.classList.remove('hot');
  }

  cancelPreview() {
    this.endPreview();
    this.gadgetPtr = null;
  }

  // ---------- touch layer (sticks) and mouse ----------

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onAnyInput();
    if (e.pointerType === 'mouse') {
      this.usingTouch = false;
      if (e.button === 0) {
        this.mouse.down = true;
        this.firedOnce = true;
      }
      if (e.button === 2) {
        if (this.gadget.active) this.cancelPreview();
        else this.mouse.right = true;
      }
      return;
    }
    this.usingTouch = true;
    const leftHanded = document.body.classList.contains('left-handed');
    const half = window.innerWidth * 0.45;
    const isMoveSide = leftHanded ? e.clientX > window.innerWidth - half : e.clientX < half;
    if (isMoveSide && this.movePtr === null) {
      this.movePtr = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.showStick(this.moveStick, e.clientX, e.clientY);
    } else if (!isMoveSide && this.aimPtr === null) {
      this.aimPtr = e.pointerId;
      this.aimOrigin = { x: e.clientX, y: e.clientY };
      this.showStick(this.aimStick, e.clientX, e.clientY);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      return;
    }
    if (e.pointerId === this.movePtr) {
      e.preventDefault();
      const v = this.stickVector(this.moveStick, this.moveOrigin, e);
      const m = Math.hypot(v.x, v.y) / STICK_R;
      const dead = 0.12;
      const mag = m < dead ? 0 : Math.min(1, (m - dead) / (1 - dead));
      const len = Math.hypot(v.x, v.y) || 1;
      this.move = { x: (v.x / len) * mag, y: (v.y / len) * mag };
      if (mag > 0.3) this.movedOnce = true;
    } else if (e.pointerId === this.aimPtr) {
      e.preventDefault();
      const v = this.stickVector(this.aimStick, this.aimOrigin, e);
      if (Math.hypot(v.x, v.y) > AIM_DEADZONE) {
        this.aim = Math.atan2(v.y, v.x);
        this.aimingActive = true;
        this.aimedOnce = true;
      }
    }
  };

  /** floating stick: the base follows the thumb when it is dragged past the rim */
  private stickVector(el: HTMLElement, origin: Vec, e: PointerEvent): Vec {
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      origin.x += (dx / d) * (d - STICK_R);
      origin.y += (dy / d) * (d - STICK_R);
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
      this.showStick(el, origin.x, origin.y);
    }
    this.knob(el, dx, dy);
    return { x: dx, y: dy };
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.right = false;
      return;
    }
    if (e.pointerId === this.movePtr) {
      this.movePtr = null;
      this.move = { x: 0, y: 0 };
      this.moveStick.style.display = 'none';
    } else if (e.pointerId === this.aimPtr) {
      this.aimPtr = null;
      this.aimingActive = this.firePtr !== null;
      this.aimStick.style.display = 'none';
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    this.usingTouch = false;
    this.onAnyInput();
    if (k === 'r') this.reloadTap = true;
    if (k === 'e') this.interactHeld = true;
    if (k === 'f') this.tagTap = true;
    if (k === 'q') {
      this.qHeld = true;
      this.gadgetDownAt = performance.now();
      if (this.gadgetPreviewAllowed()) this.gadget = { active: true, dir: { x: 0, y: 0 }, worldTarget: this.mouseWorld, overCancel: false };
    }
    if (k === 'tab') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'e') this.interactHeld = false;
    if (k === 'q' && this.qHeld) {
      this.qHeld = false;
      if (this.gadget.active) {
        this.gadget.worldTarget = this.mouseWorld;
        this.gadget.dir = { x: this.mouse.x - this.playerScreen.x, y: this.mouse.y - this.playerScreen.y };
        this.gadgetCmd = this.gadgetCommitAction(this.gadget);
        this.endPreview();
      } else this.gadgetCmd = this.gadgetTapAction();
    }
  };

  private showStick(el: HTMLElement, x: number, y: number) {
    el.style.display = 'block';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.knob(el, 0, 0);
  }

  private knob(el: HTMLElement, dx: number, dy: number) {
    const i = el.firstElementChild as HTMLElement | null;
    if (i) i.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** desktop Escape cancels a gadget preview; returns true if consumed */
  escape(): boolean {
    if (this.gadget.active) {
      this.cancelPreview();
      this.qHeld = false;
      return true;
    }
    return false;
  }

  /** Build this tick's intent. Desktop keys/mouse merge with touch. */
  produce(): ActorIntent {
    const it = emptyIntent();
    let mx = this.move.x;
    let my = this.move.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    if (m > 0.3) this.movedOnce = true;
    it.move = { x: mx, y: my };
    let fire = this.firing;
    let ads = this.ads;
    if (!this.usingTouch && this.mouse.inside) {
      this.aim = Math.atan2(this.mouse.y - this.playerScreen.y, this.mouse.x - this.playerScreen.x);
      this.aimingActive = true;
      fire = fire || this.mouse.down;
      ads = ads || this.mouse.right || this.keys.has('shift');
      if (this.mouse.down) this.aimedOnce = true;
      if (this.gadget.active) {
        this.gadget.worldTarget = this.mouseWorld;
        this.gadget.dir = { x: this.mouse.x - this.playerScreen.x, y: this.mouse.y - this.playerScreen.y };
      }
    }
    it.aim = this.aim;
    it.fire = fire && !this.gadget.active;
    it.ads = ads;
    it.interact = this.interactHeld;
    it.reload = this.reloadTap;
    this.reloadTap = false;
    it.gadget = this.gadgetCmd;
    this.gadgetCmd = null;
    return it;
  }

  /** consume a pending drone tag request */
  takeTag(): boolean {
    const t = this.tagTap;
    this.tagTap = false;
    return t;
  }

  /** Clear every held input (takeover, pause, app switch): no held trigger survives. */
  reset() {
    this.move = { x: 0, y: 0 };
    this.firing = false;
    this.interactHeld = false;
    this.reloadTap = false;
    this.tagTap = false;
    this.gadgetCmd = null;
    this.movePtr = null;
    this.aimPtr = null;
    this.firePtr = null;
    this.gadgetPtr = null;
    this.aimingActive = false;
    this.mouse.down = false;
    this.mouse.right = false;
    this.keys.clear();
    this.qHeld = false;
    this.moveStick.style.display = 'none';
    this.aimStick.style.display = 'none';
    this.endPreview();
    document.querySelectorAll('.act.pressed').forEach((el) => el.classList.remove('pressed'));
  }
}
