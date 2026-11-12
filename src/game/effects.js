import { drawText } from '../engine/font.js';
import { rand, pick } from '../engine/utils.js';

// Particles, pixel rings and floating score text. Palette colours only, no alpha.
export class Effects {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
  }

  burst(x, y, n, colors, speed = 60, life = 0.5, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(speed * 0.3, speed);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(life * 0.5, life), c: pick(colors), s: size });
    }
  }

  ring(x, y, maxR, c, speed = 90) {
    this.rings.push({ x, y, r: 1, maxR, c, speed });
  }

  text(x, y, str, c) {
    this.texts.push({ x, y, str, c, life: 0.8 });
  }

  update(dt) {
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.noDrag) {
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.r += r.speed * dt;
    this.rings = this.rings.filter((r) => r.r < r.maxR);
    for (const t of this.texts) {
      t.y -= 14 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  render(r) {
    for (const p of this.parts) {
      if (p.wake) {
        // dissolve: brighter tone steps down to the dark one, then sparse pixels before vanishing
        if (p.life < 0.15 && (Math.floor(p.x + p.y) & 1)) continue;
        const c = p.life < 0.3 ? 1 : p.c;
        if (p.bubble && p.life > 0.3) {
          r.rect(p.x, p.y - 1, 1, 1, c); r.rect(p.x - 1, p.y, 1, 1, c);
          r.rect(p.x + 1, p.y, 1, 1, c); r.rect(p.x, p.y + 1, 1, 1, c);
        } else r.rect(p.x, p.y, 1, 1, c);
        continue;
      }
      if (p.bubble) {
        r.rect(p.x, p.y - 1, 1, 1, p.c);
        r.rect(p.x - 1, p.y, 1, 1, p.c);
        r.rect(p.x + 1, p.y, 1, 1, p.c);
        r.rect(p.x, p.y + 1, 1, 1, p.c);
      } else r.rect(p.x, p.y, p.s, p.s, p.c);
    }
    for (const ring of this.rings) r.ring(ring.x, ring.y, ring.r, ring.c);
  }

  renderTexts(r) {
    for (const t of this.texts) if (t.life > 0.2 || Math.floor(t.life * 20) % 2) drawText(r, t.str, t.x, t.y, t.c, 1, 'center');
  }
}
