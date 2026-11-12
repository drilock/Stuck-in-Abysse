import { S } from '../engine/sprites.js';
import { rand } from '../engine/utils.js';
import { drawIcon } from './items.js';

// Crystals: the harvestable resource. Pickups: rare repair kits.
export class Crystal {
  constructor(x, y, kind = 'cristal') {
    this.kind = kind;
    const a = rand(0, Math.PI * 2);
    const v = rand(15, 45);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(a) * v;
    this.vy = Math.sin(a) * v;
    this.life = 25;
    this.t = Math.random() * 3;
    this.dead = false;
  }

  update(dt, player, magnet, canTake) {
    this.t += dt;
    this.life -= dt;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (player.alive && canTake && d < magnet) {
      const sp = 150 + player.speed;
      this.vx += ((dx / d) * sp - this.vx) * Math.min(1, dt * 8);
      this.vy += ((dy / d) * sp - this.vy) * Math.min(1, dt * 8);
    } else {
      this.vx *= Math.pow(0.3, dt);
      this.vy *= Math.pow(0.3, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0) this.dead = true;
  }

  render(r) {
    if (this.life < 2 && Math.floor(this.life * 10) % 2 === 0) return;
    if (this.kind === 'cristal') r.sprite(S.crystal, this.x, this.y, Math.floor(this.t * 6) % 3);
    else drawIcon(r, this.kind, this.x - 2, this.y - 2);
  }
}

export class Repair {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 7;
    this.h = 7;
    this.t = 0;
    this.dead = false;
  }

  update(dt) {
    this.t += dt;
    if (this.t > 30) this.dead = true;
  }

  render(r) {
    r.sprite(S.repair, this.x, this.y, Math.floor(this.t * 4) % 2);
  }
}
