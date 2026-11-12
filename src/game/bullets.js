
export function makeBullet(x, y, vx, vy, dmg = 1, w = 1, h = 5) {
  return { x, y, vx, vy, dmg, w, h, dead: false, life: 1.4 };
}

export function updateBullets(list, dt) {
  for (const b of list) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) b.dead = true;
  }
}

export function renderPlayerBullets(r, list) {
  // short streak along the travel direction: bright head, teal tail
  for (const b of list) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    r.rect(b.x, b.y, 1, 1, 4);
    for (let k = 1; k <= 3; k++) r.rect(b.x - ux * k, b.y - uy * k, 1, 1, 2);
  }
}

export function renderEnemyBullets(r, list, t) {
  const f = Math.floor(t * 12) % 2;
  for (const b of list) {
    const x = Math.round(b.x) - 1;
    const y = Math.round(b.y) - 2;
    for (let i = 0; i < 4; i++) r.rect(x + ((i + f) % 2), y + i, 1, 1, 4);
  }
}
