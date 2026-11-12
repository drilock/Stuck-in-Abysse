// Sectors of space. Only the home sector exists for now; later sectors (warp gates at the
// sector edge) only need a new entry here: bigger, richer, more dangerous.
export const ZONES = [
  {
    id: 'home',
    name: 'HOME BELT',
    size: 1600, // square world, in pixels
    asteroids: 48, // asteroid population kept alive
    rich: 0.3, // share of big asteroids
    enemyHp: 0, // extra HP for every invader
    crystalMul: 1,
  },
];
