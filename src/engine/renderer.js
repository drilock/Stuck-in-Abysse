import { PALETTE } from './palette.js';

// Low internal resolution, scaled up with nearest-neighbour (no blur).
export const W = 240;
export const H = 320;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.ox = 0; // world offset (screen shake), always integer
    this.oy = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let s = Math.min(vw / W, vh / H);
    if (s >= 2) s = Math.floor(s); // integer scale whenever possible: perfectly square pixels
    this.scale = s;
    this.canvas.style.width = `${Math.floor(W * s)}px`;
    this.canvas.style.height = `${Math.floor(H * s)}px`;
  }

  clear(c = 0) {
    this.ctx.fillStyle = PALETTE[c];
    this.ctx.fillRect(0, 0, W, H);
  }

  rect(x, y, w, h, c) {
    this.ctx.fillStyle = PALETTE[c];
    this.ctx.fillRect(Math.round(x) + this.ox, Math.round(y) + this.oy, w, h);
  }

  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y + 1, 1, h - 2, c);
    this.rect(x + w - 1, y + 1, 1, h - 2, c);
  }

  // Pixel circle outline (no anti-aliasing): plots integer points.
  ring(cx, cy, r, c, thick = 1) {
    if (r < 0.5) return this.rect(cx, cy, 1, 1, c);
    const n = Math.max(8, Math.floor(r * 4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.rect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, thick, thick, c);
    }
  }

  // Draw a sprite centred on (x, y).
  sprite(spr, x, y, frame = 0, flash = false, scale = 1) {
    const img = (flash ? spr.flash : spr.frames)[frame % spr.frames.length];
    const w = spr.w * scale;
    const h = spr.h * scale;
    this.ctx.drawImage(img, Math.round(x) - (w >> 1) + this.ox, Math.round(y) - (h >> 1) + this.oy, w, h);
  }
}
