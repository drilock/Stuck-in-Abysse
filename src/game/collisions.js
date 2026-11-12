import { SHIELD_R } from './constants.js';

// Axis-aligned box overlap between two centred entities (x, y, w, h).
export const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

export function resolveCollisions(p) {
  const pl = p.player;
  const enemies = p.enemies.list;
  const st = p.station;

  // player shots -> invaders, asteroids
  for (const b of p.pBullets) {
    for (const e of enemies) {
      if (e.alive && overlap(b, e)) {
        p.damageEnemy(e, b.dmg);
        b.dead = true;
        break;
      }
    }
    if (b.dead) continue;
    for (const a of p.asteroids) {
      if (!a.dead && overlap(b, a)) {
        p.damageAsteroid(a, b.dmg);
        b.dead = true;
        break;
      }
    }
    if (b.dead) continue;
    for (const c of p.crates) {
      if (!c.dead && overlap(b, c)) {
        p.damageCrate(c, b.dmg);
        b.dead = true;
        break;
      }
    }
  }

  // enemy shots -> base shield, asteroids (cover), player
  for (const b of p.eBullets) {
    if (p.atHome && Math.hypot(b.x - st.x, b.y - st.y) < SHIELD_R) {
      b.dead = true;
      p.baseHit(1);
      p.fx.burst(b.x, b.y, 3, [2, 4], 25, 0.25);
      continue;
    }
    for (const a of p.asteroids) {
      if (!a.dead && overlap(b, a)) {
        b.dead = true;
        p.fx.burst(b.x, b.y, 3, [1, 4], 30, 0.25);
        break;
      }
    }
    if (!b.dead && pl.alive && overlap(b, pl)) {
      b.dead = true;
      p.playerHit();
    }
  }

  if (!pl.alive) return;

  // ship vs asteroids: bounce off, damage on a hard hit
  for (const a of p.asteroids) {
    if (a.dead) continue;
    const dx = pl.x - a.x;
    const dy = pl.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const min = a.def.r + 4;
    if (d < min) {
      const impact = pl.speed;
      pl.x = a.x + (dx / d) * min;
      pl.y = a.y + (dy / d) * min;
      const vn = pl.vx * (dx / d) + pl.vy * (dy / d);
      if (vn < 0) {
        pl.vx -= 1.3 * vn * (dx / d);
        pl.vy -= 1.3 * vn * (dy / d);
      }
      // only a full-speed crash hurts; gentle contact just slides off
      if (impact > pl.stats.speed * 0.85 && -vn > pl.stats.speed * 0.6) {
        p.playerHit();
        p.damageAsteroid(a, 2);
      }
    }
  }

  for (const e of enemies) {
    if ((e.type === 'fast' || e.type === 'basic') && e.alive && overlap(e, pl)) {
      p.playerHit();
      p.damageEnemy(e, 99);
    }
  }
  const room = pl.cargo < pl.stats.cargo;
  for (const c of p.crystals) {
    if (room && !c.dead && Math.abs(c.x - pl.x) < 8 && Math.abs(c.y - pl.y) < 8) {
      c.dead = true;
      p.collectCrystal(c);
      if (pl.cargo >= pl.stats.cargo) break;
    }
  }
  for (const k of p.pickups) {
    if (!k.dead && overlap(k, pl)) {
      k.dead = true;
      p.collectRepair(k);
    }
  }
}
