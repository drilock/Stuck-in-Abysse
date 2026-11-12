import { W, H } from '../engine/renderer.js';
import { theme } from '../engine/palette.js';

const SPEEDS = [5, 12, 26];
const PARALLAX = [0.1, 0.3, 0.6];
const RISE = [2, 5, 12];

export class Starfield {
  constructor() {
    this.stars = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      layer: i < 38 ? 0 : i < 62 ? 1 : 2,
      tw: Math.random() * 10,
    }));
  }

  update(dt, speed = 1) {
    for (const s of this.stars) {
      // stars fall in space, bubbles rise in the abyss
      s.y += SPEEDS[s.layer] * dt * speed * (theme === 'abyss' ? -1 : 1);
      if (s.y >= H || s.y < 0) {
        s.y = (s.y + H) % H;
        s.x = Math.random() * W;
      }
    }
  }

  // camX/camY give parallax when the camera moves through the world
  render(r, t, camX = 0, camY = 0) {
    const ox = r.ox;
    const oy = r.oy;
    r.ox = 0;
    r.oy = 0;
    for (const s of this.stars) {
      const f = PARALLAX[s.layer];
      const x = (((s.x - camX * f) % W) + W) % W;
      if (theme === 'abyss') {
        // drifting particles + rising bubbles (gentle sway)
        const rise = camY !== 0 || camX !== 0 ? RISE[s.layer] * t : 0;
        const y = (((s.y - camY * f - rise) % H) + H) % H;
        const bx = x + Math.round(Math.sin(t * 1.5 + s.tw) * (s.layer === 2 ? 1 : 0));
        if (s.layer === 0) r.rect(bx, y, 1, 1, 1);
        else if (s.layer === 1) r.rect(bx, y, 1, 1, Math.floor(t * 2 + s.tw) % 5 === 0 ? 3 : 1);
        else if (s.tw > 5) {
          r.rect(bx, y - 1, 1, 1, 2); // 3x3 hollow bubble
          r.rect(bx - 1, y, 1, 1, 2);
          r.rect(bx + 1, y, 1, 1, 2);
          r.rect(bx, y + 1, 1, 1, 2);
        } else r.rect(bx, y, 1, 1, 2);
        continue;
      }
      const y = (((s.y - camY * f) % H) + H) % H;
      if (s.layer === 0) r.rect(x, y, 1, 1, 1);
      else if (s.layer === 1) r.rect(x, y, 1, 1, Math.floor(t * 3 + s.tw) % 7 === 0 ? 1 : 4);
      else r.rect(x, y, 1, 1, 4);
    }
    r.ox = ox;
    r.oy = oy;
  }
}
