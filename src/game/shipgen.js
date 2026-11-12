import { PALETTE } from '../engine/palette.js';

// Modular ship: every upgrade level adds visible parts to the hull.
// Parts are [dx, y, colour] on the LEFT half (dx = columns from the centre line), mirrored.
export const SIZE = 27;
const C = 13; // centre column

const range = (dx, y0, y1, c) => {
  const out = [];
  for (let y = y0; y <= y1; y++) out.push([dx, y, c]);
  return out;
};
// filled ellipse as left/right-mirrored parts (only dx >= 0 is kept, the mirror does the rest)
const ell = (cx, cy, rx, ry, c) => {
  const out = [];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      out.push([x, y, c]);
    }
  }
  return out;
};

// BATHYSCAPHE: observation sphere with a big porthole at the front, float hull behind,
// ballast tanks on the flanks and a propeller at the stern. Nose = up.
const BASE = [
  ...ell(0, 17, 4.4, 6.5, 1), ...range(0, 11, 23, 2),
  ...ell(5.4, 17, 1.4, 3, 2),
  ...ell(0, 9, 4.6, 4.6, 2), ...range(4, 8, 10, 1),
  ...ell(0, 9, 2, 2, 3), [0, 9, 4], [0, 24, 1],
];

// PARTS[upgrade][level-1] = parts added when reaching that level
export const PARTS = {
  hull: [
    [[3, 6, 1], [4, 7, 1], [3, 12, 1], [4, 11, 1]], // armoured ring around the sphere
    [...ell(5, 17, 1.8, 4, 2), [5, 14, 1], [5, 20, 1]], // bigger ballast tanks
    [[1, 4, 1], [2, 4, 1], [3, 5, 1]], // pressure dome over the porthole
    [[2, 24, 1], [3, 23, 1], [1, 25, 1]], // stern armour
    [...range(7, 14, 20, 1), [6, 13, 1], [6, 21, 1]], // heavy side plating
  ],
  power: [
    [[0, 3, 2], [0, 2, 4]], // harpoon cannon on top of the sphere
    [...range(5, 11, 13, 2), [5, 10, 4]], // ballast cannons
    [[5, 9, 2], [5, 8, 4], [5, 10, 2]], // longer ballast cannons
    [[5, 7, 1], [6, 6, 1], [7, 5, 1], [8, 4, 2], [8, 3, 4], [9, 4, 3], [7, 3, 3]], // pincer arms with guns
    [[0, 2, 3], [5, 8, 3], [8, 3, 3], [0, 1, 4]], // charged muzzles
  ],
  speed: [
    [[1, 24, 1], [0, 25, 1]], // bigger propeller
    [[5, 21, 1], [5, 22, 1]], // ballast thrusters
    [[3, 23, 2], [4, 24, 2]], // stern fins
    [...range(7, 15, 18, 2), [6, 15, 2]], // side stabilisers
    [[0, 26, 4], [5, 23, 4]], // overdrive props
  ],
  harvest: [
    [[1, 16, 3], [1, 17, 3]], // cargo window in the float
    [[1, 18, 3], [1, 19, 3]], // bigger hold
    [[3, 5, 1], [4, 4, 1], [5, 3, 3]], // sonar antennas
    [[7, 12, 1], [7, 13, 3], [8, 13, 3], [7, 14, 3]], // side cargo pods
    [[8, 12, 3], [6, 10, 3]], // magnet emitters
  ],
  nova: [
    [[0, 15, 3]], // nova core
    [[0, 16, 4]],
    [[0, 14, 3], [0, 17, 3]],
    [[1, 15, 3], [1, 14, 1]],
    [[0, 14, 4], [0, 18, 4]], // overcharged core
  ],
};

// Gun muzzles (ship space, centre = 0,0, nose up): [x, y, angle offset]. Match the drawn cannons.
export function muzzles(lv) {
  const out = [[0, lv >= 1 ? -11 : -8, 0]];
  if (lv >= 2) out.push([-5, lv >= 3 ? -5 : -3, 0], [5, lv >= 3 ? -5 : -3, 0]);
  if (lv >= 4) out.push([-8, -10, -0.22], [8, -10, 0.22]);
  return out;
}

// Prop wash emitters (ship space) from the speed level.
export function engines(lv) {
  const out = [[0, lv >= 5 ? 13 : lv >= 1 ? 12 : 11]];
  if (lv >= 2) out.push([-5, lv >= 5 ? 10 : 9], [5, lv >= 5 ? 10 : 9]);
  return out;
}

// Grid of palette indices (or -1) for given upgrade levels.
// highlight: {id, level} draws that level's parts in a blink colour (hangar preview).
export function buildGrid(levels, highlight = null, blinkColor = 4) {
  const g = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  const put = ([dx, y, c], col = c) => {
    g[y][C - dx] = col;
    g[y][C + dx] = col;
  };
  BASE.forEach((p) => put(p));
  for (const id of ['speed', 'hull', 'harvest', 'power', 'nova']) {
    const lv = levels[id] || 0;
    for (let i = 0; i < lv; i++) PARTS[id][i].forEach((p) => put(p));
    if (highlight && highlight.id === id && highlight.level <= 5 && highlight.level > lv) {
      PARTS[id][highlight.level - 1].forEach((p) => put(p, blinkColor));
    }
  }
  return g;
}

// RotSprite-style rotation: upscale 8x with Scale2x (EPX), rotate nearest-neighbour, sample back.
// Keeps exact palette colours and much cleaner diagonals than plain nearest-neighbour.
function scale2x(g) {
  const h = g.length;
  const w = g[0].length;
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : g[y][x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = g[y][x];
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const Cc = at(x - 1, y);
      const D = at(x, y + 1);
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (Cc === A && Cc !== D && A !== B) e0 = A;
      if (A === B && A !== Cc && B !== D) e1 = B;
      if (D === Cc && D !== B && Cc !== A) e2 = Cc;
      if (B === D && B !== A && D !== Cc) e3 = D;
      out[y * 2][x * 2] = e0;
      out[y * 2][x * 2 + 1] = e1;
      out[y * 2 + 1][x * 2] = e2;
      out[y * 2 + 1][x * 2 + 1] = e3;
    }
  }
  return out;
}

function rotateGrid(g, angle) {
  if (angle === 0) return g.map((r) => r.slice());
  const K = 8;
  const big = scale2x(scale2x(scale2x(g)));
  const N = SIZE * K;
  const cx = N / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x * K + K / 2 - cx;
      const dy = y * K + K / 2 - cx;
      const sx = Math.floor(cx + dx * cos + dy * sin);
      const sy = Math.floor(cx - dx * sin + dy * cos);
      if (sx >= 0 && sy >= 0 && sx < N && sy < N) out[y][x] = big[sy][sx];
    }
  }
  return out;
}

export function gridToCanvas(g) {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const x = c.getContext('2d');
  for (let y = 0; y < SIZE; y++) {
    for (let i = 0; i < SIZE; i++) {
      if (g[y][i] < 0) continue;
      x.fillStyle = PALETTE[g[y][i]];
      x.fillRect(i, y, 1, 1);
    }
  }
  return c;
}

export const DIRS = 32;

// Builds the 16 rotated frames (index 0 = nose up, clockwise) + white flash frames.
export function buildShip(levels) {
  const g = buildGrid(levels);
  const frames = [];
  const flash = [];
  for (let i = 0; i < DIRS; i++) {
    const rg = rotateGrid(g, (i / DIRS) * Math.PI * 2);
    frames.push(gridToCanvas(rg));
    flash.push(gridToCanvas(rg.map((row) => row.map((v) => (v < 0 ? -1 : 4)))));
  }
  return { w: SIZE, h: SIZE, frames, flash };
}
