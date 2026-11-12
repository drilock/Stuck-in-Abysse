import { S } from '../engine/sprites.js';
import { rand, pick } from '../engine/utils.js';

export const SIZES = {
  s: { r: 4, hp: 2, drop: [1, 2], score: 5 },
  m: { r: 7, hp: 4, drop: [2, 4], score: 10 },
  l: { r: 10, hp: 7, drop: [4, 7], score: 20 },
  // ore extracted by laser: s=2, m=5, l=10
};

export class Asteroid {
  constructor(size, x, y, wave, vx = rand(-9, 9), vy = rand(-9, 9)) {
    const def = SIZES[size];
    this.size = size;
    this.def = def;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.w = def.r * 2 - 1;
    this.h = def.r * 2 - 1;
    this.hp = def.hp + Math.floor(wave / 4);
    this.ore = def.drop[1] + (size === 'l' ? 3 : size === 'm' ? 1 : 0); // crystals the laser can extract
    this.spr = pick(S.asteroids[size]);
    this.rot = Math.random() * 8;
    this.spin = rand(-3, 3);
    this.flash = 0;
    this.dead = false;
  }

  // Spawns somewhere in the sector, away from the player's view and from the base.
  static spawn(play) {
    const z = play.zone;
    let x = 0;
    let y = 0;
    for (let k = 0; k < 20; k++) {
      x = rand(20, z.size - 20);
      y = rand(20, z.size - 20);
      const far = Math.hypot(x - play.player.x, y - play.player.y) > 190;
      const clear = Math.hypot(x - play.anchor.x, y - play.anchor.y) > 100 && !play.sector.gates.some((g) => Math.hypot(x - g.x, y - g.y) < 40);
      if (far && clear) break;
    }
    // the further from the base, the bigger and richer the rocks
    const dg = play.enemies.danger(x, y);
    const roll = Math.random();
    const size = roll < 0.45 - dg * 0.25 ? 's' : roll < 1 - z.rich - dg * 0.25 ? 'm' : 'l';
    const a = new Asteroid(size, x, y, 0);
    // vent fields hold the richest ore
    const vent = play.sector.biomeAt(x, y) === 'vent';
    a.ore = Math.round(a.ore * (1 + dg * 1.2) * (vent ? 1.6 : 1));
    a.rich = dg > 0.6 || vent;
    // what the laser extracts: vents give magmatite, the deep sometimes hides abyssal nodules
    a.kind = 'cristal';
    if (vent && Math.random() < 0.7) a.kind = 'magmatite';
    if (play.depth >= 2 && Math.random() < 0.06 + play.depth * 0.03) {
      a.kind = 'nodule';
      a.ore = Math.min(a.ore, 3);
      a.rich = true;
    }
    // rich rocks use the sprites with crystal veins, others the plain ones
    const variants = S.asteroids[size];
    a.spr = variants[a.rich ? (size === 'l' ? 0 : 1) : size === 'l' ? 1 : pick([0, 2])];
    return a;
  }

  update(dt, size) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.flash > 0) this.flash -= dt;
    if ((this.x < 10 && this.vx < 0) || (this.x > size - 10 && this.vx > 0)) this.vx = -this.vx;
    if ((this.y < 10 && this.vy < 0) || (this.y > size - 10 && this.vy > 0)) this.vy = -this.vy;
  }

  render(r) {
    const f = ((Math.floor(this.rot) % 8) + 8) % 8;
    r.sprite(this.spr, this.x, this.y, f, this.flash > 0);
  }
}
