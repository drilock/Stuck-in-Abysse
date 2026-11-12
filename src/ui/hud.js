import { W, H } from '../engine/renderer.js';
import { drawIcon, RES } from '../game/items.js';
import { drawText } from '../engine/font.js';
import { pad } from '../engine/utils.js';
import { NOVA_BTN, MINE_BTN, DOCK_BTN, TOP } from '../game/constants.js';

export const PAUSE_BTN = { x: 224, y: 0, w: 16, h: 10 };
const MAP = { x: W - 42, y: TOP + 3, s: 38 };

function button(r, b, label, active, lit) {
  if (lit) {
    r.rect(b.x, b.y, b.w, b.h, 2);
    drawText(r, label, b.x + b.w / 2, b.y + b.h / 2 - 2, 0, 1, 'center');
  } else {
    r.rect(b.x, b.y, b.w, b.h, 0);
    r.frame(b.x, b.y, b.w, b.h, active ? 2 : 1);
    drawText(r, label, b.x + b.w / 2, b.y + b.h / 2 - 2, active ? 4 : 1, 1, 'center');
  }
}

export function drawHud(r, p, t) {
  const pl = p.player;
  const blink = Math.floor(t * 4) % 2 === 0;

  // --- top bar: SCORE / CARGO / WAVE
  r.rect(0, 0, W, 10, 0);
  r.rect(0, 10, W, 1, 1);
  drawText(r, 'SCORE', 3, 3, 2);
  drawText(r, pad(p.score, 6), 25, 3, 4);
  const full = pl.cargo >= pl.stats.cargo;
  drawText(r, 'CARGO', 78, 3, 2);
  drawText(r, `${pl.cargo}/${pl.stats.cargo}`, 100, 3, full && blink ? 4 : 3);
  // base integrity
  const st = p.station;
  drawText(r, 'BASE', 150, 3, st.hitT > 0 ? 4 : 2);
  r.frame(168, 3, 52, 5, 1);
  const bw = Math.max(0, Math.ceil((50 * st.hp) / st.stats.maxHp));
  r.rect(169, 4, bw, 3, st.hp < st.stats.maxHp * 0.3 && blink ? 4 : 2);
  r.rect(230, 3, 2, 5, 2); // pause icon
  r.rect(234, 3, 2, 5, 2);

  // --- hold contents by resource (under the top bar)
  let hx = 3;
  for (const k of RES) {
    const n = pl.hold[k] || 0;
    if (!n) continue;
    drawIcon(r, k, hx, 13);
    drawText(r, `${n}`, hx + 7, 13, 4);
    hx += 9 + `${n}`.length * 4 + 3;
  }

  // --- minimap (sector overview)
  const m = MAP;
  const k = m.s / p.zone.size;
  r.rect(m.x, m.y, m.s, m.s, 0);
  r.ctx.drawImage(p.fogCanvas, m.x, m.y, m.s, m.s); // explored area
  r.frame(m.x - 1, m.y - 1, m.s + 2, m.s + 2, 1);
  if (p.atHome) r.rect(m.x + p.station.x * k - 1, m.y + p.station.y * k - 1, 3, 3, 2);
  for (const g of p.sector.gates) if (blink || g.kind === 'home') r.rect(m.x + g.x * k - 1, m.y + g.y * k - 1, 3, 3, p.gateOpen(g) ? 3 : 1);
  for (const e of p.enemies.list) {
    const near = Math.hypot(e.x - pl.x, e.y - pl.y) < 260;
    if (e.mode !== 'raid' && !e.aggro && !near) continue; // sensors only see close or attacking units
    const s = e.type === 'boss' ? 2 : 1;
    if (blink || e.type === 'boss') r.rect(m.x + e.x * k, m.y + e.y * k, s, s, 4);
  }
  if (pl.alive) r.rect(m.x + pl.x * k - 1, m.y + pl.y * k - 1, 2, 2, 3);
  drawText(r, `${p.atHome ? 'HOME' : 'D' + p.depth} ${p.exploredPct}%`, m.x + m.s / 2, m.y + m.s + 3, 1, 1, 'center');
  if (p.hidden) drawText(r, 'HIDDEN', m.x + m.s / 2, m.y + m.s + 10, 3, 1, 'center');
  r.frame(m.x + p.camX * k, m.y + (p.camY + TOP) * k, Math.round(W * k), Math.round((H - 27) * k), 1);

  // --- boss health
  const b = p.enemies.boss;
  if (b && p.raid) {
    drawText(r, 'BOSS', 40, 30, 4);
    r.frame(58, 30, 102, 5, 1);
    r.rect(59, 31, Math.ceil((100 * b.hp) / b.maxHp), 3, 4);
  }

  // --- bottom bar: HP, energy, hints
  r.rect(0, 304, W, H - 304, 0);
  r.rect(0, 304, W, 1, 1);
  drawText(r, 'HP', 3, 308, 2);
  for (let i = 0; i < pl.stats.maxHp; i++) r.rect(13 + i * 6, 308, 5, 5, i < pl.hp ? 2 : 1);
  drawText(r, 'EN', 3, 314, 2);
  r.frame(13, 314, 52, 5, 1);
  const ready = pl.energy >= 100;
  r.rect(14, 315, Math.floor(pl.energy / 2), 3, ready && blink ? 3 : 4);
  if (ready) drawText(r, p.g.input.isTouch ? 'NOVA!' : 'SHIFT NOVA', 69, 314, blink ? 4 : 3);
  drawText(r, `BANK ${p.g.save.bank}`, W - 3, 308, 3, 1, 'right');
  const hint = p.nearBase ? (pl.cargo > 0 ? 'UNLOADING...' : p.g.input.isTouch ? 'DOCK: UPGRADES' : 'E: UPGRADES') : pl.mining ? 'MINING' : full ? 'CARGO FULL: GO TO BASE' : '';
  if (hint) drawText(r, hint, W - 3, 314, full || p.nearBase ? 4 : 3, 1, 'right');

  // --- touch buttons
  if (p.g.input.isTouch && pl.alive) {
    button(r, NOVA_BTN, 'NOVA', ready, ready);
    button(r, MINE_BTN, 'MINE', true, pl.mining);
    if (p.nearBase) button(r, DOCK_BTN, 'DOCK', true, blink);
    // virtual joystick
    if (pl.stick) {
      r.ox = 0;
      r.ring(pl.stick.sx, pl.stick.sy, 14, 1);
      const dx = pl.stick.x - pl.stick.sx;
      const dy = pl.stick.y - pl.stick.sy;
      const d = Math.hypot(dx, dy);
      const s = d > 14 ? 14 / d : 1;
      r.rect(pl.stick.sx + dx * s - 2, pl.stick.sy + dy * s - 2, 4, 4, 2);
    }
  }
}
