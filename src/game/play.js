import { W } from '../engine/renderer.js';
import { drawText, drawBigShadow } from '../engine/font.js';
import { rand, randi, chance, clamp } from '../engine/utils.js';
import { Player } from './player.js';
import { EnemyManager, ENEMY, isBossRaid } from './enemies.js';
import { Asteroid } from './asteroids.js';
import { Crystal, Repair } from './resources.js';
import { Station } from './station.js';
import { Sector, sectorInfo } from './world.js';
import { RES, drawIcon } from './items.js';
import { makeBullet, updateBullets, renderPlayerBullets, renderEnemyBullets } from './bullets.js';
import { resolveCollisions, overlap } from './collisions.js';
import { Effects } from './effects.js';
import { computeStats, persist, recordScore } from './progression.js';
import { ButtonList } from '../ui/buttons.js';
import { drawHud, PAUSE_BTN } from '../ui/hud.js';
import { PALETTE, theme } from '../engine/palette.js';
import { TOP, BOTTOM, VIEW_H, DOCK_R, DOCK_BTN, SHIELD_R } from './constants.js';

const FIRST_RAID = 150; // seconds before the first base attack
const RAID_WARNING = 20;
const SIDES = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
const FOG_CELL = 40; // exploration grid (world px per cell)

// The in-game scene: explore an open sector, mine, upgrade the ship and the base, defend it from raids.
export class PlayScene {
  constructor(game) {
    this.g = game;
    this.zone = sectorInfo(0);
    const size = this.zone.size;
    this.station = new Station(size / 2, size / 2, game.save.base);
    this.stats = computeStats(game.save.upgrades);
    this.player = new Player(game.save.upgrades, this.stats, size / 2, size / 2 + SHIELD_R + 14);
    this.fx = new Effects();
    this.pBullets = [];
    this.eBullets = [];
    this.novas = [];
    this.runSeed = Math.floor(Math.random() * 1e9);
    this.sectors = {};
    this.depth = 0;
    this.maxDepth = 0;
    this.hidden = false;
    this.gateCd = 0;
    this.score = 0;
    this.deposited = 0;
    this.raidN = 0;
    this.raidsRepelled = 0;
    this.raid = null; // {side, n}
    this.raidT = FIRST_RAID;
    this.deaths = 0;
    this.time = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.paused = false;
    this.beam = null;
    this.phase = 'play';
    this.phaseT = 0;
    this.fogT = 0;
    this.loadSector(0);
    this.camX = this.player.x - W / 2;
    this.camY = this.player.y - TOP - VIEW_H / 2;
    this.reveal();
  }

  get atHome() {
    return this.depth === 0;
  }

  get anchor() {
    return this.sector.anchor;
  }

  // ---------------------------------------------------------------- sectors
  // Each depth is generated once per run and kept while you travel back and forth.
  loadSector(depth) {
    const KEYS = ['zone', 'sector', 'asteroids', 'crystals', 'pickups', 'crates', 'nodes', 'enemies', 'fog', 'fogN', 'fogCanvas', 'explored'];
    if (this.sector) {
      const keep = {};
      for (const k of KEYS) keep[k] = this[k];
      this.sectors[this.depth] = keep;
    }
    this.depth = depth;
    this.maxDepth = Math.max(this.maxDepth, depth);
    const saved = this.sectors[depth];
    if (saved) {
      Object.assign(this, saved);
      return;
    }
    this.zone = sectorInfo(depth);
    const size = this.zone.size;
    let anchor = { x: this.station.x, y: this.station.y };
    if (depth > 0) {
      const ar = Math.abs(Math.sin(this.runSeed + depth * 91.7));
      const aa = (this.runSeed % 628) / 100 + depth * 2.1;
      anchor = { x: size / 2 + Math.cos(aa) * (200 + ar * 400), y: size / 2 + Math.sin(aa) * (200 + ar * 400) };
    }
    this.sector = new Sector(depth, this.runSeed + depth * 7919, anchor);
    this.crates = this.sector.crates.map((c) => ({ x: c.x, y: c.y, w: 9, h: 7, hp: 3 + depth, flash: 0, dead: false }));
    this.nodes = this.sector.corals.map((c) => ({ x: c.x, y: c.y, w: 9, h: 9, p: c.p, kind: 'corail', ore: 4, regrow: 0, node: true }));
    this.asteroids = [];
    this.crystals = [];
    this.pickups = [];
    this.enemies = new EnemyManager(this);
    // exploration fog: one pixel per cell, drawn on the minimap
    const n = Math.ceil(size / FOG_CELL);
    this.fogN = n;
    this.fog = new Uint8Array(n * n);
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = n;
    this.fogCanvas.height = n;
    this.explored = 0;
    const px = this.player.x;
    const py = this.player.y;
    this.player.x = anchor.x; // spawn rocks and patrols away from the arrival point
    this.player.y = anchor.y;
    for (let i = 0; i < this.zone.asteroids; i++) this.asteroids.push(Asteroid.spawn(this));
    for (let i = 0; i < 5 + depth * 2; i++) this.enemies.spawnPatrol();
    this.player.x = px;
    this.player.y = py;
  }

  travel(depth) {
    this.loadSector(depth);
    const pl = this.player;
    if (depth === 0) {
      pl.x = this.station.x;
      pl.y = this.station.y + SHIELD_R + 14;
    } else {
      pl.x = this.anchor.x;
      pl.y = this.anchor.y + 6;
    }
    pl.vx = 0;
    pl.vy = 0;
    pl.inv = Math.max(pl.inv, 1.5);
    this.pBullets = [];
    this.eBullets = [];
    this.novas = [];
    this.beam = null;
    this.gateCd = 1.2;
    this.camX = pl.x - W / 2;
    this.camY = pl.y - TOP - VIEW_H / 2;
    this.warp = { t: 2.6, depth };
    this.reveal();
    this.g.audio.play('dock');
  }

  gateOpen(g) {
    return g.kind === 'home' || (this.g.save.base.lab || 0) >= sectorInfo(g.to).lab;
  }

  updateGates(dt) {
    const pl = this.player;
    this.gateCd -= dt;
    if (!pl.alive || this.gateCd > 0) return;
    for (const g of this.sector.gates) {
      if (Math.hypot(pl.x - g.x, pl.y - g.y) > 9) continue;
      this.gateCd = 1.5;
      if (this.raid && this.atHome) {
        this.fx.text(g.x, g.y - 16, 'DEFEND THE BASE FIRST', 4);
        this.g.audio.play('error');
      } else if (!this.gateOpen(g)) {
        this.fx.text(g.x, g.y - 16, `BUILD LAB LV ${sectorInfo(g.to).lab}`, 4);
        this.g.audio.play('error');
      } else this.travel(g.to);
      return;
    }
  }

  // Sector hazards and salvage: vent eruptions, kelp cover
  updateHazards(dt) {
    const pl = this.player;
    this.hideT = (this.hideT || 0) - dt;
    if (this.hideT <= 0) {
      this.hideT = 0.2;
      this.hidden = pl.alive && this.sector.hiddenInKelp(pl.x, pl.y, this.time);
    }
    for (const c of this.crates) if (c.flash > 0) c.flash -= dt;
    for (const n of this.nodes) if (n.ore <= 0 && (n.regrow -= dt) <= 0) n.ore = 4;
    for (const k of this.sector.kelp) {
      if (k.ore > 0) continue;
      k.regrow -= dt;
      k.L = Math.min(k.L0, k.L + dt * 1.2);
      if (k.regrow <= 0) {
        k.ore = 3;
        k.L = k.L0;
      }
    }
    if (!pl.alive) return;
    for (const v of this.sector.vents) {
      if (Math.abs(v.x - pl.x) > 30 || Math.abs(v.y - pl.y) > 30) continue;
      if (this.sector.ventState(v, this.time) === 'erupt' && Math.hypot(v.x - pl.x, v.y - pl.y) < 24 && pl.inv <= 0) {
        this.fx.text(pl.x, pl.y - 14, 'ERUPTION', 4);
        this.playerHit();
      }
    }
  }

  // ---------------------------------------------------------------- hold (ship cargo by resource)
  holdAdd(kind) {
    const pl = this.player;
    pl.cargo++;
    pl.hold[kind] = (pl.hold[kind] || 0) + 1;
  }

  // takes one unit out of the hold (rare resources last) and returns its kind
  holdTake() {
    const pl = this.player;
    for (const k of RES) {
      if (pl.hold[k] > 0) {
        pl.hold[k]--;
        pl.cargo--;
        return k;
      }
    }
    pl.cargo = 0;
    return null;
  }

  holdClear() {
    this.player.hold = {};
    this.player.cargo = 0;
  }

  store(kind, n) {
    const save = this.g.save;
    if (kind === 'cristal') save.bank += n;
    else save.store[kind] = (save.store[kind] || 0) + n;
  }

  damageCrate(c, dmg) {
    if (c.dead) return;
    c.hp -= dmg;
    c.flash = 0.07;
    this.fx.burst(c.x, c.y, 2, [1, 2], 25, 0.25);
    if (c.hp > 0) {
      this.g.audio.play('hit');
      return;
    }
    c.dead = true;
    this.fx.burst(c.x, c.y, 16, [2, 3, 4, 1], 50, 0.6);
    this.fx.text(c.x, c.y - 10, 'SALVAGE', 3);
    this.spawnCrystals(c.x, c.y, 4 + this.depth, 'ferraille');
    this.spawnCrystals(c.x, c.y, 2);
    if (chance(0.3)) this.pickups.push(new Repair(c.x, c.y));
    this.addScore(50);
    this.g.audio.play('rock');
  }

  get wave() {
    return this.raidN;
  }

  // Reveal the map around the ship
  reveal() {
    const pl = this.player;
    const R = 150;
    const n = this.fogN;
    const g = this.fogCanvas.getContext('2d');
    g.fillStyle = PALETTE[1];
    for (let cy = Math.floor((pl.y - R) / FOG_CELL); cy <= Math.floor((pl.y + R) / FOG_CELL); cy++) {
      for (let cx = Math.floor((pl.x - R) / FOG_CELL); cx <= Math.floor((pl.x + R) / FOG_CELL); cx++) {
        if (cx < 0 || cy < 0 || cx >= n || cy >= n || this.fog[cy * n + cx]) continue;
        if (Math.hypot((cx + 0.5) * FOG_CELL - pl.x, (cy + 0.5) * FOG_CELL - pl.y) > R) continue;
        this.fog[cy * n + cx] = 1;
        this.explored++;
        g.fillRect(cx, cy, 1, 1);
      }
    }
  }

  get exploredPct() {
    return Math.floor((100 * this.explored) / this.fog.length);
  }

  // ---------------------------------------------------------------- base raids
  startRaid() {
    this.raidN++;
    this.raid = { n: this.raidN, side: this.raidSide, hits: 0 };
    this.enemies.startRaid(this.raidN, this.raidSide);
    this.g.audio.play(isBossRaid(this.raidN) ? 'boss' : 'wave');
    this.shake(2, 0.3);
  }

  raidRepelled() {
    const n = this.raid.n;
    this.raid = null;
    this.raidsRepelled++;
    const bonus = 10 + n * 8;
    this.g.save.bank += bonus;
    this.score += 150 * n;
    this.raidReward = { bonus, t: 4 };
    this.raidT = rand(140, 200);
    this.raidSide = undefined;
    persist(this.g.save);
    this.g.audio.play('waveclear');
  }

  updateRaids(dt) {
    if (this.raid) {
      if (this.enemies.raidRemaining === 0) this.raidRepelled();
      return;
    }
    this.raidT -= dt;
    if (this.raidSide === undefined && this.raidT <= RAID_WARNING) {
      this.raidSide = Math.floor(Math.random() * 4);
      this.g.audio.play('boss');
    }
    if (this.raidT <= 0) this.startRaid();
  }

  get nearBase() {
    const pl = this.player;
    return this.atHome && pl.alive && Math.hypot(pl.x - this.station.x, pl.y - this.station.y) < DOCK_R + SHIELD_R * 0.5;
  }

  dock() {
    const pl = this.player;
    const n = pl.cargo;
    while (pl.cargo > 0) {
      const k = this.holdTake();
      if (!k) break;
      this.store(k, 1);
      this.deposited++;
      this.score += 2;
    }
    pl.hp = pl.stats.maxHp;
    pl.vx = 0;
    pl.vy = 0;
    this.eBullets = [];
    persist(this.g.save);
    this.g.audio.play(n > 0 ? 'deposit' : 'dock');
    this.g.openHangar(true, n);
  }

  // Called when leaving the hangar
  resume() {
    this.stats = computeStats(this.g.save.upgrades);
    this.player.applyStats(this.stats);
    this.player.hp = this.stats.maxHp;
    this.player.rebuild(this.g.save.upgrades);
    this.station.rebuild(this.g.save.base);
    this.player.x = this.station.x;
    this.player.y = this.station.y + SHIELD_R + 14;
    this.player.angle = Math.PI;
    this.player.inv = 1;
  }

  openPause() {
    this.paused = true;
    this.pauseMenu = new ButtonList(this.g, [
      { label: 'RESUME', action: () => { this.paused = false; } },
      { label: 'QUIT TO MENU', action: () => this.endRun(true) },
    ], { y: 150, w: 110 });
  }

  endRun(quit = false) {
    const rank = recordScore(this.g.save, this.score, this.raidsRepelled);
    persist(this.g.save);
    this.g.gameOver({ score: this.score, res: this.deposited, waves: this.raidsRepelled, explored: this.exploredPct, depth: this.maxDepth, rank, quit, baseLost: this.baseLost });
  }

  // ---------------------------------------------------------------- events
  firePlayer(x, y, angle, dmg) {
    const v = 250;
    const pl = this.player;
    this.pBullets.push(makeBullet(x, y, Math.sin(angle) * v + pl.vx * 0.5, -Math.cos(angle) * v + pl.vy * 0.5, dmg, 2, 2));
  }

  turretShot(x, y, a) {
    this.pBullets.push(makeBullet(x, y, Math.cos(a) * 220, Math.sin(a) * 220, 1, 2, 2));
    if (this.onScreen(x, y)) this.g.audio.play('shoot');
  }

  enemyShot(x, y, vx, vy) {
    this.eBullets.push(makeBullet(x, y, vx, vy, 1, 3, 3));
    if (this.onScreen(x, y)) this.g.audio.play('eshoot');
  }

  onScreen(x, y, m = 0) {
    return x > this.camX - m && x < this.camX + W + m && y > this.camY + TOP - m && y < this.camY + BOTTOM + m;
  }

  shake(mag, dur) {
    if (!this.g.save.settings.shake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  addScore(v, x, y) {
    this.score += v;
    if (x !== undefined) this.fx.text(x, y - 6, `${v}`, 4);
  }

  spawnCrystals(x, y, n, kind = 'cristal') {
    for (let i = 0; i < n; i++) this.crystals.push(new Crystal(x + rand(-3, 3), y + rand(-3, 3), kind));
  }

  harvestCount(base) {
    let n = base;
    for (let i = 0; i < base; i++) if (chance(this.stats.yieldBonus)) n++;
    return Math.round(n * this.zone.crystalMul);
  }

  damageEnemy(e, dmg) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.07;
    if (e.hp > 0) {
      this.g.audio.play('hit');
      return;
    }
    this.enemies.remove(e);
    if (e.type === 'boss') {
      this.addScore(300 + this.raidN * 40, e.x, e.y);
      this.fx.burst(e.x, e.y, 60, [4, 3, 2, 1], 110, 1.1, 2);
      this.fx.ring(e.x, e.y, 60, 4, 120);
      this.fx.ring(e.x, e.y, 40, 2, 80);
      this.spawnCrystals(e.x, e.y, this.harvestCount(12 + this.raidN));
      this.spawnCrystals(e.x, e.y, 1 + Math.floor(this.raidN / 3), 'nodule');
      this.pickups.push(new Repair(e.x, e.y));
      this.shake(4, 0.6);
      this.g.audio.play('bigexplode');
      return;
    }
    this.addScore(ENEMY[e.type].score, e.x, e.y);
    this.fx.burst(e.x, e.y, 12, [4, 4, 2, 1], 60, 0.45);
    this.fx.ring(e.x, e.y, 9, 4, 70);
    this.g.audio.play('explode');
    if (e.type === 'basic' && chance(0.25)) this.spawnCrystals(e.x, e.y, 1);
    if (e.type === 'fast') this.spawnCrystals(e.x, e.y, randi(1, 2));
    if (e.type === 'tank') {
      this.spawnCrystals(e.x, e.y, 2);
      if (chance(0.15)) this.pickups.push(new Repair(e.x, e.y));
    }
  }

  // Guns smash rocks (few crystals). The mining laser extracts their full ore.
  damageAsteroid(a, dmg) {
    a.hp -= dmg;
    a.flash = 0.06;
    this.fx.burst(a.x, a.y, 2, [1, 4], 30, 0.25);
    if (a.hp <= 0) this.destroyAsteroid(a, true);
    else this.g.audio.play('hit');
  }

  destroyAsteroid(a, reward) {
    if (a.dead) return;
    a.dead = true;
    const r = a.def.r;
    this.fx.burst(a.x, a.y, 6 + r * 2, [1, 1, 4, 3], 25 + r * 4, 0.6, r > 6 ? 2 : 1);
    if (this.onScreen(a.x, a.y, 20)) this.g.audio.play('rock');
    if (!reward) return;
    this.addScore(a.def.score, a.x, a.y);
    this.spawnCrystals(a.x, a.y, Math.min(a.ore, 1), a.kind || 'cristal');
    if (a.size === 'l') {
      this.asteroids.push(new Asteroid('s', a.x - 5, a.y, 0, -18, a.vy));
      this.asteroids.push(new Asteroid('s', a.x + 5, a.y, 0, 18, a.vy));
      if (chance(0.1)) this.pickups.push(new Repair(a.x, a.y));
    }
    this.shake(1, 0.12);
  }

  mineAsteroid(a, dt, hx, hy) {
    a.mineAcc = (a.mineAcc || 0) + this.stats.laserRate * dt;
    while (a.mineAcc >= 1 && a.ore > 0) {
      a.mineAcc -= 1;
      a.ore--;
      const n = this.harvestCount(1);
      const kind = !a.kind || a.kind === 'cristal' || chance(0.3) ? 'cristal' : a.kind;
      for (let i = 0; i < n; i++) {
        const c = new Crystal(hx, hy, kind);
        // fling the ore towards the ship
        const dx = this.player.x - hx;
        const dy = this.player.y - hy;
        const d = Math.hypot(dx, dy) || 1;
        c.vx = (dx / d) * 40 + rand(-15, 15);
        c.vy = (dy / d) * 40 + rand(-15, 15);
        this.crystals.push(c);
      }
    }
    if (a.ore <= 0) {
      this.addScore(a.def.score, a.x, a.y);
      a.dead = true;
      this.fx.burst(a.x, a.y, 8 + a.def.r * 2, [1, 1, 3], 20 + a.def.r * 3, 0.6);
      this.fx.text(a.x, a.y - 8, 'DEPLETED', 3);
      this.g.audio.play('rock');
    }
  }

  collectCrystal(c) {
    const pl = this.player;
    this.holdAdd(c.kind || 'cristal');
    this.score += 5;
    pl.addEnergy(3);
    this.fx.burst(c.x, c.y, 3, [3, 4], 25, 0.25);
    this.g.audio.play('collect');
    if (pl.cargo >= pl.stats.cargo) this.fx.text(pl.x, pl.y - 14, 'CARGO FULL', 4);
  }

  collectRepair(k) {
    const pl = this.player;
    if (pl.hp < pl.stats.maxHp) {
      pl.hp++;
      this.fx.text(k.x, k.y - 6, '+1 HP', 2);
    } else this.addScore(100, k.x, k.y);
    this.fx.burst(k.x, k.y, 8, [2, 4], 40, 0.4);
    this.g.audio.play('repair');
  }

  playerHit() {
    const pl = this.player;
    if (!pl.alive || pl.inv > 0) return;
    pl.hp--;
    pl.inv = 1.4;
    this.fx.burst(pl.x, pl.y, 14, [2, 4, 1], 60, 0.5);
    this.shake(3, 0.3);
    this.g.audio.play('hurt');
    // a hit spills some cargo
    const lost = Math.min(pl.cargo, Math.ceil(pl.cargo * 0.2));
    for (let i = 0; i < lost; i++) {
      const k = this.holdTake();
      if (!k) break;
      this.spawnCrystals(pl.x, pl.y, 1, k);
      this.crystals[this.crystals.length - 1].life = 6;
    }
    if (pl.hp <= 0) this.killPlayer();
  }

  killPlayer() {
    const pl = this.player;
    if (!pl.alive) return;
    pl.alive = false;
    pl.hp = 0;
    this.phase = 'respawn';
    this.phaseT = 3;
    this.deaths++;
    this.lostCargo = pl.cargo;
    this.holdClear();
    this.beam = null;
    this.fx.burst(pl.x, pl.y, 50, [2, 4, 3, 1], 100, 1.2, 2);
    this.fx.ring(pl.x, pl.y, 40, 4, 90);
    this.shake(5, 0.6);
    this.g.audio.play('bigexplode');
  }

  respawn() {
    const pl = this.player;
    if (!this.atHome) this.loadSector(0);
    this.warp = { t: 2.6, depth: 0 };
    pl.alive = true;
    pl.hp = pl.stats.maxHp;
    pl.x = this.station.x;
    pl.y = this.station.y + SHIELD_R + 14;
    pl.vx = 0;
    pl.vy = 0;
    pl.inv = 2;
    this.phase = 'play';
    this.camX = pl.x - W / 2;
    this.camY = pl.y - TOP - VIEW_H / 2;
  }

  baseHit(n) {
    const st = this.station;
    st.damage(n);
    if (st.hp <= 0 && this.phase !== 'over') {
      this.phase = 'over';
      this.phaseT = 3;
      this.baseLost = true;
      this.fx.burst(st.x, st.y, 80, [4, 3, 2, 1], 130, 1.4, 2);
      this.fx.ring(st.x, st.y, 70, 4, 100);
      this.shake(6, 0.8);
      this.g.audio.play('bigexplode');
    }
  }

  nova(x, y) {
    this.novas.push({ x, y, r: 0, hit: new Set() });
    this.shake(2, 0.25);
    this.g.audio.play('nova');
  }

  // anything the mining laser can work on: rocks, coral heads, kelp fronds
  nearestAsteroid(x, y, maxD) {
    let best = null;
    let bd = maxD;
    for (const a of this.asteroids) {
      const d = Math.hypot(a.x - x, a.y - y) - a.def.r;
      if (!a.dead && d < bd) {
        bd = d;
        best = a;
      }
    }
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y) - 3;
      if (n.ore > 0 && d < bd) {
        bd = d;
        best = n;
      }
    }
    for (const k of this.sector.kelp) {
      if (k.ore <= 0 || Math.abs(k.x - x) > 120 || Math.abs(k.y - y) > 120) continue;
      const pts = this.sector.kelpPoints(k, this.time, 4);
      for (const [px, py] of pts) {
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          best = { x: px, y: py, kelp: k };
        }
      }
    }
    return best;
  }

  // laser extraction from a coral head or a kelp plant
  harvest(t, dt, hx, hy, kind) {
    t.mineAcc = (t.mineAcc || 0) + this.stats.laserRate * dt;
    while (t.mineAcc >= 1 && t.ore > 0) {
      t.mineAcc -= 1;
      t.ore--;
      const c = new Crystal(hx, hy, kind);
      const dx = this.player.x - hx;
      const dy = this.player.y - hy;
      const d = Math.hypot(dx, dy) || 1;
      c.vx = (dx / d) * 40 + rand(-15, 15);
      c.vy = (dy / d) * 40 + rand(-15, 15);
      this.crystals.push(c);
      if (t.L !== undefined) t.L = Math.max(10, t.L - 7); // the frond gets shorter
    }
    if (t.ore <= 0) {
      t.regrow = 45;
      this.fx.text(hx, hy - 8, 'HARVESTED', 3);
      this.g.audio.play('rock');
    }
  }

  nearestEnemy(x, y, maxD) {
    let best = null;
    let bd = maxD;
    for (const e of this.enemies.list) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const inp = this.g.input;
    if (this.paused) {
      this.pauseMenu.update(dt);
      if (inp.pressed('pause') && this.pauseMenu.t > 0.1) this.paused = false;
      return;
    }
    if (this.phase !== 'over' && (inp.pressed('pause') || inp.tapIn(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h))) {
      inp.consumeTap();
      this.openPause();
      return;
    }
    if (document.hidden) return;
    if (this.nearBase && (inp.pressed('dock') || (inp.isTouch && inp.tapIn(DOCK_BTN.x, DOCK_BTN.y, DOCK_BTN.w, DOCK_BTN.h)))) {
      inp.consumeTap();
      this.dock();
      return;
    }

    this.time += dt;
    this.phaseT -= dt;
    if (this.raidReward) {
      this.raidReward.t -= dt;
      if (this.raidReward.t <= 0) this.raidReward = null;
    }

    this.enemies.update(dt);
    if (this.phase === 'play' && this.atHome) this.updateRaids(dt);
    if (this.warp) {
      this.warp.t -= dt;
      if (this.warp.t <= 0) this.warp = null;
    }
    else if (this.phase === 'respawn' && this.phaseT <= 0) this.respawn();
    else if (this.phase === 'over' && this.phaseT <= 0) {
      this.endRun();
      return;
    }

    const pl = this.player;
    if (pl.alive) {
      pl.update(dt, this);
      this.emitWake(dt);
    }
    this.fogT -= dt;
    if (this.fogT <= 0 && pl.alive) {
      this.fogT = 0.25;
      this.reveal();
    }
    this.autoUnload(dt);
    this.updateBeam(dt);
    this.updateGates(dt);
    this.updateHazards(dt);
    if (this.phase !== 'over' && this.atHome) this.station.update(dt, this);

    // keep the asteroid field populated
    const alive = this.asteroids.length;
    if (alive < this.zone.asteroids && chance(dt * 0.6)) this.asteroids.push(Asteroid.spawn(this));

    updateBullets(this.pBullets, dt);
    updateBullets(this.eBullets, dt);
    for (const a of this.asteroids) a.update(dt, this.zone.size);
    const room = pl.cargo < pl.stats.cargo;
    for (const c of this.crystals) c.update(dt, pl, this.stats.magnet, room);
    for (const k of this.pickups) k.update(dt);
    this.updateNovas(dt);
    resolveCollisions(this);
    this.fx.update(dt);

    this.pBullets = this.pBullets.filter((b) => !b.dead);
    this.eBullets = this.eBullets.filter((b) => !b.dead);
    this.asteroids = this.asteroids.filter((a) => !a.dead);
    this.crystals = this.crystals.filter((c) => !c.dead);
    this.pickups = this.pickups.filter((k) => !k.dead);
    this.crates = this.crates.filter((c) => !c.dead);

    // camera follows the ship with a little lead in the travel direction
    const size = this.zone.size;
    const tx = clamp(pl.x + pl.vx * 0.12 - W / 2, -20, size - W + 20);
    const ty = clamp(pl.y + pl.vy * 0.12 - TOP - VIEW_H / 2, -TOP - 20, size - BOTTOM + 20);
    const k = Math.min(1, dt * 9);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;

    if (this.shakeT > 0) this.shakeT -= dt;
  }

  // Water wake (abyss) or engine sparks (space) streaming behind the moving ship
  emitWake(dt) {
    const pl = this.player;
    const sp = pl.speed;
    if (sp < 20) return;
    this.wakeAcc = (this.wakeAcc || 0) + dt * (sp / 6);
    const abyss = theme === 'abyss';
    while (this.wakeAcc >= 1) {
      this.wakeAcc -= 1;
      const [bx, by] = pl.toWorld(rand(-2, 2), rand(8, 10));
      const ux = -pl.vx / sp;
      const uy = -pl.vy / sp;
      const side = rand(-1, 1);
      const v = rand(6, 16) * (sp / 100);
      if (abyss) {
        // faint churned water: mostly the dark rock tone, fading out (colour steps down, then gone)
        this.fx.parts.push({
          x: bx, y: by,
          vx: ux * v - uy * side * 12, vy: uy * v + ux * side * 12 - 3,
          life: rand(0.3, 0.7), c: chance(0.2) ? 2 : 1, s: 1, bubble: chance(0.08), wake: true,
        });
      } else if (chance(0.5)) {
        this.fx.parts.push({ x: bx, y: by, vx: ux * v * 0.5, vy: uy * v * 0.5, life: rand(0.2, 0.4), c: chance(0.5) ? 1 : 2, s: 1 });
      }
    }
  }

  // Flying over the base unloads the cargo into the hangar automatically (crystal by crystal).
  autoUnload(dt) {
    const pl = this.player;
    if (!this.nearBase || pl.cargo <= 0) {
      this.unloadT = 0;
      if (this.unloaded > 0 && !this.nearBase) this.unloaded = 0;
      return;
    }
    this.unloadT = (this.unloadT || 0) + dt;
    const st = this.station;
    while (this.unloadT >= 0.04 && pl.cargo > 0) {
      this.unloadT -= 0.04;
      const kind = this.holdTake();
      let n = 1;
      if (kind === 'cristal') {
        // the refinery only multiplies crystals
        this.refineAcc = (this.refineAcc || 0) + this.station.stats.refine;
        n = Math.floor(this.refineAcc);
        this.refineAcc -= n;
      }
      this.store(kind, n);
      this.deposited += n;
      this.score += 2;
      this.unloaded = (this.unloaded || 0) + n;
      // a crystal pixel flying from the ship into the station
      const dx = st.x - pl.x;
      const dy = st.y - pl.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 140;
      this.fx.parts.push({ x: pl.x, y: pl.y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: d / sp, c: 3, s: 2, noDrag: true });
      this.g.audio.play('collect');
    }
    if (pl.cargo === 0) {
      this.fx.text(st.x, st.y - 30, `+${this.unloaded} IN HANGAR`, 3);
      this.g.audio.play('deposit');
      persist(this.g.save);
    }
  }

  // Mining laser: a beam from the nose that extracts ore from the first asteroid it meets.
  updateBeam(dt) {
    const pl = this.player;
    this.beam = null;
    if (!pl.alive || !pl.mining) return;
    const [ox, oy] = pl.toWorld(0, -10);
    let a = pl.angle;
    if (pl.lock) a = Math.atan2(pl.lock.x - ox, -(pl.lock.y - oy));
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    const range = this.stats.laserRange;
    const kelpPts = [];
    for (const k of this.sector.kelp) {
      if (k.ore <= 0 || Math.abs(k.x - ox) > range + 90 || Math.abs(k.y - oy) > range + 90) continue;
      for (const p of this.sector.kelpPoints(k, this.time, 2)) kelpPts.push([p[0], p[1], k]);
    }
    let hit = null;
    let len = range;
    for (let d = 0; d <= range; d += 1) {
      const x = ox + ux * d;
      const y = oy + uy * d;
      const rock = this.asteroids.find((r) => !r.dead && Math.hypot(r.x - x, r.y - y) < r.def.r - 1);
      if (rock) {
        hit = rock;
        len = d;
        break;
      }
      const node = this.nodes.find((n) => n.ore > 0 && Math.abs(n.x - x) < 4 && Math.abs(n.y - y) < 4);
      const frond = !node && kelpPts.find((p) => Math.abs(p[0] - x) < 3 && Math.abs(p[1] - y) < 3);
      if (node || frond) {
        hit = node || { kelp: frond[2] };
        len = d;
        break;
      }
      const foe = this.enemies.list.find((e) => overlap({ x, y, w: 1, h: 1 }, e)) || this.crates.find((c) => !c.dead && overlap({ x, y, w: 1, h: 1 }, c));
      if (foe) {
        hit = foe;
        len = d;
        break;
      }
    }
    const hx = ox + ux * len;
    const hy = oy + uy * len;
    this.beam = { ox, oy, ux, uy, len, hit: !!hit };
    this.g.audio.play('laser');
    if (!hit) return;
    if (hit.node || hit.kelp) {
      if (pl.cargo < pl.stats.cargo) this.harvest(hit.node ? hit : hit.kelp, dt, hx, hy, hit.node ? 'corail' : 'kelp');
      else this.beam.full = true;
    } else if (hit instanceof Asteroid) {
      if (pl.cargo < pl.stats.cargo || hit.ore <= 0) this.mineAsteroid(hit, dt, hx, hy);
      else this.beam.full = true;
    } else {
      hit.laserAcc = (hit.laserAcc || 0) + dt * (hit.type ? 2 : 4); // weak against invaders, cuts crates
      if (hit.laserAcc >= 1) {
        hit.laserAcc = 0;
        if (hit.type) this.damageEnemy(hit, 1);
        else this.damageCrate(hit, 1);
      }
    }
    if (chance(dt * 30)) this.fx.burst(hx, hy, 1, [3, 4], 35, 0.25);
  }

  updateNovas(dt) {
    for (const nv of this.novas) {
      nv.r += 260 * dt;
      const r2 = nv.r * nv.r;
      const inside = (o) => (o.x - nv.x) ** 2 + (o.y - nv.y) ** 2 < r2;
      for (const b of this.eBullets) {
        if (!b.dead && inside(b)) {
          b.dead = true;
          this.fx.burst(b.x, b.y, 2, [2, 4], 20, 0.3);
        }
      }
      for (const e of this.enemies.list) {
        if (!nv.hit.has(e) && inside(e)) {
          nv.hit.add(e);
          this.damageEnemy(e, this.stats.novaDmg);
        }
      }
    }
    this.novas = this.novas.filter((nv) => nv.r < 200);
  }

  // ---------------------------------------------------------------- render
  render(r) {
    const t = this.time;
    r.clear(0);
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      sx = Math.round(rand(-this.shakeMag, this.shakeMag));
      sy = Math.round(rand(-this.shakeMag, this.shakeMag));
    }
    r.ox = -Math.round(this.camX) + sx;
    r.oy = -Math.round(this.camY) + sy;
    this.sector.renderFloor(r);
    this.g.stars.render(r, t, this.camX, this.camY);

    this.renderBounds(r);
    const vis = (o, m = 30) => this.onScreen(o.x, o.y, m);
    const visXY = (x, y, m) => this.onScreen(x, y, m);
    this.sector.render(r, t, visXY);
    for (const g of this.sector.gates) if (visXY(g.x, g.y, 30)) this.renderGate(r, g, t);
    for (const c of this.crates) if (vis(c)) this.renderCrate(r, c);
    for (const n of this.nodes) if (vis(n)) this.renderCoral(r, n, t);
    if (this.atHome && vis(this.station, 80) && this.phase !== 'over') this.station.render(r);
    for (const a of this.asteroids) if (vis(a)) a.render(r);
    for (const c of this.crystals) if (vis(c)) c.render(r);
    for (const k of this.pickups) if (vis(k)) k.render(r);
    this.enemies.render(r, vis);
    this.renderBeam(r, t);
    this.player.render(r);
    this.sector.renderKelp(r, t, visXY);
    renderPlayerBullets(r, this.pBullets);
    renderEnemyBullets(r, this.eBullets, t);
    for (const nv of this.novas) {
      r.ring(nv.x, nv.y, nv.r, 4, 2);
      r.ring(nv.x, nv.y, Math.max(0, nv.r - 5), 2);
    }
    this.fx.render(r);
    this.fx.renderTexts(r);
    r.ox = 0;
    r.oy = 0;

    this.renderIndicators(r, t);
    drawHud(r, this, t);
    this.renderOverlay(r, t);
  }

  renderGate(r, g, t) {
    const open = this.gateOpen(g);
    const spin = open ? t * 1.5 : 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + spin;
      r.rect(g.x + Math.cos(a) * 10, g.y + Math.sin(a) * 10, 2, 2, i % 3 === 0 ? (open ? 3 : 2) : open ? 2 : 1);
    }
    if (open) {
      for (let i = 0; i < 10; i++) {
        const k = (t * 0.8 + i / 10) % 1;
        const a = i * 2.4 - t * 3;
        r.rect(g.x + Math.cos(a) * 8 * (1 - k), g.y + Math.sin(a) * 8 * (1 - k), 1, 1, k > 0.7 ? 4 : 3);
      }
      r.rect(g.x, g.y, 1, 1, 4);
    }
    const label = g.kind === 'home' ? 'BASE' : open ? `DEPTH ${g.to}` : `LAB ${sectorInfo(g.to).lab}`;
    drawText(r, label, g.x, g.y - 20, open ? 4 : 2, 1, 'center');
  }

  // harvestable coral head: bright branches with glinting tips; a dim stub once harvested
  renderCoral(r, n, t) {
    const full = n.ore > 0;
    r.rect(n.x - 1, n.y - 1, 3, 3, full ? 3 : 1);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.256 + n.p;
      const len = full ? 5 : 2;
      for (let d = 2; d <= len; d++) r.rect(n.x + Math.cos(a) * d, n.y + Math.sin(a) * d, 1, 1, full ? 2 : 1);
      if (full) r.rect(n.x + Math.cos(a) * (len + 1), n.y + Math.sin(a) * (len + 1), 1, 1, Math.floor(t * 3 + k + n.p) % 4 ? 3 : 4);
    }
  }

  renderCrate(r, c) {
    const f = c.flash > 0;
    r.rect(c.x - 4, c.y - 3, 9, 7, f ? 4 : 2);
    r.rect(c.x - 3, c.y - 2, 7, 5, f ? 4 : 1);
    r.rect(c.x - 3, c.y, 7, 1, 3);
    r.rect(c.x, c.y - 2, 1, 5, 2);
  }

  renderBounds(r) {
    // sector edge: dotted frame
    const s = this.zone.size;
    for (let i = 0; i < s; i += 6) {
      if (!this.onScreen(i, 0, 4) && !this.onScreen(i, s, 4) && !this.onScreen(0, i, 4) && !this.onScreen(s, i, 4)) continue;
      r.rect(i, 0, 3, 1, 1);
      r.rect(i, s, 3, 1, 1);
      r.rect(0, i, 1, 3, 1);
      r.rect(s, i, 1, 3, 1);
    }
  }

  renderBeam(r, t) {
    const b = this.beam;
    if (!b) return;
    const flick = Math.floor(t * 30) % 2;
    for (let d = 0; d < b.len; d++) {
      const c = (d + flick) % 5 === 0 ? 4 : 3;
      r.rect(b.ox + b.ux * d, b.oy + b.uy * d, 1, 1, c);
    }
    if (b.hit) {
      const hx = b.ox + b.ux * b.len;
      const hy = b.oy + b.uy * b.len;
      r.rect(hx - 1, hy - 1, 3, 3, flick ? 4 : 3);
      if (b.full && Math.floor(t * 4) % 2) drawText(r, 'CARGO FULL', hx, hy - 10, 4, 1, 'center');
    }
  }

  // Arrows on the screen edge: base (teal) and nearby invaders (cream)
  renderIndicators(r, t) {
    const cx = W / 2;
    const cy = TOP + VIEW_H / 2;
    const edge = (x, y, c, big) => {
      const sx = x - this.camX;
      const sy = y - this.camY;
      if (sx > 2 && sx < W - 2 && sy > TOP + 2 && sy < BOTTOM - 2) return;
      const dx = sx - cx;
      const dy = sy - cy;
      const k = Math.min((W / 2 - 6) / Math.abs(dx || 1e-6), (VIEW_H / 2 - 6) / Math.abs(dy || 1e-6));
      const ex = cx + dx * k;
      const ey = cy + dy * k;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      r.rect(ex, ey, 2, 2, c);
      if (big) {
        r.rect(ex - ux * 3 - uy * 2, ey - uy * 3 + ux * 2, 1, 1, c);
        r.rect(ex - ux * 3 + uy * 2, ey - uy * 3 - ux * 2, 1, 1, c);
        r.rect(ex - ux * 2, ey - uy * 2, 1, 1, c);
      }
    };
    for (const e of this.enemies.list) {
      // raiders are always tracked; patrols only when hunting you or close by
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (e.mode === 'raid' || e.aggro || d < 260) edge(e.x, e.y, 4, e.type === 'boss');
    }
    for (const g of this.sector.gates) edge(g.x, g.y, this.gateOpen(g) ? 3 : 1, true);
    const urgent = this.raid && this.station.hitT > 0;
    if (this.atHome && Math.floor(t * (urgent ? 8 : 2)) % 4 !== 3) edge(this.station.x, this.station.y, urgent ? 4 : 2, true);
  }

  panel(r, y, h) {
    r.rect(20, y, W - 40, h, 0);
    r.frame(20, y, W - 40, h, 2);
    r.frame(22, y + 2, W - 44, h - 4, 1);
  }

  renderOverlay(r, t) {
    const pl = this.player;
    const blink = Math.floor(t * 3) % 2 === 0;
    if (this.time < 14) {
      const touch = this.g.input.isTouch;
      const mouse = this.g.input.mouseAim;
      const lines = touch
        ? ['DRAG TO FLY - AUTO AIM AND FIRE', 'HOLD MINE NEAR A ROCK', 'FLY OVER THE BASE TO UNLOAD']
        : mouse
          ? ['WASD/ZQSD FLY - MOUSE AIM - CLICK FIRE', 'RIGHT CLICK OR X: MINING LASER', 'FLY OVER BASE: UNLOAD - E: HANGAR']
          : ['ARROWS/WASD FLY - SPACE FIRE', 'HOLD X NEAR A ROCK: MINING LASER', 'FLY OVER BASE: UNLOAD - E: HANGAR'];
      lines.forEach((l, i) => drawText(r, l, W / 2, 40 + i * 8, i === 1 ? 3 : 2, 1, 'center'));
      drawText(r, 'FIND THE GATE TO DIVE DEEPER', W / 2, 70, 4, 1, 'center');
    }
    if (!this.raid && this.raidSide !== undefined && this.phase === 'play') {
      drawText(r, `RAID FROM THE ${SIDES[this.raidSide]} IN ${Math.ceil(this.raidT)}`, W / 2, 22, blink ? 4 : 3, 1, 'center');
      if (this.raidT > RAID_WARNING - 3) drawText(r, 'GET BACK TO DEFEND THE BASE', W / 2, 30, 2, 1, 'center');
    }
    if (this.raid) {
      const boss = isBossRaid(this.raid.n);
      drawText(r, `BASE UNDER ATTACK - ${this.enemies.raidRemaining} LEFT${boss ? ' - BOSS' : ''}`, W / 2, 22, blink ? 4 : 3, 1, 'center');
    }
    if (this.warp && this.phase === 'play') {
      const z = this.zone;
      if (this.warp.t > 2.3) {
        // short dithered flash when passing a gate
        for (let y = TOP; y < BOTTOM; y += 2) r.rect(0, y + (Math.floor(this.warp.t * 30) & 1), W, 1, 0);
      }
      drawBigShadow(r, z.name, W / 2, 96, 4, 1, 2);
      drawText(r, `-${z.meters} M`, W / 2, 112, 3, 1, 'center');
      if (z.depth > 0) drawText(r, 'KELP HIDES YOU - VENTS ERUPT', W / 2, 122, 2, 1, 'center');
      if (z.depth > 0) drawText(r, 'WRECKS HOLD SALVAGE', W / 2, 130, 2, 1, 'center');
    }
    if (this.raid && !this.atHome && blink) drawText(r, 'RAID: RETURN TO BASE', W / 2, 30, 4, 1, 'center');
    if (this.raidReward) {
      this.panel(r, 40, 40);
      drawBigShadow(r, 'BASE DEFENDED', W / 2, 48, 4, 1, 2);
      drawText(r, `+${this.raidReward.bonus} CRYSTALS TO THE HANGAR`, W / 2, 64, 3, 1, 'center');
    }
    if (this.phase === 'respawn') {
      drawBigShadow(r, 'SHIP LOST', W / 2, 130, 4, 1, 2);
      if (this.lostCargo > 0) drawText(r, `${this.lostCargo} CRYSTALS LOST`, W / 2, 148, 3, 1, 'center');
      drawText(r, `REBUILDING AT BASE ${Math.ceil(this.phaseT)}`, W / 2, 158, 2, 1, 'center');
    }
    if (this.phase === 'over' && this.phaseT < 2.2) {
      drawBigShadow(r, 'BASE DESTROYED', W / 2, 140, 4, 1, 2);
    }
    if (this.paused) {
      this.panel(r, 110, 90);
      drawBigShadow(r, 'PAUSED', W / 2, 122, 4, 1, 2);
      this.pauseMenu.render(r, performance.now() / 1000);
    }
  }
}

