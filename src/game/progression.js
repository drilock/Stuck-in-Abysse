// Upgrades, derived ship stats and LocalStorage persistence.
const KEY = 'space-harvester-save-v2';

export const MAX_LEVEL = 5;
export const COSTS = [20, 45, 80, 130, 200];

export const UPGRADES = [
  { id: 'power', name: 'POWER', short: 'PW', desc: 'FIRE RATE. NEW CANNONS AT LV 2 AND 4' },
  { id: 'speed', name: 'SPEED', short: 'SP', desc: 'BIGGER ENGINES. FASTER SHIP' },
  { id: 'harvest', name: 'HARVEST', short: 'HV', desc: 'LASER, CARGO +10, MAGNET' },
  { id: 'hull', name: 'HULL', short: 'HL', desc: 'ARMOUR PLATES. +1 MAX HP' },
  { id: 'nova', name: 'NOVA', short: 'NV', desc: 'BIGGER CORE. FASTER. STRONGER' },
];

export function computeStats(u) {
  return {
    fireCd: 0.3 - u.power * 0.02,
    dmg: u.power >= 5 ? 2 : 1,
    speed: 105 + u.speed * 16,
    magnet: 14 + u.harvest * 8,
    yieldBonus: u.harvest * 0.12,
    cargo: 15 + u.harvest * 10,
    laserRange: 46 + u.harvest * 8,
    laserRate: 3 + u.harvest * 1.2, // crystals extracted per second
    maxHp: 3 + u.hull,
    novaRegen: 4 + u.nova * 2.5,
    novaDmg: 4 + u.nova * 2,
  };
}

export const upgradeCost = (level) => (level >= MAX_LEVEL ? null : COSTS[level]);

// Research: ship upgrade level N needs the LAB at level N-1.
export const labNeeded = (nextLevel) => Math.max(0, nextLevel - 1);

// Base modules (RTS-style): each level is visible on the station.
export const BASE_MAX = 4;
export const BASE_MODULES = [
  { id: 'lab', name: 'LAB', desc: 'RESEARCH: UNLOCKS SHIP LEVELS', costs: [40, 90, 160, 260] },
  { id: 'turret', name: 'TURRETS', desc: '+1 AUTO TURRET PER LEVEL', costs: [35, 70, 120, 190] },
  { id: 'shield', name: 'SHIELD', desc: 'BASE HP +40. FASTER REPAIR', costs: [30, 60, 110, 180] },
  { id: 'refinery', name: 'REFINERY', desc: '+15% CRYSTALS ON UNLOAD', costs: [50, 100, 170, 260] },
];
export const baseCost = (mod, level) => (level >= BASE_MAX ? null : mod.costs[level]);

export function baseStats(b) {
  return {
    maxHp: 60 + b.shield * 40,
    regen: 0.6 + b.shield * 0.6, // HP per second when not under fire
    turrets: b.turret,
    turretCd: 0.75 - b.turret * 0.05,
    turretRange: 120,
    refine: 1 + b.refinery * 0.15,
  };
}

function defaults() {
  return {
    bank: 0, // crystals
    store: { corail: 0, kelp: 0, ferraille: 0, magmatite: 0, nodule: 0 }, // other resources in the base warehouse
    highScores: [], // [{score, wave}]
    upgrades: { power: 0, speed: 0, harvest: 0, hull: 0, nova: 0 },
    base: { lab: 0, turret: 0, shield: 0, refinery: 0 },
    settings: { sound: true, music: true, shake: true, theme: 'abyss' },
  };
}

export function loadSave() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      bank: Number.isFinite(s.bank) ? s.bank : 0,
      store: { ...d.store, ...(s.store || {}) },
      highScores: Array.isArray(s.highScores) ? s.highScores.slice(0, 5) : [],
      upgrades: { ...d.upgrades, ...(s.upgrades || {}) },
      base: { ...d.base, ...(s.base || {}) },
      settings: { ...d.settings, ...(s.settings || {}) },
    };
  } catch {
    return d;
  }
}

export function persist(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: game still works for this session */
  }
}

export function resetSave(save) {
  const d = defaults();
  d.settings = save.settings; // keep audio preferences
  Object.assign(save, d);
  persist(save);
}

export const bestScore = (save) => (save.highScores[0] ? save.highScores[0].score : 0);

// Returns the rank (0-based) if the score entered the top 5, else -1.
export function recordScore(save, score, raids) {
  const wave = raids;
  const list = [...save.highScores, { score, wave }].sort((a, b) => b.score - a.score).slice(0, 5);
  save.highScores = list;
  persist(save);
  return list.findIndex((e) => e.score === score && e.wave === wave);
}
