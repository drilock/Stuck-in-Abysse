import { PALETTE, theme } from '../engine/palette.js';
import { W } from '../engine/renderer.js';
import { TOP, BOTTOM } from './constants.js';

// Procedural sectors. Every sector mixes the four biomes in regions (a Voronoi map):
//   reef  - corals, anemones, fish schools (calm, home of the base)
//   kelp  - swaying kelp forests that hide the ship from patrols
//   wreck - sunken hulls with salvage crates to crack open
//   vent  - hydrothermal vents: very rich ore, but eruptions damage the hull
// The deeper the sector, the fewer reefs and the more vents / wrecks.
export const BIOMES = ['reef', 'kelp', 'wreck', 'vent'];
const WEIGHTS = [
  [0.55, 0.3, 0.15, 0],
  [0.25, 0.35, 0.3, 0.1],
  [0.1, 0.25, 0.35, 0.3],
  [0.05, 0.2, 0.3, 0.45],
];
const SIZE = 1600;
const CLEAR = 255; // transparent cell in the decor map

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sectorInfo(depth) {
  return {
    depth,
    size: SIZE,
    name: depth === 0 ? 'HOME REEF' : `DEPTH ${depth}`,
    meters: 120 + depth * 380,
    asteroids: 44 + depth * 4,
    rich: Math.min(0.3 + depth * 0.08, 0.6),
    enemyHp: depth,
    dangerBase: Math.min(depth * 0.22, 0.66),
    crystalMul: 1 + depth * 0.2,
    lab: Math.min(depth, 4), // research needed to open the gate to this depth
  };
}

export class Sector {
  constructor(depth, seed, anchor) {
    Object.assign(this, sectorInfo(depth));
    this.seed = seed;
    const r = rng(seed);
    this.r = r;
    const S = this.size;
    // --- biome regions
    const w = WEIGHTS[Math.min(depth, WEIGHTS.length - 1)];
    const pickBiome = () => {
      let v = r();
      for (let i = 0; i < 4; i++) {
        v -= w[i];
        if (v <= 0) return i;
      }
      return 0;
    };
    this.regions = [];
    for (let i = 0; i < 14; i++) this.regions.push({ x: r() * S, y: r() * S, b: pickBiome() });
    // the base (home) or arrival gate sits in a calm reef/kelp pocket
    this.regions.push({ x: anchor.x, y: anchor.y, b: depth === 0 ? 0 : 1 });
    if (depth > 0 && !this.regions.some((g) => g.b === 3)) this.regions[0].b = 3;
    if (!this.regions.some((g) => g.b === 2)) this.regions[1].b = 2;
    // --- gates: deeper gate far from the anchor; elsewhere a return gate at the anchor
    this.gates = [];
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < 40; k++) {
      gx = 160 + r() * (S - 320);
      gy = 160 + r() * (S - 320);
      if (Math.hypot(gx - anchor.x, gy - anchor.y) > (depth === 0 ? 520 : 700)) break;
    }
    this.gates.push({ x: gx, y: gy, to: depth + 1, kind: 'down' });
    if (depth > 0) this.gates.push({ x: anchor.x, y: anchor.y - 40, to: 0, kind: 'home' });
    this.anchor = anchor;
    // --- features
    this.map = new Uint8Array(S * S).fill(CLEAR);
    this.kelp = [];
    this.anemones = [];
    this.fish = [];
    this.vents = [];
    this.jellies = [];
    this.weeds = [];
    this.crates = [];
    this.corals = []; // harvestable coral heads
    this.generate();
    this.canvas = null;
    this.paintedTheme = null;
  }

  biomeAt(x, y) {
    // slightly warped nearest-region lookup gives organic borders
    const wx = x + Math.sin(y * 0.013) * 40;
    const wy = y + Math.cos(x * 0.011) * 40;
    let best = 0;
    let bd = Infinity;
    for (const g of this.regions) {
      const d = (g.x - wx) ** 2 + (g.y - wy) ** 2;
      if (d < bd) {
        bd = d;
        best = g.b;
      }
    }
    return BIOMES[best];
  }

  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.map[y * this.size + x] = c;
  }

  // keep the anchor (base / arrival) and the gates clear of big decor
  clearZone(x, y, m = 70) {
    if (Math.hypot(x - this.anchor.x, y - this.anchor.y) < m + 40) return false;
    return !this.gates.some((g) => Math.hypot(x - g.x, y - g.y) < m);
  }

  randIn(biome, tries = 30) {
    const r = this.r;
    for (let k = 0; k < tries; k++) {
      const x = 30 + r() * (this.size - 60);
      const y = 30 + r() * (this.size - 60);
      if (this.biomeAt(x, y) === biome) return [x, y];
    }
    return null;
  }

  generate() {
    const r = this.r;
    const S = this.size;
    // sand grain over reef and wreck floors, fissure grit in vent fields
    for (let i = 0; i < 26000; i++) {
      const x = Math.floor(r() * S);
      const y = Math.floor(r() * S);
      const b = this.biomeAt(x, y);
      if (b === 'reef' || b === 'wreck') this.set(x, y, 1);
      else if (b === 'vent' && i % 3 === 0) this.set(x, y, 1);
    }
    // feature counts follow how much of the sector each biome covers
    const f = { reef: 0, kelp: 0, wreck: 0, vent: 0 };
    for (let i = 0; i < 400; i++) f[this.biomeAt(r() * S, r() * S)] += 1 / 400;
    const n = (k, per) => Math.round(per * f[k]);
    for (let i = 0; i < 300 * (f.reef + f.wreck); i++) this.genRipples();
    for (let i = 0; i < n('reef', 420); i++) this.genBranchCoral();
    for (let i = 0; i < n('reef', 120); i++) this.genBrainCoral();
    for (let i = 0; i < n('reef', 110); i++) {
      const p = this.randIn('reef');
      if (p) this.anemones.push({ x: p[0], y: p[1], p: r() * 6 });
    }
    for (let i = 0; i < n('reef', 22); i++) {
      const p = this.randIn('reef');
      if (p) this.fish.push({ x: p[0], y: p[1], p: r() * 6, n: 6 + Math.floor(r() * 6), rx: 50 + r() * 60, ry: 40 + r() * 50 });
    }
    for (let i = 0; i < n('reef', 70); i++) {
      const p = this.randIn('reef');
      if (p && this.clearZone(p[0], p[1], 30)) this.corals.push({ x: p[0], y: p[1], p: r() * 6 });
    }
    for (let i = 0; i < n('kelp', 80); i++) this.genKelpForest();
    for (let i = 0; i < Math.max(f.wreck > 0 ? 1 : 0, n('wreck', 16)); i++) this.genWreck();
    for (let i = 0; i < n('wreck', 90); i++) this.genContainer();
    for (let i = 0; i < n('vent', 120); i++) this.genFissure();
    for (let i = 0; i < n('vent', 40); i++) this.genVent();
    for (let i = 0; i < n('vent', 22); i++) {
      const p = this.randIn('vent');
      if (p) this.jellies.push({ x: p[0], y: p[1], p: r() * 6, sp: 0.7 + r() * 0.6 });
    }
  }

  genRipples() {
    const p = this.randIn('reef') || this.randIn('wreck');
    if (!p) return;
    const [cx, cy] = p;
    const rad = 20 + this.r() * 30;
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        if (Math.hypot(x, y) > rad * (0.7 + 0.3 * Math.sin(x * 0.2 + y * 0.13))) continue;
        const X = Math.round(cx + x);
        const Y = Math.round(cy + y);
        if ((Y + Math.round(Math.sin(X / 9) * 3)) % 9 === 0 && (X & 1)) this.set(X, Y, 1);
      }
    }
  }

  genBranchCoral() {
    const p = this.randIn('reef');
    if (!p || !this.clearZone(p[0], p[1], 30)) return;
    const r = this.r;
    const branch = (x, y, a, len, d) => {
      for (let s = 0; s < len; s++) {
        x += Math.cos(a);
        y += Math.sin(a);
        this.set(x, y, 2);
      }
      if (d === 0) {
        this.set(x, y, 3);
        return;
      }
      branch(x, y, a - 0.5 - r() * 0.3, len * 0.75, d - 1);
      branch(x, y, a + 0.5 + r() * 0.3, len * 0.75, d - 1);
    };
    for (let k = 0; k < 3; k++) branch(p[0], p[1], k * 2.1 + r(), 4 + r() * 3, 3);
  }

  genBrainCoral() {
    const p = this.randIn('reef');
    if (!p || !this.clearZone(p[0], p[1], 30)) return;
    const [cx, cy] = p;
    const rad = 6 + this.r() * 6;
    for (let y = -rad - 1; y <= rad + 1; y++) {
      for (let x = -rad - 1; x <= rad + 1; x++) {
        const d = Math.hypot(x, y);
        if (d > rad) continue;
        if (d > rad - 1) this.set(cx + x, cy + y, 2);
        else if (Math.sin(x * 1.1 + Math.cos(y * 0.9) * 2) > 0.55) this.set(cx + x, cy + y, 1);
      }
    }
  }

  genKelpForest() {
    const p = this.randIn('kelp');
    if (!p) return;
    const r = this.r;
    const n = 5 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const x = p[0] + (r() - 0.5) * 110;
      const y = p[1] + (r() - 0.5) * 110;
      if (!this.clearZone(x, y, 24)) continue;
      // holdfast rock
      for (let a = 0; a < 6.28; a += 0.5) this.set(x + Math.cos(a) * 2, y + Math.sin(a) * 2, 1);
      const L = 36 + r() * 46;
      this.kelp.push({ x, y, L, L0: L, ore: 3, regrow: 0, a: -1.1 - r() * 0.5, p: r() * 6 });
    }
  }

  genWreck() {
    const p = this.randIn('wreck', 60);
    if (!p || !this.clearZone(p[0], p[1], 110)) return;
    const r = this.r;
    const [CX, CY] = p;
    const ang = r() * Math.PI;
    const co = Math.cos(ang);
    const si = Math.sin(ang);
    const len = 60 + r() * 30;
    const beam = 12 + r() * 6;
    const brk = -len * 0.2 + r() * len * 0.3;
    const holds = [len * 0.5, len * 0.1, -len * 0.55];
    const R = len + 10;
    for (let Y = Math.floor(CY - R); Y <= CY + R; Y++) {
      for (let X = Math.floor(CX - R); X <= CX + R; X++) {
        const dx = X - CX;
        const dy = Y - CY;
        const u = dx * co + dy * si;
        const v = -dx * si + dy * co;
        if (u < -len || u > len) continue;
        const hw = u > len * 0.45 ? (beam * (len - u)) / (len * 0.55) : u < -len + 10 ? beam * Math.sqrt(Math.max(0, 1 - ((u + len - 10) / 10) ** 2)) : beam;
        if (Math.abs(v) > hw) continue;
        if (u > brk - 6 && u < brk + 6 && Math.abs(v + Math.sin(u) * 3) < hw - 2) {
          if (((X + Y) & 1) === 0) this.set(X, Y, 1);
          continue;
        }
        const hold = holds.find((h) => Math.abs(u - h) < 6 && Math.abs(v) < beam * 0.5);
        if (Math.abs(v) > hw - 2) this.set(X, Y, 2);
        else if (hold !== undefined) this.set(X, Y, Math.abs(u - hold) > 4.5 || Math.abs(v) > beam * 0.5 - 1.5 ? 2 : 0);
        else if (Math.round(v) % 4 === 0) this.set(X, Y, 0);
        else this.set(X, Y, 1);
      }
    }
    // fallen mast
    const ma = ang + 0.5 + r();
    for (let k = 0; k < 40 + r() * 20; k++) this.set(CX + co * len * 0.2 + Math.cos(ma) * (beam + k), CY + si * len * 0.2 + Math.sin(ma) * (beam + k), 2);
    // salvage crates spilled from the holds
    for (const h of holds) {
      if (r() < 0.25) continue;
      const side = r() < 0.5 ? -1 : 1;
      const d = beam + 8 + r() * 14;
      this.crates.push({ x: CX + co * h - si * d * side, y: CY + si * h + co * d * side });
    }
    for (let i = 0; i < 4; i++) this.weeds.push({ x: CX + (r() - 0.5) * len * 1.6, y: CY + (r() - 0.5) * len * 1.6, p: r() * 6 });
  }

  genContainer() {
    const p = this.randIn('wreck');
    if (!p || !this.clearZone(p[0], p[1], 30)) return;
    const a = this.r() * 3;
    for (let y = -4; y <= 4; y++) {
      for (let x = -7; x <= 7; x++) {
        const X = p[0] + x * Math.cos(a) - y * Math.sin(a);
        const Y = p[1] + x * Math.sin(a) + y * Math.cos(a);
        this.set(X, Y, Math.abs(x) === 7 || Math.abs(y) === 4 ? 2 : x % 3 === 0 ? 0 : 1);
      }
    }
    if (this.r() < 0.4) this.weeds.push({ x: p[0] + 9, y: p[1] + 6, p: this.r() * 6 });
  }

  genFissure() {
    const p = this.randIn('vent');
    if (!p) return;
    const r = this.r;
    let [x, y] = p;
    let a = r() * 6.28;
    for (let s = 0; s < 80; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
      this.set(x, y, r() < 0.12 ? 2 : 1);
    }
  }

  genVent() {
    const p = this.randIn('vent', 60);
    if (!p || !this.clearZone(p[0], p[1], 60)) return;
    const r = this.r;
    const v = { x: p[0], y: p[1], phase: r() * 8, worms: [] };
    for (let i = 0; i < 12; i++) v.worms.push([r() * 6.28, 7 + r() * 4, r() * 6]);
    for (let a = 0; a < 6.28; a += 0.2) this.set(v.x + Math.cos(a) * 4, v.y + Math.sin(a) * 4, 1);
    for (let a = 0; a < 6.28; a += 0.4) this.set(v.x + Math.cos(a) * 2, v.y + Math.sin(a) * 2, 2);
    this.vents.push(v);
  }

  // vent cycle: 8 s period, erupting for the last 2.2 s, warning blink 1 s before
  ventState(v, t) {
    const c = (t + v.phase) % 8;
    return c > 5.8 ? 'erupt' : c > 4.8 ? 'warn' : 'calm';
  }

  hiddenInKelp(x, y, t) {
    for (const k of this.kelp) {
      if (Math.abs(k.x - x) > 90 || Math.abs(k.y - y) > 90) continue;
      // distance to the swaying stipe, sampled
      const pts = this.kelpPoints(k, t, 6);
      if (pts.some(([px, py]) => Math.abs(px - x) < 9 && Math.abs(py - y) < 9)) return true;
    }
    return false;
  }

  kelpPoints(k, t, step = 1) {
    const out = [];
    let x = k.x;
    let y = k.y;
    for (let d = 0; d < k.L; d++) {
      const a = k.a + Math.sin(t * 1.1 + d * 0.07 + k.p) * 0.35 * (d / k.L);
      x += Math.cos(a);
      y += Math.sin(a);
      if (d % step === 0) out.push([x, y, a, d]);
    }
    return out;
  }

  // Static floor: a canvas painted from the index map with the current palette.
  paint() {
    const S = this.size;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d32 = new Uint32Array(img.data.buffer);
    const cols = PALETTE.map((h) => {
      const n = parseInt(h.slice(1), 16);
      return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
    });
    const m = this.map;
    for (let i = 0; i < m.length; i++) if (m[i] !== CLEAR) d32[i] = cols[m[i]];
    ctx.putImageData(img, 0, 0);
    this.canvas = c;
    this.paintedTheme = theme;
  }

  renderFloor(r) {
    if (!this.canvas || this.paintedTheme !== theme) this.paint();
    // source rectangle = the visible world window, clipped to the map
    let x0 = -r.ox;
    let y0 = -r.oy + TOP;
    let w = W;
    let h = BOTTOM - TOP;
    let dx = 0;
    let dy = TOP;
    if (x0 < 0) { dx -= x0; w += x0; x0 = 0; }
    if (y0 < 0) { dy -= y0; h += y0; y0 = 0; }
    w = Math.min(w, this.size - x0);
    h = Math.min(h, this.size - y0);
    if (w > 0 && h > 0) r.ctx.drawImage(this.canvas, x0, y0, w, h, dx, dy, w, h);
  }

  // Animated life: anemones, fish, kelp, vents, jellies, weeds. vis(x, y, margin) culls.
  render(r, t, vis) {
    for (const a of this.anemones) {
      if (!vis(a.x, a.y, 6)) continue;
      r.rect(a.x, a.y, 1, 1, 2);
      for (let k = 0; k < 8; k++) {
        const an = (k * Math.PI) / 4 + Math.sin(t * 2 + a.p + k) * 0.35;
        for (let d = 1; d <= 3; d++) r.rect(a.x + Math.cos(an) * d, a.y + Math.sin(an) * d, 1, 1, d === 3 ? 4 : 3);
      }
    }
    for (const f of this.fish) {
      if (!vis(f.x, f.y, 130)) continue;
      const ph = t * 0.4 + f.p;
      const cx = f.x + Math.cos(ph) * f.rx;
      const cy = f.y + Math.sin(ph * 1.3) * f.ry;
      const vx = -Math.sin(ph) * f.rx;
      const vy = Math.cos(ph * 1.3) * f.ry * 1.3;
      const m = Math.hypot(vx, vy) || 1;
      for (let i = 0; i < f.n; i++) {
        const lag = i * 0.35;
        const ox = Math.sin(i * 2.3 + f.p) * 7;
        const oy = Math.cos(i * 1.7 + f.p) * 7;
        const fx = cx + ox - (vx / m) * lag * 8 + Math.sin(t * 3 + lag * 5);
        const fy = cy + oy - (vy / m) * lag * 8;
        r.rect(fx, fy, 1, 1, 4);
        r.rect(fx - vx / m, fy - vy / m, 1, 1, 3);
        r.rect(fx - (vx / m) * 2, fy - (vy / m) * 2, 1, 1, 2);
      }
    }
    for (const w of this.weeds) {
      if (!vis(w.x, w.y, 8)) continue;
      for (let b = -1; b <= 1; b++) for (let d = 1; d <= 4; d++) r.rect(w.x + b * 2 + Math.sin(t * 1.6 + w.p + d * 0.5) * d * 0.35, w.y - d, 1, 1, d === 4 ? 3 : 2);
    }
    for (const v of this.vents) {
      if (!vis(v.x, v.y, 60)) continue;
      const st = this.ventState(v, t);
      const big = st === 'erupt';
      for (let k = 0; k < (big ? 40 : 18); k++) {
        const age = (t * (big ? 1.4 : 0.6) + k / (big ? 40 : 18)) % 1;
        const d = age * (big ? 28 : 46);
        let x;
        let y;
        if (big) {
          const a = k * 2.4 + t;
          x = v.x + Math.cos(a) * d;
          y = v.y + Math.sin(a) * d;
        } else {
          x = v.x + d * 0.9 + Math.sin(age * 9 + k) * age * 8;
          y = v.y - d * 0.4 + Math.cos(age * 7 + k * 2) * age * 8;
        }
        if (age < 0.8 || k & 1) r.rect(x, y, 1, 1, big ? (age < 0.4 ? 4 : 3) : age < 0.15 ? 2 : 1);
      }
      r.rect(v.x, v.y, 1, 1, st === 'calm' ? 3 : Math.floor(t * 10) % 2 ? 4 : 2);
      for (const [a, d, p] of v.worms) {
        const x = v.x + Math.cos(a) * d;
        const y = v.y + Math.sin(a) * d;
        r.rect(x, y, 1, 1, 1);
        const s = Math.sin(t * 1.5 + p);
        if (s > -0.3) r.rect(x + Math.cos(a), y + Math.sin(a), 1, 1, s > 0.7 ? 4 : 3);
      }
    }
    for (const j of this.jellies) {
      const x = j.x + Math.sin(t * 0.2 * j.sp + j.p) * 70;
      const y = j.y + Math.cos(t * 0.15 * j.sp + j.p * 2) * 70;
      if (!vis(x, y, 10)) continue;
      const rr = 2.5 + Math.sin(t * 3 + j.p) * 0.8;
      for (let a = 0; a < 6.28; a += 0.3) r.rect(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1, 1, 3);
      r.rect(x, y, 1, 1, 4);
      for (let k = -1; k <= 1; k++) for (let d = 1; d <= 5; d++) r.rect(x + k * 2 + Math.sin(t * 4 + d + k) * 0.8, y + rr + d, 1, 1, 2);
    }
  }

  // Kelp is drawn above the ship: you slip between the fronds.
  renderKelp(r, t, vis) {
    for (const k of this.kelp) {
      if (!vis(k.x, k.y, k.L + 6)) continue;
      r.rect(k.x, k.y, 1, 1, 2);
      let last = null;
      for (const [x, y, a, d] of this.kelpPoints(k, t)) {
        r.rect(x, y, 1, 1, d > k.L * 0.7 ? 2 : 1);
        if (d % 5 === 2) {
          const side = d % 10 === 2 ? 1 : -1;
          const la = a + side * 1.2;
          for (let q = 1; q <= 3; q++) r.rect(x + Math.cos(la) * q, y + Math.sin(la) * q, 1, 1, q === 3 ? 3 : 2);
        }
        last = [x, y];
      }
      if (last) {
        for (let q = 0; q < 6; q++) r.rect(last[0] + Math.cos(q + t) * 2, last[1] + Math.sin(q + t) * 2, 1, 1, 3);
        r.rect(last[0], last[1], 1, 1, 4);
      }
    }
  }
}
