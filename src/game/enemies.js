import { S } from '../engine/sprites.js';
import { rand, clamp, chance, pick } from '../engine/utils.js';
import { SHIELD_R } from './constants.js';

export const ENEMY = {
  basic: { score: 10 },
  fast: { score: 25 },
  tank: { score: 40 },
  boss: { score: 0 }, // computed from the raid number
};

export const isBossRaid = (n) => n % 3 === 0;

// Invaders live in the sector as roaming patrols (more and tougher far from the base),
// and periodically launch raids against the base.
export class EnemyManager {
  constructor(play) {
    this.p = play;
    this.list = [];
    this.queue = []; // raid units waiting to enter the sector
    this.frame = 0;
    this.anim = 0;
    this.patrolT = 1;
    this.raidN = 0;
  }

  get boss() {
    return this.list.find((e) => e.type === 'boss') || null;
  }

  get raiders() {
    return this.list.filter((e) => e.mode === 'raid');
  }

  get raidRemaining() {
    return this.queue.length + this.raiders.length;
  }

  // 0 near the base, 1 at the far reaches of the sector
  danger(x, y) {
    const a = this.p.anchor;
    return clamp(this.p.zone.dangerBase + (Math.hypot(x - a.x, y - a.y) - 220) / 520, 0, 1);
  }

  make(type, x, y, mode, tier) {
    const extra = this.p.zone.enemyHp + tier;
    const e = { type, mode, x, y, vx: 0, vy: 0, flash: 0, t: Math.random() * 10, fireT: rand(1.5, 3), alive: true, aggro: false, hx: x, hy: y, wx: x, wy: y };
    if (type === 'basic') Object.assign(e, { hp: 1 + extra, w: 11, h: 8, speed: 36 + tier * 6 });
    if (type === 'fast') Object.assign(e, { hp: 1 + Math.floor(extra / 2), w: 11, h: 6, speed: 90 + tier * 10 });
    if (type === 'tank') Object.assign(e, { hp: 4 + extra * 2, w: 11, h: 8, speed: 22 });
    if (type === 'boss') Object.assign(e, { hp: 50 + extra * 15, w: 27, h: 14, speed: 30, pat: 0 });
    e.maxHp = e.hp;
    e.tier = tier;
    this.list.push(e);
    return e;
  }

  // ---------------------------------------------------------------- patrols
  patrolCount() {
    return this.list.filter((e) => e.mode === 'patrol').length;
  }

  spawnPatrol() {
    const p = this.p;
    const size = p.zone.size;
    let x = 0;
    let y = 0;
    let ok = false;
    for (let k = 0; k < 25 && !ok; k++) {
      x = rand(30, size - 30);
      y = rand(30, size - 30);
      ok = Math.hypot(x - p.player.x, y - p.player.y) > 260 && Math.hypot(x - p.anchor.x, y - p.anchor.y) > 280;
    }
    if (!ok) return;
    const dg = this.danger(x, y);
    const tier = Math.floor(dg * 2.2);
    const types = dg < 0.3 ? ['basic'] : dg < 0.65 ? ['basic', 'basic', 'fast'] : ['basic', 'fast', 'tank'];
    const n = dg < 0.3 ? 2 : 3;
    for (let i = 0; i < n; i++) this.make(pick(types), x + rand(-20, 20), y + rand(-20, 20), 'patrol', tier);
  }

  // ---------------------------------------------------------------- raids
  startRaid(n, side) {
    this.raidN = n;
    const q = [];
    for (let i = 0; i < Math.min(3 + n * 2, 16); i++) q.push('basic');
    if (n >= 2) for (let i = 0; i < Math.min(n, 6); i++) q.push('fast');
    if (n >= 3) for (let i = 0; i < Math.floor(n / 2); i++) q.push('tank');
    if (isBossRaid(n)) q.push('boss');
    this.queue = q;
    this.raidSide = side;
    this.spawnT = 0;
  }

  raidEntry() {
    // raiders appear ~460px from the base, on the announced side
    const st = this.p.station;
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][this.raidSide] + rand(-0.35, 0.35);
    return [st.x + Math.cos(a) * 460, st.y + Math.sin(a) * 460];
  }

  // ---------------------------------------------------------------- update
  animate(dt) {
    this.anim += dt;
    if (this.anim > 0.4) {
      this.anim = 0;
      this.frame ^= 1;
    }
    for (const e of this.list) if (e.flash > 0) e.flash -= dt;
  }

  update(dt) {
    const p = this.p;
    const pl = p.player;
    const st = p.station;
    this.animate(dt);

    // keep the sector populated with patrols (slowly more over time)
    this.patrolT -= dt;
    const target = Math.min(6 + Math.floor(p.time / 60), 14);
    if (this.patrolT <= 0) {
      this.patrolT = 2.5;
      if (this.patrolCount() < target * 2.5) this.spawnPatrol();
    }

    // raid units arrive one by one from the chosen edge
    if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = rand(0.4, 0.9);
        const [x, y] = this.raidEntry();
        const e = this.make(this.queue.shift(), x, y, 'raid', Math.floor(this.raidN / 3));
        if (e.type === 'boss') p.g.audio.play('boss');
      }
    }

    const shoot = (e, tx, ty, speed, spread = 0, count = 1) => {
      const base = Math.atan2(ty - e.y, tx - e.x);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spread;
        p.enemyShot(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, e.mode === 'raid');
      }
    };

    for (const e of this.list) {
      e.t += dt;
      const dx = pl.x - e.x;
      const dy = pl.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const bx = st.x - e.x;
      const by = st.y - e.y;
      const bd = Math.hypot(bx, by) || 1;

      // who are we after?
      if (e.mode === 'patrol') {
        // kelp hides the ship: patrols only notice it point-blank
        if (pl.alive && d < (p.hidden ? 36 : 130)) e.aggro = true;
        if (!pl.alive || d > (p.hidden ? 110 : 320)) e.aggro = false;
      } else {
        e.aggro = pl.alive && d < (e.type === 'boss' ? 140 : 90);
      }
      const huntPlayer = e.aggro;
      const huntBase = e.mode === 'raid' && !huntPlayer;

      let tx = 0;
      let ty = 0;
      let speed = e.speed;
      if (huntPlayer) {
        if (e.type === 'basic') {
          const orbit = d < 70 ? 1 : 0;
          tx = (dx / d) * (1 - orbit) + (-dy / d) * orbit * 0.8 + Math.sin(e.t * 2.3) * 0.4;
          ty = (dy / d) * (1 - orbit) + (dx / d) * orbit * 0.8 + Math.cos(e.t * 1.9) * 0.4;
        } else if (e.type === 'fast') {
          tx = dx / d;
          ty = dy / d;
        } else if (e.type === 'tank') {
          tx = d > 90 ? dx / d : 0;
          ty = d > 90 ? dy / d : 0;
        } else {
          const keep = d > 110 ? 1 : d < 80 ? -1 : 0;
          tx = (dx / d) * keep + (-dy / d) * 0.6;
          ty = (dy / d) * keep + (dx / d) * 0.6;
        }
      } else if (huntBase) {
        // close in on the base, then circle just outside the shield
        const ring = SHIELD_R + (e.type === 'boss' ? 40 : 20);
        const inward = bd > ring + 6 ? 1 : bd < ring - 6 ? -1 : 0;
        tx = (bx / bd) * inward + (-by / bd) * 0.7;
        ty = (by / bd) * inward + (bx / bd) * 0.7;
        if (bd > ring + 60) speed *= 1.7; // rush in
      } else {
        // calm patrol: drift between random points around home
        if (Math.hypot(e.wx - e.x, e.wy - e.y) < 8 || chance(dt * 0.15)) {
          e.wx = clamp(e.hx + rand(-90, 90), 10, p.zone.size - 10);
          e.wy = clamp(e.hy + rand(-90, 90), 10, p.zone.size - 10);
        }
        const wx = e.wx - e.x;
        const wy = e.wy - e.y;
        const wd = Math.hypot(wx, wy) || 1;
        tx = wx / wd;
        ty = wy / wd;
        speed *= 0.45;
      }
      const tl = Math.hypot(tx, ty) || 1;
      const acc = e.type === 'fast' ? 4 : 2.5;
      e.vx += ((tx / tl) * speed - e.vx) * Math.min(1, dt * acc);
      e.vy += ((ty / tl) * speed - e.vy) * Math.min(1, dt * acc);
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // the base shield repels invaders
      const sd = Math.hypot(e.x - st.x, e.y - st.y) || 1;
      const minD = SHIELD_R + e.w / 2 + 2;
      if (p.atHome && sd < minD) {
        e.x = st.x + ((e.x - st.x) / sd) * minD;
        e.y = st.y + ((e.y - st.y) / sd) * minD;
      }

      // recycle calm patrols that are far away, so the sector keeps changing
      if (e.mode === 'patrol' && !e.aggro && d > 900) e.alive = false;

      // firing
      const targetPlayer = huntPlayer && d < 170;
      const targetBase = huntBase && bd < SHIELD_R + 70;
      if (!targetPlayer && !targetBase) continue;
      e.fireT -= dt;
      if (e.fireT > 0) continue;
      const [fx, fy] = targetPlayer ? [pl.x, pl.y] : [st.x, st.y];
      if (e.type === 'basic') {
        e.fireT = rand(2.2, 3.4) * (e.mode === 'raid' ? 0.8 : 1);
        shoot(e, fx, fy, 75 + e.tier * 12);
      } else if (e.type === 'tank') {
        e.fireT = rand(2.2, 3);
        shoot(e, fx, fy, 80, 0.22, 3);
      } else if (e.type === 'boss') {
        e.fireT = 1.4;
        const enraged = e.hp < e.maxHp / 2;
        if (e.pat === 0) shoot(e, fx, fy, 80, 0.25, 5);
        else if (e.pat === 1) shoot(e, fx, fy, 105, 0.1, 3);
        else for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + e.t;
          p.enemyShot(e.x, e.y, Math.cos(a) * 65, Math.sin(a) * 65, true);
        }
        e.pat = (e.pat + 1) % (enraged ? 3 : 2);
      } else e.fireT = 99;
    }
    this.list = this.list.filter((e) => e.alive);

    // keep invaders from stacking (only the ones near the player matter)
    const L = this.list.filter((e) => Math.abs(e.x - pl.x) < 200 && Math.abs(e.y - pl.y) < 200);
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i];
        const b = L[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = (a.w + b.w) / 2 + 2;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }

  remove(e) {
    e.alive = false;
    this.list = this.list.filter((x) => x !== e);
  }

  render(r, vis) {
    for (const e of this.list) {
      if (!vis(e)) continue;
      if (e.type === 'basic') r.sprite(S.basic, e.x, e.y, this.frame, e.flash > 0);
      else if (e.type === 'tank') r.sprite(e.hp < e.maxHp ? S.tankCracked : S.tank, e.x, e.y, this.frame, e.flash > 0);
      else if (e.type === 'fast') r.sprite(S.fast, e.x, e.y, Math.floor(e.t * 8) % 2, e.flash > 0);
      else r.sprite(S.boss, e.x, e.y, this.frame, e.flash > 0);
    }
  }
}
