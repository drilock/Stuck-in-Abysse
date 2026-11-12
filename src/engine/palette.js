// The ONLY colours used by the game: exactly 5 per theme. Index constants keep sprite data compact.
export const THEMES = {
  // deep space
  space: ['#101820', '#344B50', '#65A89A', '#B8C98B', '#F2E6C9'],
  // submarine mode: the same five roles in ocean blues
  abyss: ['#0A1628', '#1E4A66', '#2F8FBF', '#7CD3C8', '#E3F2F0'],
};
export const THEME_NAMES = Object.keys(THEMES);

// Live palette (mutated in place by setTheme; sprites must be rebuilt afterwards).
export const PALETTE = [...THEMES.space];
export let theme = 'space';

export function setTheme(name) {
  if (!THEMES[name]) name = 'space';
  theme = name;
  PALETTE.splice(0, 5, ...THEMES[name]);
  const root = document.documentElement.style;
  PALETTE.forEach((c, i) => root.setProperty(`--c${i}`, c));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PALETTE[0]);
}

export const DARK = 0;   // background, shadows
export const GREY = 1;   // secondary elements, asteroids / rocks
export const TEAL = 2;   // ship, projectiles, interactive
export const GREEN = 3;  // resources, crystals, rewards
export const CREAM = 4;  // text, stars, light
