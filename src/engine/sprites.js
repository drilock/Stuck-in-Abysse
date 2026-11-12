import { PALETTE } from './palette.js';

// Sprites are strings: '.' = transparent, '0'..'4' = palette index.
// sym() mirrors a left half (including the centre column) to build symmetric sprites.
const sym = (rows) => rows.map((r) => r + r.slice(0, -1).split('').reverse().join(''));

function build(rows, map) {
  const h = rows.length;
  const w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error(`Sprite row width mismatch: "${r}"`);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = PALETTE[map ? map(+ch) : +ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function make(frames) {
  return {
    w: frames[0][0].length,
    h: frames[0].length,
    frames: frames.map((f) => build(f)),
    flash: frames.map((f) => build(f, () => 4)),
  };
}

// --- tiny seeded RNG for procedural asteroids
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function asteroidFrames(r, seed, rich, nFrames = 8) {
  const R = rng(seed);
  const harm = [2, 3, 5].map((k) => ({ k, a: R() * Math.PI * 2, amp: (0.06 + R() * 0.1) * r }));
  const craters = Array.from({ length: Math.max(1, Math.round(r / 3)) }, () => ({
    ang: R() * Math.PI * 2, d: R() * r * 0.55, cr: 0.7 + R() * r * 0.2,
  }));
  const specks = rich
    ? Array.from({ length: Math.max(2, Math.round(r / 2)) }, () => ({ ang: R() * Math.PI * 2, d: 1 + R() * (r - 2.5) }))
    : [];
  const size = Math.ceil(r * 1.3) * 2 + 1;
  const c = (size - 1) / 2;
  const frames = [];
  for (let f = 0; f < nFrames; f++) {
    const rot = (f / nFrames) * Math.PI * 2;
    const rows = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) {
        const dx = x - c;
        const dy = y - c;
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) - rot;
        let edge = r;
        for (const h of harm) edge += Math.sin(h.k * ang + h.a) * h.amp;
        if (d > edge) { row += '.'; continue; }
        let col = '1';
        // lit rim on the upper-left
        if (d > edge - 1.2 && dx + dy < -r * 0.5) col = '4';
        for (const cr of craters) {
          const cx = Math.cos(cr.ang + rot) * cr.d;
          const cy = Math.sin(cr.ang + rot) * cr.d;
          if (Math.hypot(dx - cx, dy - cy) < cr.cr) col = '0';
        }
        for (const s of specks) {
          const sx = Math.round(Math.cos(s.ang + rot) * s.d);
          const sy = Math.round(Math.sin(s.ang + rot) * s.d);
          if (Math.round(dx) === sx && Math.round(dy) === sy) col = '3';
        }
        row += col;
      }
      rows.push(row);
    }
    frames.push(rows);
  }
  return frames;
}

export const S = {};

export function initSprites() {
  S.player = make([sym([
    '.....4',
    '....42',
    '....22',
    '...224',
    '...222',
    '..1222',
    '.11222',
    '112212',
    '1...11',
  ])]);

  S.flame = make([
    ['....434....', '.....4.....', '...........'],
    ['....343....', '....434....', '.....3.....'],
    ['....444....', '.....3.....', '.....3.....'],
  ]);

  // Basic invader: a drifting "spore drone"
  S.basic = make([
    sym(['...444', '..4444', '.44144', '.44444', '.4.444', '..4.4.', '.4..4.']),
    sym(['...444', '..4444', '.44144', '.44444', '.4.444', '..4.4.', '...4.4']),
  ]);

  // Fast invader: a manta dart flapping its wings
  S.fast = make([
    sym(['4.....', '44....', '.444.4', '..4414', '...444', '....4.']),
    sym(['......', '4.....', '44...4', '.44414', '...444', '....4.']),
  ]);

  // Armoured invader: grey shell, bright eyes
  S.tank = make([
    sym(['..1111', '.11441', '111111', '141111', '111111', '11.111', '1..1..']),
    sym(['..1111', '.11441', '111111', '141111', '111111', '11.111', '.1..1.']),
  ]);
  S.tankCracked = make([
    sym(['..1111', '.11441', '110111', '141101', '111011', '11.111', '1..1..']),
    sym(['..1111', '.11441', '110111', '141101', '111011', '11.111', '.1..1.']),
  ]);

  // Boss: the Harvest Queen, a giant jelly mothership
  const bossTop = [
    '...........44444',
    '........44444444',
    '......4444444444',
    '.....44411144444',
    '....444100014444',
    '...4444100014444',
    '..44444411144444',
    '.444444444444444',
    '4444111444441114',
    '4141444141444444',
    '.444444444444444',
  ];
  S.boss = make([
    sym([...bossTop,
      '..1...1...1...1.',
      '..1...1...1...1.',
      '.1...1...1...1..',
      '.1...1...1...1..',
      '..1...1...1...1.']),
    sym([...bossTop,
      '..1...1...1...1.',
      '...1...1...1...1',
      '...1...1...1...1',
      '..1...1...1...1.',
      '..1...1...1...1.']),
  ]);

  S.crystal = make([
    ['..3..', '.343.', '34333', '33333', '.333.', '..3..'],
    ['..4..', '.333.', '33333', '33343', '.333.', '..3..'],
    ['..3..', '.333.', '33333', '33333', '.343.', '..3..'],
  ]);

  S.repair = make([
    ['.222.', '22422', '24442', '22422', '.222.'],
    ['.222.', '22222', '22422', '22222', '.222.'],
  ]);

  S.asteroids = {
    s: [asteroidFrames(4, 11, false), asteroidFrames(4, 29, true), asteroidFrames(4, 7, false)].map(make),
    m: [asteroidFrames(7, 3, false), asteroidFrames(7, 41, true), asteroidFrames(7, 77, false)].map(make),
    l: [asteroidFrames(10, 5, true), asteroidFrames(10, 93, false), asteroidFrames(10, 61, true)].map(make),
  };
}
