import { drawIcon } from '../game/items.js';
import { W, H } from '../engine/renderer.js';
import { drawText, drawBig, drawBigShadow } from '../engine/font.js';
import { S } from '../engine/sprites.js';
import { pad } from '../engine/utils.js';
import { ButtonList } from './buttons.js';
import { UPGRADES, MAX_LEVEL, upgradeCost, persist, resetSave, bestScore, labNeeded, BASE_MODULES, BASE_MAX, baseCost } from '../game/progression.js';
import { buildStation } from '../game/station.js';
import { buildGrid, gridToCanvas, buildShip, engines } from '../game/shipgen.js';
import { theme, THEME_NAMES } from '../engine/palette.js';

function cabinetFrame(r, t) {
  r.frame(2, 2, W - 4, H - 4, 1);
  for (const [x, y] of [[2, 2], [W - 6, 2], [2, H - 6], [W - 6, H - 6]]) r.rect(x, y, 4, 4, 2);
  // slow scanning line, arcade CRT nod (solid palette colour, no transparency)
  const sy = 6 + Math.floor((t * 22) % (H - 12));
  r.rect(4, sy, W - 8, 1, 1);
}

function crystalIcon(r, x, y, t) {
  r.sprite(S.crystal, x, y, Math.floor(t * 5) % 3);
}

export function drawTitle(r, y, t) {
  // "SPACE": big cream letters with a stepped grey extrusion
  drawBigShadow(r, 'ABYSS', W / 2, y, 4, 1, 5, 'center', 4, 3);
  drawBigShadow(r, 'INVADERS', W / 2, y + 35, 3, 1, 2, 'center', 5, 1);
  // underline with a travelling sparkle
  r.rect(36, y + 52, W - 72, 1, 2);
  const sx = 36 + Math.floor((t * 40) % (W - 75));
  r.rect(sx, y + 51, 3, 3, 4);
}

// ------------------------------------------------------------------ MENU
export class MenuScene {
  constructor(g) {
    this.g = g;
    this.t = 0;
    this.list = new ButtonList(g, [
      { label: 'START GAME', action: () => g.startGame() },
      { label: 'HANGAR', action: () => g.openHangar(false) },
      { label: 'SETTINGS', action: () => g.push(new SettingsScene(g)) },
    ], { y: 198, w: 112 });
  }

  update(dt) {
    this.t += dt;
    this.g.stars.update(dt, 0.6);
    this.list.update(dt);
  }

  render(r) {
    const t = this.t;
    r.clear(0);
    this.g.stars.render(r, t);
    cabinetFrame(r, t);
    drawTitle(r, 34, t);

    // animated ship harvesting crystals
    const sy = 150 + Math.round(Math.sin(t * 2) * 3);
    const sx = W / 2 + Math.round(Math.sin(t * 0.7) * 30);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + (i * Math.PI * 2) / 3;
      if (Math.sin(a) < 0) crystalIcon(r, sx + Math.round(Math.cos(a) * 30), sy + Math.round(Math.sin(a) * 10), t + i);
    }
    const lv = this.g.save.upgrades;
    const key = JSON.stringify([lv, theme]);
    if (this.shipKey !== key) {
      this.shipKey = key;
      this.ship = buildShip(lv);
    }
    const fl = 2 + (Math.floor(t * 16) % 2) + Math.floor(lv.speed / 2);
    for (const [ex, ey] of engines(lv.speed)) {
      for (let k = 0; k < fl; k++) r.rect(sx + ex * 2, sy + (ey + 1 + k) * 2, 2, 2, [4, 4, 3, 3, 1, 1][Math.min(k, 5)]);
    }
    r.sprite(this.ship, sx, sy, 0, false, 2);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + (i * Math.PI * 2) / 3;
      if (Math.sin(a) >= 0) crystalIcon(r, sx + Math.round(Math.cos(a) * 30), sy + Math.round(Math.sin(a) * 10), t + i);
    }
    r.sprite(S.basic, 40, 118 + Math.round(Math.sin(t * 3) * 2), Math.floor(t * 2.5) % 2);
    r.sprite(S.fast, 200, 124 + Math.round(Math.cos(t * 3) * 2), Math.floor(t * 8) % 2);

    this.list.render(r, t);

    drawText(r, `HI SCORE ${pad(bestScore(this.g.save), 6)}`, W / 2, 268, 4, 1, 'center');
    crystalIcon(r, 92, 280, t);
    drawText(r, `BANK ${this.g.save.bank}`, 100, 278, 3);
    const hint = this.g.input.isTouch ? 'DRAG TO FLY - HOLD TO FIRE' : 'WASD FLY  SPACE FIRE  X LASER  E DOCK';
    drawText(r, hint, W / 2, 296, 2, 1, 'center');
    if (Math.floor(t * 1.5) % 2 === 0) drawText(r, '1 CREDIT', W - 8, 308, 1, 1, 'right');
    drawText(r, 'V0.1', 8, 308, 1);
  }
}

// ------------------------------------------------------------------ HANGAR (base)
// Two tabs: SHIP upgrades (gated by LAB research) and BASE modules. The preview shows the
// ship or the station with the parts of the next level blinking, so every upgrade is visible.
export class HangarScene {
  constructor(g, fromGame, deposited = 0) {
    this.g = g;
    this.fromGame = fromGame;
    this.deposited = deposited;
    this.t = 0;
    this.tab = 'ship';
    this.sel = 0;
    this.err = 0;
    this.msg = null;
    this.bought = -1;
    this.boughtT = 0;
    this.cache = {};
  }

  rows() {
    const save = this.g.save;
    if (this.tab === 'ship') {
      return UPGRADES.map((u) => {
        const lvl = save.upgrades[u.id];
        const cost = upgradeCost(lvl);
        const need = labNeeded(lvl + 1);
        return { id: u.id, name: u.name, desc: u.desc, lvl, max: MAX_LEVEL, cost, locked: cost !== null && save.base.lab < need ? need : 0 };
      });
    }
    return BASE_MODULES.map((m) => {
      const lvl = save.base[m.id];
      return { id: m.id, name: m.name, desc: m.desc, lvl, max: BASE_MAX, cost: baseCost(m, lvl), locked: 0 };
    });
  }

  rowRect(i) {
    return { x: 10, y: (this.tab === 'base' ? 180 : 146) + i * 22, w: W - 20, h: 20 };
  }

  backRect() {
    return { x: W / 2 - 60, y: 282, w: 120, h: 15 };
  }

  tabRect(i) {
    return { x: W / 2 - 62 + i * 64, y: 22, w: 60, h: 11 };
  }

  setTab(tab) {
    if (tab === this.tab) return;
    this.tab = tab;
    this.sel = 0;
    this.g.audio.play('select');
  }

  preview(hl, blinkOn) {
    const save = this.g.save;
    const key = JSON.stringify([this.tab, this.tab === 'ship' ? save.upgrades : save.base, hl, blinkOn]);
    if (!this.cache[key]) {
      if (this.tab === 'ship') this.cache[key] = gridToCanvas(buildGrid(save.upgrades, blinkOn ? hl : null, 4));
      else this.cache[key] = buildStation(save.base, hl, blinkOn).frames[0];
    }
    return this.cache[key];
  }

  buy(i) {
    const row = this.rows()[i];
    const save = this.g.save;
    const fail = (msg) => {
      this.err = 0.3;
      this.errRow = i;
      this.msg = msg ? { text: msg, t: 2 } : null;
      this.g.audio.play('error');
    };
    if (row.cost === null) return fail('MAX LEVEL');
    if (row.locked) return fail(`RESEARCH NEEDED: BUILD LAB LV ${row.locked}`);
    if (save.bank < row.cost) return fail(`NEED ${row.cost - save.bank} MORE CRYSTALS`);
    save.bank -= row.cost;
    if (this.tab === 'ship') save.upgrades[row.id]++;
    else save.base[row.id]++;
    persist(save);
    this.bought = i;
    this.boughtT = 0.6;
    this.msg = null;
    this.g.audio.play('buy');
  }

  back() {
    this.g.audio.play('confirm');
    this.g.pop();
  }

  update(dt) {
    this.t += dt;
    if (this.err > 0) this.err -= dt;
    if (this.boughtT > 0) this.boughtT -= dt;
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    this.g.stars.update(dt, 0.4);
    const inp = this.g.input;
    const rows = this.rows();
    const n = rows.length + 1;
    if (inp.pressed('left')) this.setTab('ship');
    if (inp.pressed('right')) this.setTab('base');
    if (inp.pressed('up')) { this.sel = (this.sel + n - 1) % n; this.g.audio.play('select'); }
    if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; this.g.audio.play('select'); }
    if (inp.pressed('back')) return this.back();
    ['ship', 'base'].forEach((tab, i) => {
      const b = this.tabRect(i);
      if (inp.tapIn(b.x, b.y, b.w, b.h)) {
        inp.consumeTap();
        this.setTab(tab);
      }
    });
    if (inp.hoverMoved && inp.hover) {
      for (let i = 0; i < n; i++) {
        const b = i < rows.length ? this.rowRect(i) : this.backRect();
        if (inp.hover.x >= b.x && inp.hover.x < b.x + b.w && inp.hover.y >= b.y && inp.hover.y < b.y + b.h && this.sel !== i) {
          this.sel = i;
          this.g.audio.play('select');
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const b = i < rows.length ? this.rowRect(i) : this.backRect();
      if (inp.tapIn(b.x, b.y, b.w, b.h)) {
        inp.consumeTap();
        if (i < rows.length && this.sel !== i && inp.isTouch) {
          this.sel = i; // on touch: first tap previews, second tap buys
          this.g.audio.play('select');
          return;
        }
        this.sel = i;
        return i < rows.length ? this.buy(i) : this.back();
      }
    }
    if (inp.pressed('confirm')) {
      if (this.sel < rows.length) this.buy(this.sel);
      else this.back();
    }
  }

  render(r) {
    const t = this.t;
    const save = this.g.save;
    const rows = this.rows();
    r.clear(0);
    this.g.stars.render(r, t);
    cabinetFrame(r, t);
    drawBigShadow(r, 'HANGAR', W / 2, 8, 4, 1, 2);

    ['SHIP', 'BASE'].forEach((label, i) => {
      const b = this.tabRect(i);
      const on = this.tab === label.toLowerCase();
      r.rect(b.x, b.y, b.w, b.h, on ? 2 : 0);
      if (!on) r.frame(b.x, b.y, b.w, b.h, 1);
      drawText(r, label, b.x + b.w / 2, b.y + 3, on ? 0 : 2, 1, 'center');
    });
    crystalIcon(r, 6, 39, t);
    drawText(r, `${save.bank}`, 14, 37, 3);
    // the base warehouse: every other resource
    let sx = 40;
    for (const k of ['corail', 'kelp', 'ferraille', 'magmatite', 'nodule']) {
      drawIcon(r, k, sx, 37);
      drawText(r, `${save.store[k] || 0}`, sx + 7, 37, 4);
      sx += 40;
    }

    // preview pad
    const pad = { x: 34, y: 46, w: W - 68, h: this.tab === 'base' ? 132 : 98 };
    r.frame(pad.x, pad.y, pad.w, pad.h, 1);
    for (let i = 0; i < 6; i++) r.rect(pad.x + 6 + i * ((pad.w - 14) / 5), pad.y + pad.h - 4, 2, 2, (Math.floor(t * 4) + i) % 3 ? 1 : 2);
    const row = rows[Math.min(this.sel, rows.length - 1)];
    const hl = this.sel < rows.length && row.cost !== null ? { id: row.id, level: row.lvl + 1 } : null;
    const img = this.preview(hl, Math.floor(t * 3) % 2 === 0);
    const sc = this.tab === 'ship' ? 3 : 2;
    const ih = img.height * sc;
    r.ctx.drawImage(img, Math.round(W / 2 - (img.width * sc) / 2), Math.max(pad.y, Math.round(pad.y + (pad.h - ih) / 2 - 2)), img.width * sc, ih);
    if (hl) drawText(r, 'NEXT LEVEL', pad.x + 4, pad.y + 4, 4);
    if (this.deposited > 0 && t < 3) drawText(r, `+${this.deposited} UNLOADED`, pad.x + pad.w - 4, pad.y + 4, 3, 1, 'right');

    rows.forEach((up, i) => {
      const b = this.rowRect(i);
      const sel = this.sel === i;
      const dx = this.err > 0 && this.errRow === i ? Math.round(Math.sin(this.err * 80) * 2) : 0;
      const flash = this.bought === i && this.boughtT > 0 && Math.floor(this.boughtT * 16) % 2 === 0;
      r.rect(b.x + dx, b.y, b.w, b.h, flash ? 3 : 0);
      r.frame(b.x + dx, b.y, b.w, b.h, sel ? 4 : 1);
      drawBig(r, up.name, b.x + dx + 5, b.y + 4, flash ? 0 : 4, 1, 'left', 1);
      for (let k = 0; k < up.max; k++) r.rect(b.x + dx + 66 + k * 7, b.y + 4, 5, 5, k < up.lvl ? 3 : 1);
      if (up.cost === null) drawText(r, 'MAX', b.x + dx + b.w - 5, b.y + 4, 3, 1, 'right');
      else if (up.locked) drawText(r, `LAB ${up.locked}`, b.x + dx + b.w - 5, b.y + 4, 1, 1, 'right');
      else {
        const ok = save.bank >= up.cost;
        drawText(r, `${up.cost}`, b.x + dx + b.w - 5, b.y + 4, ok ? 3 : 1, 1, 'right');
        r.sprite(S.crystal, b.x + dx + b.w - 12 - String(up.cost).length * 4, b.y + 6, 0);
      }
      drawText(r, up.desc, b.x + dx + 5, b.y + 13, sel ? 2 : 1);
    });

    const bb = this.backRect();
    const sel = this.sel === rows.length;
    r.rect(bb.x, bb.y, bb.w, bb.h, sel ? 2 : 0);
    if (!sel) r.frame(bb.x, bb.y, bb.w, bb.h, 2);
    drawText(r, this.fromGame ? 'LAUNCH' : 'BACK', W / 2, bb.y + 5, sel ? 0 : 4, 1, 'center');
    const hint = this.msg ? this.msg.text : this.g.input.isTouch ? 'TABS: SHIP/BASE - TAP TWICE TO BUY' : 'LEFT/RIGHT: TAB  ENTER: BUY  ESC: ' + (this.fromGame ? 'LAUNCH' : 'BACK');
    drawText(r, hint, W / 2, 302, this.msg ? 4 : 1, 1, 'center');
  }
}

// ------------------------------------------------------------------ SETTINGS
export class SettingsScene {
  constructor(g) {
    this.g = g;
    this.t = 0;
    this.confirmReset = false;
    const s = g.save.settings;
    const toggle = (key) => () => {
      s[key] = !s[key];
      persist(g.save);
      g.audio.apply();
    };
    this.list = new ButtonList(g, [
      { label: () => `SOUND FX: ${s.sound ? 'ON' : 'OFF'}`, action: toggle('sound') },
      { label: () => `MUSIC: ${s.music ? 'ON' : 'OFF'}`, action: toggle('music') },
      {
        label: () => `THEME: ${theme === 'abyss' ? 'ABYSS (SUB)' : 'SPACE'}`,
        action: () => g.applyTheme(THEME_NAMES[(THEME_NAMES.indexOf(theme) + 1) % THEME_NAMES.length]),
      },
      { label: () => `SCREEN SHAKE: ${s.shake ? 'ON' : 'OFF'}`, action: toggle('shake') },
      {
        label: () => (this.confirmReset ? 'SURE? PRESS AGAIN' : 'RESET PROGRESS'),
        action: () => {
          if (this.confirmReset) {
            resetSave(g.save);
            this.confirmReset = false;
            this.done = 1.5;
          } else this.confirmReset = true;
        },
      },
      { label: 'BACK', action: () => g.pop() },
    ], { y: 84, w: 140, gap: 7 });
    this.done = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.done > 0) this.done -= dt;
    this.g.stars.update(dt, 0.4);
    if (this.list.sel !== 4) this.confirmReset = false;
    if (this.g.input.pressed('back')) return this.g.pop();
    this.list.update(dt);
  }

  render(r) {
    r.clear(0);
    this.g.stars.render(r, this.t);
    cabinetFrame(r, this.t);
    drawBigShadow(r, 'SETTINGS', W / 2, 40, 4, 1, 2);
    this.list.render(r, this.t);
    if (this.done > 0) drawText(r, 'PROGRESS RESET', W / 2, 220, 3, 1, 'center');
    drawText(r, 'CONTROLS', W / 2, 238, 2, 1, 'center');
    drawText(r, 'ARROWS / WASD / ZQSD  FLY', W / 2, 248, 4, 1, 'center');
    drawText(r, 'SPACE  FIRE    X  MINING LASER', W / 2, 256, 4, 1, 'center');
    drawText(r, 'SHIFT  NOVA    E  DOCK AT BASE', W / 2, 264, 4, 1, 'center');
    drawText(r, 'ESC OR P  PAUSE', W / 2, 272, 4, 1, 'center');
    drawText(r, 'TOUCH: JOYSTICK + MINE/NOVA/DOCK', W / 2, 286, 1, 1, 'center');
  }
}

// ------------------------------------------------------------------ GAME OVER
export class GameOverScene {
  constructor(g, res) {
    this.g = g;
    this.res = res;
    this.t = 0;
    this.list = new ButtonList(g, [
      { label: 'RETRY', action: () => g.startGame() },
      { label: 'MENU', action: () => g.toMenu() },
    ], { y: 252, w: 100, delay: 1.0 });
    if (!res.quit) g.audio.play('gameover');
  }

  update(dt) {
    this.t += dt;
    this.g.stars.update(dt, 0.3);
    this.list.update(dt);
  }

  render(r) {
    const t = this.t;
    const { score, res, waves, rank } = this.res;
    r.clear(0);
    this.g.stars.render(r, t);
    cabinetFrame(r, t);
    drawBigShadow(r, 'GAME', W / 2, 30, 4, 1, 5, 'center', 4, 3);
    drawBigShadow(r, 'OVER', W / 2, 62, 4, 1, 5, 'center', 4, 3);
    if (this.res.baseLost) drawText(r, 'THE BASE WAS DESTROYED', W / 2, 92, 3, 1, 'center');

    const rows = [
      ['FINAL SCORE', pad(score, 6), 4],
      ['CRYSTALS DELIVERED', `${res}`, 3],
      ['RAIDS REPELLED', `${waves}`, 4],
      ['DEEPEST DIVE', `-${120 + (this.res.depth ?? 0) * 380} M`, 4],
    ];
    rows.forEach(([k, v, c], i) => {
      const y = 104 + i * 11;
      drawText(r, k, 44, y, 2);
      drawText(r, v, W - 44, y, c, 1, 'right');
    });
    if (rank === 0 && Math.floor(t * 4) % 2 === 0) drawText(r, 'NEW HIGH SCORE!', W / 2, 148, 3, 1, 'center');

    drawText(r, 'TOP SCORES', W / 2, 166, 2, 1, 'center');
    this.g.save.highScores.forEach((e, i) => {
      const y = 178 + i * 9;
      const c = i === rank ? 3 : 4;
      drawText(r, `${i + 1}.`, 64, y, 1);
      drawText(r, pad(e.score, 6), 76, y, c);
      drawText(r, `RAIDS ${e.wave}`, W - 64, y, c, 1, 'right');
    });
    this.list.render(r, t);
  }
}
