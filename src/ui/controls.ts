// Touch (floating twin sticks + gadget drag) and desktop (WASD + mouse) input.
// Each pointer is tracked independently; everything resets on cancel, blur, rotation, death.
import type { ActorIntent, GadgetCommand, Vec } from '../sim/types';
import { emptyIntent } from '../sim/types';

export type GadgetMode = 'ram' | 'hinge' | 'none';

export interface GadgetPreview {
  active: boolean;
  /** screen-space drag vector from the gadget button (or mouse world point on desktop) */
  dir: Vec;
  /** desktop: world target in tiles */
  worldTarget: Vec | null;
  overCancel: boolean;
}

const STICK_R = 60;
const AIM_DEADZONE = 14;

export class Controls {
  move: Vec = { x: 0, y: 0 };
  aim: number | null = null;
  firing = false;
  interactHeld = false;
  private reloadTap = false;
  private gadgetCmd: GadgetCommand | null = null;
  gadget: GadgetPreview = { active: false, dir: { x: 0, y: 0 }, worldTarget: null, overCancel: false };
  /** set by App: decides what a gadget press means right now */
  gadgetTapAction: () => GadgetCommand | null = () => null;
  gadgetCommitAction: (p: GadgetPreview) => GadgetCommand | null = () => null;
  gadgetPreviewAllowed: () => boolean = () => false;
  onAnyInput: () => void = () => {};
  usingTouch = false;
  /** analytic flags for tutorial hints */
  movedOnce = false;
  aimedOnce = false;

  private movePtr: number | null = null;
  private moveOrigin: Vec = { x: 0, y: 0 };
  private aimPtr: number | null = null;
  private aimOrigin: Vec = { x: 0, y: 0 };
  private gadgetPtr: number | null = null;
  private gadgetOrigin: Vec = { x: 0, y: 0 };
  private gadgetDownAt = 0;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, inside: false };
  private qHeld = false;
  /** world position under the mouse, supplied by App each frame */
  mouseWorld: Vec | null = null;
  playerScreen: Vec = { x: 0, y: 0 };

  constructor(
    layer: HTMLElement,
    private moveStick: HTMLElement,
    private aimStick: HTMLElement,
    private cancelZone: HTMLElement,
  ) {
    layer.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('orientationchange', () => this.reset());
  }

  /** Attach press-and-hold / drag behaviour to an action button. */
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
        /* capture not supported */
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

  private endPreview() {
    this.gadget = { active: false, dir: { x: 0, y: 0 }, worldTarget: null, overCancel: false };
    this.cancelZone.style.display = 'none';
    this.cancelZone.classList.remove('hot');
  }

  cancelPreview() {
    this.endPreview();
    this.gadgetPtr = null;
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onAnyInput();
    const left = e.clientX < window.innerWidth * 0.45;
    if (e.pointerType === 'mouse') {
      this.usingTouch = false;
      if (e.button === 0) {
        this.mouse.down = true;
        this.firing = !this.gadget.active;
      }
      if (e.button === 2 && this.gadget.active) this.cancelPreview();
      return;
    }
    this.usingTouch = true;
    const leftHanded = document.body.classList.contains('left-handed');
    const isMoveSide = leftHanded ? !left && e.clientX > window.innerWidth * 0.55 : left;
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
      let dx = e.clientX - this.moveOrigin.x;
      let dy = e.clientY - this.moveOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        // floating stick follows the thumb when dragged past its rim
        this.moveOrigin.x += (dx / d) * (d - STICK_R);
        this.moveOrigin.y += (dy / d) * (d - STICK_R);
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
        this.showStick(this.moveStick, this.moveOrigin.x, this.moveOrigin.y);
      }
      const m = Math.hypot(dx, dy) / STICK_R;
      const dead = 0.12;
      const mag = m < dead ? 0 : Math.min(1, (m - dead) / (1 - dead));
      const len = Math.hypot(dx, dy) || 1;
      this.move = { x: (dx / len) * mag, y: (dy / len) * mag };
      if (mag > 0.3) this.movedOnce = true;
      this.knob(this.moveStick, dx, dy);
    } else if (e.pointerId === this.aimPtr) {
      e.preventDefault();
      let dx = e.clientX - this.aimOrigin.x;
      let dy = e.clientY - this.aimOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        this.aimOrigin.x += (dx / d) * (d - STICK_R);
        this.aimOrigin.y += (dy / d) * (d - STICK_R);
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
        this.showStick(this.aimStick, this.aimOrigin.x, this.aimOrigin.y);
      }
      if (Math.hypot(dx, dy) > AIM_DEADZONE) {
        this.aim = Math.atan2(dy, dx);
        this.firing = !this.gadget.active;
        this.aimedOnce = true;
      }
      this.knob(this.aimStick, dx, dy);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        this.mouse.down = false;
        this.firing = false;
      }
      return;
    }
    if (e.pointerId === this.movePtr) {
      this.movePtr = null;
      this.move = { x: 0, y: 0 };
      this.moveStick.style.display = 'none';
    } else if (e.pointerId === this.aimPtr) {
      this.aimPtr = null;
      this.firing = false;
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

  /** desktop keyboard escape cancels a gadget preview; returns true if consumed */
  escape(): boolean {
    if (this.gadget.active) {
      this.cancelPreview();
      this.qHeld = false;
      return true;
    }
    return false;
  }

  isKeyDown(k: string) {
    return this.keys.has(k);
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
    if (!this.usingTouch && this.mouse.inside) {
      this.aim = Math.atan2(this.mouse.y - this.playerScreen.y, this.mouse.x - this.playerScreen.x);
      this.firing = this.mouse.down && !this.gadget.active;
      if (this.mouse.down) this.aimedOnce = true;
      if (this.gadget.active) {
        this.gadget.worldTarget = this.mouseWorld;
        this.gadget.dir = { x: this.mouse.x - this.playerScreen.x, y: this.mouse.y - this.playerScreen.y };
      }
    }
    it.aim = this.aim;
    it.fire = this.firing && !this.gadget.active;
    it.interact = this.interactHeld;
    it.reload = this.reloadTap;
    this.reloadTap = false;
    it.gadget = this.gadgetCmd;
    this.gadgetCmd = null;
    return it;
  }

  /** Clear every held input (takeover, pause, app switch): no held trigger survives. */
  reset() {
    this.move = { x: 0, y: 0 };
    this.firing = false;
    this.interactHeld = false;
    this.reloadTap = false;
    this.gadgetCmd = null;
    this.movePtr = null;
    this.aimPtr = null;
    this.gadgetPtr = null;
    this.mouse.down = false;
    this.keys.clear();
    this.qHeld = false;
    this.moveStick.style.display = 'none';
    this.aimStick.style.display = 'none';
    this.endPreview();
  }

  get stickRadius() {
    return STICK_R;
  }
}
