export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const pad = (n, len) => String(Math.max(0, Math.floor(n))).padStart(len, '0');
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
