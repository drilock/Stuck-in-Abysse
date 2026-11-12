import { W } from '../engine/renderer.js';
import { drawText } from '../engine/font.js';

// Vertical arcade button list: keyboard (up/down/enter), mouse hover/click, touch tap.
export class ButtonList {
  constructor(game, items, { y, w = 120, h = 15, gap = 5, cx = W / 2, sel = 0, delay = 0 } = {}) {
    this.g = game;
    this.items = items;
    this.y = y;
    this.w = w;
    this.h = h;
    this.gap = gap;
    this.cx = cx;
    this.sel = sel;
    this.delay = delay; // ignore input briefly (avoid accidental presses)
    this.t = 0;
  }

  rectOf(i) {
    return { x: Math.round(this.cx - this.w / 2), y: this.y + i * (this.h + this.gap), w: this.w, h: this.h };
  }

  move(d) {
    this.sel = (this.sel + d + this.items.length) % this.items.length;
    this.g.audio.play('select');
  }

  update(dt) {
    this.t += dt;
    if (this.t < this.delay) return;
    const inp = this.g.input;
    if (inp.pressed('up')) this.move(-1);
    if (inp.pressed('down')) this.move(1);
    if (inp.hoverMoved && inp.hover) {
      this.items.forEach((_, i) => {
        const r = this.rectOf(i);
        if (i !== this.sel && inp.hover.x >= r.x && inp.hover.x < r.x + r.w && inp.hover.y >= r.y && inp.hover.y < r.y + r.h) {
          this.sel = i;
          this.g.audio.play('select');
        }
      });
    }
    for (let i = 0; i < this.items.length; i++) {
      const r = this.rectOf(i);
      if (inp.tapIn(r.x, r.y, r.w, r.h)) {
        inp.consumeTap();
        this.sel = i;
        this.activate(i);
        return;
      }
    }
    if (inp.pressed('confirm')) this.activate(this.sel);
  }

  activate(i) {
    this.g.audio.play('confirm');
    this.items[i].action();
  }

  render(r, t = 0) {
    const ready = this.t >= this.delay;
    this.items.forEach((it, i) => {
      const b = this.rectOf(i);
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (i === this.sel && ready) {
        r.rect(b.x, b.y, b.w, b.h, 2);
        drawText(r, label, b.x + b.w / 2, b.y + 5, 0, 1, 'center');
        if (Math.floor(t * 3) % 2 === 0) {
          drawText(r, '>', b.x - 6, b.y + 5, 4);
          drawText(r, '<', b.x + b.w + 3, b.y + 5, 4);
        }
      } else {
        r.rect(b.x, b.y, b.w, b.h, 0);
        r.frame(b.x, b.y, b.w, b.h, i === this.sel ? 4 : 2);
        drawText(r, label, b.x + b.w / 2, b.y + 5, 4, 1, 'center');
      }
    });
  }
}
