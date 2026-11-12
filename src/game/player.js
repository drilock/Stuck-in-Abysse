import { clamp } from '../engine/utils.js';
import { buildShip, muzzles, engines, DIRS } from './shipgen.js';
import { NOVA_BTN, MINE_BTN, TOUCH_BTNS, TOP, BOTTOM } from './constants.js';

const STEP = (Math.PI * 2) / DIRS;
const inBtn = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;

// Free-flying ship with inertia. Faces its direction of travel (16 directions).
export class Player {
  constructor(levels, stats, x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 9; // forgiving hitbox
    this.h = 9;
    this.angle = 0; // radians, clockwise from "up"
    this.dir = 0;
    this.cool = 0;
    this.inv = 0;
    this.energy = 0;
    this.cargo = 0;
    this.hold = {}; // resource -> count (cargo is the total)
    this.alive = true;
    this.t = 0;
    this.thrust = 0;
    this.stick = null; // touch joystick {sx, sy, x, y}
    this.stats = null;
    this.applyStats(stats);
    this.rebuild(levels);
  }

  rebuild(levels) {
    this.levels = { ...levels };
    this.spr = buildShip(levels);
  }

  applyStats(s) {
    if (!this.stats) this.hp = s.maxHp;
    else this.hp = Math.min(s.maxHp, this.hp + Math.max(0, s.maxHp - this.stats.maxHp));
    this.stats = s;
  }

  // Ship-space point (nose up) -> world point for the current facing
  toWorld(px, py) {
    const a = this.dir * STEP;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [this.x + px * c - py * s, this.y + px * s + py * c];
  }

  update(dt, play) {
    const inp = play.g.input;
    const s = this.stats;
    this.t += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.cool > 0) this.cool -= dt;

    let ix = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
    let iy = (inp.down('down') ? 1 : 0) - (inp.down('up') ? 1 : 0);
    let firing = inp.down('fire');
    let special = inp.pressed('special');
    let mining = inp.down('mine');

    // Pointers: mouse buttons fire (left) / mine (right); touch = joystick where the finger lands.
    this.stick = null;
    let touchMove = false;
    for (const p of inp.pointers.values()) {
      if (p.type === 'mouse') {
        if (p.button === 2) mining = true;
        else firing = true;
        continue;
      }
      const start = { x: p.sx, y: p.sy };
      if (inBtn(start, MINE_BTN)) mining = true;
      if (TOUCH_BTNS.some((b) => inBtn(start, b))) continue;
      if (p.sy <= TOP || p.sy >= BOTTOM) continue;
      this.stick = p;
      touchMove = true;
      const dx = p.x - p.sx;
      const dy = p.y - p.sy;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        ix = dx / Math.max(d, 16);
        iy = dy / Math.max(d, 16);
      }
    }
    if (inp.isTouch && inp.tapIn(NOVA_BTN.x, NOVA_BTN.y, NOVA_BTN.w, NOVA_BTN.h)) special = true;

    // ---- movement: responsive thrust, quick braking when you let go
    const mag = Math.min(1, Math.hypot(ix, iy));
    this.thrust = mag;
    if (mag > 0.05) {
      const n = Math.hypot(ix, iy);
      const acc = s.speed * 8;
      this.vx += (ix / n) * mag * acc * dt;
      this.vy += (iy / n) * mag * acc * dt;
      const drag = Math.pow(0.3, dt);
      this.vx *= drag;
      this.vy *= drag;
    } else {
      const brake = Math.pow(0.004, dt);
      this.vx *= brake;
      this.vy *= brake;
    }
    const sp = Math.hypot(this.vx, this.vy);
    const max = s.speed * Math.max(mag, 0.15);
    if (sp > max && mag > 0.05) {
      this.vx *= max / sp;
      this.vy *= max / sp;
    }
    const size = play.zone.size;
    this.x = clamp(this.x + this.vx * dt, 8, size - 8);
    this.y = clamp(this.y + this.vy * dt, 8, size - 8);

    // ---- aiming (independent from movement)
    // mining locks onto the nearest rock; mouse aims on desktop; touch auto-aims at the nearest invader
    this.lock = null;
    let aim = null;
    if (mining) {
      this.lock = play.nearestAsteroid(this.x, this.y, s.laserRange + 14);
      if (this.lock) aim = Math.atan2(this.lock.x - this.x, -(this.lock.y - this.y));
    }
    if (aim === null && inp.mouseAim) {
      const mx = play.camX + inp.hover.x;
      const my = play.camY + inp.hover.y;
      if (Math.hypot(mx - this.x, my - this.y) > 4) aim = Math.atan2(mx - this.x, -(my - this.y));
    }
    if (aim === null && inp.isTouch && !mining) {
      const foe = play.nearestEnemy(this.x, this.y, 150);
      if (foe) {
        aim = Math.atan2(foe.x - this.x, -(foe.y - this.y));
        if (touchMove || inp.pointers.size === 0) firing = true; // auto-fire on a target
      }
    }
    if (aim === null && mag > 0.05) aim = Math.atan2(ix, -iy);
    if (aim !== null) {
      let diff = aim - this.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.angle += clamp(diff, -18 * dt, 18 * dt);
    }
    this.dir = ((Math.round(this.angle / STEP) % DIRS) + DIRS) % DIRS;
    this.mining = mining;

    if (firing && !mining && this.cool <= 0) {
      this.cool = s.fireCd;
      for (const [mx, my, off] of muzzles(this.levels.power)) {
        const [wx, wy] = this.toWorld(mx, my);
        play.firePlayer(wx, wy, this.angle + off, s.dmg);
      }
      play.g.audio.play('shoot');
    }

    const wasFull = this.energy >= 100;
    this.energy = Math.min(100, this.energy + s.novaRegen * dt);
    if (!wasFull && this.energy >= 100) play.g.audio.play('novaready');
    if (special && this.energy >= 100) {
      this.energy = 0;
      play.nova(this.x, this.y);
    }
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  addEnergy(v) {
    this.energy = Math.min(100, this.energy + v);
  }

  render(r) {
    if (!this.alive) return;
    if (this.inv > 0 && Math.floor(this.inv * 15) % 2 === 0) return;
    // engine flames: length grows with thrust and speed level
    const lvl = this.levels.speed;
    const len = this.thrust > 0.05 ? 2 + Math.floor(lvl / 2) + (Math.floor(this.t * 20) % 2) : 1;
    const cols = [4, 4, 3, 3, 1, 1];
    for (const [ex, ey] of engines(lvl)) {
      for (let k = 0; k < len; k++) {
        const [fx, fy] = this.toWorld(ex, ey + 1 + k);
        r.rect(fx, fy, 1, 1, cols[Math.min(k, cols.length - 1)]);
      }
    }
    r.sprite(this.spr, this.x, this.y, this.dir);
  }
}

