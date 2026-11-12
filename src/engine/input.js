import { W, H } from './renderer.js';

// Action -> physical key codes (QWERTY positions) and produced characters (covers AZERTY too).
const MAP = {
  left: { codes: ['ArrowLeft', 'KeyA'], keys: ['a', 'q'] },
  right: { codes: ['ArrowRight', 'KeyD'], keys: ['d'] },
  up: { codes: ['ArrowUp', 'KeyW'], keys: ['w', 'z'] },
  down: { codes: ['ArrowDown', 'KeyS'], keys: ['s'] },
  fire: { codes: ['Space'], keys: [' '] },
  special: { codes: ['ShiftLeft', 'ShiftRight'], keys: ['shift'] },
  confirm: { codes: ['Enter', 'NumpadEnter', 'Space'], keys: ['enter', ' '] },
  back: { codes: ['Escape', 'Backspace'], keys: ['escape'] },
  pause: { codes: ['Escape', 'KeyP'], keys: ['p', 'escape'] },
  mine: { codes: ['KeyX'], keys: ['x'] },
  dock: { codes: ['KeyE', 'Enter', 'NumpadEnter'], keys: ['e', 'enter'] },
};

function actionsFor(e) {
  const key = (e.key || '').toLowerCase();
  const out = [];
  for (const [action, m] of Object.entries(MAP)) {
    if (m.codes.includes(e.code) || m.keys.includes(key)) out.push(action);
  }
  return out;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Map(); // code -> actions
    this.justPressed = new Set();
    this.pointers = new Map(); // pointerId -> {x, y}
    this.tap = null; // {x, y} on the step a pointer went down
    this.hover = null; // last mouse position (for menu hover)
    this.hoverMoved = false;
    this.isTouch = false;
    this.onFirstInteraction = null;
    this._interacted = false;

    window.addEventListener('keydown', (e) => {
      const acts = actionsFor(e);
      if (acts.length) e.preventDefault();
      this._first();
      if (e.repeat) return;
      this.held.set(e.code || e.key, acts);
      acts.forEach((a) => this.justPressed.add(a));
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code || e.key));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.pointers.clear();
    });

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._first();
      this.isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      const p = pos(e);
      this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, type: e.pointerType, button: e.button });
      if (e.pointerType === 'mouse') this.mouseT = performance.now();
      this.tap = p;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      const cur = this.pointers.get(e.pointerId);
      if (cur) {
        cur.x = p.x;
        cur.y = p.y;
      }
      if (e.pointerType === 'mouse') {
        this.hover = p;
        this.hoverMoved = true;
        this.mouseT = performance.now();
      }
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _first() {
    if (this._interacted) {
      this.onFirstInteraction?.(false);
      return;
    }
    this._interacted = true;
    this.onFirstInteraction?.(true);
  }

  // true while the mouse has been used recently (desktop aiming)
  get mouseAim() {
    return !this.isTouch && !!this.hover && performance.now() - (this.mouseT || 0) < 4000;
  }

  down(action) {
    for (const acts of this.held.values()) if (acts.includes(action)) return true;
    return false;
  }

  pressed(action) {
    return this.justPressed.has(action);
  }

  // Taps inside a rectangle this step
  tapIn(x, y, w, h) {
    const t = this.tap;
    return !!t && t.x >= x && t.x < x + w && t.y >= y && t.y < y + h;
  }

  consumeTap() {
    this.tap = null;
  }

  endStep() {
    this.justPressed.clear();
    this.tap = null;
    this.hoverMoved = false;
  }
}
