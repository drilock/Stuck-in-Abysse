import { PALETTE } from '../engine/palette.js';
import { SHIELD_R } from './constants.js';
import { baseStats } from './progression.js';

// The home base: a ring station whose modules (lab, refinery, shield emitters, turrets)
// appear on the sprite as they are built. Procedural pixel art, palette colours only.
export const STATION_SIZE = 65;
const C = 32;
export const TURRET_SLOTS = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75];
const TURRET_R = 28;

function frame(f, nFrames, lv, hl, hlOn) {
  const c = document.createElement('canvas');
  c.width = STATION_SIZE;
  c.height = STATION_SIZE;
  const g = c.getContext('2d');
  const px = (x, y, col) => {
    g.fillStyle = PALETTE[col];
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const rot = (f / nFrames) * Math.PI * 0.5;
  for (let y = 0; y < STATION_SIZE; y++) {
    for (let x = 0; x < STATION_SIZE; x++) {
      const d = Math.hypot(x - C, y - C);
      if (d >= 19.5 && d < 23) px(x, y, d < 20.6 ? 2 : 1); // outer ring
      else if (d < 7.5) px(x, y, d < 3 ? 4 : d < 5.5 ? 2 : 1); // hub
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let r = 8; r < 20; r++) px(C + ca * r, C + sa * r, 1);
    for (let r = 12; r < 17; r++) {
      for (let w = -2; w <= 2; w++) px(C + ca * r - sa * w, C + sa * r + ca * w, Math.abs(w) === 2 ? 1 : 2);
    }
    px(C + ca * 14.5, C + sa * 14.5, 3);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - rot * 2;
    px(C + Math.cos(a) * 21, C + Math.sin(a) * 21, (k + f) % 4 === 0 ? 4 : 3);
  }

  // modules: level n drawn; the highlighted next level blinks in the light colour
  const level = (id) => lv[id] + (hl && hl.id === id && hlOn ? 1 : 0);
  const tint = (id, n, col) => (hl && hl.id === id && hlOn && n === lv[id] + 1 ? 4 : col);
  const box = (x0, y0, w, h, id, n, fill, edge) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const border = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
        px(x, y, tint(id, n, border ? edge : fill));
      }
    }
  };

  // LAB: research tower above the ring; each level adds a floor with lit windows
  const lab = level('lab');
  for (let n = 1; n <= lab; n++) {
    const y0 = 10 - n * 3;
    const w = 13 - n * 2;
    box(C - (w >> 1), y0, w, 4, 'lab', n, 2, 1);
    for (let k = 0; k < n; k++) px(C - n + 1 + k * 2, y0 + 1, tint('lab', n, 3));
  }
  if (lab) {
    const top = 10 - lab * 3;
    px(C, top - 1, tint('lab', lab, 1));
    px(C, top - 2, tint('lab', lab, 4)); // antenna light
  }

  // REFINERY: ore tanks under the ring, one per level
  const ref = level('refinery');
  for (let n = 1; n <= ref; n++) {
    const x0 = C - 13 + (n - 1) * 7;
    box(x0, 55, 6, 8, 'refinery', n, 3, 1);
    px(x0 + 2, 54, tint('refinery', n, 1));
    px(x0 + 2, 53, tint('refinery', n, 4));
  }

  // SHIELD pylons on both sides, one segment per level
  const sh = level('shield');
  for (let n = 1; n <= sh; n++) {
    const y0 = C - 9 + (n - 1) * 5;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 2 : STATION_SIZE - 8;
      box(x0, y0, 6, 4, 'shield', n, 2, 1);
      px(side < 0 ? x0 : x0 + 5, y0 + 1, tint('shield', n, 4));
    }
  }

  // TURRET platforms on the diagonals (the guns are drawn live so they can aim)
  const tu = level('turret');
  for (let n = 1; n <= tu; n++) {
    const a = TURRET_SLOTS[n - 1];
    const x = C + Math.cos(a) * TURRET_R;
    const y = C + Math.sin(a) * TURRET_R;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m <= 4) px(x + dx, y + dy, tint('turret', n, m >= 4 ? 2 : m === 0 ? 4 : 1));
      }
    }
  }
  return c;
}

export function buildStation(levels, hl = null, hlOn = false) {
  const n = 12;
  const frames = Array.from({ length: n }, (_, i) => frame(i, n, levels, hl, hlOn));
  return { w: STATION_SIZE, h: STATION_SIZE, frames, flash: frames };
}

export class Station {
  constructor(x, y, levels) {
    this.x = x;
    this.y = y;
    this.t = 0;
    this.hitT = 0;
    this.calmT = 0;
    this.rebuild(levels);
    this.hp = this.stats.maxHp;
  }

  rebuild(levels) {
    const prevMax = this.stats ? this.stats.maxHp : null;
    this.levels = { ...levels };
    this.stats = baseStats(levels);
    this.spr = buildStation(levels);
    if (prevMax !== null) this.hp = Math.min(this.stats.maxHp, this.hp + Math.max(0, this.stats.maxHp - prevMax));
    this.turrets = TURRET_SLOTS.slice(0, this.stats.turrets).map((a) => ({
      x: this.x + Math.cos(a) * TURRET_R,
      y: this.y + Math.sin(a) * TURRET_R,
      aim: a,
      cool: Math.random() * 0.5,
    }));
  }

  damage(n) {
    this.hp -= n;
    this.hitT = 0.15;
    this.calmT = 3;
  }

  update(dt, play) {
    this.t += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.calmT > 0) this.calmT -= dt;
    else this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    // turrets: track and shoot the nearest invader in range
    for (const tu of this.turrets) {
      tu.cool -= dt;
      const e = play.nearestEnemy(tu.x, tu.y, this.stats.turretRange);
      if (!e) continue;
      const a = Math.atan2(e.y - tu.y, e.x - tu.x);
      let diff = Math.atan2(Math.sin(a - tu.aim), Math.cos(a - tu.aim));
      tu.aim += Math.max(-6 * dt, Math.min(6 * dt, diff));
      diff = Math.atan2(Math.sin(a - tu.aim), Math.cos(a - tu.aim));
      if (tu.cool <= 0 && Math.abs(diff) < 0.2) {
        tu.cool = this.stats.turretCd;
        play.turretShot(tu.x + Math.cos(tu.aim) * 4, tu.y + Math.sin(tu.aim) * 4, tu.aim);
      }
    }
  }

  render(r) {
    r.sprite(this.spr, this.x, this.y, Math.floor(this.t * 3));
    for (const tu of this.turrets) {
      for (let k = 1; k <= 4; k++) r.rect(tu.x + Math.cos(tu.aim) * k, tu.y + Math.sin(tu.aim) * k, 1, 1, k === 4 ? 4 : 2);
      r.rect(tu.x, tu.y, 1, 1, 4);
    }
    // dotted shield bubble, brighter when struck
    const n = 120;
    const hit = this.hitT > 0;
    const off = this.t * 0.25;
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * Math.PI * 2 + off;
      const c = hit ? 4 : i % 10 === 0 ? 2 : 1;
      r.rect(this.x + Math.cos(a) * SHIELD_R, this.y + Math.sin(a) * SHIELD_R, 1, 1, c);
    }
  }
}
